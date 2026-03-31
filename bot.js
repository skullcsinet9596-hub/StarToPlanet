const { Telegraf } = require('telegraf');
const db = require('./database');
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

// ========== API ENDPOINTS ==========

app.get('/api/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const leaderboard = await db.getLeaderboard(limit);
        res.json(leaderboard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/:telegramId', async (req, res) => {
    try {
        const user = await db.getUser(parseInt(req.params.telegramId));
        const stats = await db.getStats(parseInt(req.params.telegramId));
        const dailyTasks = await db.getDailyTasks(parseInt(req.params.telegramId));
        const weeklyTasks = await db.getWeeklyTasks(parseInt(req.params.telegramId));
        res.json({ user, stats, dailyTasks, weeklyTasks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/friends/:telegramId', async (req, res) => {
    try {
        const friends = await db.getReferrals(parseInt(req.params.telegramId));
        res.json(friends);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/referral-structure/:telegramId', async (req, res) => {
    try {
        const structure = await db.getReferralsByLevel(parseInt(req.params.telegramId));
        res.json(structure);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/update', async (req, res) => {
    try {
        const { telegramId, gameData } = req.body;
        await db.updateUserGameData(telegramId, gameData);
        
        // Обновляем прогресс заданий
        const user = await db.getUser(telegramId);
        const previousCoins = user?.coins || 0;
        const coinsEarned = Math.max(0, gameData.coins - previousCoins);
        
        if (gameData.dailyClickCount) {
            await db.updateDailyProgress(telegramId, gameData.dailyClickCount, coinsEarned);
            await db.updateWeeklyProgress(telegramId, gameData.weeklyClickCount, coinsEarned);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/daily-bonus', async (req, res) => {
    try {
        const { telegramId } = req.body;
        const result = await db.claimDailyBonus(telegramId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/claim-task', async (req, res) => {
    try {
        const { telegramId, taskType, taskPeriod } = req.body;
        let result;
        
        if (taskPeriod === 'daily') {
            result = await db.claimDailyTask(telegramId, taskType);
        } else {
            result = await db.claimWeeklyTask(telegramId, taskType);
        }
        
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/toggle-sound', async (req, res) => {
    try {
        const { telegramId } = req.body;
        const soundEnabled = await db.toggleSound(telegramId);
        res.json({ soundEnabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== КОМАНДЫ БОТА ==========

bot.start(async (ctx) => {
    const user = ctx.from;
    const text = ctx.message.text;
    
    let referrerId = null;
    const parts = text.split(' ');
    if (parts.length > 1 && parts[1].startsWith('ref_')) {
        referrerId = parseInt(parts[1].replace('ref_', ''));
        if (referrerId === user.id) referrerId = null;
    }

    await db.createUser(user.id, user.username || user.first_name, user.first_name, referrerId);

    const webAppUrl = `${APP_URL}?startapp=ref_${user.id}`;
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;

    let message = `⭐ <b>Star to Planet</b> ⭐\n\n`;
    message += `Привет, ${user.first_name}!\n\n`;
    message += `Добро пожаловать в игру!\n\n`;
    
    if (referrerId) {
        message += `🎉 Вас пригласили! +500 монет бонусом!\n\n`;
    }
    
    message += `<b>💰 Реферальная программа:</b>\n`;
    message += `• 1 уровень: 50% от дохода друга\n`;
    message += `• 2 уровень: 20%\n`;
    message += `• 3 уровень: 10%\n\n`;
    
    message += `<b>🎁 Ежедневный бонус:</b>\n`;
    message += `• Заходи каждый день и получай до 2000 монет!\n\n`;
    
    message += `<b>Ваша ссылка:</b>\n`;
    message += `<code>${referralLink}</code>\n\n`;
    message += `<i>Нажми кнопку, чтобы начать!</i>`;

    ctx.replyWithHTML(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 Открыть игру', web_app: { url: webAppUrl } }],
                [{ text: '🎁 Ежедневный бонус', callback_data: 'daily_bonus' }],
                [{ text: '👥 Пригласить друга', url: referralLink }]
            ]
        }
    });
});

bot.action('daily_bonus', async (ctx) => {
    const result = await db.claimDailyBonus(ctx.from.id);
    if (result.success) {
        await ctx.answerCbQuery(`🎉 +${result.bonus} монет! Стрик: ${result.streak} дней`);
        await ctx.replyWithHTML(`🎉 <b>Ежедневный бонус!</b>\n+${result.bonus} 🪙\n🔥 Стрик: ${result.streak} дней`);
    } else {
        await ctx.answerCbQuery(result.message);
    }
});

bot.command('referral', async (ctx) => {
    const link = `https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}`;
    const stats = await db.getStats(ctx.from.id);
    ctx.replyWithHTML(`👥 <b>Ваша ссылка</b>\n<code>${link}</code>\n\n📊 Друзей: ${stats.referralsCount}\n🎁 Бонусов: ${stats.totalReferralBonus} 🪙`);
});

bot.command('structure', async (ctx) => {
    const structure = await db.getReferralsByLevel(ctx.from.id);
    ctx.reply(`🌳 Ваша структура:\n⭐ 1 уровень: ${structure.level1.length}\n✨ 2 уровень: ${structure.level2.length}\n💫 3 уровень: ${structure.level3.length}`);
});

bot.command('top', async (ctx) => {
    const top = await db.getLeaderboard(10);
    let msg = `🏆 Топ-10:\n`;
    top.forEach((p, i) => {
        msg += `${i+1}. ${p.first_name || p.username} — ${p.coins.toLocaleString()} 🪙\n`;
    });
    ctx.reply(msg);
});

bot.command('daily', async (ctx) => {
    const result = await db.claimDailyBonus(ctx.from.id);
    if (result.success) {
        ctx.reply(`🎉 Ежедневный бонус: +${result.bonus} монет! Стрик: ${result.streak} дней`);
    } else {
        ctx.reply(`❌ ${result.message}`);
    }
});

bot.help((ctx) => {
    ctx.reply(`📖 Помощь:\n/start — начать\n/daily — ежедневный бонус\n/referral — ссылка\n/structure — структура\n/top — рейтинг`);
});

// ========== ЗАПУСК ==========
async function start() {
    try {
        await db.initializeDatabase();
        console.log('✅ База данных подключена');
        
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        await bot.launch({ webhook: false });
        
        console.log('✅ Бот успешно запущен в режиме long polling');
        
        const me = await bot.telegram.getMe();
        console.log(`🤖 Username: @${me.username}`);
        
        app.listen(PORT, () => {
            console.log(`🌐 API: http://localhost:${PORT}/api/leaderboard`);
        });
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
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