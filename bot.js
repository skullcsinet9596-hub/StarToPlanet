const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || 'https://your-app.onrender.com';

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден в .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ========== БАЗА ДАННЫХ (JSON) ==========
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
            clickPower: 1,
            maxEnergy: 100,
            energy: 100,
            clickUpgradeLevel: 1,
            energyUpgradeLevel: 1,
            passiveIncomeLevel: 0,
            hasMoon: false,
            hasEarth: false,
            hasSun: false,
            lastActiveTime: Date.now(),
            totalClicks: 0,
            totalFarmEarned: 0
        };
        saveDB();
    }
    users[userId].name = users[userId].name || 'Игрок';
    return users[userId];
}

// ========== ФУНКЦИЯ АВТО-НАЧИСЛЕНИЯ ПРИ ВХОДЕ ==========
function calculateOfflineRewards(user) {
    const now = Date.now();
    const lastActive = user.lastActiveTime || now;
    const elapsedMinutes = (now - lastActive) / 1000 / 60;
    
    // Максимум 8 часов (480 минут)
    const effectiveMinutes = Math.min(elapsedMinutes, 480);
    
    if (effectiveMinutes <= 0) return { coinsEarned: 0, energyRestored: 0 };
    
    // Расчёт пассивного дохода
    const passiveRate = user.passiveIncomeLevel * 5 + 
                       (user.hasSun ? 100000 : user.hasEarth ? 50000 : user.hasMoon ? 20000 : 0);
    const coinsPerMinute = Math.max(0, passiveRate);
    const coinsEarned = Math.floor(effectiveMinutes * coinsPerMinute);
    
    // Восстановление энергии (3 энергии в минуту, максимум до maxEnergy)
    const energyRestoreRate = 3;
    let energyRestored = Math.floor(effectiveMinutes * energyRestoreRate);
    const newEnergy = Math.min(user.maxEnergy, (user.energy || user.maxEnergy) + energyRestored);
    energyRestored = newEnergy - (user.energy || user.maxEnergy);
    
    // Обновляем данные
    user.coins += coinsEarned;
    user.energy = newEnergy;
    user.totalFarmEarned = (user.totalFarmEarned || 0) + coinsEarned;
    user.lastActiveTime = now;
    
    return { coinsEarned, energyRestored, elapsedMinutes: effectiveMinutes };
}

// ========== ФУНКЦИИ ДЛЯ РЕЙТИНГА ==========
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

function getNeighbors(userId, limit = 3) {
    const players = Object.values(users);
    players.sort((a, b) => b.coins - a.coins);
    const index = players.findIndex(p => p.id == userId);
    
    const start = Math.max(0, index - limit);
    const end = Math.min(players.length, index + limit + 1);
    
    return players.slice(start, end).map((p, i) => ({
        ...p,
        rank: start + i + 1,
        isCurrent: p.id == userId
    }));
}

// ========== ВЕБ-СЕРВЕР ==========
app.get('/', (req, res) => {
    res.send('✅ Star to Planet Bot is running with auto offline rewards!');
});

app.get('/leaderboard', (req, res) => {
    const top = getTopPlayers(20);
    res.json(top);
});

app.listen(PORT, () => {
    console.log(`✅ Веб-сервер запущен на порту ${PORT}`);
});

// ========== КОМАНДЫ БОТА ==========

// 🎮 /start — главное меню с авто-начислением
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = getUser(userId);
    const userName = ctx.from.first_name || 'игрок';
    
    // Обновляем имя
    user.name = userName;
    
    // 🔥 АВТОМАТИЧЕСКОЕ НАЧИСЛЕНИЕ ЗА ВРЕМЯ ОТСУТСТВИЯ 🔥
    const { coinsEarned, energyRestored, elapsedMinutes } = calculateOfflineRewards(user);
    saveDB();
    
    let offlineMessage = '';
    if (coinsEarned > 0 || energyRestored > 0) {
        offlineMessage = `\n\n🎉 <b>ВЫ ВЕРНУЛИСЬ!</b>\n`;
        if (coinsEarned > 0) offlineMessage += `💰 +${coinsEarned.toLocaleString()} монет (пассивный доход)\n`;
        if (energyRestored > 0) offlineMessage += `⚡ +${energyRestored} энергии восстановлено\n`;
        offlineMessage += `⏱ Отсутствовали: ${Math.floor(elapsedMinutes)} мин`;
    }
    
    const passiveRate = user.passiveIncomeLevel * 5 + 
                       (user.hasSun ? 100000 : user.hasEarth ? 50000 : user.hasMoon ? 20000 : 0);
    
    await ctx.replyWithHTML(`
🌟 <b>Добро пожаловать в Star to Planet, ${userName}!</b> 🌟

💰 <b>Баланс:</b> ${user.coins.toLocaleString()} монет
⚡ <b>Энергия:</b> ${Math.floor(user.energy)}/${user.maxEnergy}
💪 <b>Сила клика:</b> ${user.clickPower}
🤖 <b>Пассивный доход:</b> ${passiveRate} монет/мин
🏆 <b>Место в рейтинге:</b> #${getPlayerRank(userId)}
${offlineMessage}

🚀 <b>Как играть:</b>
• Тапай по звезде/планете — зарабатывай монеты
• Покупай апгрейды в разделе BOOST
• Чем выше уровень — тем больше пассивный доход

📊 <b>Команды:</b>
/leaderboard — таблица лидеров
/top — топ 10 игроков
/rank — моё место в рейтинге
/stats — полная статистика
    `, {
        reply_markup: {
            inline_keyboard: [[
                { text: '✨ ЗАПУСТИТЬ ИГРУ ✨', web_app: { url: APP_URL } }
            ]]
        }
    });
});

