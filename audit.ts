import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { userDb } from './database';

dotenv.config({ path: '.env.local' });

// Добавляем тип для разных видов сообщений
type MessageType = 'user' | 'system' | 'admin' | 'user_action';

// Модифицируем функцию форматирования сообщения
function formatMessage(userId: number, username: string | undefined, message: string, type: MessageType): string {
  const userInfo = username ? `@${username}` : userId;
  
  switch (type) {
    case 'system':
      return `🤖 Система: ${message}`;
    case 'admin':
      return `👮 Админ: ${userInfo}\n${message}`;
    case 'user_action':
      return `⚡️ Действие: ${message}\n👤 Пользователь: ${userInfo}`;
    default:
      return `👤 Пользователь: ${userInfo}\n${message}`;
  }
}

class AuditLogger {
  private auditChannelId: string | null = null;
  private bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);
    this.auditChannelId = userDb.getSetting('audit_channel_id');
  }

  setAuditChannel(channelId: string) {
    this.auditChannelId = channelId;
    userDb.setSetting('audit_channel_id', channelId);
  }

  async logMessage(userId: number, username: string | undefined, message: string): Promise<void> {
    await this.log(formatMessage(userId, username, message, 'user'));
  }

  async logAddressCheck(userId: number, username: string | undefined, projectName: string, addressCount: number) {
    if (!this.auditChannelId) return;
    
    const message = `🔍 Проверка адресов
👤 Пользователь: ${username ? `@${username}` : userId}
📊 Проект: ${projectName}
📝 Количество адресов: ${addressCount}`;

    try {
      await this.bot.telegram.sendMessage(this.auditChannelId, message);
    } catch (error) {
      console.error('Failed to send audit log:', error);
    }
  }

  async logAdminAction(userId: number, username: string | undefined, action: string, targetId: number): Promise<void> {
    await this.log(formatMessage(userId, username, `${action} (target: ${targetId})`, 'admin'));
  }

  async logSystemEvent(userId: number, username: string | undefined, message: string): Promise<void> {
    await this.log(formatMessage(userId, username, message, 'system'));
  }

  async logUserAction(userId: number, username: string | undefined, action: string): Promise<void> {
    await this.log(formatMessage(userId, username, action, 'user_action'));
  }

  private async log(message: string) {
    if (!this.auditChannelId) return;
    
    try {
      await this.bot.telegram.sendMessage(this.auditChannelId, message);
    } catch (error) {
      console.error('Failed to send audit log:', error);
    }
  }
}

export const auditLogger = new AuditLogger();