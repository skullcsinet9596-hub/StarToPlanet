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

// ========== БАЗА ДАННЫХ (простой JSON файл) ==========
const DB_FILE = 'users.json';

// Загрузка базы данных
let users = {};
if (fs.existsSync(DB_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log(`✅ Загружено ${Object.keys(users).length} пользователей`);
    } catch(e) {
        console.log('Ошибка загрузки БД, создаю новую');
    }
}

// Сохранение базы данных
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// Получить данные пользователя
function getUser(userId) {
    if (!users[userId]) {
        users[userId] = {
            id: userId,
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
            // Офлайн-фарминг
            isFarming: false,
            farmStartTime: null,
            farmLastClaimTime: null,
            farmRate: 10, // монет в минуту
            totalFarmEarned: 0
        };
        saveDB();
    }
    return users[userId];
}

// ========== ВЕБ-СЕРВЕР ==========
app.get('/', (req, res) => {
    res.send('✅ Star to Planet Bot is running with offline farming!');
});

app.listen(PORT, () => {
    console.log(`✅ Веб-сервер запущен на порту ${PORT}`);
});

// ========== КОМАНДЫ БОТА ==========

// 🎮 /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const userName = ctx.from.first_name || 'игрок';
    
    await ctx.replyWithHTML(`
🌟 <b>Добро пожаловать в Star to Planet, ${userName}!</b> 🌟

💰 <b>Баланс:</b> ${user.coins} монет
⚡ <b>Сила клика:</b> ${user.clickPower}
🤖 <b>Пассивный доход:</b> ${user.passiveIncomeLevel * 5 + (user.hasSun ? 100000 : user.hasEarth ? 50000 : user.hasMoon ? 20000 : 0)} монет/мин

🚀 <b>Как играть:</b>
• Тапай по звезде/планете — зарабатывай монеты
• Покупай апгрейды в разделе BOOST
• Запусти /farm для пассивного дохода

🎮 <b>Запустить игру:</b>
    `, {
        reply_markup: {
            inline_keyboard: [[
                { text: '✨ ЗАПУСТИТЬ ИГРУ ✨', web_app: { url: APP_URL } }
            ]]
        }
    });
});

// 🌾 /farm — запуск офлайн-фарминга
bot.command('farm', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const now = Date.now();
    
    // Рассчитываем пассивный доход
    const passiveRate = user.passiveIncomeLevel * 5 + 
                       (user.hasSun ? 100000 : user.hasEarth ? 50000 : user.hasMoon ? 20000 : 0);
    const farmRate = Math.max(10, Math.floor(passiveRate / 60)); // монет в минуту, минимум 10
    
    user.isFarming = true;
    user.farmStartTime = now;
    user.farmLastClaimTime = now;
    user.farmRate = farmRate;
    saveDB();
    
    await ctx.reply(`
🌾 <b>ОФЛАЙН-ФАРМИНГ ЗАПУЩЕН!</b>

⚡ Скорость: ${farmRate} монет/минуту
⏱ Максимальное время накопления: 8 часов
💰 Вы будете получать монеты даже когда игра закрыта!

🔹 Используйте /claim чтобы собрать накопленные монеты
🔹 Используйте /farmstatus чтобы проверить прогресс
    `, { parse_mode: 'HTML' });
});

// 💰 /claim — сбор накопленных монет
bot.command('claim', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const now = Date.now();
    
    if (!user.isFarming || !user.farmLastClaimTime) {
        await ctx.reply('❌ У вас нет активного фарминга. Запустите /farm');
        return;
    }
    
    // Проверяем максимальное время накопления (8 часов = 480 минут)
    const maxMinutes = 480;
    let elapsedMinutes = (now - user.farmLastClaimTime) / 1000 / 60;
    
    if (elapsedMinutes > maxMinutes) {
        elapsedMinutes = maxMinutes;
    }
    
    const earnedCoins = Math.floor(elapsedMinutes * user.farmRate);
    
    if (earnedCoins > 0) {
        user.coins += earnedCoins;
        user.totalFarmEarned = (user.totalFarmEarned || 0) + earnedCoins;
        user.farmLastClaimTime = now;
        saveDB();
        
        // Анимация в ответе
        let message = `💰 <b>ВЫ СОБРАЛИ ${earnedCoins} МОНЕТ!</b> 💰\n\n`;
        message += `⏱ Время отсутствия: ${Math.floor(elapsedMinutes)} мин\n`;
        message += `⚡ Скорость фарминга: ${user.farmRate} монет/мин\n`;
        message += `📊 Всего собрано за всё время: ${user.totalFarmEarned} монет\n\n`;
        message += `💎 <b>Новый баланс: ${user.coins} монет</b>`;
        
        await ctx.reply(message, { parse_mode: 'HTML' });
    } else {
        const minutesToNext = Math.ceil(1 / user.farmRate * 60);
        await ctx.reply(`⏳ Монет ещё не накопилось.\nСледующий сбор через ~${minutesToNext} минут.\nИспользуйте /farmstatus для проверки.`);
    }
});

