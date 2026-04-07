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
    toggleSound,
    distributeReferralRewards
} from './db.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
// Render передаёт PORT; пустая строка даёт Number('') === 0 — случайный порт, healthcheck не найдёт.
const rawPort = process.env.PORT;
const parsedPort = rawPort != null && String(rawPort).trim() !== '' ? Number(rawPort) : NaN;
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 10000;
if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
    console.warn('⚠️ PORT из окружения не задан или неверен — используется fallback 10000. Для Render нужен тип Web Service, чтобы подставился PORT.');
}
const APP_URL = process.env.WEBAPP_URL || 'https://startoplanet.onrender.com';
const PAYMENTS_ENABLED = process.env.PAYMENTS_ENABLED === 'true';

const PREMIUM_PRODUCTS = {
    moon: { title: 'Уровень 8 · Луна', amountRub: 50, amountXTR: 50, dbField: 'has_moon' },
    earth: { title: 'Уровень 9 · Земля', amountRub: 100, amountXTR: 100, dbField: 'has_earth' },
    sun: { title: 'Уровень 10 · Солнце', amountRub: 200, amountXTR: 200, dbField: 'has_sun' }
};

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ========== API ==========
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
app.use(express.static('frontend'));
app.get('/healthz', (req, res) => res.status(200).send('ok'));

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
        const telegramId = parseInt(userId);
        const existingUser = await getUser(telegramId);
        const previousCoins = existingUser ? Number(existingUser.coins) : 0;
        const currentCoins = Math.max(0, Math.floor(Number(gameData.coins) || 0));

        await updateUser(telegramId, {
            coins: currentCoins,
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

        const earnedCoins = Math.max(0, currentCoins - previousCoins);
        if (earnedCoins > 0) {
            await distributeReferralRewards(telegramId, earnedCoins);
        }
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.get('/api/premium/config', (req, res) => {
    res.json({
        paymentsEnabled: PAYMENTS_ENABLED,
        prices: {
            moon: PREMIUM_PRODUCTS.moon.amountRub,
            earth: PREMIUM_PRODUCTS.earth.amountRub,
            sun: PREMIUM_PRODUCTS.sun.amountRub
        }
    });
});

app.post('/api/premium/invoice-link', async (req, res) => {
    try {
        const { userId, type } = req.body || {};
        const telegramId = parseInt(userId);
        const product = PREMIUM_PRODUCTS[type];

        if (!telegramId || !product) {
            res.status(400).json({ ok: false, message: 'Неверные параметры оплаты' });
            return;
        }

        if (!PAYMENTS_ENABLED) {
            res.status(503).json({ ok: false, message: 'Платежи временно отключены' });
            return;
        }

        const user = await getUser(telegramId);
        if (!user) {
            res.status(404).json({ ok: false, message: 'Пользователь не найден' });
            return;
        }

        const hasLevel7 = Number(user.coins) >= 10000000000;
        if (type === 'moon' && !hasLevel7) {
            res.status(400).json({ ok: false, message: '8 уровень доступен только после 7 уровня' });
            return;
        }
        if (type === 'earth' && !user.has_moon) {
            res.status(400).json({ ok: false, message: '9 уровень доступен после покупки 8 уровня' });
            return;
        }
        if (type === 'sun' && !user.has_earth) {
            res.status(400).json({ ok: false, message: '10 уровень доступен после покупки 9 уровня' });
            return;
        }

        const payload = `premium:${type}:${telegramId}:${Date.now()}`;
        const invoiceLink = await bot.telegram.createInvoiceLink(
            product.title,
            `Покупка ${product.title} в Star to Planet`,
            payload,
            '',
            'XTR',
            [{ label: product.title, amount: product.amountXTR }]
        );

        res.json({ ok: true, invoiceLink });
    } catch (e) {
        console.error('Ошибка создания invoice-link:', e);
        res.status(500).json({ ok: false, message: 'Не удалось создать платеж' });
    }
});

const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
    console.log(`✅ Веб-сервер слушает http://${HOST}:${PORT} (env PORT=${process.env.PORT ?? 'not-set'})`);
});
server.on('error', (err) => {
    console.error('❌ Ошибка веб-сервера:', err);
});

// ========== КОМАНДЫ БОТА ==========
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let userName = ctx.from.username || ctx.from.first_name || 'игрок';
    if (ctx.from.username) userName = `@${ctx.from.username}`;
    
    // Проверяем реферальный код
    const payloadRaw = ctx.startPayload || '';
    const refMatch = payloadRaw.match(/(\d+)/);
    const referrerId = refMatch ? parseInt(refMatch[1]) : null;
    
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

bot.on('pre_checkout_query', async (ctx) => {
    try {
        await ctx.answerPreCheckoutQuery(true);
    } catch (e) {
        console.error('Ошибка pre_checkout_query:', e);
    }
});

bot.on('message', async (ctx) => {
    try {
        const payment = ctx.message?.successful_payment;
        if (!payment) return;

        const payload = payment.invoice_payload || '';
        const [scope, type, userIdFromPayload] = payload.split(':');
        if (scope !== 'premium' || !PREMIUM_PRODUCTS[type]) return;

        const buyerId = ctx.from?.id;
        const targetUserId = parseInt(userIdFromPayload);
        if (!buyerId || !targetUserId || buyerId !== targetUserId) return;

        const user = await getUser(buyerId);
        if (!user) return;

        const hasLevel7 = Number(user.coins) >= 10000000000;
        if (type === 'moon' && !hasLevel7) {
            await ctx.reply('⚠️ Условие 8 уровня не выполнено. Обратитесь в поддержку.');
            return;
        }
        if (type === 'earth' && !user.has_moon) {
            await ctx.reply('⚠️ Сначала нужно купить 8 уровень.');
            return;
        }
        if (type === 'sun' && !user.has_earth) {
            await ctx.reply('⚠️ Сначала нужно купить 9 уровень.');
            return;
        }

        const dbField = PREMIUM_PRODUCTS[type].dbField;
        await updateUser(buyerId, { [dbField]: true });

        const labels = { moon: 'Луна', earth: 'Земля', sun: 'Солнце' };
        await ctx.reply(`✅ Оплата получена. Уровень ${labels[type]} активирован.`);
    } catch (e) {
        console.error('Ошибка обработки successful_payment:', e);
    }
});

// ========== ЗАПУСК ==========
await bot.telegram.deleteWebhook();
console.log('✅ Вебхук удалён');

await initDB();
bot.launch();
console.log('🤖 Бот запущен!');