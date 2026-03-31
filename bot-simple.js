const { Telegraf } = require('telegraf');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден в .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

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