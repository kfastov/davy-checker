import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { userDb } from './database';

dotenv.config({ path: '.env.local' });

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

  async logMessage(userId: number, username: string | undefined, message: string) {
    if (!this.auditChannelId) return;
    
    const truncatedMessage = message.length > 100 ? message.slice(0, 97) + '...' : message;
    const logMessage = `📨 Сообщение
👤 Пользователь: ${username ? `@${username}` : userId}
💬 Текст: ${truncatedMessage}`;

    try {
      await this.bot.telegram.sendMessage(this.auditChannelId, logMessage);
    } catch (error) {
      console.error('Failed to send audit log:', error);
    }
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

  async logAdminAction(adminId: number, username: string | undefined, action: string, targetUserId: number) {
    if (!this.auditChannelId) return;
    
    const message = `👮‍♂️ Административное действие
🔑 Админ: ${username ? `@${username}` : adminId}
📋 Действие: ${action}
👤 Цель: ${targetUserId}`;

    try {
      await this.bot.telegram.sendMessage(this.auditChannelId, message);
    } catch (error) {
      console.error('Failed to send audit log:', error);
    }
  }

  async logSystemEvent(userId: number, username: string | undefined, event: string) {
    if (!this.auditChannelId) return;
    
    const message = `🤖 Системное событие
👤 Пользователь: ${username ? `@${username}` : userId}
📋 Событие: ${event}`;

    try {
      await this.bot.telegram.sendMessage(this.auditChannelId, message);
    } catch (error) {
      console.error('Failed to send audit log:', error);
    }
  }
}

export const auditLogger = new AuditLogger();