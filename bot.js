import { Telegraf } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import { initDB, getUser, updateUser, getTopPlayers, getPlayerRank, getTotalPlayers } from './db.js';

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
            has_sun: gameData.hasSun,
            last_active_time: Date.now()
        });
        const rank = await getPlayerRank(parseInt(userId));
        res.json({ success: true, rank });
    } else {
        res.json({ success: false });
    }
});

app.listen(PORT, () => console.log(`✅ Веб-сервер на порту ${PORT}`));

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'игрок';
    await updateUser(userId, { name: userName });
    
    const user = await getUser(userId);
    const rank = await getPlayerRank(userId);
    const totalPlayers = await getTotalPlayers();
    
    const passiveRate = user.passive_income_level * 5;
    
    await ctx.replyWithHTML(`
🌟 <b>Добро пожаловать в Star to Planet, ${userName}!</b> 🌟

💰 <b>Баланс:</b> ${user.coins} монет
⚡ <b>Энергия:</b> ${user.energy}/${user.max_energy}
💪 <b>Сила клика:</b> ${user.click_power}
🤖 <b>Пассивный доход:</b> ${passiveRate} монет/мин
🏆 <b>Место в рейтинге:</b> #${rank} из ${totalPlayers}

🎮 <b>Нажми на кнопку ниже, чтобы открыть игру!</b>
    `, {
        reply_markup: {
            inline_keyboard: [[{ text: '✨ ЗАПУСТИТЬ ИГРУ ✨', web_app: { url: APP_URL } }]]
        }
    });
});

bot.command('rating', async (ctx) => {
    const top = await getTopPlayers(10);
    let message = `🏆 <b>ТАБЛИЦА ЛИДЕРОВ</b> 🏆\n\n`;
    for (let i = 0; i < top.length; i++) {
        const p = top[i];
        message += `${i+1}. ${p.name} — ${p.coins} 🪙\n`;
    }
    await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const rank = await getPlayerRank(userId);
    const totalPlayers = await getTotalPlayers();
    
    await ctx.reply(`
📊 <b>ВАША СТАТИСТИКА</b>

👤 <b>Игрок:</b> ${user.name}
🏆 <b>Место в рейтинге:</b> #${rank} из ${totalPlayers}

💰 <b>Монет:</b> ${user.coins}
💪 <b>Сила клика:</b> ${user.click_power}
⚡ <b>Энергия:</b> ${user.energy}/${user.max_energy}
🤖 <b>Пассивный доход:</b> ${user.passive_income_level * 5} монет/мин
    `, { parse_mode: 'HTML' });
});

bot.on('web_app_data', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.webAppData.data;
    try {
        const gameData = JSON.parse(data);
        await updateUser(userId, {
            coins: gameData.coins,
            energy: gameData.energy,
            max_energy: gameData.maxEnergy,
            click_power: gameData.clickPower,
            passive_income_level: gameData.passiveIncomeLevel,
            has_moon: gameData.hasMoon,
            has_earth: gameData.hasEarth,
            has_sun: gameData.hasSun,
            last_active_time: Date.now()
        });
        await ctx.reply(`✅ Данные сохранены!`);
    } catch (e) {
        console.error(e);
        await ctx.reply('❌ Ошибка сохранения');
    }
});

// Инициализация БД и запуск
await initDB();
bot.launch();
console.log('🤖 Star to Planet Bot запущен с Supabase!');