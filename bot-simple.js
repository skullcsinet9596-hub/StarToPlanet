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

// Простой веб-сервер для Render
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log(`✅ Веб-сервер запущен на порту ${PORT}`);
});

bot.start(async (ctx) => {
    await ctx.reply('✅ Бот работает! Отправь /ping');
});

bot.command('ping', async (ctx) => {
    await ctx.reply('pong 🏓');
});

bot.launch();
console.log('✅ Простой бот запущен');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));