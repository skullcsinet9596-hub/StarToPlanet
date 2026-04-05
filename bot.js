import { Telegraf } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

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

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Инициализация таблицы
await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255) DEFAULT 'Игрок',
        coins NUMERIC DEFAULT 0,
        energy INT DEFAULT 100,
        max_energy INT DEFAULT 100,
        click_power INT DEFAULT 1,
        passive_income_level INT DEFAULT 0,
        has_moon BOOLEAN DEFAULT FALSE,
        has_earth BOOLEAN DEFAULT FALSE,
        has_sun BOOLEAN DEFAULT FALSE,
        last_active_time BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    )
`);
console.log('✅ Таблица users готова');

// Функции БД
async function getUser(userId) {
    let res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (res.rows.length === 0) {
        await pool.query('INSERT INTO users (id) VALUES ($1)', [userId]);
        res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    }
    return res.rows[0];
}

async function updateUser(userId, data) {
    const user = await getUser(userId);
    
    // Безопасное преобразование чисел
    let coinsValue = 0;
    if (data.coins !== undefined) {
        coinsValue = parseFloat(data.coins);
        if (isNaN(coinsValue) || coinsValue > 1e15) coinsValue = user.coins;
    } else {
        coinsValue = user.coins;
    }
    
    const updated = { ...user, ...data, coins: coinsValue };
    await pool.query(
        `UPDATE users SET 
            name=$2, coins=$3, energy=$4, max_energy=$5,
            click_power=$6, passive_income_level=$7,
            has_moon=$8, has_earth=$9, has_sun=$10, last_active_time=$11
        WHERE id=$1`,
        [userId, updated.name, updated.coins, updated.energy,
         updated.max_energy, updated.click_power, updated.passive_income_level,
         updated.has_moon, updated.has_earth, updated.has_sun, Date.now()]
    );
}

async function getTopPlayers(limit = 20) {
    const res = await pool.query('SELECT id, name, coins FROM users ORDER BY coins DESC LIMIT $1', [limit]);
    return res.rows;
}

// API
app.use(express.json());
app.use(express.static('frontend'));

app.get('/api/leaderboard', async (req, res) => {
    const top = await getTopPlayers(20);
    res.json(top);
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await getUser(parseInt(req.params.userId));
        res.json({
            coins: Number(user.coins),
            energy: user.energy,
            maxEnergy: user.max_energy,
            clickPower: user.click_power,
            passiveIncomeLevel: user.passive_income_level,
            hasMoon: user.has_moon,
            hasEarth: user.has_earth,
            hasSun: user.has_sun
        });
    } catch (e) {
        res.json({ coins: 0, energy: 100, maxEnergy: 100, clickPower: 1, passiveIncomeLevel: 0 });
    }
});

app.post('/api/save', async (req, res) => {
    const { userId, gameData } = req.body;
    if (userId && gameData) {
        try {
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
        } catch (e) {
            res.json({ success: false });
        }
    } else {
        res.json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Веб-сервер на порту ${PORT}`);
});

// Команды бота
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let userName = ctx.from.username || ctx.from.first_name || 'игрок';
    if (ctx.from.username) userName = `@${ctx.from.username}`;
    
    await updateUser(userId, { name: userName });
    const user = await getUser(userId);
    
    const rankRes = await pool.query('SELECT COUNT(*) FROM users WHERE coins > $1', [user.coins]);
    const rank = parseInt(rankRes.rows[0].count) + 1;
    const totalRes = await pool.query('SELECT COUNT(*) FROM users');
    const total = parseInt(totalRes.rows[0].count);
    
    await ctx.replyWithHTML(`
🌟 <b>Star to Planet</b> 🌟

👤 <b>Игрок:</b> ${userName}
💰 <b>Баланс:</b> ${Number(user.coins).toLocaleString()} 🪙
⚡ <b>Энергия:</b> ${user.energy}/${user.max_energy}
💪 <b>Сила клика:</b> ${user.click_power}
🏆 <b>Рейтинг:</b> #${rank} из ${total}

🎮 Нажми на кнопку ниже!
    `, {
        reply_markup: {
            inline_keyboard: [[{ text: '✨ ИГРАТЬ ✨', web_app: { url: APP_URL } }]]
        }
    });
});

bot.command('rating', async (ctx) => {
    const top = await getTopPlayers(10);
    let msg = '🏆 <b>ТОП ИГРОКОВ</b> 🏆\n\n';
    for (let i = 0; i < top.length; i++) {
        msg += `${i+1}. ${top[i].name} — ${Number(top[i].coins).toLocaleString()} 🪙\n`;
    }
    await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data);
        await updateUser(ctx.from.id, data);
    } catch (e) {}
});

// Запуск
await bot.telegram.deleteWebhook();
await initDB();
bot.launch();
console.log('🤖 Бот запущен!');