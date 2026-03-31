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
        const telegramId = parseInt(req.params.telegramId);
        if (isNaN(telegramId)) {
            return res.status(400).json({ error: 'Invalid telegramId' });
        }
        const user = await db.getUser(telegramId);
        const stats = await db.getStats(telegramId);
        const dailyTasks = await db.getDailyTasks(telegramId);
        const weeklyTasks = await db.getWeeklyTasks(telegramId);
        res.json({ user, stats, dailyTasks, weeklyTasks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/friends/:telegramId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegramId);
        if (isNaN(telegramId)) {
            return res.status(400).json({ error: 'Invalid telegramId' });
        }
        const friends = await db.getReferrals(telegramId);
        res.json(friends);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/referral-structure/:telegramId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegramId);
        if (isNaN(telegramId)) {
            return res.status(400).json({ error: 'Invalid telegramId' });
        }
        const structure = await db.getReferralsByLevel(telegramId);
        res.json(structure);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/update', async (req, res) => {
    try {
        const { telegramId, gameData } = req.body;
        if (!telegramId || isNaN(parseInt(telegramId))) {
            return res.status(400).json({ error: 'Invalid telegramId' });
        }
        await db.updateUserGameData(parseInt(telegramId), gameData);
        
        const user = await db.getUser(parseInt(telegramId));
        const previousCoins = user?.coins || 0;
        const coinsEarned = Math.max(0, gameData.coins - previousCoins);
        
        if (gameData.dailyClickCount) {
            await db.updateDailyProgress(parseInt(telegramId), gameData.dailyClickCount || 0, coinsEarned);
            await db.updateWeeklyProgress(parseInt(telegramId), gameData.weeklyClickCount || 0, coinsEarned);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/daily-bonus', async (req, res) => {
    try {
        const { telegramId } = req.body;
        if (!telegramId || isNaN(parseInt(telegramId))) {
            return res.status(400).json({ error: 'Invalid telegramId' });
        }
        const result = await db.claimDailyBonus(parseInt(telegramId));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/claim-task', async (req, res) => {
    try {
        const { telegramId, taskType, taskPeriod } = req.body;
        if (!telegramId || isNaN(parseInt(telegramId))) {
            return res.status(400).json({ error: 'Invalid telegramId' });
        }
        let result;
        if (taskPeriod === 'daily') {
            result = await db.claimDailyTask(parseInt(telegramId), taskType);
        } else {
            result = await db.claimWeeklyTask(parseInt(telegramId), taskType);
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/toggle-sound', async (req, res) => {
    try {
        const { telegramId } = req.body;
        if (!telegramId || isNaN(parseInt(telegramId))) {
            return res.status(400).json({ error: 'Invalid telegramId' });
        }
        const soundEnabled = await db.toggleSound(parseInt(telegramId));
        res.json({ soundEnabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== КОМАНДЫ БОТА ==========

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        // ✅ БЕЗОПАСНО: проверяем, существует ли текст сообщения
        const text = ctx.message && ctx.message.text ? ctx.message.text : '';
        let referrerId = null;

        // ✅ БЕЗОПАСНАЯ ПРОВЕРКА — ТЕПЕРЬ ТОЧНО БЕЗ ОШИБОК
        if (text && typeof text === 'string') {
            const parts = text.split(' ');
            // Проверяем, что parts[1] существует и является строкой
            if (parts.length > 1 && parts[1] && typeof parts[1] === 'string' && parts[1].startsWith('ref_')) {
                const refNum = parseInt(parts[1].replace('ref_', ''));
                if (!isNaN(refNum) && refNum !== user.id) {
                    referrerId = refNum;
                }
            }
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

        await ctx.replyWithHTML(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Открыть игру', web_app: { url: webAppUrl } }],
                    [{ text: '🎁 Ежедневный бонус', callback_data: 'daily_bonus' }],
                    [{ text: '👥 Пригласить друга', url: referralLink }]
                ]
            }
        });
    } catch (err) {
        console.error('Ошибка в start:', err.message);
        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
});

bot.action('daily_bonus', async (ctx) => {
    try {
        const result = await db.claimDailyBonus(ctx.from.id);
        if (result.success) {
            await ctx.answerCbQuery(`🎉 +${result.bonus} монет! Стрик: ${result.streak} дней`);
            await ctx.replyWithHTML(`🎉 <b>Ежедневный бонус!</b>\n+${result.bonus} 🪙\n🔥 Стрик: ${result.streak} дней`);
        } else {
            await ctx.answerCbQuery(result.message || 'Бонус уже получен сегодня!');
        }
    } catch (err) {
        console.error('Ошибка в daily_bonus:', err.message);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

bot.command('referral', async (ctx) => {
    try {
        const link = `https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}`;
        const stats = await db.getStats(ctx.from.id);
        await ctx.replyWithHTML(`👥 <b>Ваша ссылка</b>\n<code>${link}</code>\n\n📊 Друзей: ${stats.referralsCount}\n🎁 Бонусов: ${stats.totalReferralBonus} 🪙`);
    } catch (err) {
        console.error('Ошибка в referral:', err.message);
        await ctx.reply('❌ Ошибка');
    }
});

bot.command('structure', async (ctx) => {
    try {
        const structure = await db.getReferralsByLevel(ctx.from.id);
        await ctx.reply(`🌳 Ваша структура:\n⭐ 1 уровень: ${structure.level1.length}\n✨ 2 уровень: ${structure.level2.length}\n💫 3 уровень: ${structure.level3.length}`);
    } catch (err) {
        console.error('Ошибка в structure:', err.message);
        await ctx.reply('❌ Ошибка');
    }
});

bot.command('top', async (ctx) => {
    try {
        const top = await db.getLeaderboard(10);
        let msg = `🏆 Топ-10:\n`;
        top.forEach((p, i) => {
            msg += `${i+1}. ${p.first_name || p.username || 'Игрок'} — ${p.coins.toLocaleString()} 🪙\n`;
        });
        await ctx.reply(msg);
    } catch (err) {
        console.error('Ошибка в top:', err.message);
        await ctx.reply('❌ Ошибка');
    }
});

bot.command('daily', async (ctx) => {
    try {
        const result = await db.claimDailyBonus(ctx.from.id);
        if (result.success) {
            await ctx.reply(`🎉 Ежедневный бонус: +${result.bonus} монет! Стрик: ${result.streak} дней`);
        } else {
            await ctx.reply(`❌ ${result.message || 'Бонус уже получен сегодня!'}`);
        }
    } catch (err) {
        console.error('Ошибка в daily:', err.message);
        await ctx.reply('❌ Ошибка');
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