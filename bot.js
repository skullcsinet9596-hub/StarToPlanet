const { Telegraf } = require('telegraf');
const express = require('express');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден в .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// 🌐 Веб-сервер для Render
app.get('/', (req, res) => {
    res.send('✅ Star to Planet Bot is running!');
});

// 🎮 Команда /start
bot.start(async (ctx) => {
    const userName = ctx.from.first_name || 'игрок';
    await ctx.replyWithHTML(`
🌟 <b>Добро пожаловать в Star to Planet, ${userName}!</b> 🌟

🚀 <b>Как играть:</b>
• Тапай по звезде/планете — зарабатывай монеты
• Покупай апгрейды в разделе BOOST
• Выполняй задания и получай бонусы
• Приглашай друзей и получай реферальные награды

🎮 <b>Запустить игру:</b>
    `, {
        reply_markup: {
            inline_keyboard: [[
                { text: '✨ ЗАПУСТИТЬ ИГРУ ✨', web_app: { url: process.env.APP_URL || 'https://your-app.onrender.com' } }
            ]]
        }
    });
});

// 🏓 Команда /ping (проверка работы)
bot.command('ping', async (ctx) => {
    await ctx.reply('🏓 Pong! Бот работает отлично');
});

// ℹ️ Команда /help
bot.command('help', async (ctx) => {
    await ctx.reply(`
📖 <b>Команды бота:</b>
/start — начать игру
/ping — проверить работу бота
/help — показать эту справку

🎮 <b>Игровая механика:</b>
• Чем больше монет — тем выше уровень
• От звезды до Юпитера — 8 уровней
• Премиум-планеты: Луна, Земля, Солнце
    `, { parse_mode: 'HTML' });
});

// 📊 Команда /stats (статистика игрока)
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    // Здесь потом добавим базу данных
    await ctx.reply(`
📊 <b>Ваша статистика:</b>
🆔 ID: ${userId}
👤 Имя: ${ctx.from.first_name}
💰 Монет: 0 (сохранение в разработке)
⭐ Уровень: 0 (Белая звезда)

🔧 <b>Скоро появится:</b>
• Сохранение прогресса
• Таблица лидеров
• Реферальная система
    `, { parse_mode: 'HTML' });
});

// 🚀 Обработка данных из Mini App (если будут отправляться)
bot.on('web_app_data', async (ctx) => {
    const data = ctx.webAppData.data;
    try {
        const parsed = JSON.parse(data);
        console.log('📥 Получены данные из игры:', parsed);
        await ctx.reply('✅ Данные сохранены! (база данных подключается)');
    } catch (e) {
        console.log('Ошибка парсинга:', e);
    }
});

// Запуск веб-сервера
app.listen(PORT, () => {
    console.log(`✅ Веб-сервер запущен на порту ${PORT}`);
});

// Запуск бота (через Long Polling — работает на Render)
bot.launch();
console.log('🤖 Star to Planet Bot запущен!');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));