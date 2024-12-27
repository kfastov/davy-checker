import { Telegraf, session, Context } from 'telegraf';
import { type CallbackQuery } from 'telegraf/types';
import dotenv from 'dotenv';
import { projects, type Project } from './projectsConfig';
import { airdropWorker } from './airdropWorker';
import { userDb, UserRole } from './database';
import { auditLogger } from './audit';
import { validateAddress, getAddressTypeDisplay } from './addressTypes';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

interface SessionData {
  promptMessageId?: number;
  selectedProject?: Project;
}

interface MyContext extends Context {
  session: SessionData;
}

// Use the bot token from the environment variable
const bot = new Telegraf<MyContext>(process.env.TELEGRAM_BOT_TOKEN as string);

// Add session middleware before other uses
bot.use(session());

// Constant for the maximum number of addresses
const MAX_ADDRESSES = 80;

// Middleware для проверки прав админа
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const requireAdmin = async (ctx: MyContext, next: () => Promise<void>) => {
  const userId = ctx.from?.id;
  if (!userId || !userDb.isAdmin(userId)) {
    await ctx.reply('У вас нет прав для выполнения этой команды.');
    return;
  }
  return next();
};

// Middleware для проверки прав овнера
const requireOwner = async (ctx: MyContext, next: () => Promise<void>) => {
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
  await auditLogger.logAdminAction(
    ctx.from.id,
    ctx.from.username,
    'Добавление админа',
    targetUserId
  );
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

// Команда для установки текущей группы как канала аудита
bot.command('setauditgroup', requireOwner, async (ctx) => {
  if (!ctx.chat) return;
  
  // Проверяем, что команда отправлена в группу/супергруппу
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    await ctx.reply('Эта команда должна быть использована в группе');
    return;
  }

  auditLogger.setAuditChannel(ctx.chat.id.toString());
  await ctx.reply('✅ Эта группа установлена как канал аудита');
  
  // Тестовое сообщение
  await auditLogger.logAdminAction(
    ctx.from.id,
    ctx.from.username,
    'Установка группы аудита',
    ctx.from.id
  );
});

// Команда статистики (только для админов)
bot.command('stats', requireAdmin, async (ctx) => {
  const stats = userDb.getStats();
  
  let message = `📊 Статистика бота:

👥 Всего пользователей: ${stats.totalUsers}
👮‍♂️ Администраторов: ${stats.admins}
👤 Обычных пользователей: ${stats.users}
🔍 Всего проверок адресов: ${stats.totalChecks}`;

  if (stats.topUsers.length > 0) {
    message += '\n\n📈 Топ-5 пользователей по количеству проверок:';
    for (const user of stats.topUsers) {
      const userDisplay = user.username ? `@${user.username}` : `ID: ${user.userId}`;
      message += `\n${userDisplay}: ${user.checks} проверок`;
    }
  }

  await ctx.reply(message);
});

// Start command
bot.start(async (ctx) => {
  if (ctx.from) {
    userDb.addUser(ctx.from.id, ctx.from.username);
    
    await auditLogger.logSystemEvent(
      ctx.from.id,
      ctx.from.username,
      'Начал использовать бота'
    );
  }
  
  sendProjectList(ctx);
});

// Function to send the list of projects
async function sendProjectList(ctx: MyContext) {
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

// Вспомогательная функция для обработки ошибок
async function handleError(ctx: MyContext, errorMessage: string) {
  // Удаляем сообщение пользователя
  await ctx.deleteMessage();
  
  // Редактируем предыдущее сообщение с ошибкой
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    ctx.session.promptMessageId,
    undefined,
    errorMessage,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Назад', callback_data: 'back' }]
        ]
      }
    }
  );
}