// 📊 /farmstatus — статус фарминга
bot.command('farmstatus', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const now = Date.now();
    
    if (!user.isFarming || !user.farmLastClaimTime) {
        await ctx.reply('🌾 Фарминг не активен. Запустите /farm');
        return;
    }
    
    const elapsedMinutes = (now - user.farmLastClaimTime) / 1000 / 60;
    const pendingCoins = Math.floor(elapsedMinutes * user.farmRate);
    const maxMinutes = 480;
    const remainingMinutes = Math.max(0, maxMinutes - elapsedMinutes);
    
    await ctx.reply(`
📊 <b>СТАТУС ОФЛАЙН-ФАРМИНГА</b>

⏱ Времени прошло: ${Math.floor(elapsedMinutes)} мин
💰 Накоплено: ${pendingCoins} монет
⚡ Скорость: ${user.farmRate} монет/мин
🕐 Максимальное накопление: 8 часов
⏳ Осталось до лимита: ${Math.floor(remainingMinutes)} мин

✅ Используйте /claim чтобы собрать монеты!
    `, { parse_mode: 'HTML' });
});

// 🛑 /stopfarm — остановка фарминга
bot.command('stopfarm', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    
    if (user.isFarming) {
        user.isFarming = false;
        saveDB();
        await ctx.reply('🛑 Фарминг остановлен. Все накопленные монеты сохранены. Используйте /farm чтобы запустить снова.');
    } else {
        await ctx.reply('❌ У вас нет активного фарминга.');
    }
});

// 🏓 /ping
bot.command('ping', async (ctx) => {
    await ctx.reply('🏓 Pong! Бот работает отлично');
});

// ℹ️ /help
bot.command('help', async (ctx) => {
    await ctx.reply(`
📖 <b>Команды бота:</b>

🎮 <b>Игровые:</b>
/start — начать игру
/stats — моя статистика

🌾 <b>Офлайн-фарминг:</b>
/farm — запустить пассивный доход
/claim — собрать накопленные монеты
/farmstatus — проверить прогресс
/stopfarm — остановить фарминг

🔧 <b>Другие:</b>
/ping — проверить работу бота
/help — показать эту справку
    `, { parse_mode: 'HTML' });
});

// 📊 /stats
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    
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

👤 <b>Игрок:</b> ${ctx.from.first_name}
🆔 <b>ID:</b> ${userId}
⭐ <b>Уровень:</b> ${planetName}

💰 <b>Монет:</b> ${user.coins}
💪 <b>Сила клика:</b> ${user.clickPower}
⚡ <b>Макс. энергия:</b> ${user.maxEnergy}
🤖 <b>Пассивный доход:</b> ${passiveRate} монет/мин

🌾 <b>Офлайн-фарминг:</b>
${user.isFarming ? '✅ Активен' : '❌ Не активен'}
${user.totalFarmEarned ? `📊 Всего собрано: ${user.totalFarmEarned} монет` : ''}

🚀 <i>Используйте /farm для запуска пассивного дохода!</i>
    `, { parse_mode: 'HTML' });
});

// 🚀 Обработка данных из Mini App
bot.on('web_app_data', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    const data = ctx.webAppData.data;
    
    try {
        const parsed = JSON.parse(data);
        
        // Обновляем данные пользователя из игры
        if (parsed.coins !== undefined) user.coins = parsed.coins;
        if (parsed.clickPower !== undefined) user.clickPower = parsed.clickPower;
        if (parsed.maxEnergy !== undefined) user.maxEnergy = parsed.maxEnergy;
        if (parsed.passiveIncomeLevel !== undefined) user.passiveIncomeLevel = parsed.passiveIncomeLevel;
        if (parsed.hasMoon !== undefined) user.hasMoon = parsed.hasMoon;
        if (parsed.hasEarth !== undefined) user.hasEarth = parsed.hasEarth;
        if (parsed.hasSun !== undefined) user.hasSun = parsed.hasSun;
        
        saveDB();
        await ctx.reply(`✅ Данные сохранены! Баланс: ${user.coins} монет`);
        
    } catch (e) {
        console.log('Ошибка парсинга:', e);
        await ctx.reply('❌ Ошибка сохранения данных');
    }
});

// ========== ЗАПУСК БОТА ==========
bot.launch();
console.log('🤖 Star to Planet Bot запущен с офлайн-фармингом!');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));