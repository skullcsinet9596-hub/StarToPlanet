const { Telegraf } = require('telegraf');
const db = require('./database');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден в файле .env');
    process.exit(1);
}

if (!APP_URL) {
    console.error('❌ APP_URL не найден в файле .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());

// ==================== API ENDPOINTS ====================

// Получение рейтинга
app.get('/api/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const leaderboard = await db.getLeaderboard(limit);
        res.json(leaderboard);
    } catch (error) {
        console.error('Ошибка получения рейтинга:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение статистики пользователя
app.get('/api/user/:telegramId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegramId);
        const stats = await db.getStats(telegramId);
        res.json(stats);
    } catch (error) {
        console.error('Ошибка получения пользователя:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение списка друзей
app.get('/api/friends/:telegramId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegramId);
        const referrals = await db.getReferrals(telegramId);
        res.json(referrals);
    } catch (error) {
        console.error('Ошибка получения списка друзей:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновление прогресса пользователя
app.post('/api/update', async (req, res) => {
    try {
        const { telegramId, coins, clickPower, maxEnergy } = req.body;
        
        await db.updateUserProgress(telegramId, coins, clickPower, maxEnergy);
        
        const stats = await db.getStats(telegramId);
        res.json(stats);
    } catch (error) {
        console.error('Ошибка обновления:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Запуск HTTP сервера
app.listen(PORT, () => {
    console.log(`🌐 API сервер запущен на порту ${PORT}`);
    console.log(`📊 Рейтинг: http://localhost:${PORT}/api/leaderboard`);
});

// ==================== КОМАНДЫ БОТА ====================

async function startBot() {
    try {
        await db.initializeDatabase();
        console.log('✅ База данных подключена');
        
        await bot.launch();
        console.log('✅ Бот успешно запущен!');
        
        const me = await bot.telegram.getMe();
        console.log(`🤖 Username: @${me.username}`);
        console.log(`📱 Откройте Telegram и найдите своего бота`);
        console.log(`💬 Отправьте команду /start`);
        
    } catch (err) {
        console.error('❌ Ошибка при запуске:', err.message);
        process.exit(1);
    }
}

// Команда /start
bot.start(async (ctx) => {
    const user = ctx.from;
    const messageText = ctx.message.text;
    
    let referrerId = null;
    const parts = messageText.split(' ');
    if (parts.length > 1 && parts[1].startsWith('ref_')) {
        referrerId = parseInt(parts[1].replace('ref_', ''));
        if (referrerId === user.id) referrerId = null;
    }
    
    await db.createUser(
        user.id,
        user.username || user.first_name,
        user.first_name,
        referrerId
    );
    
    const webAppUrl = `${APP_URL}?startapp=ref_${user.id}`;
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;
    
    let message = `⭐ <b>Star to Planet</b> ⭐\n\n`;
    message += `Привет, ${user.first_name}!\n\n`;
    message += `Добро пожаловать в игру, где звезда превращается в планету!\n\n`;
    
    if (referrerId) {
        message += `🎉 Вас кто-то пригласил! Вы получили <b>+500 монет</b> бонусом!\n\n`;
    }
    
    message += `<b>Как играть:</b>\n`;
    message += `• Нажимай на звезду, чтобы зарабатывать монеты\n`;
    message += `• Покупай улучшения для увеличения дохода\n`;
    message += `• Приглашай друзей и получай бонусы!\n\n`;
    
    message += `<b>💰 Реферальная программа:</b>\n`;
    message += `• За каждого приглашенного друга: <b>1000 монет</b>\n`;
    message += `• Друг получает: <b>500 монет</b>\n\n`;
    
    message += `<b>Ваша ссылка:</b>\n`;
    message += `<code>${referralLink}</code>\n\n`;
    
    message += `<i>Нажми на кнопку ниже, чтобы начать!</i>`;
    
    ctx.replyWithHTML(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 Открыть игру', web_app: { url: webAppUrl } }],
                [{ text: '👥 Пригласить друга', url: referralLink }]
            ]
        }
    });
});

// Команда /referral
bot.command('referral', async (ctx) => {
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}`;
    const stats = await db.getStats(ctx.from.id);
    
    const message = `
👥 <b>Ваша реферальная программа</b>

🔗 <b>Ваша ссылка:</b>
<code>${referralLink}</code>

📊 <b>Статистика:</b>
• Приглашено друзей: <b>${stats.referralsCount || 0}</b>
• Получено бонусов: <b>${stats.totalReferralBonus || 0}</b> 🪙
• Место в рейтинге: <b>#${stats.leaderboardPosition || '?'}</b>

<i>Отправьте ссылку друзьям и получайте бонусы!</i>
    `;
    
    ctx.replyWithHTML(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '👥 Поделиться', url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=⭐ Присоединяйся к Star to Planet! Получи бонус 500 монет!` }]
            ]
        }
    });
});

// Команда /top
bot.command('top', async (ctx) => {
    try {
        const leaderboard = await db.getLeaderboard(10);
        const stats = await db.getStats(ctx.from.id);
        
        let text = `🏆 <b>Топ-10 игроков</b>\n\n`;
        
        for (let i = 0; i < leaderboard.length; i++) {
            const player = leaderboard[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            text += `${medal} <b>${player.first_name || player.username}</b> — ${player.coins?.toLocaleString() || 0} 🪙\n`;
        }
        
        text += `\n📊 Ваша позиция: <b>#${stats?.leaderboardPosition || '?'}</b>`;
        
        ctx.replyWithHTML(text);
    } catch(e) {
        console.error('Ошибка:', e);
        ctx.reply('❌ Ошибка загрузки рейтинга');
    }
});

// Команда /help
bot.help((ctx) => {
    ctx.reply(`
📖 <b>Star to Planet — помощь</b>

🎮 <b>Как играть:</b>
Нажимай на звезду, чтобы зарабатывать монеты

📈 <b>Улучшения:</b>
• Сила клика: увеличивает доход
• Энергия: больше кликов
• Пассивный доход: монеты в минуту

👥 <b>Рефералы:</b>
Приглашай друзей и получай 1000 монет за каждого!

🏆 <b>Рейтинг:</b>
Соревнуйся с другими игроками!
    `, { parse_mode: 'HTML' });
});

startBot();