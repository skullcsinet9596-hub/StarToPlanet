const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !APP_URL) {
    console.error('❌ BOT_TOKEN или APP_URL не найдены в .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());

// Простой API для проверки
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ========== КОМАНДЫ БОТА ==========

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const text = ctx.message?.text || '';
        
        let referrerId = null;
        if (text && text.includes('ref_')) {
            const parts = text.split(' ');
            if (parts.length > 1 && parts[1] && parts[1].startsWith('ref_')) {
                const refNum = parseInt(parts[1].replace('ref_', ''));
                if (!isNaN(refNum) && refNum !== user.id) {
                    referrerId = refNum;
                }
            }
        }

        const webAppUrl = `${APP_URL}?startapp=ref_${user.id}`;
        const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;

        let message = `⭐ Star to Planet ⭐\n\n`;
        message += `Привет, ${user.first_name}!\n\n`;
        message += `Добро пожаловать в игру!\n\n`;
        
        if (referrerId) {
            message += `🎉 Вас пригласили! +500 монет бонусом!\n\n`;
        }
        
        message += `💰 Реферальная программа:\n`;
        message += `• 1 уровень: 50% от дохода друга\n`;
        message += `• 2 уровень: 20%\n`;
        message += `• 3 уровень: 10%\n\n`;
        
        message += `Ваша ссылка:\n${referralLink}\n\n`;
        message += `Нажми кнопку, чтобы начать!`;

        await ctx.reply(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Открыть игру', web_app: { url: webAppUrl } }],
                    [{ text: '👥 Пригласить друга', url: referralLink }]
                ]
            }
        });
    } catch (err) {
        console.error('Ошибка в start:', err.message);
        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
});

bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
});

bot.help((ctx) => {
    ctx.reply(`Команды:\n/start — начать\n/ping — проверить работу бота`);
});

// ========== ЗАПУСК ==========
async function start() {
    try {
        // Удаляем вебхук и запускаем в режиме long polling
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        await bot.launch({ webhook: false });
        
        console.log('✅ Бот успешно запущен');
        
        const me = await bot.telegram.getMe();
        console.log(`🤖 Username: @${me.username}`);
        
        // Запускаем API сервер
        app.listen(PORT, () => {
            console.log(`🌐 API: http://localhost:${PORT}/api/health`);
        });
    } catch (err) {
        console.error('❌ Ошибка при запуске:', err.message);
        process.exit(1);
    }
}

start();

process.once('SIGINT', () => {
    console.log('🛑 Остановка...');
    bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log('🛑 Остановка...');
    bot.stop('SIGTERM');
    process.exit(0);
});