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
    setUserReferrerAdmin,
    trackBotStart,
    getMarketingMetricsAdmin,
    ensureLeaderboardRow,
    attachReferrerForExistingUser,
    getUsersEligibleForInactivityReminders,
    markInactivityReminderSent
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

/** Напоминания в личку бота неактивным (last_seen = последний save). Отключить: INACTIVITY_REMINDER_ENABLED=false */
const INACTIVITY_REMINDER_ENABLED = process.env.INACTIVITY_REMINDER_ENABLED !== 'false';
const INACTIVITY_REMINDER_AFTER_HOURS = Number(process.env.INACTIVITY_REMINDER_AFTER_HOURS || 4);
const INACTIVITY_REMINDER_COOLDOWN_HOURS = Number(process.env.INACTIVITY_REMINDER_COOLDOWN_HOURS || 5);
const INACTIVITY_REMINDER_BATCH = Number(process.env.INACTIVITY_REMINDER_BATCH || 500);
/** Секрет для GET /api/cron/inactivity-reminders — внешний cron (Render sleep) будет будить сервис */
const INACTIVITY_REMINDER_CRON_SECRET = process.env.INACTIVITY_REMINDER_CRON_SECRET || '';

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

/** @see https://core.telegram.org/bots/api#getchatmember — бот должен быть админом канала. Пример: @channelname или -1001234567890 */
const INFO_CHANNEL_CHAT_ID = (process.env.INFO_CHANNEL_CHAT_ID || '').trim();
const INFO_CHANNEL_PASSIVE_BONUS = 20;

function asInt(v, d = 0) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : d;
}

function isInfoChannelMemberStatus(status) {
    return (
        status === 'creator' ||
        status === 'administrator' ||
        status === 'member' ||
        status === 'restricted'
    );
}

/** @returns {boolean|null} true/false или null при ошибке API (состояние не меняем) */
async function checkInfoChannelMembership(telegramUserId) {
    if (!INFO_CHANNEL_CHAT_ID) return null;
    try {
        const m = await bot.telegram.getChatMember(INFO_CHANNEL_CHAT_ID, telegramUserId);
        return isInfoChannelMemberStatus(m.status);
    } catch (e) {
        const desc = String(e?.response?.description || e?.message || '');
        console.warn('[info-channel] getChatMember:', desc);
        return null;
    }
}

/** Старые профили: бонус канала был в task_passive_bonus_rate, флаг — в task_state. */
async function migrateLegacyInfoChannelBonus(telegramId) {
    const u = await getUser(telegramId);
    if (!u) return;
    const ts = u.task_state || {};
    const claimed = Boolean(ts.instantTasksClaimed?.channel);
    const chCol = asInt(u.info_channel_passive_bonus, 0);
    if (!claimed || chCol > 0) return;
    const total = Math.max(0, asInt(u.task_passive_bonus_rate, 0));
    if (total <= 0) return;
    const take = Math.min(INFO_CHANNEL_PASSIVE_BONUS, total);
    await updateUser(telegramId, {
        info_channel_passive_bonus: take,
        task_passive_bonus_rate: total - take
    });
}

/** Отписка от канала → снять флаг и отдельный бонус (столбец info_channel_passive_bonus). */
async function reconcileInfoChannelReward(telegramId) {
    if (!INFO_CHANNEL_CHAT_ID) return { changed: false };
    await migrateLegacyInfoChannelBonus(telegramId);
    const u = await getUser(telegramId);
    if (!u) return { changed: false };
    const chBonus = Math.max(0, asInt(u.info_channel_passive_bonus, 0));
    const ts = u.task_state && typeof u.task_state === 'object' ? { ...u.task_state } : {};
    const claimed = Boolean(ts.instantTasksClaimed?.channel);
    if (!claimed && chBonus <= 0) return { changed: false };

    const subscribed = await checkInfoChannelMembership(telegramId);
    if (subscribed !== false) return { changed: false };

    const newTs = {
        ...ts,
        instantTasksClaimed: { ...(ts.instantTasksClaimed || {}), channel: false }
    };
    await updateUser(telegramId, {
        info_channel_passive_bonus: 0,
        task_state: newTs
    });
    return { changed: true, revoked: true };
}

