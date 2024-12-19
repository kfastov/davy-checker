import { Telegraf } from 'telegraf';
import { type CallbackQuery } from 'telegraf/types';
import dotenv from 'dotenv';
import { projects } from './projectsConfig';
import { airdropWorker } from './airdropWorker';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Use the bot token from the environment variable
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);

// Constant for the maximum number of addresses
const MAX_ADDRESSES = 80;

// Start command
bot.start(async (ctx) => {
  sendProjectList(ctx);
});

// Function to send the list of projects
async function sendProjectList(ctx: any) {
  const projectButtons = projects.map((project) => ({
    text: project.name,
    callback_data: `project:${project.name}`,
  }));

  await ctx.reply('Добро пожаловать! Выберите проект для проверки возможности участия в airdrop:', {
    reply_markup: {
      inline_keyboard: [projectButtons],
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
    await ctx.deleteMessage();
    return sendProjectList(ctx);
  }

  // Handle project selection
  if (data.startsWith('project:')) {
    const projectName = data.replace('project:', '');
    const project = projects.find((p) => p.name === projectName);

    if (project) {
      // Delete the previous message
      await ctx.deleteMessage();

      const promptMessage = await ctx.reply(
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

        // Delete the prompt message and user's input
        await ctx.telegram.deleteMessage(ctx.chat.id, promptMessage.message_id);
        await ctx.deleteMessage();

        const results = await Promise.all(addresses.map(address => 
          airdropWorker.addTask(project, address)
            .then((airdropAmount: string) => `Адрес: ${address}, Airdrop: ${airdropAmount}`)
            .catch(() => `Адрес: ${address}, Ошибка при проверке возможности`)
        ));

        const responseMessage = `Результаты для ${project.name}:\n` + results.join('\n');
        await ctx.reply(responseMessage, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Назад', callback_data: 'back' }]
            ]
          }
        });
      });
    }
  }
});

// Launch the bot
bot.launch();