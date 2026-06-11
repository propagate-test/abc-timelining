// src/lib/telegram.ts
import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from './logger'; // assuming you have a shared logger

dotenv.config();

const BOT_TOKEN = process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development" ? process.env.TELEGRAM_BOT_TOKEN_DEV : process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_TIMEOUT = 5000; // Set your desired timeout

type TelegramVideo = {
  duration: number;
  width: number;
  height: number;
  file_name?: string;
  mime_type: string;
  thumbnail?: {
    file_id: string;
    file_unique_id: string;
    file_size: number;
    width: number;
    height: number;
  };
  thumb?: {
    file_id: string;
    file_unique_id: string;
    file_size: number;
    width: number;
    height: number;
  };
  file_id: string;
  file_unique_id: string;
  file_size: number;
};

type TelegramPhoto = {
  file_id: string;
  file_unique_id: string;
  file_size: number;
  width: number;
  height: number;
};

type SendMessageOptions = {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  reply_markup?: {
    inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>;
  };
};

export interface TelegramMessage {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
      language_code?: string;
    };
    chat?: {
      id: number;
      title?: string;
      username?: string;
      type: 'private' | 'group' | 'supergroup' | 'channel';
      is_forum?: boolean;
      topic?: string;
    };
    date: number;
    message_thread_id?: number;
    is_topic_message?: boolean;
    text?: string;
    entities?: Array<{
      offset: number;
      length: number;
      type: 'mention' | 'hashtag' | 'bot_command' | 'url' | 'email' | 'phone_number' | 'bold' | 'italic' | 'code' | 'pre' | 'text_link' | 'text_mention';
    }>;
    caption?: string; // Caption for photos or other media
    reply_to_message?: TelegramMessage['message']; // Allow for replying to other messges
    photo?: TelegramPhoto | TelegramPhoto[];
    voice?: {
      duration: number;
      mime_type: string;
      file_id: string;
      file_unique_id: string;
      file_size: number;
    }; // Voice message properties
    video?: TelegramVideo | TelegramVideo[]; // Video message properties
    video_note?: {
      duration: number;
      length: number;
      thumbnail?: {
        file_id: string;
        file_unique_id: string;
        file_size: number;
        width: number;
        height: number;
      };
      thumb?: {
        file_id: string;
        file_unique_id: string;
        file_size: number;
        width: number;
        height: number;
      };
      file_id: string;
      file_unique_id: string;
      file_size: number;
    }; // Video note (voice note but video) properties
    forum_topic_created?: {
      name: string;
      icon_color: number;
    };
  };
}

const telegramApi = axios.create({
  timeout: TELEGRAM_API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Sends a message to a Telegram chat with timeout and error handling
 */
export async function sendTelegramMessage(chatId: number, text: string, options: SendMessageOptions = {}): Promise<{ message_id: number }> {
  try {
    const response = await telegramApi.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text,
      ...options
    });

    // Return the message ID for future use (to delete it later)
    return response.data.result;
  } catch (error: unknown) {
    const axiosError = error as { code?: string };
    if (axios.isAxiosError(error) && axiosError.code === 'ECONNABORTED') {
      logger.warn('Telegram API timeout', { chatId });
      throw new Error('Telegram API timeout');
    }
    logger.error('Failed to send Telegram message', {
      chatId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to send Telegram message');
  }
}

export async function setMessageReaction(chatId: number, messageId: string) {
  try {
    await telegramApi.post(`https://api.telegram.org/bot${BOT_TOKEN}/setMessageReaction`, {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: '⚡' }]
    });
    return;

  } catch (error: unknown) {
    const axiosError = error as { code?: string };
    if (axios.isAxiosError(error) && axiosError.code === 'ECONNABORTED') {
      logger.warn('Telegram API timeout', { chatId });
      throw new Error('Telegram API timeout');
    }
    logger.error('Failed to add message reaction', {
      chatId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to send Telegram message');
  }
}

export async function deleteTelegramMessage(chatId: number, messageId: number): Promise<void> {
  try {
    await telegramApi.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      chat_id: chatId,
      message_id: messageId,
    });
    logger.info('Message deleted', { chatId, messageId });
  } catch (error) {
    logger.error('Failed to delete Telegram message', {
      chatId,
      messageId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to delete Telegram message');
  }
}