async function runInactivityReminderJob() {
    if (!INACTIVITY_REMINDER_ENABLED) return { skipped: true, sent: 0, failed: 0 };
    const ids = await getUsersEligibleForInactivityReminders({
        inactiveAfterHours: INACTIVITY_REMINDER_AFTER_HOURS,
        reminderCooldownHours: INACTIVITY_REMINDER_COOLDOWN_HOURS,
        limit: INACTIVITY_REMINDER_BATCH
    });
    if (!ids.length) return { sent: 0, failed: 0 };

    const text = [
        '⚡ <b>Star to Planet</b>',
        '',
        'Давно не было тебя в игре — зайди на пару минут.',
        '',
        'Энергия, ежедневные задания и пассивный доход не должны простаивать.',
        '',
        'Нажми «Играть» ниже — быстро вернёшься в ритм 🚀'
    ].join('\n');

    let sent = 0;
    let failed = 0;
    for (const id of ids) {
        try {
            await bot.telegram.sendMessage(id, text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '✨ ИГРАТЬ ✨', web_app: { url: APP_URL } }]]
                }
            });
            await markInactivityReminderSent(id);
            sent += 1;
            await new Promise((r) => setTimeout(r, 55));
        } catch (e) {
            failed += 1;
            const desc = String(e?.response?.description || e?.message || '');
            if (/403|blocked|deactivated|chat not found/i.test(desc)) {
                await markInactivityReminderSent(id);
            }
        }
    }
    if (sent || failed) {
        console.log(`📣 Напоминания неактивным: отправлено ${sent}, ошибок ${failed}`);
    }
    return { sent, failed };
}

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

