import { Telegraf } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import { 
    initDB, 
    getUser, 
    createUser, 
    updateUser, 
    getLeaderboard, 
    getPlayerRank,
    claimDailyBonus,
    getStats,
    toggleSound
} from './db.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const APP_URL = 'https://startoplanet.onrender.com';

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ========== API ==========
app.use(express.json());
app.use(express.static('frontend'));

app.get('/api/leaderboard', async (req, res) => {
    const top = await getLeaderboard(20);
    res.json(top);
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await getUser(parseInt(req.params.userId));
        if (!user) {
            res.json({ coins: 0, energy: 100, maxEnergy: 100, clickPower: 1, passiveIncomeLevel: 0 });
            return;
        }
        
        res.json({
            coins: Number(user.coins),
            energy: user.energy,
            maxEnergy: user.max_energy,
            clickPower: user.click_power,
            passiveIncomeLevel: user.passive_income_level,
            hasMoon: user.has_moon,
            hasEarth: user.has_earth,
            hasSun: user.has_sun,
            clickUpgradeLevel: user.click_upgrade_level,
            clickUpgradeCost: user.click_upgrade_cost,
            energyUpgradeLevel: user.energy_upgrade_level,
            energyUpgradeCost: user.energy_upgrade_cost,
            passiveIncomeUpgradeCost: user.passive_income_cost,
            soundEnabled: user.sound_enabled
        });
    } catch (e) {
        res.json({ coins: 0, energy: 100, maxEnergy: 100, clickPower: 1, passiveIncomeLevel: 0 });
    }
});

app.post('/api/save', async (req, res) => {
    const { userId, gameData } = req.body;
    console.log('📥 POST /api/save:', { userId, coins: gameData?.coins });
    if (userId && gameData) {
        await updateUser(parseInt(userId), {
            coins: gameData.coins,
            energy: gameData.energy,
            max_energy: gameData.maxEnergy,
            click_power: gameData.clickPower,
            passive_income_level: gameData.passiveIncomeLevel,
            has_moon: gameData.hasMoon,
            has_earth: gameData.hasEarth,
            has_sun: gameData.hasSun,
            click_upgrade_level: gameData.clickUpgradeLevel,
            click_upgrade_cost: gameData.clickUpgradeCost,
            energy_upgrade_level: gameData.energyUpgradeLevel,
            energy_upgrade_cost: gameData.energyUpgradeCost,
            passive_income_cost: gameData.passiveIncomeUpgradeCost,
            sound_enabled: gameData.soundEnabled
        });
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Веб-сервер на порту ${PORT}`);
});

// ========== КОМАНДЫ БОТА ==========
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let userName = ctx.from.username || ctx.from.first_name || 'игрок';
    if (ctx.from.username) userName = `@${ctx.from.username}`;
    
    // Проверяем реферальный код
    const referrerId = ctx.startPayload && !isNaN(parseInt(ctx.startPayload)) ? parseInt(ctx.startPayload) : null;
    
    let user = await getUser(userId);
    if (!user) {
        user = await createUser(userId, ctx.from.username, ctx.from.first_name, referrerId);
    } else {
        await updateUser(userId, { username: ctx.from.username, first_name: ctx.from.first_name });
    }
    
    const rank = await getPlayerRank(userId);
    const stats = await getStats(userId);
    
    await ctx.replyWithHTML(`
🌟 <b>Star to Planet</b> 🌟

👤 <b>Игрок:</b> ${userName}
💰 <b>Баланс:</b> ${Number(user.coins).toLocaleString()} 🪙
⚡ <b>Энергия:</b> ${user.energy}/${user.max_energy}
💪 <b>Сила клика:</b> ${user.click_power}
🏆 <b>Рейтинг:</b> #${rank}
👥 <b>Рефералов:</b> ${stats.referralsCount}

🎮 Нажми на кнопку ниже!
    `, {
        reply_markup: {
            inline_keyboard: [[{ text: '✨ ИГРАТЬ ✨', web_app: { url: APP_URL } }]]
        }
    });
});

bot.command('rating', async (ctx) => {
    const top = await getLeaderboard(10);
    let msg = '🏆 <b>ТОП ИГРОКОВ</b> 🏆\n\n';
    for (let i = 0; i < top.length; i++) {
        const name = top[i].username || top[i].first_name || 'Аноним';
        const level = top[i].level || 1;
        msg += `${i+1}. ${name} — ${Number(top[i].coins).toLocaleString()} 🪙 (Уровень ${level})\n`;
    }
    await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data);
        await updateUser(ctx.from.id, data);
        console.log('✅ Данные сохранены от', ctx.from.id);
    } catch (e) {
        console.error('Ошибка web_app_data:', e);
    }
});

// ========== ЗАПУСК ==========
await bot.telegram.deleteWebhook();
console.log('✅ Вебхук удалён');

await initDB();
bot.launch();
console.log('🤖 Бот запущен!');