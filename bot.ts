import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import dotenv from 'dotenv';
import { projects, Project } from './projectsConfig'; // Import projects and Project interface

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Use the bot token from the environment variable
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);

// Constant for the maximum number of addresses
const MAX_ADDRESSES = 80;

// Start command
bot.start((ctx) => {
  ctx.reply('Добро пожаловать! Проверьте свою возможность участия в airdrop, выбрав проект.');
  sendProjectList(ctx);
});

// Function to send the list of projects
function sendProjectList(ctx: any) {
  const projectButtons = projects.map((project) => ({
    text: project.name,
    callback_data: project.name,
  }));

  ctx.reply('Выберите проект:', {
    reply_markup: {
      inline_keyboard: [projectButtons],
    },
  });
}

// Type guard to check if callbackQuery is of type CallbackQuery.DataQuery
function isDataQuery(query: CallbackQuery): query is CallbackQuery.DataQuery {
  return (query as CallbackQuery.DataQuery).data !== undefined;
}

// Handle project selection
bot.on('callback_query', async (ctx) => {
  const callbackQuery = ctx.callbackQuery;
  
  if (isDataQuery(callbackQuery)) {
    const projectName = callbackQuery.data;
    const project = projects.find((p) => p.name === projectName);

    if (project) {
      ctx.reply(`Вы выбрали ${project.name}. Пожалуйста, введите ваши адреса (каждый адрес на новой строке, максимум ${MAX_ADDRESSES}):`);
      bot.on('text', async (ctx) => {
        const addresses = ctx.message.text.split('\n').map(addr => addr.trim()).filter(addr => addr);
        
        if (addresses.length > MAX_ADDRESSES) {
          ctx.reply(`Вы ввели слишком много адресов. Пожалуйста, введите не более ${MAX_ADDRESSES} адресов.`);
          return;
        }

        const results = [];
        for (const address of addresses) {
          const airdropAmount = await checkAirdropEligibility(project, address);
          results.push(`Адрес: ${address}, Airdrop: ${airdropAmount}`);
        }

        const responseMessage = `Результаты для ${project.name}:\n` + results.join('\n');
        ctx.reply(responseMessage);
      });
    }
  }
});

// Function to check airdrop eligibility
async function checkAirdropEligibility(project: Project, address: string): Promise<string> {
  try {
    // Replace the placeholder with the actual user address
    const url = `${project.apiEndpoint}${address}`;
    const response = await fetch(url);
    const data = await response.json();

    // Use the project's parseResponse function
    return project.parseResponse(data);
  } catch (error) {
    console.error('Ошибка при проверке возможности участия в airdrop:', error);
    return 'Ошибка при проверке возможности';
  }
}

// Launch the bot
bot.launch(); 