/** Внешний cron (cron-job.org, UptimeRobot): раз в 1–2 ч, чтобы на Render будить сервис и слать напоминания */
app.get('/api/cron/inactivity-reminders', async (req, res) => {
    if (!INACTIVITY_REMINDER_CRON_SECRET) {
        res.status(503).json({ ok: false, message: 'Задайте INACTIVITY_REMINDER_CRON_SECRET в env' });
        return;
    }
    const q = req.query.secret?.toString() || '';
    const h = req.headers['x-cron-secret']?.toString() || '';
    if (q !== INACTIVITY_REMINDER_CRON_SECRET && h !== INACTIVITY_REMINDER_CRON_SECRET) {
        res.status(403).json({ ok: false, message: 'Неверный секрет' });
        return;
    }
    try {
        const r = await runInactivityReminderJob();
        res.json({ ok: true, ...r });
    } catch (e) {
        console.error('cron inactivity-reminders:', e);
        res.status(500).json({ ok: false, message: e?.message || 'error' });
    }
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
        const rawSeen = user.last_seen_at ?? user.created_at;
        let lastSeenAtMs = null;
        if (rawSeen != null) {
            const t = new Date(rawSeen).getTime();
            if (Number.isFinite(t) && t > 0) lastSeenAtMs = t;
        }

        const basePassive = asInt(user.task_passive_bonus_rate, 0);
        const chPassive = asInt(user.info_channel_passive_bonus, 0);
        const infoChannelClaimed = Boolean(user.task_state?.instantTasksClaimed?.channel);
        // Подписку не проверяем здесь синхронно — иначе /api/user тормозит запуск игры.
        // Точный статус догружается отдельным /api/tasks/info-channel.
        const infoChannelSubscribed = false;

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
            energyRegenSpeedLevel: Number(user.energy_regen_speed_level ?? 0),
            energyRegenSpeedCost: Number(user.energy_regen_speed_cost ?? 250),
            taskPassiveBonusRate: basePassive + chPassive,
            infoChannelConfigured: Boolean(INFO_CHANNEL_CHAT_ID),
            infoChannelClaimed,
            infoChannelSubscribed,
            infoChannelCanClaim: Boolean(INFO_CHANNEL_CHAT_ID) && infoChannelSubscribed && !infoChannelClaimed,
            ownedRankLevel: Number(user.owned_rank_level ?? -1),
            ...(lastSeenAtMs != null ? { lastSeenAtMs } : {}),
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
        await ensureLeaderboardRow(telegramId);
        const ref = referrerId && !isNaN(parseInt(referrerId)) ? parseInt(referrerId) : null;
        if (ref) {
            const attached = await attachReferrerForExistingUser(telegramId, ref);
            if (attached.ok) {
                res.json({
                    success: true,
                    registered: true,
                    created: false,
                    userId: telegramId,
                    referrerAttached: true,
                    message: 'Профиль уже был; реферер по ссылке привязан'
                });
                return;
            }
        }
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
            referrals: Array.isArray(stats.referrals) ? stats.referrals : [],
            referralLine2: Array.isArray(stats.referralLine2) ? stats.referralLine2 : [],
            referralLine3: Array.isArray(stats.referralLine3) ? stats.referralLine3 : [],
            referralLine4: Array.isArray(stats.referralLine4) ? stats.referralLine4 : []
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
        const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
        const int = (v, d = 0) => Math.floor(num(v, d));

        await reconcileInfoChannelReward(telegramId);
        const existingUser = await getUser(telegramId);
        const previousCoins = existingUser ? Number(existingUser.coins) : 0;
        const currentCoins = Math.max(0, int(gameData.coins, 0));

        const serverChPassive = Math.max(0, asInt(existingUser?.info_channel_passive_bonus, 0));
        const incomingPassiveTotal = Math.max(0, int(gameData.taskPassiveBonusRate, 0));
        const basePassiveStored = Math.max(0, incomingPassiveTotal - serverChPassive);

        const serverTs = existingUser?.task_state && typeof existingUser.task_state === 'object' ? existingUser.task_state : {};
        const serverChannelClaimed = Boolean(serverTs.instantTasksClaimed?.channel);
        const clientInstant = gameData.instantTasksClaimed && typeof gameData.instantTasksClaimed === 'object' ? gameData.instantTasksClaimed : {};
        const mergedInstantTasks = { ...clientInstant, channel: serverChannelClaimed };

        const nowMs = Date.now();
        const anchorRaw = num(gameData.lastSeenAtMs, NaN);
        let lastSeenAt = new Date(nowMs);
        if (Number.isFinite(anchorRaw) && anchorRaw > 1_000_000_000_000) {
            const maxAheadMs = 120_000;
            const maxBackMs = 30 * 24 * 60 * 60 * 1000;
            const clamped = Math.min(nowMs + maxAheadMs, Math.max(nowMs - maxBackMs, Math.floor(anchorRaw)));
            lastSeenAt = new Date(clamped);
        }

        await updateUser(telegramId, {
            last_seen_at: lastSeenAt,
            coins: currentCoins,
            energy: Math.max(0, int(gameData.energy, 100)),
            max_energy: Math.max(100, int(gameData.maxEnergy, 100)),
            click_power: Math.max(1, int(gameData.clickPower, 1)),
            passive_income_level: Math.max(0, int(gameData.passiveIncomeLevel, 0)),
            task_passive_bonus_rate: basePassiveStored,
            info_channel_passive_bonus: serverChPassive,
            owned_rank_level: Math.max(-1, Math.min(10, int(gameData.ownedRankLevel, -1))),
            has_moon: Boolean(gameData.hasMoon),
            has_earth: Boolean(gameData.hasEarth),
            has_sun: Boolean(gameData.hasSun),
            click_upgrade_level: Math.max(1, int(gameData.clickUpgradeLevel, 1)),
            click_upgrade_cost: Math.max(0, int(gameData.clickUpgradeCost, 100)),
            energy_upgrade_level: Math.max(1, int(gameData.energyUpgradeLevel, 1)),
            energy_upgrade_cost: Math.max(0, int(gameData.energyUpgradeCost, 200)),
            passive_income_cost: Math.max(0, int(gameData.passiveIncomeUpgradeCost, 500)),
            energy_regen_speed_level: Math.max(0, Math.min(30, int(gameData.energyRegenSpeedLevel, 0))),
            energy_regen_speed_cost: Math.max(0, int(gameData.energyRegenSpeedCost, 250)),
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
                instantTasksClaimed: mergedInstantTasks,
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

app.get('/api/tasks/info-channel', rateLimit('info_ch', 90, 60_000), async (req, res) => {
    try {
        const telegramId = parseInt(req.query.userId);
        if (!telegramId) {
            res.status(400).json({ ok: false, message: 'Неверный userId' });
            return;
        }
        if (!INFO_CHANNEL_CHAT_ID) {
            res.json({
                ok: true,
                configured: false,
                claimed: false,
                subscribed: false,
                canClaim: false
            });
            return;
        }
        await reconcileInfoChannelReward(telegramId);
        const u = await getUser(telegramId);
        if (!u) {
            res.json({ ok: true, configured: true, claimed: false, subscribed: false, canClaim: false });
            return;
        }
        const claimed = Boolean(u.task_state?.instantTasksClaimed?.channel);
        const sub = await checkInfoChannelMembership(telegramId);
        const subscribed = sub === true;
        const passiveTotal = asInt(u.task_passive_bonus_rate, 0) + asInt(u.info_channel_passive_bonus, 0);
        res.json({
            ok: true,
            configured: true,
            claimed,
            subscribed,
            canClaim: subscribed && !claimed,
            taskPassiveBonusRate: passiveTotal
        });
    } catch (e) {
        console.error('Ошибка /api/tasks/info-channel:', e);
        res.status(500).json({ ok: false, message: 'Ошибка' });
    }
});

app.post('/api/tasks/claim-info-channel', rateLimit('claim_info_ch', 25, 60_000), async (req, res) => {
    try {
        const { userId } = req.body || {};
        const telegramId = parseInt(userId);
        if (!telegramId) {
            res.status(400).json({ ok: false, message: 'Неверный userId' });
            return;
        }
        if (!INFO_CHANNEL_CHAT_ID) {
            res.status(503).json({ ok: false, message: 'Проверка канала не настроена на сервере' });
            return;
        }
        await reconcileInfoChannelReward(telegramId);
        let u = await getUser(telegramId);
        if (!u) {
            res.status(404).json({ ok: false, message: 'Профиль не найден' });
            return;
        }
        if (u.task_state?.instantTasksClaimed?.channel) {
            res.json({ ok: true, already: true, message: 'Вы уже получили награду' });
            return;
        }
        const sub = await checkInfoChannelMembership(telegramId);
        if (sub !== true) {
            res.status(400).json({ ok: false, message: 'Сначала подпишитесь на канал' });
            return;
        }
        const ts = u.task_state && typeof u.task_state === 'object' ? { ...u.task_state } : {};
        const newTs = {
            ...ts,
            instantTasksClaimed: { ...(ts.instantTasksClaimed || {}), channel: true }
        };
        const base = asInt(u.task_passive_bonus_rate, 0);
        const newCh = asInt(u.info_channel_passive_bonus, 0) + INFO_CHANNEL_PASSIVE_BONUS;
        await updateUser(telegramId, {
            task_state: newTs,
            info_channel_passive_bonus: newCh,
            task_passive_bonus_rate: base
        });
        u = await getUser(telegramId);
        res.json({
            ok: true,
            taskPassiveBonusRate: asInt(u.task_passive_bonus_rate, 0) + asInt(u.info_channel_passive_bonus, 0),
            instantTasksClaimed: newTs.instantTasksClaimed || { channel: true }
        });
    } catch (e) {
        console.error('Ошибка /api/tasks/claim-info-channel:', e);
        res.status(500).json({ ok: false, message: 'Ошибка сервера' });
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

app.get('/api/admin/user/:telegramId', requireAdmin, async (req, res) => {
    const telegramId = parseInt(req.params.telegramId, 10);
    if (!telegramId) {
        res.status(400).json({ success: false, message: 'Неверный telegramId' });
        return;
    }
    const user = await getUser(telegramId);
    if (!user) {
        res.status(404).json({ success: false, message: 'Пользователь не найден' });
        return;
    }
    res.json({ success: true, user });
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

app.post('/api/admin/set-referrer', requireAdmin, async (req, res) => {
    const telegramId = parseInt(req.body?.telegramId, 10);
    const rawRef = req.body?.referrerId;
    if (!telegramId) {
        res.status(400).json({ success: false, message: 'Неверный telegramId' });
        return;
    }
    const result = await setUserReferrerAdmin(telegramId, rawRef);
    if (!result?.ok) {
        res.status(400).json({ success: false, message: result?.message || 'Не удалось обновить реферера' });
        return;
    }
    res.json({ success: true, user: result.user });
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

/** Как во фронте: K/M/B/T, запятая как десятичный разделитель. */
function formatCompactCoins(value) {
    const x = Math.max(0, Math.floor(Number(value) || 0));
    if (x < 1000) return String(x);
    const tiers = [
        { min: 1e12, div: 1e12, s: 'T' },
        { min: 1e9, div: 1e9, s: 'B' },
        { min: 1e6, div: 1e6, s: 'M' },
        { min: 1e3, div: 1e3, s: 'K' }
    ];
    for (const { min, div, s } of tiers) {
        if (x >= min) {
            const d = x / div;
            let num;
            if (d >= 100) num = String(Math.floor(d));
            else {
                const r = Math.round(d * 10) / 10;
                if (Number.isInteger(r)) num = String(r);
                else {
                    num = r.toFixed(1);
                    if (num.endsWith('.0')) num = num.slice(0, -2);
                }
            }
            return num.replace('.', ',') + s;
        }
    }
    return String(x);
}

// ========== КОМАНДЫ БОТА (регистрация до listen, чтобы не терять апдейты) ==========
bot.catch((err, ctx) => {
    console.error('❌ Telegraf:', err?.message || err, ctx?.update?.update_id);
    const reply = ctx?.reply?.bind(ctx);
    if (reply) {
        reply('⚠️ Сервис временно недоступен. Нажмите /start ещё раз через минуту.').catch(() => {});
    }
});

/** Общая логика приветствия /start (кнопка «Start», ручной ввод, реф-параметр). */
async function sendStartWelcome(ctx, startPayloadRaw = '') {
    const userId = ctx.from.id;
    try {
        await trackBotStart(userId);
        let userName = ctx.from.username || ctx.from.first_name || 'игрок';
        if (ctx.from.username) userName = `@${ctx.from.username}`;

        const payloadRaw = String(startPayloadRaw || '').trim();
        let user = await getUser(userId);
        if (user) {
            await updateUser(userId, { username: ctx.from.username, first_name: ctx.from.first_name });
        }

        const rank = user ? await getPlayerRank(userId) : '—';
        const stats = user ? await getStats(userId) : { referralsCount: 0 };
        const safeCoins = user ? formatCompactCoins(user.coins) : '0';
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
    } catch (e) {
        console.error('Ошибка /start:', e?.message || e);
        await ctx.reply(
            '🌟 Star to Planet\n\nНе удалось загрузить профиль (БД или сеть). Попробуйте /start снова через минуту.',
            {
                reply_markup: {
                    inline_keyboard: [[{ text: '✨ Открыть игру', web_app: { url: APP_URL } }]]
                }
            }
        );
    }
}

bot.start(async (ctx) => {
    await sendStartWelcome(ctx, ctx.startPayload || '');
});

/**
 * Telegraf обрабатывает /start только если сущность bot_command с offset === 0.
 * Если перед командой пробел/символ (часто при вводе с клавиатуры или вставке), штатный handler пропускает — тишина.
 */
bot.use(async (ctx, next) => {
    const msg = ctx.message;
    if (!msg?.text || ctx.chat?.type !== 'private') return next();

    const text = msg.text;
    const entities = msg.entities || [];

    let payload = '';
    const startEntity = entities.find((e) => {
        if (e.type !== 'bot_command') return false;
        const part = text.slice(e.offset, e.offset + e.length);
        const cmd = part.split('@')[0].toLowerCase();
        return cmd === '/start';
    });

    if (startEntity) {
        const part = text.slice(startEntity.offset, startEntity.offset + startEntity.length);
        const atBot = part.split('@')[1];
        if (atBot && atBot.toLowerCase() !== ctx.me.toLowerCase()) return next();
        payload = text.slice(startEntity.offset + startEntity.length).trim();
    } else {
        const trimmed = text.trimStart();
        const m = trimmed.match(/^\/start(?:@([\w]+))?(?:\s+(.+))?$/i);
        if (!m) return next();
        if (m[1] && m[1].toLowerCase() !== ctx.me.toLowerCase()) return next();
        payload = (m[2] || '').trim();
    }

    await sendStartWelcome(ctx, payload);
});

bot.command('rating', async (ctx) => {
    const top = await getLeaderboard(10);
    let msg = '🏆 <b>ТОП ИГРОКОВ</b> 🏆\n\n';
    for (let i = 0; i < top.length; i++) {
        const name = top[i].username || top[i].first_name || 'Аноним';
        const level = top[i].level || 1;
        msg += `${i+1}. ${name} — ${formatCompactCoins(top[i].coins)} 🪙 (Уровень ${level})\n`;
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
// Сначала БД, потом HTTP — иначе webhook может прийти до initDB и /start упадёт молча.
await initDB();

if (!INFO_CHANNEL_CHAT_ID) {
    console.warn(
        '⚠️ INFO_CHANNEL_CHAT_ID не задан — бонус за канал без проверки getChatMember; задайте @username или -100… (бот — админ канала).'
    );
}

const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
    console.log(`✅ Веб-сервер слушает http://${HOST}:${PORT} (env PORT=${process.env.PORT ?? 'not-set'})`);
});
server.on('error', (err) => {
    console.error('❌ Ошибка веб-сервера:', err);
});

if (useWebhookMode) {
    const hookUrl = `${publicUrl}${WEBHOOK_PATH}`;
    // setWebhook заменяет предыдущий URL; не вызываем deleteWebhook(drop_pending_updates: true) —
    // иначе на время долгого initDB апдейты теряются и пользователи «нажимают /start — тишина».
    await bot.telegram.setWebhook(hookUrl);
    console.log(`✅ Webhook: ${hookUrl}`);
} else {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch();
    console.log('🤖 Бот в режиме long polling (убедись, что нет второго инстанса с тем же BOT_TOKEN)');
}

if (INACTIVITY_REMINDER_ENABLED) {
    const tickMs = 60 * 60 * 1000;
    setInterval(() => {
        runInactivityReminderJob().catch((e) => console.error('inactivity reminder tick:', e));
    }, tickMs);
    setTimeout(() => {
        runInactivityReminderJob().catch((e) => console.error('inactivity reminder initial:', e));
    }, 150_000);
    if (INACTIVITY_REMINDER_CRON_SECRET) {
        console.log('📅 Напоминания: cron GET /api/cron/inactivity-reminders?secret=… + таймер раз в 1 ч');
    } else {
        console.log('📅 Напоминания: таймер раз в 1 ч (для Render sleep задайте INACTIVITY_REMINDER_CRON_SECRET и внешний cron)');
    }
}