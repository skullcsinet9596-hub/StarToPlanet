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

// ========== БАЗА ДАННЫХ С БЕЗОПАСНЫМ SSL ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: true  // ← БЕЗОПАСНО: проверка сертификата ВКЛЮЧЕНА
    },
    connectionTimeoutMillis: 10000
});

async function initDB() {
    try {
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
        console.log('✅ Таблица users создана');
        return true;
    } catch (err) {
        console.error('❌ Ошибка БД:', err.message);
        return false;
    }
}

async function checkConnection() {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('✅ Безопасное SSL подключение к Supabase установлено');
        return true;
    } catch (err) {
        console.error('❌ Ошибка подключения к Supabase:', err.message);
        return false;
    }
}

async function getUser(userId) {
    try {
        let res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0) {
            await pool.query('INSERT INTO users (id) VALUES ($1)', [userId]);
            res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        }
        return res.rows[0];
    } catch (err) {
        console.error('Ошибка getUser:', err.message);
        return {
            id: userId,
            name: 'Игрок',
            coins: 0,
            energy: 100,
            max_energy: 100,
            click_power: 1,
            passive_income_level: 0,
            has_moon: false,
            has_earth: false,
            has_sun: false
        };
    }
}

async function updateUser(userId, data) {
    try {
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
    } catch (err) {
        console.error('Ошибка updateUser:', err.message);
    }
}

async function getTopPlayers(limit = 10) {
    try {
        const res = await pool.query(
            'SELECT id, name, coins FROM users ORDER BY coins DESC LIMIT $1',
            [limit]
        );
        return res.rows;
    } catch (err) {
        return [];
    }
}

async function getPlayerRank(userId) {
    try {
        const res = await pool.query(
            'SELECT COUNT(*) FROM users WHERE coins > (SELECT COALESCE(coins,0) FROM users WHERE id=$1)',
            [userId]
        );
        return parseInt(res.rows[0].count) + 1;
    } catch (err) {
        return 1;
    }
}

async function getTotalPlayers() {
    try {
        const res = await pool.query('SELECT COUNT(*) FROM users');
        return parseInt(res.rows[0].count);
    } catch (err) {
        return 0;
    }
}

// ========== ВЕБ-СЕРВЕР ==========
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

// ========== КОМАНДЫ БОТА ==========
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

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const rank = await getPlayerRank(userId);
    const total = await getTotalPlayers();
    
    await ctx.reply(`
📊 <b>ВАША СТАТИСТИКА</b>

👤 <b>Игрок:</b> ${user.name}
🏆 <b>Место в рейтинге:</b> #${rank} из ${total}

💰 <b>Монет:</b> ${user.coins}
💪 <b>Сила клика:</b> ${user.click_power}
⚡ <b>Энергия:</b> ${user.energy}/${user.max_energy}
🤖 <b>Пассивный доход:</b> ${user.passive_income_level * 5} монет/мин
    `, { parse_mode: 'HTML' });
});

bot.command('ping', async (ctx) => {
    const total = await getTotalPlayers();
    await ctx.reply(`🏓 Pong! Бот работает\n📊 Всего игроков: ${total}`);
});

bot.command('help', async (ctx) => {
    await ctx.reply(`
📖 <b>КОМАНДЫ БОТА</b>

/start — Главное меню
/rating — Таблица лидеров
/stats — Моя статистика
/ping — Проверить работу бота
/help — Эта справка

🎮 <b>Как играть:</b>
1. Нажми "ЗАПУСТИТЬ ИГРУ"
2. Тапай по звезде/планете
3. Покупай улучшения в BOOST
4. Поднимайся в рейтинге!
    `, { parse_mode: 'HTML' });
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

// ========== ЗАПУСК С ПРОВЕРКОЙ ПОДКЛЮЧЕНИЯ ==========
const isConnected = await checkConnection();
if (!isConnected) {
    console.error('❌ Критическая ошибка: не удалось подключиться к базе данных');
    console.error('❌ Бот остановлен из соображений безопасности');
    process.exit(1);
}

await initDB();
bot.launch();
console.log('🤖 Star to Planet Bot запущен с безопасным SSL подключением!');