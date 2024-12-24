import { Telegraf } from 'telegraf';
import { type CallbackQuery } from 'telegraf/types';
import dotenv from 'dotenv';
import { projects } from './projectsConfig';
import { airdropWorker } from './airdropWorker';
import { userDb, UserRole } from './database';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Use the bot token from the environment variable
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);

// Constant for the maximum number of addresses
const MAX_ADDRESSES = 80;

// Middleware для проверки прав админа
const requireAdmin = async (ctx: any, next: () => Promise<void>) => {
  const userId = ctx.from?.id;
  if (!userId || !userDb.isAdmin(userId)) {
    await ctx.reply('У вас нет прав для выполнения этой команды.');
    return;
  }
  return next();
};

// Middleware для проверки прав овнера
const requireOwner = async (ctx: any, next: () => Promise<void>) => {
  const userId = ctx.from?.id;
  if (!userId || !userDb.isOwner(userId)) {
    await ctx.reply('Только владелец бота может выполнять эту команду.');
    return;
  }
  return next();
};

// Команда для добавления админа (только для овнера)
bot.command('addadmin', requireOwner, async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    await ctx.reply('Использование: /addadmin <user_id>');
    return;
  }

  const targetUserId = parseInt(args[1]);
  if (isNaN(targetUserId)) {
    await ctx.reply('Некорректный ID пользователя');
    return;
  }

  userDb.setUserRole(targetUserId, UserRole.ADMIN);
  await ctx.reply(`Пользователь ${targetUserId} назначен администратором.`);
});

// Команда для удаления админа (только для овнера)
bot.command('removeadmin', requireOwner, async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    await ctx.reply('Использование: /removeadmin <user_id>');
    return;
  }

  const targetUserId = parseInt(args[1]);
  if (isNaN(targetUserId)) {
    await ctx.reply('Некорректный ID пользователя');
    return;
  }

  userDb.removeUserRole(targetUserId);
  await ctx.reply(`Пользователь ${targetUserId} больше не является администратором.`);
});

// Start command
bot.start(async (ctx) => {
  sendProjectList(ctx);
});

// Function to send the list of projects
async function sendProjectList(ctx: any) {
  await ctx.reply('Добро пожаловать! Выберите проект для проверки возможности участия в airdrop:', {
    reply_markup: {
      inline_keyboard: [projects.map((project) => ({
        text: project.name,
        callback_data: `project:${project.name}`,
      }))],
    },
  });
}

// Type guard to check if callbackQuery is of type CallbackQuery.DataQuery
function isDataQuery(query: CallbackQuery): query is CallbackQuery.DataQuery {
  return (query as CallbackQuery.DataQuery).data !== undefined;
}

// Handle project selection and back button
bot.on('callback_query', async (ctx) => {
  const callbackQuery = ctx.callbackQuery;
  
  if (!isDataQuery(callbackQuery)) return;

  const data = callbackQuery.data;
  
  // Handle back button
  if (data === 'back') {
    await ctx.editMessageText('Добро пожаловать! Выберите проект для проверки возможности участия в airdrop:', {
      reply_markup: {
        inline_keyboard: [projects.map((project) => ({
          text: project.name,
          callback_data: `project:${project.name}`,
        }))],
      },
    });
    return;
  }

  // Handle project selection
  if (data.startsWith('project:')) {
    const projectName = data.replace('project:', '');
    const project = projects.find((p) => p.name === projectName);

    if (project) {
      // Вместо удаления и создания нового сообщения, редактируем текущее
      await ctx.editMessageText(
        `Вы выбрали ${project.name}. Пожалуйста, введите ваши адреса (каждый адрес на новой строке, максимум ${MAX_ADDRESSES}):`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Назад', callback_data: 'back' }]
            ]
          }
        }
      );

      bot.on('text', async (ctx) => {
        const addresses = ctx.message.text.split('\n').map(addr => addr.trim()).filter(addr => addr);
        
        if (addresses.length > MAX_ADDRESSES) {
          await ctx.reply(`Вы ввели слишком много адресов. Пожалуйста, введите не более ${MAX_ADDRESSES} адресов.`);
          return;
        }

        // Delete only user's input message
        await ctx.deleteMessage();

        const results = await Promise.all(addresses.map(address => 
          airdropWorker.addTask(project, address)
            .then((airdropAmount: string) => `Адрес: ${address}, Airdrop: ${airdropAmount}`)
            .catch(() => `Адрес: ${address}, Ошибка при проверке возможности`)
        ));

        const responseMessage = `Результаты для ${project.name}:\n` + results.join('\n');
        
        // Edit the original message instead of creating a new one
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          callbackQuery.message?.message_id,
          undefined,
          responseMessage,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Назад', callback_data: 'back' }]
              ]
            }
          }
        );
      });
    }
  }
});

// Launch the bot
bot.launch();