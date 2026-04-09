import { Telegraf } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
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
    distributeReferralRewards,
    createPaymentInvoice,
    markPaymentPaid,
    getPaymentByProviderInvoiceId,
    listPayments,
    searchUsersAdmin,
    getReferralTreeAdmin,
    updateEconomyConfig,
    getEconomyConfig,
    adjustUserAdmin,
    deleteUserAdmin,
    trackBotStart,
    getMarketingMetricsAdmin
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
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'virtual_wallet').toLowerCase();
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || crypto.createHash('sha256').update(BOT_TOKEN + ':pay').digest('hex').slice(0, 24);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || 0) || null;

const PREMIUM_PRODUCTS = {
    moon: { title: 'Уровень 8 · Луна', amountRub: 50, amountXTR: 50, dbField: 'has_moon' },
    earth: { title: 'Уровень 9 · Земля', amountRub: 100, amountXTR: 100, dbField: 'has_earth' },
    sun: { title: 'Уровень 10 · Солнце', amountRub: 200, amountXTR: 200, dbField: 'has_sun' }
};

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден');
    process.exit(1);
}

/** Публичный URL сервиса (Render задаёт RENDER_EXTERNAL_URL). Long polling + второй инстанс дают 409 Conflict. */
const publicUrl = (process.env.WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const useWebhookMode = process.env.BOT_POLLING !== 'true' && Boolean(publicUrl);
const webhookSecret =
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    crypto.createHash('sha256').update(BOT_TOKEN).digest('hex').slice(0, 24);
const WEBHOOK_PATH = `/tg-hook/${webhookSecret}`;

const bot = new Telegraf(BOT_TOKEN);
const app = express();

const rateBuckets = new Map();
function rateLimit(key, maxHits, windowMs) {
    return (req, res, next) => {
        const now = Date.now();
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'ip';
        const id = `${key}:${ip}`;
        const bucket = rateBuckets.get(id) || { count: 0, resetAt: now + windowMs };
        if (now > bucket.resetAt) {
            bucket.count = 0;
            bucket.resetAt = now + windowMs;
        }
        bucket.count += 1;
        rateBuckets.set(id, bucket);
        if (bucket.count > maxHits) {
            res.status(429).json({ success: false, message: 'Слишком много запросов' });
            return;
        }
        next();
    };
}

function requireAdmin(req, res, next) {
    if (!ADMIN_TOKEN) {
        res.status(503).json({ success: false, message: 'ADMIN_TOKEN не настроен' });
        return;
    }
    const token = req.headers['x-admin-token']?.toString() || req.query?.token?.toString() || '';
    if (token !== ADMIN_TOKEN) {
        res.status(403).json({ success: false, message: 'Доступ запрещен' });
        return;
    }
    if (ADMIN_TELEGRAM_ID) {
        const adminUserId = Number(req.headers['x-admin-user-id']?.toString() || req.query?.adminUserId?.toString() || 0);
        if (adminUserId !== ADMIN_TELEGRAM_ID) {
            res.status(403).json({ success: false, message: 'Доступ запрещен (allowlist)' });
            return;
        }
    }
    next();
}

function validatePremiumPurchase(user, type) {
    const hasLevel7 = Number(user.coins) >= 10000000000;
    if (type === 'moon' && !hasLevel7) return '8 уровень доступен только после 7 уровня';
    if (type === 'earth' && !user.has_moon) return '9 уровень доступен после покупки 8 уровня';
    if (type === 'sun' && !user.has_earth) return '10 уровень доступен после покупки 9 уровня';
    return null;
}

async function grantPremiumLevel(telegramId, type) {
    const user = await getUser(telegramId);
    if (!user) return { ok: false, message: 'Пользователь не найден' };
    const gateErr = validatePremiumPurchase(user, type);
    if (gateErr) return { ok: false, message: gateErr };
    const dbField = PREMIUM_PRODUCTS[type]?.dbField;
    if (!dbField) return { ok: false, message: 'Неизвестный тип продукта' };
    if (user[dbField]) return { ok: true, message: 'Уровень уже активирован', already: true };
    await updateUser(telegramId, { [dbField]: true });
    return { ok: true, message: 'Уровень активирован', already: false };
}

// ========== API ==========
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
app.get('/healthz', (req, res) => {
    res.status(200).json({
        ok: true,
        service: 'star-to-planet-bot',
        uptimeSec: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

if (useWebhookMode) {
    app.post(WEBHOOK_PATH, (req, res) => {
        bot.handleUpdate(req.body, res);
    });
}

app.get('/api/leaderboard', async (req, res) => {
    const top = await getLeaderboard(20);
    res.json(top);
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.userId);
        const user = await getUser(telegramId);
        if (!user) {
            res.json({ registered: false, coins: 0, energy: 100, maxEnergy: 100, clickPower: 1, passiveIncomeLevel: 0 });
            return;
        }
        const lastSeenAtMs = user.last_seen_at ? new Date(user.last_seen_at).getTime() : Date.now();
        await updateUser(telegramId, { last_seen_at: new Date() });
        
        res.json({
            registered: true,
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
            taskPassiveBonusRate: Number(user.task_passive_bonus_rate || 0),
            ownedRankLevel: Number(user.owned_rank_level ?? -1),
            lastSeenAtMs,
            soundEnabled: user.sound_enabled,
            taskState: user.task_state || {}
        });
    } catch (e) {
        res.json({ registered: false, coins: 0, energy: 100, maxEnergy: 100, clickPower: 1, passiveIncomeLevel: 0 });
    }
});

app.post('/api/register', rateLimit('register', 30, 60_000), async (req, res) => {
    try {
        const { userId, username, firstName, referrerId } = req.body || {};
        const telegramId = parseInt(userId);
        if (!telegramId) {
            res.status(400).json({ success: false, message: 'Неверный userId' });
            return;
        }

        let user = await getUser(telegramId);
        if (!user) {
            const ref = referrerId && !isNaN(parseInt(referrerId)) ? parseInt(referrerId) : null;
            user = await createUser(telegramId, username || null, firstName || null, ref);
            const playUrl = APP_URL;
            bot.telegram.sendMessage(telegramId, '✅ Профиль создан. Теперь можете играть.', {
                reply_markup: {
                    inline_keyboard: [[{ text: '✨ ИГРАТЬ ✨', web_app: { url: playUrl } }]]
                }
            }).catch(() => {});
            res.json({ success: true, registered: true, created: true, userId: telegramId, message: 'Профиль создан' });
            return;
        }

        await updateUser(telegramId, { username: username || user.username, first_name: firstName || user.first_name });
        res.json({ success: true, registered: true, created: false, userId: telegramId, message: 'Вы уже зарегистрированы' });
    } catch (e) {
        console.error('Ошибка /api/register:', e);
        res.status(500).json({ success: false, message: 'Ошибка регистрации' });
    }
});

app.get('/api/friends/:userId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.userId);
        if (!telegramId) {
            res.status(400).json({ success: false, message: 'Неверный userId' });
            return;
        }
        const stats = await getStats(telegramId);
        if (!stats) {
            res.json({ success: true, referralsCount: 0, totalReferralBonus: 0, referrals: [] });
            return;
        }
        res.json({
            success: true,
            referralsCount: Number(stats.referralsCount || 0),
            totalReferralBonus: Number(stats.totalReferralBonus || 0),
            referrals: Array.isArray(stats.referrals) ? stats.referrals : []
        });
    } catch (e) {
        console.error('Ошибка /api/friends/:userId:', e);
        res.status(500).json({ success: false, message: 'Ошибка загрузки друзей' });
    }
});

app.post('/api/save', rateLimit('save', 240, 60_000), async (req, res) => {
    const { userId, gameData } = req.body;
    console.log('📥 POST /api/save:', { userId, coins: gameData?.coins });
    if (userId && gameData) {
        const telegramId = parseInt(userId);
        if (!telegramId) {
            res.status(400).json({ success: false, message: 'Неверный userId' });
            return;
        }
        const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
        const int = (v, d = 0) => Math.floor(num(v, d));
        const existingUser = await getUser(telegramId);
        const previousCoins = existingUser ? Number(existingUser.coins) : 0;
        const currentCoins = Math.max(0, int(gameData.coins, 0));

        await updateUser(telegramId, {
            coins: currentCoins,
            energy: Math.max(0, int(gameData.energy, 100)),
            max_energy: Math.max(100, int(gameData.maxEnergy, 100)),
            click_power: Math.max(1, int(gameData.clickPower, 1)),
            passive_income_level: Math.max(0, int(gameData.passiveIncomeLevel, 0)),
            task_passive_bonus_rate: Math.max(0, int(gameData.taskPassiveBonusRate, 0)),
            owned_rank_level: Math.max(-1, Math.min(10, int(gameData.ownedRankLevel, -1))),
            has_moon: Boolean(gameData.hasMoon),
            has_earth: Boolean(gameData.hasEarth),
            has_sun: Boolean(gameData.hasSun),
            click_upgrade_level: Math.max(1, int(gameData.clickUpgradeLevel, 1)),
            click_upgrade_cost: Math.max(0, int(gameData.clickUpgradeCost, 100)),
            energy_upgrade_level: Math.max(1, int(gameData.energyUpgradeLevel, 1)),
            energy_upgrade_cost: Math.max(0, int(gameData.energyUpgradeCost, 200)),
            passive_income_cost: Math.max(0, int(gameData.passiveIncomeUpgradeCost, 500)),
            sound_enabled: Boolean(gameData.soundEnabled),
            task_state: {
                dailyClickCount: int(gameData.dailyClickCount, 0),
                dailyCoinsEarned: int(gameData.dailyCoinsEarned, 0),
                dailyEnergySpent: int(gameData.dailyEnergySpent, 0),
                dailyUpgradesBought: int(gameData.dailyUpgradesBought, 0),
                weeklyClickCount: int(gameData.weeklyClickCount, 0),
                weeklyCoinsEarned: int(gameData.weeklyCoinsEarned, 0),
                weeklyEnergySpent: int(gameData.weeklyEnergySpent, 0),
                weeklyUpgradesBought: int(gameData.weeklyUpgradesBought, 0),
                dailyTasksClaimed: gameData.dailyTasksClaimed || {},
                weeklyTasksClaimed: gameData.weeklyTasksClaimed || {},
                instantTasksClaimed: gameData.instantTasksClaimed || {},
                lastDailyCycleKey: typeof gameData.lastDailyCycleKey === 'string' ? gameData.lastDailyCycleKey : null,
                lastWeeklyCycleKey: typeof gameData.lastWeeklyCycleKey === 'string' ? gameData.lastWeeklyCycleKey : null
            }
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

app.post('/api/premium/invoice-link', rateLimit('premium_invoice', 40, 60_000), async (req, res) => {
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

        const gateErr = validatePremiumPurchase(user, type);
        if (gateErr) {
            res.status(400).json({ ok: false, message: gateErr });
            return;
        }

        // Унифицированный адаптер инвойсов с idempotency
        const providerInvoiceId = `inv_${Date.now()}_${telegramId}_${type}_${Math.random().toString(36).slice(2, 8)}`;
        const payment = await createPaymentInvoice({
            telegramId,
            productType: type,
            provider: PAYMENT_PROVIDER,
            providerInvoiceId,
            amountRub: product.amountRub,
            metadata: { title: product.title }
        });
        if (!payment) {
            res.status(500).json({ ok: false, message: 'Не удалось создать счет' });
            return;
        }

        if (PAYMENT_PROVIDER === 'telegram_stars') {
            const payload = `premium:${type}:${telegramId}:${providerInvoiceId}`;
            const invoiceLink = await bot.telegram.createInvoiceLink(
                product.title,
                `Покупка ${product.title} в Star to Planet`,
                payload,
                '',
                'XTR',
                [{ label: product.title, amount: product.amountXTR }]
            );
            res.json({ ok: true, provider: 'telegram_stars', invoiceLink });
            return;
        }

        // Виртуальный кошелек / merchant-провайдер (MVP): отдаём checkout URL.
        const checkoutUrl = `${APP_URL}/api/pay/mock-pay/${providerInvoiceId}`;
        res.json({ ok: true, provider: 'virtual_wallet', paymentUrl: checkoutUrl, invoiceId: providerInvoiceId });
    } catch (e) {
        console.error('Ошибка создания invoice-link:', e);
        res.status(500).json({ ok: false, message: 'Не удалось создать платеж' });
    }
});

app.post('/api/payments/webhook', rateLimit('payments_webhook', 120, 60_000), async (req, res) => {
    try {
        const secret = req.headers['x-payment-secret']?.toString() || '';
        if (secret !== PAYMENT_WEBHOOK_SECRET) {
            res.status(403).json({ success: false, message: 'Неверная подпись webhook' });
            return;
        }
        const { invoiceId, status, telegramId, productType } = req.body || {};
        if (!invoiceId || status !== 'paid') {
            res.status(400).json({ success: false, message: 'Неверные параметры webhook' });
            return;
        }

        const marked = await markPaymentPaid(invoiceId, { webhookAt: new Date().toISOString(), source: 'provider_webhook' });
        if (!marked.payment) {
            res.status(404).json({ success: false, message: 'Платеж не найден' });
            return;
        }
        if (!marked.updated) {
            res.json({ success: true, idempotent: true });
            return;
        }

        const uid = Number(marked.payment.telegram_id || telegramId);
        const type = String(marked.payment.product_type || productType || '');
        const grant = await grantPremiumLevel(uid, type);
        if (!grant.ok) {
            res.status(400).json({ success: false, message: grant.message });
            return;
        }
        res.json({ success: true, idempotent: false });
    } catch (e) {
        console.error('Ошибка /api/payments/webhook:', e);
        res.status(500).json({ success: false, message: 'Ошибка webhook' });
    }
});

// Тестовый checkout для виртуального кошелька (MVP): имитация успешной оплаты
app.get('/api/pay/mock-pay/:invoiceId', async (req, res) => {
    try {
        const invoiceId = req.params.invoiceId;
        const payment = await getPaymentByProviderInvoiceId(invoiceId);
        if (!payment) {
            res.status(404).send('Invoice not found');
            return;
        }
        const marked = await markPaymentPaid(invoiceId, { mockPaidAt: new Date().toISOString(), source: 'mock_checkout' });
        if (marked.updated) {
            await grantPremiumLevel(Number(payment.telegram_id), String(payment.product_type));
        }
        res.redirect(`${APP_URL}?paid=1&invoice=${encodeURIComponent(invoiceId)}`);
    } catch (e) {
        console.error('Ошибка mock-pay:', e);
        res.status(500).send('Payment error');
    }
});

// ========== ADMIN API ==========
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const q = req.query.q?.toString() || '';
    const limit = Number(req.query.limit || 50);
    const rows = await searchUsersAdmin(q, limit);
    res.json({ success: true, users: rows });
});

app.get('/api/admin/referrals/:telegramId', requireAdmin, async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);
    const depth = Number(req.query.depth || 4);
    const tree = await getReferralTreeAdmin(telegramId, depth);
    res.json({ success: true, tree });
});

app.get('/api/admin/payments', requireAdmin, async (req, res) => {
    const rows = await listPayments(Number(req.query.limit || 100));
    res.json({ success: true, payments: rows });
});

app.get('/api/admin/economy', requireAdmin, async (req, res) => {
    const cfg = await getEconomyConfig();
    res.json({ success: true, config: cfg || {} });
});

app.get('/api/admin/marketing-metrics', requireAdmin, async (req, res) => {
    const metrics = await getMarketingMetricsAdmin();
    if (!metrics) {
        res.status(500).json({ success: false, message: 'Не удалось загрузить метрики' });
        return;
    }
    res.json({ success: true, metrics });
});

app.post('/api/admin/economy', requireAdmin, async (req, res) => {
    const patch = req.body || {};
    const cfg = await updateEconomyConfig(patch);
    if (!cfg) {
        res.status(500).json({ success: false, message: 'Не удалось обновить конфиг' });
        return;
    }
    res.json({ success: true, config: cfg });
});

app.post('/api/admin/adjust-user', requireAdmin, async (req, res) => {
    const telegramId = parseInt(req.body?.telegramId);
    const patch = req.body?.patch || {};
    if (!telegramId) {
        res.status(400).json({ success: false, message: 'Неверный telegramId' });
        return;
    }
    const updated = await adjustUserAdmin(telegramId, patch);
    res.json({ success: true, user: updated });
});

app.post('/api/admin/delete-user', requireAdmin, async (req, res) => {
    const telegramId = parseInt(req.body?.telegramId);
    if (!telegramId) {
        res.status(400).json({ success: false, message: 'Неверный telegramId' });
        return;
    }
    const result = await deleteUserAdmin(telegramId);
    if (!result?.ok) {
        res.status(400).json({ success: false, message: result?.message || 'Не удалось удалить пользователя' });
        return;
    }
    res.json({ success: true, deletedTelegramId: result.deletedTelegramId });
});

app.use('/admin', express.static('frontend/admin'));
app.use(express.static('frontend'));

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
    await trackBotStart(userId);
    let userName = ctx.from.username || ctx.from.first_name || 'игрок';
    if (ctx.from.username) userName = `@${ctx.from.username}`;
    
    // Проверяем реферальный код (нужен для передачи в WebApp).
    const payloadRaw = ctx.startPayload || '';
    let user = await getUser(userId);
    if (user) {
        await updateUser(userId, { username: ctx.from.username, first_name: ctx.from.first_name });
    }
    
    const rank = user ? await getPlayerRank(userId) : '—';
    const stats = user ? await getStats(userId) : { referralsCount: 0 };
    const safeCoins = user ? Number(user.coins).toLocaleString() : '0';
    const safeEnergy = user ? `${user.energy}/${user.max_energy}` : '100/100';
    const safeClickPower = user ? user.click_power : 1;
    const baseUrl = payloadRaw
        ? `${APP_URL}?startapp=${encodeURIComponent(payloadRaw)}`
        : APP_URL;
    const registerUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}register=1`;
    const webAppUrl = user ? baseUrl : registerUrl;
    const actionText = user ? '✨ ИГРАТЬ ✨' : '📝 РЕГИСТРАЦИЯ';
    
    await ctx.replyWithHTML(`
