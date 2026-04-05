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

// ========== БАЗА ДАННЫХ ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            name VARCHAR(255) DEFAULT 'Игрок',
            coins BIGINT DEFAULT 0,
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
}

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
    const updated = { ...user, ...data };
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

async function getTopPlayers(limit = 10) {
    const res = await pool.query(
        'SELECT id, name, coins FROM users ORDER BY coins DESC LIMIT $1',
        [limit]
    );
    return res.rows;
}

async function getPlayerRank(userId) {
    const res = await pool.query(
        'SELECT COUNT(*) FROM users WHERE coins > (SELECT COALESCE(coins,0) FROM users WHERE id=$1)',
        [userId]
    );
    return parseInt(res.rows[0].count) + 1;
}

async function getTotalPlayers() {
    const res = await pool.query('SELECT COUNT(*) FROM users');
    return parseInt(res.rows[0].count);
}

// ========== API ==========
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

// ========== КОМАНДЫ БОТА ==========
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let userName = ctx.from.username || ctx.from.first_name || 'игрок';
    if (ctx.from.username) userName = `@${ctx.from.username}`;
    
    await updateUser(userId, { name: userName });
    const user = await getUser(userId);
    const rank = await getPlayerRank(userId);
    const total = await getTotalPlayers();
    
    await ctx.replyWithHTML(`
🌟 <b>Star to Planet</b> 🌟

👤 <b>Игрок:</b> ${userName}
💰 <b>Баланс:</b> ${user.coins} 🪙
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
        msg += `${i+1}. ${top[i].name} — ${top[i].coins} 🪙\n`;
    }
    await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data);
        const userId = ctx.from.id;
        console.log('📥 web_app_data от', userId, 'монет:', data.coins);
        await updateUser(userId, data);
    } catch (e) {
        console.error('❌ Ошибка:', e);
    }
});

// ========== ЗАПУСК С УДАЛЕНИЕМ ВЕБХУКА ==========
try {
    await bot.telegram.deleteWebhook();
    console.log('✅ Вебхук удалён');
} catch (err) {
    console.log('⚠️ Ошибка удаления вебхука:', err.message);
}

await initDB();
bot.launch();
console.log('🤖 Бот запущен!');