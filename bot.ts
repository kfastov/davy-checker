import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import dotenv from 'dotenv';
import { projects, Project } from './projectsConfig'; // Import projects and Project interface

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Use the bot token from the environment variable
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);

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
      ctx.reply(`Вы выбрали ${project.name}. Пожалуйста, введите ваш адрес:`);
      bot.on('text', async (ctx) => {
        const address = ctx.message.text;
        const airdropAmount = await checkAirdropEligibility(project, address);
        ctx.reply(`Ваше количество airdrop для ${project.name} составляет: ${airdropAmount}`);
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