// Handle text messages and documents with addresses
async function handleAddresses(ctx: MyContext, addresses: string[], project: Project) {
  if (!ctx.chat || !ctx.from) return;
  
  // Remove duplicates
  const uniqueAddresses = [...new Set(addresses.map(addr => addr.trim().toLowerCase()))];
  
  if (uniqueAddresses.length > MAX_ADDRESSES) {
    await handleError(ctx, 
      `⚠️ Вы ввели слишком много адресов. Пожалуйста, введите не более ${MAX_ADDRESSES} адресов.`
    );
    return;
  }

  // Validate addresses
  const validationResults = uniqueAddresses.map(address => ({
    address,
    isValid: validateAddress(address, project.addressType)
  }));

  const validAddresses = validationResults.filter(r => r.isValid).map(r => r.address);
  const invalidAddresses = validationResults.filter(r => !r.isValid).map(r => r.address);

  if (validAddresses.length === 0) {
    await handleError(ctx, '❌ Не найдено корректных адресов для проверки.');
    return;
  }

  // Add audit log
  await auditLogger.logAddressCheck(
    ctx.from.id,
    ctx.from.username,
    project.name,
    validAddresses.length
  );

  await ctx.deleteMessage();

  const results = await Promise.all(validAddresses.map(address => 
    airdropWorker.addTask(project, address)
      .then((airdropAmount: string) => ({ address, airdropAmount, error: false }))
      .catch(() => ({ address, airdropAmount: '0', error: true }))
  ));

  // Группируем результаты
  const eligible = results.filter(r => !r.error && r.airdropAmount !== '0');
  const notEligible = results.filter(r => !r.error && r.airdropAmount === '0');
  const errors = results.filter(r => r.error);

  let responseMessage = `Результаты для ${project.name}:\n\n`;
  
  if (eligible.length > 0) {
    responseMessage += '✅ Eligible:\n';
    eligible.forEach(r => {
      responseMessage += `${r.address}: ${r.airdropAmount}\n`;
    });
    responseMessage += '\n';
  }

  if (notEligible.length > 0) {
    responseMessage += '❌ Not Eligible:\n';
    notEligible.forEach(r => {
      responseMessage += `${r.address}\n`;
    });
    responseMessage += '\n';
  }

  if (errors.length > 0) {
    responseMessage += '⚠️ Ошибки проверки:\n';
    errors.forEach(r => {
      responseMessage += `${r.address}\n`;
    });
    responseMessage += '\n';
  }

  if (invalidAddresses.length > 0) {
    responseMessage += '🚫 Некорректные адреса:\n';
    invalidAddresses.forEach(address => {
      responseMessage += `${address}\n`;
    });
  }
  
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    ctx.session.promptMessageId,
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

  // Сбрасываем выбранный проект после обработки адресов
  ctx.session.selectedProject = undefined;

  // После успешной проверки адресов увеличиваем счетчик
  userDb.incrementAddressChecks(ctx.from.id);
}

// Handle project selection and back button
bot.on('callback_query', async (ctx) => {
  if (!ctx.callbackQuery) return;
  const callbackQuery = ctx.callbackQuery;
  
  if (!isDataQuery(callbackQuery)) return;

  const data = callbackQuery.data;
  
  // Handle back button
  if (data === 'back') {
    ctx.session.selectedProject = undefined;  // Очищаем выбранный проект
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
      // Сохраняем ID сообщения в сессии
      ctx.session = {
        promptMessageId: callbackQuery.message?.message_id,
        selectedProject: project
      };

      const addressTypeText = getAddressTypeDisplay(project.addressType);

      await ctx.editMessageText(
        `Вы выбрали ${project.name}.\nПожалуйста, введите ${addressTypeText} (каждый адрес на новой строке, максимум ${MAX_ADDRESSES}) или отправьте их текстовым файлом:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Назад', callback_data: 'back' }]
            ]
          }
        }
      );
    }
  }
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  // Пропускаем команды
  if (ctx.message.text.startsWith('/')) return;

  // Логируем сообщение
  await auditLogger.logMessage(
    ctx.from.id,
    ctx.from.username,
    ctx.message.text
  );

  // Обрабатываем адреса только если выбран проект
  if (ctx.session?.selectedProject) {
    const addresses = ctx.message.text.split('\n').map((addr: string) => addr.trim()).filter((addr: string) => addr);
    await handleAddresses(ctx, addresses, ctx.session.selectedProject);
  }
});

// Обработка документов
bot.on('document', async (ctx) => {
  // Логируем полученное файла
  await auditLogger.logMessage(
    ctx.from.id,
    ctx.from.username,
    `[Файл: ${ctx.message.document.file_name || 'без имени'}]`
  );

  // Обрабатываем файл только если выбран про��кт
  if (ctx.session?.selectedProject) {
    if (ctx.message.document.mime_type !== 'text/plain') {
      await ctx.reply('Пожалуйста, отправьте текстовый файл (.txt)');
      return;
    }

    try {
      const file = await ctx.telegram.getFile(ctx.message.document.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const text = await response.text();
      
      const addresses = text.split('\n').map(addr => addr.trim()).filter(addr => addr);
      await handleAddresses(ctx, addresses, ctx.session.selectedProject);
    } catch (error) {
      console.error('File reading error:', error);
      await ctx.reply('Ошибка при чтении файла. Пожалуйста, убедитесь, что это текстовый файл с адресами.');
    }
  }
});

// Enable graceful stop
process.once('SIGINT', () => {
  auditLogger.logSystemEvent(0, undefined, '🔄 Бот остановлен (SIGINT)').finally(() => {
    bot.stop('SIGINT');
  });
});

process.once('SIGTERM', () => {
  auditLogger.logSystemEvent(0, undefined, '🔄 Бот остановлен (SIGTERM)').finally(() => {
    bot.stop('SIGTERM');
  });
});

// Логируем запуск бота
auditLogger.logSystemEvent(
  0, // системный ID для событий бота
  undefined,
  '🤖 Бот запущен'
);

// Launch the bot
bot.launch().catch(error => {
  console.error('Failed to start bot:', error);
});