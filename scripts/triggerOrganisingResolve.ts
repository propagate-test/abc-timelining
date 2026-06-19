import axios from 'axios';
import neo4j from 'neo4j-driver';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  allChannelSpecs,
  buildOrganisingResolveUrl,
  channelSpecForTopic,
  type OrganisingChannelSpec,
  type OrganisingKey,
  ORGANISING_CONFIG,
} from '@organising-config';
import { createNeo4jDriver, loadDbEnv } from './db/env';

type PendingEntry = {
  entryId: string;
  resolveStatus: string | null;
  failureReason: string | null;
  date: string;
  participant: string | null;
  chatTitle: string | null;
  voiceStatus: string | null;
  topic: string | null;
  app: OrganisingKey | null;
  channelKey: string | null;
};

function resolveChannelSpec(options: {
  topic?: string;
  app?: string;
  channel?: string;
}): OrganisingChannelSpec {
  if (options.topic) {
    const spec = channelSpecForTopic(options.topic);
    if (!spec) {
      throw new Error(`Unknown topic: ${options.topic}`);
    }
    return spec;
  }

  if (options.app && options.channel) {
    const appKey = options.app as OrganisingKey;
    const appConfig = ORGANISING_CONFIG[appKey];
    const channelConfig = appConfig?.channels[options.channel];
    if (!appConfig || !channelConfig) {
      throw new Error(`Unknown app/channel: ${options.app}/${options.channel}`);
    }

    return {
      key: appKey,
      channelKey: options.channel,
      domain: appConfig.domain,
      channel: channelConfig.channel,
      ...(channelConfig.forward ? { forward: channelConfig.forward } : {}),
      ...(channelConfig.resolve ? { resolve: channelConfig.resolve } : {}),
    };
  }

  throw new Error('Provide --topic or both --app and --channel');
}

function buildAuthHeaders(): Record<string, string> {
  loadDbEnv();

  const token = process.env.PRIVATE_API_TOKEN;
  if (!token) {
    throw new Error('PRIVATE_API_TOKEN is not set in .env.local');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
  }

  return headers;
}

