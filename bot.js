const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || 'https://your-app.onrender.com/frontend/';

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден в .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ========== БАЗА ДАННЫХ ==========
const DB_FILE = 'users.json';

let users = {};
if (fs.existsSync(DB_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log(`✅ Загружено ${Object.keys(users).length} пользователей`);
    } catch(e) {
        console.log('Ошибка загрузки БД, создаю новую');
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function getUser(userId) {
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            name: '',
            coins: 0,
            energy: 100,
            maxEnergy: 100,
            clickPower: 1,
            passiveIncomeLevel: 0,
            clickUpgradeLevel: 1,
            energyUpgradeLevel: 1,
            hasMoon: false,
            hasEarth: false,
            hasSun: false,
            lastActiveTime: Date.now(),
            totalClicks: 0,
            totalFarmEarned: 0
        };
        saveDB();
    }
    return users[userId];
}

// ========== РЕЙТИНГ ==========
function getTopPlayers(limit = 10) {
    const players = Object.values(users);
    players.sort((a, b) => b.coins - a.coins);
    return players.slice(0, limit);
}

function getPlayerRank(userId) {
    const players = Object.values(users);
    players.sort((a, b) => b.coins - a.coins);
    const index = players.findIndex(p => p.id == userId);
    return index + 1;
}

// ========== ВЕБ-СЕРВЕР ==========
app.use(express.json());
app.use(express.static('frontend'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/frontend/index.html');
});

app.get('/api/leaderboard', (req, res) => {
    const top = getTopPlayers(20);
    res.json(top);
});

app.post('/api/save', (req, res) => {
    const { userId, gameData } = req.body;
    if (userId && gameData) {
        const user = getUser(userId);
        user.coins = gameData.coins || 0;
        user.energy = gameData.energy || 100;
        user.maxEnergy = gameData.maxEnergy || 100;
        user.clickPower = gameData.clickPower || 1;
        user.passiveIncomeLevel = gameData.passiveIncomeLevel || 0;
        user.hasMoon = gameData.hasMoon || false;
        user.hasEarth = gameData.hasEarth || false;
        user.hasSun = gameData.hasSun || false;
        user.lastActiveTime = Date.now();
        saveDB();
        res.json({ success: true, rank: getPlayerRank(userId) });
    } else {
        res.json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Веб-сервер запущен на порту ${PORT}`);
});

// ========== КОМАНДЫ БОТА ==========

// 🎮 /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = getUser(userId);
    const userName = ctx.from.first_name || 'игрок';
    
    user.name = userName;
    
    // Расчёт пассивного дохода за время отсутствия
    const now = Date.now();
    const lastActive = user.lastActiveTime || now;
    const elapsedMinutes = Math.min((now - lastActive) / 1000 / 60, 480);
    
    const passiveRate = user.passiveIncomeLevel * 5 + 
                       (user.hasSun ? 100000 : user.hasEarth ? 50000 : user.hasMoon ? 20000 : 0);
    const coinsEarned = Math.floor(elapsedMinutes * passiveRate);
    const energyRestored = Math.floor(elapsedMinutes * 5);
    
    if (coinsEarned > 0) user.coins += coinsEarned;
    if (energyRestored > 0) {
        user.energy = Math.min(user.maxEnergy, (user.energy || 100) + energyRestored);
    }
    user.lastActiveTime = now;
    saveDB();
    
    const rank = getPlayerRank(userId);
    const totalPlayers = Object.keys(users).length;
    
    let offlineMessage = '';
    if (coinsEarned > 0 || energyRestored > 0) {
        offlineMessage = `\n\n🎉 <b>ВЫ ВЕРНУЛИСЬ!</b>\n`;
        if (coinsEarned > 0) offlineMessage += `💰 +${coinsEarned.toLocaleString()} монет\n`;
        if (energyRestored > 0) offlineMessage += `⚡ +${energyRestored} энергии\n`;
        offlineMessage += `⏱ Отсутствовали: ${Math.floor(elapsedMinutes)} мин`;
    }
    
    await ctx.replyWithHTML(`
🌟 <b>Добро пожаловать в Star to Planet, ${userName}!</b> 🌟

💰 <b>Баланс:</b> ${user.coins.toLocaleString()} монет
⚡ <b>Энергия:</b> ${Math.floor(user.energy)}/${user.maxEnergy}
💪 <b>Сила клика:</b> ${user.clickPower}
🤖 <b>Пассивный доход:</b> ${passiveRate} монет/мин
🏆 <b>Место в рейтинге:</b> #${rank} из ${totalPlayers}
${offlineMessage}

🎮 <b>Запустить игру:</b>
    `, {
        reply_markup: {
            inline_keyboard: [[
                { text: '✨ ИГРАТЬ ✨', web_app: { url: APP_URL } }
            ]]
        }
    });
});

// 🏆 /rating — рейтинг
bot.command('rating', async (ctx) => {
    const userId = ctx.from.id;
    const top = getTopPlayers(10);
    const myRank = getPlayerRank(userId);
    const myCoins = getUser(userId).coins;
    
    let message = `🏆 <b>ТАБЛИЦА ЛИДЕРОВ</b> 🏆\n\n`;
    
    for (let i = 0; i < top.length; i++) {
        const p = top[i];
        let medal = '';
        if (i === 0) medal = '👑 ';
        else if (i === 1) medal = '🥈 ';
        else if (i === 2) medal = '🥉 ';
        else medal = `${i+1}. `;
        
        const name = p.name.length > 15 ? p.name.slice(0, 12) + '...' : p.name;
        message += `${medal}<b>${name}</b> — ${p.coins.toLocaleString()} 🪙\n`;
    }
    
    message += `\n——————————\n📊 <b>Ваше место:</b> #${myRank} (${myCoins.toLocaleString()} 🪙)`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
});

// 📊 /stats
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const rank = getPlayerRank(userId);
    const totalPlayers = Object.keys(users).length;
    
    const passiveRate = user.passiveIncomeLevel * 5 + 
                       (user.hasSun ? 100000 : user.hasEarth ? 50000 : user.hasMoon ? 20000 : 0);
    
    let planetName = '⭐ Белая звезда';
    if (user.hasSun) planetName = '☀️ Солнце';
    else if (user.hasEarth) planetName = '🌍 Земля';
    else if (user.hasMoon) planetName = '🌙 Луна';
    else if (user.coins >= 10000000000) planetName = '♃ Юпитер';
    else if (user.coins >= 1000000000) planetName = '♄ Сатурн';
    else if (user.coins >= 100000000) planetName = '⛢ Уран';
    else if (user.coins >= 10000000) planetName = '♆ Нептун';
    else if (user.coins >= 1000000) planetName = '♀ Венера';
    else if (user.coins >= 100000) planetName = '♂ Марс';
    else if (user.coins >= 10000) planetName = '☿ Меркурий';
    
    await ctx.reply(`
📊 <b>ВАША СТАТИСТИКА</b>

👤 <b>Игрок:</b> ${user.name}
⭐ <b>Уровень:</b> ${planetName}
🏆 <b>Место в рейтинге:</b> #${rank} из ${totalPlayers}

💰 <b>Монет:</b> ${user.coins.toLocaleString()}
💪 <b>Сила клика:</b> ${user.clickPower}
⚡ <b>Энергия:</b> ${Math.floor(user.energy)}/${user.maxEnergy}
🤖 <b>Пассивный доход:</b> ${passiveRate} монет/мин

💎 <b>Премиум планеты:</b>
${user.hasMoon ? '✅ Луна (+20 000 монет/мин)' : '❌ Луна (нужен Юпитер)'}
${user.hasEarth ? '✅ Земля (+50 000 монет/мин)' : '❌ Земля (нужна Луна)'}
${user.hasSun ? '✅ Солнце (+100 000 монет/мин)' : '❌ Солнце (нужна Земля)'}
    `, { parse_mode: 'HTML' });
});