🌟 <b>Star to Planet</b> 🌟

👤 <b>Игрок:</b> ${userName}
💰 <b>Баланс:</b> ${safeCoins} 🪙
⚡ <b>Энергия:</b> ${safeEnergy}
💪 <b>Сила клика:</b> ${safeClickPower}
🏆 <b>Рейтинг:</b> #${rank}
👥 <b>Рефералов:</b> ${stats?.referralsCount ?? 0}

🎯 <b>Оффер:</b> Играй 15-30 мин в день, прокачай 10/10 и попади в условия airdrop.

🚀 <b>Первые 2 минуты:</b>
1) Нажми <b>${user ? 'Играть' : 'Регистрация'}</b>
2) Сделай первый тап и забери первое задание
3) Открой Boost и купи первое улучшение
4) Пригласи друга по реферальной ссылке

🎮 Нажми на кнопку ниже!
    `, {
        reply_markup: {
            inline_keyboard: [[{ text: actionText, web_app: { url: webAppUrl } }]]
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
        const [scope, type, userIdFromPayload, providerInvoiceId] = payload.split(':');
        if (scope !== 'premium' || !PREMIUM_PRODUCTS[type]) return;

        const buyerId = ctx.from?.id;
        const targetUserId = parseInt(userIdFromPayload);
        if (!buyerId || !targetUserId || buyerId !== targetUserId) return;

        if (providerInvoiceId) {
            await markPaymentPaid(providerInvoiceId, { source: 'telegram_successful_payment', telegramPaymentChargeId: payment.telegram_payment_charge_id });
        }
        const grant = await grantPremiumLevel(buyerId, type);
        if (!grant.ok) {
            await ctx.reply(`⚠️ ${grant.message}`);
            return;
        }

        const labels = { moon: 'Луна', earth: 'Земля', sun: 'Солнце' };
        await ctx.reply(`✅ Оплата получена. Уровень ${labels[type]} активирован.`);
    } catch (e) {
        console.error('Ошибка обработки successful_payment:', e);
    }
});

// ========== ЗАПУСК ==========
await bot.telegram.deleteWebhook({ drop_pending_updates: true });
console.log('✅ Старый webhook снят');

await initDB();

if (useWebhookMode) {
    const hookUrl = `${publicUrl}${WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(hookUrl);
    console.log(`✅ Режим webhook (нет конфликта getUpdates). URL зарегистрирован в Telegram.`);
} else {
    await bot.launch();
    console.log('🤖 Бот в режиме long polling (убедись, что нет второго инстанса с тем же BOT_TOKEN)');
}