function buildOrganisingUrl(domain: string, path: string, query?: Record<string, string>): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`https://${domain}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function listPendingEntries(options: {
  topic: string;
  chatTitle?: string;
  limit: number;
  requireVectorised: boolean;
}): Promise<PendingEntry[]> {
  const spec = channelSpecForTopic(options.topic);
  const driver = await createNeo4jDriver();
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(
      `
      MATCH (e:Entry)-[:FROM_CHAT]->(c:TelegramChat)
      WHERE c.topic = $topic
        AND ($chatTitle IS NULL OR c.title CONTAINS $chatTitle)
        AND (e.resolveStatus IS NULL OR e.resolveStatus IN ['pending', 'failed'])
      OPTIONAL MATCH (e)-[:HAS_VOICE]->(v:Voice)
      OPTIONAL MATCH (e)-[:HAS_TEXT]->(t:TextContent)
      OPTIONAL MATCH (e)-[:SENT_BY]->(p:Participant)
      WITH e, c, v, p, t
      WHERE (v IS NULL OR (
        v.transcription IS NOT NULL
        AND ($requireVectorised = false OR coalesce(v.processingStatus, 'pending') = 'vectorised')
      )) AND (v IS NOT NULL OR t IS NOT NULL)
      RETURN e.id AS entryId,
             e.resolveStatus AS resolveStatus,
             e.resolveFailureReason AS failureReason,
             toString(e.date) AS date,
             p.handle AS participant,
             c.title AS chatTitle,
             v.processingStatus AS voiceStatus,
             c.topic AS topic
      ORDER BY e.date DESC
      LIMIT $limit
      `,
      {
        topic: options.topic,
        chatTitle: options.chatTitle ?? null,
        requireVectorised: options.requireVectorised,
        limit: neo4j.int(options.limit),
      }
    );

    return result.records.map((record) => ({
      entryId: record.get('entryId') as string,
      resolveStatus: record.get('resolveStatus') as string | null,
      failureReason: record.get('failureReason') as string | null,
      date: record.get('date') as string,
      participant: record.get('participant') as string | null,
      chatTitle: record.get('chatTitle') as string | null,
      voiceStatus: record.get('voiceStatus') as string | null,
      topic: record.get('topic') as string | null,
      app: spec?.key ?? null,
      channelKey: spec?.channelKey ?? null,
    }));
  } finally {
    await session.close();
    await driver.close();
  }
}

async function triggerResolve(options: {
  spec: OrganisingChannelSpec;
  entryId?: string;
  backlog?: boolean;
}): Promise<void> {
  if (!options.spec.resolve) {
    throw new Error(`Channel ${options.spec.key}/${options.spec.channelKey} has no resolve route`);
  }

  const headers = buildAuthHeaders();
  const url = options.backlog
    ? buildOrganisingUrl(options.spec.domain, options.spec.resolve.path, { backlog: 'true' })
    : buildOrganisingResolveUrl(options.spec.domain, options.spec.resolve.path, options.entryId!);

  const response = await axios.post(url, undefined, { headers, validateStatus: () => true });
  if (response.status >= 400) {
    throw new Error(`Resolve trigger failed (${response.status}): ${JSON.stringify(response.data)}`);
  }

  console.log('Resolve triggered successfully');
  console.log(JSON.stringify(response.data, null, 2));
}

async function triggerUpdate(options: {
  spec: OrganisingChannelSpec;
  replyToMessageId: string;
  text: string;
  messageId: number;
}): Promise<void> {
  if (!options.spec.forward) {
    throw new Error(
      `Channel ${options.spec.key}/${options.spec.channelKey} has no forward/update route`
    );
  }

  const headers = {
    ...buildAuthHeaders(),
    'Content-Type': 'application/json',
  };

  const url = buildOrganisingUrl(options.spec.domain, options.spec.forward.path);
  const body = {
    message: {
      message_id: options.messageId,
      text: options.text,
      reply_to_message: {
        message_id: Number(options.replyToMessageId),
      },
    },
  };

  const response = await axios.post(url, body, { headers, validateStatus: () => true });
  if (response.status >= 400) {
    throw new Error(`Resolve update failed (${response.status}): ${JSON.stringify(response.data)}`);
  }

  console.log('Resolve update triggered successfully');
  console.log(JSON.stringify(response.data, null, 2));
}

const resolveChannelKeys = [...new Set([...allChannelSpecs()].map((spec) => spec.channelKey))];
const resolveTopics = [...new Set([...allChannelSpecs()].filter((spec) => spec.resolve).map((spec) => spec.channel))];

const argv = yargs(hideBin(process.argv))
  .option('topic', {
    type: 'string',
    choices: resolveTopics,
    describe: 'Telegram topic channel (e.g. _botAgendar)',
  })
  .option('app', {
    type: 'string',
    choices: Object.keys(ORGANISING_CONFIG),
    describe: 'Organising app key from organising.config.ts',
  })
  .option('channel', {
    type: 'string',
    choices: resolveChannelKeys,
    describe: 'Organising channel key from organising.config.ts',
  })
  .option('entry-id', {
    type: 'string',
    describe: 'Entry id to resolve',
  })
  .option('list', {
    type: 'boolean',
    default: false,
    describe: 'List entries pending resolve for the selected topic',
  })
  .option('list-routes', {
    type: 'boolean',
    default: false,
    describe: 'Print configured resolve and forward routes',
  })
  .option('chat-title', {
    type: 'string',
    describe: 'Filter listed entries by Telegram chat title substring',
  })
  .option('limit', {
    type: 'number',
    default: 10,
    describe: 'Max entries to list',
  })
  .option('require-vectorised', {
    type: 'boolean',
    default: true,
    describe: 'When listing voice entries, require processingStatus=vectorised',
  })
  .option('backlog', {
    type: 'boolean',
    default: false,
    describe: 'Run one backlog resolve tick for the selected channel',
  })
  .option('update', {
    type: 'boolean',
    default: false,
    describe: 'Send a reply-based correction to the channel forward route',
  })
  .option('reply-to-message-id', {
    type: 'string',
    describe: 'Original entry Telegram message id (update mode)',
  })
  .option('text', {
    type: 'string',
    describe: 'Correction text (update mode)',
  })
  .option('message-id', {
    type: 'number',
    default: Date.now(),
    describe: 'Synthetic update message id (update mode)',
  })
  .check((args) => {
    if (args.listRoutes) return true;

    if (args.list && !args.topic && !(args.app && args.channel)) {
      throw new Error('List mode requires --topic or both --app and --channel');
    }

    if (args.update) {
      if (!args.replyToMessageId || !args.text) {
        throw new Error('Update mode requires --reply-to-message-id and --text');
      }
      if (!args.topic && !(args.app && args.channel)) {
        throw new Error('Update mode requires --topic or both --app and --channel');
      }
      return true;
    }

    if (!args.list && !args.entryId && !args.backlog) {
      throw new Error('Provide --entry-id, --list, --backlog, --update, or --list-routes');
    }

    if ((args.entryId || args.backlog) && !args.topic && !(args.app && args.channel)) {
      throw new Error('Resolve mode requires --topic or both --app and --channel');
    }

    return true;
  })
  .help()
  .parseSync();

(async () => {
  try {
    if (argv.listRoutes) {
      console.log(
        JSON.stringify(
          [...allChannelSpecs()].map((spec) => ({
            app: spec.key,
            channel: spec.channelKey,
            topic: spec.channel,
            domain: spec.domain,
            resolve: spec.resolve?.path ?? null,
            forward: spec.forward?.path ?? null,
          })),
          null,
          2
        )
      );
      return;
    }

    const spec = resolveChannelSpec({
      topic: argv.topic,
      app: argv.app,
      channel: argv.channel,
    });

    if (argv.list) {
      const entries = await listPendingEntries({
        topic: spec.channel,
        chatTitle: argv.chatTitle,
        limit: argv.limit,
        requireVectorised: argv.requireVectorised,
      });

      if (entries.length === 0) {
        console.log(`No pending resolve entries found for ${spec.key}/${spec.channelKey}.`);
        return;
      }

      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    if (argv.update) {
      await triggerUpdate({
        spec,
        replyToMessageId: argv.replyToMessageId!,
        text: argv.text!,
        messageId: argv.messageId,
      });
      return;
    }

    await triggerResolve({
      spec,
      entryId: argv.entryId,
      backlog: argv.backlog,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
})();
