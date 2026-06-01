import dotenv from 'dotenv';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { VectoriseStageResult } from '../src/services/vectorise/shared/types';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const DEFAULT_SLUG =
  'en/collaborators/Facilitators/gound-potentialising';

type FillFrom = 'none' | 'pending' | 'snapshot';

async function resolveSlugs(
  explicit: string[],
  targetCount: number,
  fillFrom: FillFrom
): Promise<string[]> {
  const slugs = [...new Set(explicit.filter(Boolean))];

  if (slugs.length >= targetCount || fillFrom === 'none') {
    return slugs.slice(0, targetCount);
  }

  const needed = targetCount - slugs.length;

  if (fillFrom === 'pending') {
    const { pickPagesNeedingVectorisation } = await import(
      '../src/services/vectorise/page/neo4j'
    );
    const pending = await pickPagesNeedingVectorisation(needed + slugs.length);
    for (const slug of pending) {
      if (!slugs.includes(slug)) slugs.push(slug);
      if (slugs.length >= targetCount) break;
    }
    return slugs;
  }

  const { fetchDocsSnapshot } = await import('../src/services/docs/client');
  const pages = await fetchDocsSnapshot();
  for (const page of pages) {
    if (!slugs.includes(page.slug)) slugs.push(page.slug);
    if (slugs.length >= targetCount) break;
  }
  return slugs;
}

function icon(result: VectoriseStageResult): string {
  if (result === 'vectorised') return '✓';
  if (result === 'failed') return '✗';
  return '⚠';
}

async function logStageFailure(slug: string): Promise<void> {
  const { fetchDocsPageContent } = await import('../src/services/docs/client');
  try {
    const content = await fetchDocsPageContent(slug);
    if (content === null) {
      console.error('     → docs serve returned 404 (should have been skipped)');
      return;
    }
    if (!content.trim()) {
      console.error('     → empty page body (should have been skipped)');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`     → ${message}`);
  }
}

async function runSlugs(slugs: string[], verbose: boolean): Promise<number> {
  const { vectorisePageStage } = await import('../src/services/vectorise/page/stage');
  const { initDriver } = await import('../src/lib/db/neo4j');

  try {
    await initDriver();
  } catch {
    console.error('Neo4j is not reachable. Check NEO4J_URI / credentials in .env.local');
    return 1;
  }

  const slugWidth = Math.max(...slugs.map((s) => s.length), 0);
  const counts = { vectorised: 0, failed: 0, skipped: 0 };

  console.log(`Vectorising ${slugs.length} page(s)...\n`);

  for (const slug of slugs) {
    const started = Date.now();
    const result = await vectorisePageStage(slug);
    const ms = Date.now() - started;

    if (result === 'vectorised') counts.vectorised++;
    else if (result === 'failed') counts.failed++;
    else counts.skipped++;

    console.log(`${icon(result)}  ${slug.padEnd(slugWidth)}  ${result}  (${ms}ms)`);
    if (verbose && result === 'failed') {
      await logStageFailure(slug);
    }
  }

  console.log('\n────────────────────────────────────────────');
  console.log(`Vectorised: ${counts.vectorised}`);
  console.log(`Failed:     ${counts.failed}`);
  console.log(`Skipped:    ${counts.skipped}`);
  console.log('────────────────────────────────────────────');

  return counts.failed > 0 ? 1 : 0;
}

async function runTick(): Promise<number> {
  const { runPageVectoriseTick, buildPageVectoriseResult } = await import(
    '../src/services/vectorise'
  );

  console.log('Running page vectorise tick (batch, same as GET /api/story/page-vectorise)...\n');

  const tick = await runPageVectoriseTick();
  const result = await buildPageVectoriseResult(tick);

  console.log(JSON.stringify({ tick, result }, null, 2));

  if (tick.status === 'skipped' || tick.status === 'error') return 1;
  return tick.failed > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('slug', {
      type: 'array',
      string: true,
      default: [DEFAULT_SLUG],
      describe: 'Page slug(s) to vectorise (repeatable)',
    })
    .option('count', {
      type: 'number',
      default: 5,
      describe: 'Target number of slugs when using --fill-from',
    })
    .option('fill-from', {
      choices: ['none', 'pending', 'snapshot'] as const,
      default: 'pending' as FillFrom,
      describe: 'Add more slugs up to --count from Neo4j pending or docs snapshot',
    })
    .option('tick', {
      type: 'boolean',
      default: false,
      describe: 'Run one batch tick instead of explicit slugs',
    })
    .option('verbose', {
      type: 'boolean',
      default: true,
      describe: 'Print error detail when a slug fails',
    })
    .help()
    .parse();

  const slugs = await resolveSlugs(
    argv.slug as string[],
    argv.count,
    argv['fill-from'] as FillFrom
  );

  if (slugs.length === 0) {
    console.error('No slugs to vectorise.');
    process.exit(1);
  }

  console.log('Slugs:', slugs.join(', '), '\n');

  const exitCode = argv.tick ? await runTick() : await runSlugs(slugs, argv.verbose);

  const { closeDriver } = await import('../src/lib/db/neo4j');
  await closeDriver();

  process.exit(exitCode);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Page vectorise failed:', message);
  process.exit(1);
});