// 🏆 /leaderboard — таблица лидеров
bot.command('leaderboard', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const top = getTopPlayers(10);
    const myRank = getPlayerRank(userId);
    
    let message = `🏆 <b>ТАБЛИЦА ЛИДЕРОВ</b> 🏆\n\n`;
    
    for (let i = 0; i < top.length; i++) {
        const p = top[i];
        let medal = '';
        if (i === 0) medal = '👑 ';
        else if (i === 1) medal = '🥈 ';
        else if (i === 2) medal = '🥉 ';
        else medal = `${i+1}. `;
        
        const name = p.name.length > 15 ? p.name.slice(0, 12) + '...' : p.name;
        message += `${medal} <b>${name}</b> — ${p.coins.toLocaleString()} 🪙\n`;
    }
    
    message += `\n——————————\n📊 <b>Ваше место:</b> #${myRank} (${user.coins.toLocaleString()} 🪙)`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
});

// 📊 /top
bot.command('top', async (ctx) => {
    const top = getTopPlayers(10);
    let message = `📊 <b>ТОП-10 ИГРОКОВ</b>\n\n`;
    
    top.forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▪️';
        message += `${medal} ${p.name} — ${p.coins.toLocaleString()} 🪙\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
});

// 📍 /rank
bot.command('rank', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const rank = getPlayerRank(userId);
    const totalPlayers = Object.keys(users).length;
    const neighbors = getNeighbors(userId, 3);
    
    let message = `📍 <b>ВАШЕ МЕСТО В РЕЙТИНГЕ</b>\n\n`;
    message += `🏆 <b>Место:</b> #${rank} из ${totalPlayers}\n`;
    message += `💰 <b>Монет:</b> ${user.coins.toLocaleString()}\n\n`;
    
    message += `📊 <b>Соседи по рейтингу:</b>\n`;
    for (const p of neighbors) {
        const arrow = p.isCurrent ? '👉 ' : '';
        const medal = p.rank === 1 ? '👑' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
        message += `${arrow}${medal} ${p.name} — ${p.coins.toLocaleString()} 🪙\n`;
    }
    
    if (rank > 1) {
        const above = neighbors.find(n => n.rank === rank - 1);
        if (above) {
            const diff = above.coins - user.coins;
            message += `\n📈 До следующего места: ${diff.toLocaleString()} 🪙`;
        }
    }
    
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
🆔 <b>ID:</b> ${userId}
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

📊 <b>Всего заработано с пассивного дохода:</b>
${(user.totalFarmEarned || 0).toLocaleString()} монет

🚀 <i>Чем чаще заходишь в игру — тем больше монет!</i>
    `, { parse_mode: 'HTML' });
});

// 🏓 /ping
bot.command('ping', async (ctx) => {
    await ctx.reply(`🏓 Pong! Бот работает отлично\n📊 Всего игроков: ${Object.keys(users).length}`);
});

// ℹ️ /help
bot.command('help', async (ctx) => {
    await ctx.reply(`
📖 <b>КОМАНДЫ БОТА</b>

🏆 <b>Рейтинг:</b>
/leaderboard — таблица лидеров
/top — топ 10 игроков
/rank — моё место в рейтинге

🎮 <b>Игра:</b>
/start — главное меню (авто-начисление монет и энергии)
/stats — полная статистика

🔧 <b>Другие:</b>
/ping — проверить работу
/help — эта справка

💡 <b>Важно:</b>
• При каждом запуске /start монеты и энергия начисляются автоматически
• Пассивный доход растёт с улучшениями
• Чем выше уровень — тем больше монет за время отсутствия
    `, { parse_mode: 'HTML' });
});

// 🚀 Обработка данных из Mini App
bot.on('web_app_data', async (ctx) => {
    const userId = ctx.from.id;
    let user = getUser(userId);
    const data = ctx.webAppData.data;
    
    try {
        const parsed = JSON.parse(data);
        
        // Обновляем данные из игры
        if (parsed.coins !== undefined) user.coins = parsed.coins;
        if (parsed.energy !== undefined) user.energy = parsed.energy;
        if (parsed.clickPower !== undefined) user.clickPower = parsed.clickPower;
        if (parsed.maxEnergy !== undefined) user.maxEnergy = parsed.maxEnergy;
        if (parsed.passiveIncomeLevel !== undefined) user.passiveIncomeLevel = parsed.passiveIncomeLevel;
        if (parsed.clickUpgradeLevel !== undefined) user.clickUpgradeLevel = parsed.clickUpgradeLevel;
        if (parsed.energyUpgradeLevel !== undefined) user.energyUpgradeLevel = parsed.energyUpgradeLevel;
        if (parsed.hasMoon !== undefined) user.hasMoon = parsed.hasMoon;
        if (parsed.hasEarth !== undefined) user.hasEarth = parsed.hasEarth;
        if (parsed.hasSun !== undefined) user.hasSun = parsed.hasSun;
        
        user.lastActiveTime = Date.now();
        saveDB();
        
        await ctx.reply(`✅ Данные сохранены!\n💰 Баланс: ${user.coins.toLocaleString()} монет\n🏆 Место в рейтинге: #${getPlayerRank(userId)}`);
        
    } catch (e) {
        console.log('Ошибка парсинга:', e);
        await ctx.reply('❌ Ошибка сохранения данных');
    }
});

// ========== ЗАПУСК БОТА ==========
bot.launch();
console.log('🤖 Star to Planet Bot запущен с авто-начислением и рейтингом!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));