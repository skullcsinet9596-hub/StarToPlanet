import { Telegraf } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import { checkConnection, initDB, getUser, updateUser, getTopPlayers, getPlayerRank, getTotalPlayers } from './db.js';

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

app.use(express.json());
app.use(express.static('frontend'));

app.get('/api/leaderboard', async (req, res) => {
    const top = await getTopPlayers(20);
    res.json(top);
});

app.get('/api/user/:userId', async (req, res) => {
    const user = await getUser(parseInt(req.params.userId));
    res.json({
        coins: user.coins,
        energy: user.energy,
        maxEnergy: user.max_energy,
        clickPower: user.click_power,
        passiveIncomeLevel: user.passive_income_level,
        hasMoon: user.has_moon,
        hasEarth: user.has_earth,
        hasSun: user.has_sun
    });
});

app.post('/api/save', async (req, res) => {
    const { userId, gameData } = req.body;
    if (userId && gameData) {
        await updateUser(parseInt(userId), {
            coins: gameData.coins,
            energy: gameData.energy,
            max_energy: gameData.maxEnergy,
            click_power: gameData.clickPower,
            passive_income_level: gameData.passiveIncomeLevel,
            has_moon: gameData.hasMoon,
            has_earth: gameData.hasEarth,
            has_sun: gameData.hasSun
        });
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Веб-сервер на порту ${PORT}`);
});

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'игрок';
    await updateUser(userId, { name: userName });
    const user = await getUser(userId);
    const rank = await getPlayerRank(userId);
    const total = await getTotalPlayers();
    
    await ctx.replyWithHTML(`
🌟 <b>Добро пожаловать, ${userName}!</b> 🌟

💰 Баланс: ${user.coins} монет
⚡ Энергия: ${user.energy}/${user.max_energy}
💪 Сила клика: ${user.click_power}
🏆 Место в рейтинге: #${rank} из ${total}

🎮 Нажми на кнопку ниже!
    `, {
        reply_markup: {
            inline_keyboard: [[{ text: '✨ ЗАПУСТИТЬ ИГРУ ✨', web_app: { url: APP_URL } }]]
        }
    });
});

bot.command('rating', async (ctx) => {
    const top = await getTopPlayers(10);
    let msg = '🏆 ТОП ИГРОКОВ 🏆\n\n';
    if (top.length === 0) {
        msg += 'Пока нет игроков. Будь первым!';
    } else {
        for (let i = 0; i < top.length; i++) {
            msg += `${i+1}. ${top[i].name} — ${top[i].coins} 🪙\n`;
        }
    }
    await ctx.reply(msg);
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data);
        await updateUser(ctx.from.id, data);
        await ctx.reply('✅ Данные сохранены!');
    } catch (e) {
        console.error(e);
        await ctx.reply('❌ Ошибка сохранения');
    }
});

// ========== ЗАПУСК С ПРОВЕРКОЙ ==========
const isConnected = await checkConnection();
if (!isConnected) {
    console.error('❌ Критическая ошибка: не удалось подключиться к базе данных');
    console.error('❌ Бот остановлен из соображений безопасности');
    process.exit(1);
}

await initDB();
bot.launch();
console.log('🤖 Star to Planet Bot запущен с безопасным SSL подключением!');