// 🏓 /ping
bot.command('ping', async (ctx) => {
    await ctx.reply(`🏓 Pong! Бот работает\n📊 Всего игроков: ${Object.keys(users).length}`);
});

// ℹ️ /help
bot.command('help', async (ctx) => {
    await ctx.reply(`
📖 <b>КОМАНДЫ БОТА</b>

/start — Главное меню (авто-начисление)
/rating — Таблица лидеров
/stats — Моя статистика
/ping — Проверить работу бота
/help — Эта справка

🎮 <b>Игра:</b>
Нажимай на планету, зарабатывай монеты,
покупай улучшения, поднимайся в рейтинге!
    `, { parse_mode: 'HTML' });
});

// 🚀 Обработка данных из Mini App
bot.on('web_app_data', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.webAppData.data;
    
    try {
        const gameData = JSON.parse(data);
        const user = getUser(userId);
        
        user.coins = gameData.coins || 0;
        user.energy = gameData.energy || 100;
        user.maxEnergy = gameData.maxEnergy || 100;
        user.clickPower = gameData.clickPower || 1;
        user.passiveIncomeLevel = gameData.passiveIncomeLevel || 0;
        user.hasMoon = gameData.hasMoon || false;
        user.hasEarth = gameData.hasEarth || false;
        user.hasSun = gameData.hasSun || false;
        user.lastActiveTime = Date.now();
        
        saveDB();
        
        await ctx.reply(`✅ Данные сохранены!\n💰 Баланс: ${user.coins.toLocaleString()} монет\n🏆 Место в рейтинге: #${getPlayerRank(userId)}`);
        
    } catch (e) {
        console.log('Ошибка парсинга:', e);
        await ctx.reply('❌ Ошибка сохранения данных');
    }
});

// Запуск бота
bot.launch();
console.log('🤖 Star to Planet Bot запущен с синхронизацией!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));