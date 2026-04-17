import * as THREE from 'three';

// Канонизируем домен, чтобы все сценарии запуска использовали один origin и общее localStorage.
if (window.location.hostname === 'star-to-planet-bot.onrender.com') {
    const target = `https://startoplanet.onrender.com${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
}

// ========== API БЭКЕНДА ==========
const API_BASE = window.API_BASE || 'https://startoplanet.onrender.com';
const INFO_CHANNEL_URL = 'https://t.me/Startoplanet_info';

// ========== Telegram WebApp ==========
let tg = null;
let userId = null;
let displayName = "Игрок";
let userAvatar = 'https://telegram.org/img/tg_icon_light.png';

if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
    const tp = tg.themeParams;
    if (tp && tp.bg_color) {
        document.documentElement.style.setProperty('--tg-bg', `#${tp.bg_color}`);
        document.body.style.background = `radial-gradient(circle at 50% 15%, rgba(255,255,255,0.04), transparent 40%), #${tp.bg_color}`;
    }
    if (tp && tp.secondary_bg_color) {
        document.documentElement.style.setProperty('--tg-secondary', `#${tp.secondary_bg_color}`);
    }
    let tgUser = tg.initDataUnsafe?.user || null;
    if (!tgUser && tg.initData) {
        try {
            const raw = new URLSearchParams(tg.initData).get('user');
            if (raw) tgUser = JSON.parse(raw);
        } catch (e) {}
    }
    if (tgUser?.id) {
        userId = tgUser.id;
        if (tgUser.username) displayName = `@${tgUser.username}`;
        else if (tgUser.first_name) displayName = tgUser.first_name;
        userAvatar = tgUser.photo_url || userAvatar;
        console.log('✅ Пользователь авторизован, ID:', userId);
    }
}

function applyViewportHeight() {
    const h = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight || 0;
    if (!h) return;
    document.documentElement.style.setProperty('--app-vh', `${h * 0.01}px`);
    const safeTop = Number(tg?.safeAreaInset?.top || tg?.contentSafeAreaInset?.top || 0);
    document.documentElement.style.setProperty('--tg-safe-top', `${Math.max(0, safeTop)}px`);
}
function applyTopHudVisibilityFix() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;
    const rect = topBar.getBoundingClientRect();
    const minTopClearance = 52; // запас под верхнюю панель Telegram (close/menu)
    const fixTop = rect.top < minTopClearance ? Math.ceil(minTopClearance - rect.top) : 0;
    document.documentElement.style.setProperty('--hud-fix-top', `${fixTop}px`);
}
applyViewportHeight();
setTimeout(applyTopHudVisibilityFix, 40);
window.addEventListener('resize', applyViewportHeight);
window.addEventListener('resize', applyTopHudVisibilityFix);
if (tg?.onEvent) {
    tg.onEvent('viewportChanged', applyViewportHeight);
    tg.onEvent('viewportChanged', applyTopHudVisibilityFix);
}
setTimeout(applyViewportHeight, 150);
setTimeout(applyViewportHeight, 600);
setTimeout(applyTopHudVisibilityFix, 180);
setTimeout(applyTopHudVisibilityFix, 700);

// Элементы профиля
const userNameElem = document.getElementById('userName');
const profileNameElem = document.getElementById('profileName');
const userAvatarElem = document.getElementById('userAvatar');
const profileAvatarElem = document.getElementById('profileAvatar');
if (userNameElem) userNameElem.textContent = displayName;
if (profileNameElem) profileNameElem.textContent = displayName;
if (userAvatarElem) userAvatarElem.src = userAvatar;
if (profileAvatarElem) profileAvatarElem.src = userAvatar;

let isRegistered = false;
const registeredCacheKey = () => (userId ? `stp_registered_${userId}` : null);
const gameStorageKey = () => (userId ? `starToPlanet_${userId}` : 'starToPlanet_guest');
function hasAnyLocalProgress() {
    try {
        if (!userId) return false;
        if (localStorage.getItem(`starToPlanet_${userId}`)) return true;
        if (localStorage.getItem('starToPlanet')) return true;
        return false;
    } catch (e) {
        return false;
    }
}
function getCachedRegistered() {
    try {
        const key = registeredCacheKey();
        if (!key) return false;
        return localStorage.getItem(key) === '1';
    } catch (e) { return false; }
}
function setCachedRegistered(value) {
    try {
        const key = registeredCacheKey();
        if (!key) return;
        localStorage.setItem(key, value ? '1' : '0');
    } catch (e) {}
}

function tryResolveTelegramUser() {
    if (!tg) return false;
    if (userId) return true;

    let tgUser = tg.initDataUnsafe?.user || null;
    if (!tgUser && tg.initData) {
        try {
            const raw = new URLSearchParams(tg.initData).get('user');
            if (raw) tgUser = JSON.parse(raw);
        } catch (e) {}
    }
    if (!tgUser?.id) return false;

    userId = tgUser.id;
    if (tgUser.username) displayName = `@${tgUser.username}`;
    else if (tgUser.first_name) displayName = tgUser.first_name;
    userAvatar = tgUser.photo_url || userAvatar;
    if (userNameElem) userNameElem.textContent = displayName;
    if (profileNameElem) profileNameElem.textContent = displayName;
    if (userAvatarElem) userAvatarElem.src = userAvatar;
    if (profileAvatarElem) profileAvatarElem.src = userAvatar;
    return true;
}

async function ensureTelegramUserResolved(maxAttempts = 8, delayMs = 350) {
    if (tryResolveTelegramUser()) return true;
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (tryResolveTelegramUser()) return true;
    }
    return false;
}

function getLaunchReferrerId() {
    const fromTelegram = tg?.initDataUnsafe?.start_param || '';
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('startapp') || params.get('start') || '';
    const source = String(fromTelegram || fromUrl || '');
    const match = source.match(/ref_(\d+)|(\d+)/);
    const refId = match ? parseInt(match[1] || match[2], 10) : null;
    if (!refId || !userId || refId === userId) return null;
    return refId;
}

function isRegisterIntentLaunch() {
    const params = new URLSearchParams(window.location.search);
    return params.get('register') === '1';
}

function showRegistrationOverlay(show) {
    const overlay = document.getElementById('registrationOverlay');
    const nav = document.querySelector('.nav-bar');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
    if (nav) nav.style.display = show ? 'none' : 'flex';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const merged = { ...options, signal: controller.signal };
        return await fetch(url, merged);
    } finally {
        clearTimeout(timer);
    }
}

async function checkRegistrationStatus(maxAttempts = 4, baseDelayMs = 700) {
    if (!userId) await ensureTelegramUserResolved(8, 350);
    if (!userId) return getCachedRegistered();
    let hadNetworkError = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const res = await fetchWithTimeout(`${API_BASE}/api/user/${userId}`, {}, 7000);
            if (!res.ok) {
                hadNetworkError = true;
                await new Promise((resolve) => setTimeout(resolve, baseDelayMs + attempt * 400));
                continue;
            }
            const data = await res.json();
            const registered = Boolean(data?.registered);
            if (registered) setCachedRegistered(true);
            return registered;
        } catch (e) {
            hadNetworkError = true;
        }
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs + attempt * 400));
    }
    // null = не удалось достоверно проверить (например, cold start/сеть)
    if (hadNetworkError) return getCachedRegistered() ? true : null;
    return getCachedRegistered();
}

async function registerCurrentUser() {
    if (!userId) await ensureTelegramUserResolved(10, 350);
    if (!userId) return { ok: false, message: 'Не удалось определить Telegram пользователя. Откройте игру через /start и попробуйте снова.' };
    const referrerId = getLaunchReferrerId();
    const username = tg?.initDataUnsafe?.user?.username || null;
    const firstName = tg?.initDataUnsafe?.user?.first_name || null;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const res = await fetchWithTimeout(`${API_BASE}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, username, firstName, referrerId })
            }, 9000);
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) {
                if (attempt < 3) {
                    await new Promise((resolve) => setTimeout(resolve, 700 + attempt * 500));
                    continue;
                }
                return { ok: false, message: data?.message || 'Ошибка регистрации' };
            }
            setCachedRegistered(true);
            return { ok: true, created: Boolean(data?.created), message: data?.message || '' };
        } catch (e) {
            if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, 700 + attempt * 500));
                continue;
            }
        }
    }
    return { ok: false, message: 'Сервер временно недоступен. Повторите через 10-20 секунд.' };
}

function renderFriendsFallback() {
    renderReferralLineList(
        'level1List',
        [],
        `<div class="level-item"><span>👥 Пригласите друзей через реферальную ссылку</span><span></span></div>`
    );
    renderReferralLineList('level2List', [], `<div class="level-item"><span>✨ Бонус от друзей друзей</span><span></span></div>`);
    renderReferralLineList('level3List', [], `<div class="level-item"><span>💫 Третья линия</span><span></span></div>`);
    renderReferralLineList('level4List', [], `<div class="level-item"><span>💎 Почётный статус</span><span></span></div>`);
    const referralCount = document.getElementById('referralCount');
    const referralBonus = document.getElementById('referralBonus');
    const profileReferrals = document.getElementById('profileReferrals');
    if (referralCount) referralCount.textContent = '0';
    if (referralBonus) referralBonus.textContent = '0';
    if (profileReferrals) profileReferrals.textContent = '0';
}

// ========== ИГРОВЫЕ КОНСТАНТЫ (выше let: инициализаторы не могут ссылаться на const до объявления) ==========
const ENERGY_MAX_VALUE = 500;
const ENERGY_MAX_LEVEL = 10;
const ONLINE_ENERGY_REGEN_PER_SEC = 2;
/** База без прокачки: 2 энерг/с = 120/мин (офлайн считается через getEnergyRegenPerSecond()). */
const OFFLINE_ENERGY_REGEN_PER_MIN = 120;
/**
 * Уровней прокачки скорости регенa: линейный рост от 2 энерг/с до цели на макс. уровне.
 * При maxEnergy=500 и ур.=MAX: время 0→полной шкалы ≈ ENERGY_REGEN_FULL_TARGET_SEC (~2¾ мин, вилка ~2–5 мин).
 */
const ENERGY_REGEN_SPEED_MAX = 30;
const ENERGY_REGEN_SPEED_BASE_COST = 250;
/** Рост цены за уровень. */
const ENERGY_REGEN_SPEED_COST_MULT = 1.06;
/** Целевое время полного восстановления (сек) при maxEnergy = ENERGY_MAX_VALUE на макс. уровне прокачки. */
const ENERGY_REGEN_FULL_TARGET_SEC = 165;

// ========== ИГРОВЫЕ ПЕРЕМЕННЫЕ ==========
let coins = 0;
let energy = 100;
let maxEnergy = 100;
let clickPower = 1;
let clickUpgradeCost = 100;
let clickUpgradeLevel = 1;
let energyUpgradeCost = 200;
let energyUpgradeLevel = 1;
let passiveIncomeLevel = 0;
let passiveIncomeUpgradeCost = 500;
let energyRegenSpeedLevel = 0;
let energyRegenSpeedCost = ENERGY_REGEN_SPEED_BASE_COST;
let passiveIncomeRate = 0;
let taskPassiveBonusRate = 0;
/** Локальный флаг только если сервер без INFO_CHANNEL_CHAT_ID (старый режим). */
let instantTaskChannelOpened = false;
let instantTasksClaimed = { channel: false };
let infoChannelConfigured = false;
let infoChannelSubscribed = false;
let infoChannelCanClaim = false;
let infoChannelClaimInFlight = false;

// ========== ЗВАНИЯ: ЭКОНОМИКА (превью, localStorage) ==========
let ownedRankLevel = -1; // -1 = ничего не куплено
/** 0 = нет сохранённой метки (после loadGame подставится с сервера или Date.now()). */
let lastSeenAtMs = 0;

/** Валидная метка времени (мс) для оффлайна; 0/null/NaN из JSON ломали расчёт (delta≈0). */
function isValidEpochMs(t) {
    const n = Number(t);
    return Number.isFinite(n) && n > 1_000_000_000_000;
}
let offlineAppliedOnBoot = false;
/** Пока false — не считаем оффлайн из visibility/focus (иначе гонка с loadFromServer затирает паузу). */
let gameStateHydrated = false;
let startupSocialPrefetchDone = false;
let bootOfflineFallbackTimer = null;
const OFFLINE_CAP_MINUTES = 180; // 3 часа
let energyRegenIntervalId = null;
/** Для dt в rechargeEnergy (фикс. тик, не равен «виртуальному» интервалу ур. 1–5). */
let lastEnergyRegenAtMs = Date.now();
const ENERGY_REGEN_TICK_MS = 100;
let isRegistering = false;
let lastBoostTapAt = 0;

function ignoreRapidBoostTap() {
    const now = Date.now();
    if (now - lastBoostTapAt < 220) return true;
    lastBoostTapAt = now;
    return false;
}

function clampInt(n, min, max) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

/** UI монет: вариант A — &lt;1 000 целое число, далее K/M/B/T, десятичная запятая. */
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
            if (d >= 100) {
                num = String(Math.floor(d));
            } else {
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

function getLevelForCoins(coinsValue) {
    if (hasSun) return 10;
    if (hasEarth) return 9;
    if (hasMoon) return 8;
    const c = Number(coinsValue) || 0;
    if (c >= 10000000000) return 7;
    if (c >= 1000000000) return 6;
    if (c >= 100000000) return 5;
    if (c >= 10000000) return 4;
    if (c >= 1000000) return 3;
    if (c >= 100000) return 2;
    if (c >= 10000) return 1;
    return 0;
}

function getEffectiveRankLevel() {
    const owned = clampInt(ownedRankLevel, -1, 10);
    if (owned < 0) return -1;
    const currentPlanetLevel = clampInt(getLevel(), 0, 10);
    return Math.max(0, Math.min(owned, currentPlanetLevel));
}

function getRankCost(level) {
    const n = clampInt(level, 0, 10);
    // Стартовые значения (будем тюнить): стоимость растёт быстро, чтобы драйвером оставались рефералы
    const base = 50_000;
    const growth = 6.0;
    return Math.round(base * Math.pow(growth, n));
}

function getRankSalaryPerMinute(level) {
    const n = clampInt(level, -1, 10);
    if (n < 0) return 0;
    // Ступенчатая «зарплата» (монет/мин). Тюним позже, цель: год до 10/10 при реферальном драйвере.
    const table = [
        20_000, 35_000, 55_000, 80_000,          // 0..3
        120_000, 180_000, 260_000,               // 4..6
        400_000, 650_000, 1_000_000, 1_600_000   // 7..10
    ];
    return table[n] ?? 0;
}

function canBuyRank(level) {
    const n = clampInt(level, 0, 10);
    if (ownedRankLevel >= n) return { ok: false, reason: 'owned' };
    if (n > 0 && ownedRankLevel < n - 1) return { ok: false, reason: 'order' };
    if (getLevel() < n) return { ok: false, reason: 'planet_level' };
    const cost = getRankCost(n);
    if (coins < cost) return { ok: false, reason: 'coins' };
    return { ok: true, reason: 'ok' };
}

function buyRank(level) {
    const n = clampInt(level, 0, 10);
    const check = canBuyRank(n);
    if (!check.ok) {
        const map = {
            owned: '✅ Звание уже куплено',
            order: '🔒 Сначала купите предыдущее звание',
            planet_level: '🔒 Сначала достигните нужного уровня планеты',
            coins: '❌ Недостаточно монет'
        };
        showMessage(map[check.reason] || '❌ Нельзя купить звание', true);
        return;
    }
    const cost = getRankCost(n);
    coins -= cost;
    ownedRankLevel = n;
    dailyUpgradesBought++;
    weeklyUpgradesBought++;
    showMessage(`✅ Куплено звание: ${MILITARY_RANKS[n]?.name || `Уровень ${n}`}`);
    updateUI();
    fillRanksPreviewGrid();
    saveGame();
    syncWithBot();
}

/**
 * Пассив и энергия за время без учёта (свёрнуто приложение, нет сети, таймеры в фоне).
 * Дробные минуты — чтобы не терять начисления при коротких паузах.
 * lastSeenAtMs обновляется внутри; в saveGame() тот же маркер синхронизируется в память.
 */
/** @returns {boolean} было ли начисление монет или энергии */
function applyOfflineEarnings(options = {}) {
    const { silentToast = false } = options;
    const now = Date.now();
    const lastRaw = isValidEpochMs(lastSeenAtMs) ? Number(lastSeenAtMs) : now;
    const last = Math.min(lastRaw, now);
    const deltaMs = now - last;
    if (deltaMs < 800) return false;

    const awayMinutes = Math.max(0, Math.min(deltaMs / 60000, OFFLINE_CAP_MINUTES));
    if (awayMinutes <= 0) return false;

    const effRank = getEffectiveRankLevel();
    let perMinute = passiveIncomeLevel * 5 + taskPassiveBonusRate;
    if (hasSun) perMinute += 100000;
    else if (hasEarth) perMinute += 50000;
    else if (hasMoon) perMinute += 20000;
    perMinute += getRankSalaryPerMinute(effRank);

    const offlineCoins = Math.floor(awayMinutes * perMinute);
    const regenPerMin = getEnergyRegenPerSecond() * 60;
    const offlineEnergyRecover = Math.min(maxEnergy - energy, Math.floor(awayMinutes * regenPerMin));

    lastSeenAtMs = now;

    let gained = false;
    if (offlineCoins > 0) {
        coins += offlineCoins;
        dailyCoinsEarned += offlineCoins;
        weeklyCoinsEarned += offlineCoins;
        gained = true;
    }
    if (offlineEnergyRecover > 0) {
        energy += offlineEnergyRecover;
        gained = true;
    }

    if (!silentToast && offlineCoins > 0) {
        const shownMin = awayMinutes >= 1 ? awayMinutes.toFixed(0) : '<1';
        showMessage(`⏱️ Пока вас не было (~${shownMin} мин): +${formatCompactCoins(offlineCoins)} 🪙`);
    } else if (!silentToast && offlineEnergyRecover > 0 && offlineCoins <= 0) {
        showMessage(`⚡ Пока вас не было: +${offlineEnergyRecover} энергии`);
    }
    return gained;
}

// Делаем функцию глобальной
window.loadFromServer = loadFromServer;

let hasMoon = false;
let hasEarth = false;
let hasSun = false;
let premiumPaymentConfig = {
    paymentsEnabled: false,
    prices: { moon: 50, earth: 100, sun: 200 }
};
let currentVisualLevel = null;

const defaultDailyTasksClaimed = () => ({ click: false, coins: false, energy: false, upgrade: false, passive: false });
const defaultWeeklyTasksClaimed = () => ({ click: false, coins: false, energy: false, upgrade: false, passive: false });
const defaultInstantTasksClaimed = () => ({ channel: false });

let dailyClickCount = 0, dailyCoinsEarned = 0, dailyEnergySpent = 0, dailyUpgradesBought = 0;
let dailyTasksClaimed = defaultDailyTasksClaimed();
let weeklyClickCount = 0, weeklyCoinsEarned = 0, weeklyEnergySpent = 0, weeklyUpgradesBought = 0;
let weeklyTasksClaimed = defaultWeeklyTasksClaimed();
let lastDailyCycleKey = todayKey();
let lastWeeklyCycleKey = weekKey();
const claimInFlight = new Set();

const TASK_TARGETS = {
    dailyClick: 1,
    dailyCoins: 500,
    dailyEnergy: 200,
    dailyUpgrade: 1,
    dailyPassive: 80,
    weeklyClick: 1000,
    weeklyCoins: 5000,
    weeklyEnergy: 1000,
    weeklyUpgrade: 5,
    weeklyPassive: 120
};

let DAILY_REWARDS = {
    click: 50,
    coins: 500,
    energy: 300,
    upgrade: 200,
    passive: 5
};

const WEEKLY_REWARDS = {
    click: 1000,
    coins: 2500,
    energy: 1500,
    upgrade: 2000,
    passive: 12
};

const DAILY_TASK_VARIANTS = {
    click: [
        { target: 1, reward: 50, name: '🎯 Сделать 1 клик' },
        { target: 25, reward: 120, name: '🎯 Сделать 25 кликов' },
        { target: 50, reward: 180, name: '🎯 Сделать 50 кликов' },
        { target: 80, reward: 260, name: '🎯 Сделать 80 кликов' }
    ],
    coins: [
        { target: 500, reward: 500, name: '💰 Заработать 500 монет' },
        { target: 1200, reward: 800, name: '💰 Заработать 1 200 монет' },
        { target: 2000, reward: 1200, name: '💰 Заработать 2 000 монет' },
        { target: 3500, reward: 1800, name: '💰 Заработать 3 500 монет' }
    ],
    energy: [
        { target: 200, reward: 300, name: '⚡ Потратить 200 энергии' },
        { target: 300, reward: 420, name: '⚡ Потратить 300 энергии' },
        { target: 450, reward: 650, name: '⚡ Потратить 450 энергии' },
        { target: 600, reward: 900, name: '⚡ Потратить 600 энергии' }
    ],
    upgrade: [
        { target: 1, reward: 200, name: '🔧 Купить 1 улучшение' },
        { target: 2, reward: 420, name: '🔧 Купить 2 улучшения' },
        { target: 3, reward: 700, name: '🔧 Купить 3 улучшения' }
    ],
    passive: [
        { target: 80, reward: 5, name: '📈 Пассивный доход 80/мин' },
        { target: 120, reward: 6, name: '📈 Пассивный доход 120/мин' },
        { target: 180, reward: 8, name: '📈 Пассивный доход 180/мин' },
        { target: 240, reward: 10, name: '📈 Пассивный доход 240/мин' }
    ]
};

function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
}

function pickVariant(list, seed) {
    if (!Array.isArray(list) || !list.length) return null;
    return list[seed % list.length];
}

function applyDailyTaskConfig() {
    const seedBase = `${todayKey()}_${userId || 'guest'}`;
    const clickCfg = pickVariant(DAILY_TASK_VARIANTS.click, hashSeed(`${seedBase}_click`));
    const coinsCfg = pickVariant(DAILY_TASK_VARIANTS.coins, hashSeed(`${seedBase}_coins`));
    const energyCfg = pickVariant(DAILY_TASK_VARIANTS.energy, hashSeed(`${seedBase}_energy`));
    const upgradeCfg = pickVariant(DAILY_TASK_VARIANTS.upgrade, hashSeed(`${seedBase}_upgrade`));
    const passiveCfg = pickVariant(DAILY_TASK_VARIANTS.passive, hashSeed(`${seedBase}_passive`));
    if (!clickCfg || !coinsCfg || !energyCfg || !upgradeCfg || !passiveCfg) return;

    TASK_TARGETS.dailyClick = clickCfg.target;
    TASK_TARGETS.dailyCoins = coinsCfg.target;
    TASK_TARGETS.dailyEnergy = energyCfg.target;
    TASK_TARGETS.dailyUpgrade = upgradeCfg.target;
    TASK_TARGETS.dailyPassive = passiveCfg.target;

    DAILY_REWARDS.click = clickCfg.reward;
    DAILY_REWARDS.coins = coinsCfg.reward;
    DAILY_REWARDS.energy = energyCfg.reward;
    DAILY_REWARDS.upgrade = upgradeCfg.reward;
    DAILY_REWARDS.passive = passiveCfg.reward;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('dailyClickName', clickCfg.name);
    setText('dailyCoinsName', coinsCfg.name);
    setText('dailyEnergyName', energyCfg.name);
    setText('dailyUpgradeName', upgradeCfg.name);
    setText('dailyPassiveName', passiveCfg.name);
    setText('dailyClickClaim', `${DAILY_REWARDS.click} 🪙`);
    setText('dailyCoinsClaim', `${DAILY_REWARDS.coins} 🪙`);
    setText('dailyEnergyClaim', `${DAILY_REWARDS.energy} 🪙`);
    setText('dailyUpgradeClaim', `${DAILY_REWARDS.upgrade} 🪙`);
    setText('dailyPassiveClaim', `+${DAILY_REWARDS.passive}/мин`);
    setText('weeklyPassiveClaim', `+${WEEKLY_REWARDS.passive}/мин`);
}

function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function weekKey() {
    const now = new Date();
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = (localMidnight.getDay() + 6) % 7;
    localMidnight.setDate(localMidnight.getDate() - day);
    const y = localMidnight.getFullYear();
    const m = String(localMidnight.getMonth() + 1).padStart(2, '0');
    const d = String(localMidnight.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getCycleClaimMap(scope) {
    const suffix = scope === 'daily' ? todayKey() : weekKey();
    const key = `stp_claimed_${scope}_${suffix}`;
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function setCycleClaim(scope, taskKey, value) {
    const suffix = scope === 'daily' ? todayKey() : weekKey();
    const key = `stp_claimed_${scope}_${suffix}`;
    const map = getCycleClaimMap(scope);
    map[taskKey] = Boolean(value);
    try { localStorage.setItem(key, JSON.stringify(map)); } catch (e) {}
}

function hydrateClaimStateFromCycleCache() {
    const d = getCycleClaimMap('daily');
    const w = getCycleClaimMap('weekly');
    // Если cycle-cache пустой в конкретном launch-контексте, сохраняем флаги из сейва текущего цикла.
    dailyTasksClaimed = { ...defaultDailyTasksClaimed(), ...dailyTasksClaimed, ...d };
    weeklyTasksClaimed = { ...defaultWeeklyTasksClaimed(), ...weeklyTasksClaimed, ...w };
}

/** Минимальный интервал между событиями одного и того же указателя (мс). 0 = каждый палец тратит энергию сразу, независимо от остальных. */
let clickCooldown = 0;
/** Кулдаун отдельно на каждый палец / мышь — иначе мультитап блокируется одним lastClickTime */
const lastTapByPointer = new Map();

/** Звания (превью): уровень игры 0–10 ↔ погоны, без сервера */
const MILITARY_RANKS = [
    // Офицерские погоны: 1 центральный просвет (красная полоса)
    { level: 0, name: 'Младший лейтенант', kind: 'officer', stripes: 1, starSize: 'small', layout: 'centerStrict', stars: 1 },
    // Лейтенант: две звезды по бокам от просвета (как на скрине)
    { level: 1, name: 'Лейтенант', kind: 'officer', stripes: 1, starSize: 'small', layout: 'side2Bottom', stars: 2 },
    // Старший лейтенант: треугольник (1 сверху по центру, 2 снизу по бокам)
    { level: 2, name: 'Старший лейтенант', kind: 'officer', stripes: 1, starSize: 'small', layout: 'triBottom', stars: 3 },
    // Капитан: 2 звезды вдоль просвета + 2 звезды снизу по бокам
    { level: 3, name: 'Капитан', kind: 'officer', stripes: 1, starSize: 'small', layout: 'captainRef', stars: 4 },

    // Старшие офицеры: 2 продольных просвета (две красные полосы)
    // Майор: одна «крупная» звезда по центру
    { level: 4, name: 'Майор', kind: 'officer', stripes: 2, starSize: 'large', layout: 'center', stars: 1 },
    // Подполковник: 2 большие звезды снизу между двумя полосами
    { level: 5, name: 'Подполковник', kind: 'officer', stripes: 2, starSize: 'large', layout: 'doubleStripeBottom2', stars: 2 },
    // Полковник: 1 большая по центру + 2 снизу между двумя полосами
    { level: 6, name: 'Полковник', kind: 'officer', stripes: 2, starSize: 'large', layout: 'doubleStripeColonel', stars: 3 },

    // Генералы (малиновое поле), звезды крупнее
    { level: 7, name: 'Генерал-майор', kind: 'general', stripes: 0, starSize: 'large', layout: 'center', stars: 1 },
    { level: 8, name: 'Генерал-лейтенант', kind: 'general', stripes: 0, starSize: 'large', layout: 'v2', stars: 2 },
    { level: 9, name: 'Генерал-полковник', kind: 'general', stripes: 0, starSize: 'large', layout: 'genV3', stars: 3 },
    // Генерал армии: большая звезда + венок с маленькой звездой (стилизация)
    { level: 10, name: 'Генерал армии', kind: 'general', stripes: 0, starSize: 'army', layout: 'armyBig', stars: 1, emblem: 'wreath' }
];

function getRankForGameLevel(level) {
    const lv = Math.max(0, Math.min(10, Math.floor(Number(level)) || 0));
    return MILITARY_RANKS[lv];
}

function starPositions(layout, count) {
    // Координаты в процентах — под «просвет» по центру.
    const layouts = {
        // строго по центру погона
        centerStrict: [{ x: 50, y: 58 }],
        center: [{ x: 50, y: 56 }],
        // две звезды по бокам от центрального просвета
        side2: [{ x: 36, y: 62 }, { x: 64, y: 62 }],
        // Лейтенант (как на скрине): две звезды внизу по бокам от центрального просвета
        side2Bottom: [{ x: 30, y: 74 }, { x: 70, y: 74 }],
        v2: [{ x: 50, y: 44 }, { x: 50, y: 64 }],
        v4: [{ x: 50, y: 34 }, { x: 50, y: 48 }, { x: 50, y: 62 }, { x: 50, y: 76 }],
        v3: [{ x: 50, y: 38 }, { x: 50, y: 54 }, { x: 50, y: 70 }],
        // Для генерал-полковника: чуть больше расстояние между звездами
        genV3: [{ x: 50, y: 34 }, { x: 50, y: 54 }, { x: 50, y: 74 }],
        triWide: [{ x: 50, y: 44 }, { x: 34, y: 66 }, { x: 66, y: 66 }],
        // Старший лейтенант (скрин): 1 по центру на просвете + 2 снизу по бокам
        triBottom: [{ x: 50, y: 52 }, { x: 30, y: 76 }, { x: 70, y: 76 }],
        // Капитан (скрин): 2 по центру вдоль просвета + 2 снизу по бокам
        captainRef: [{ x: 50, y: 46 }, { x: 50, y: 62 }, { x: 30, y: 76 }, { x: 70, y: 76 }],
        // Подполковник: 2 звезды СТРОГО на двух просветах (каждая по центру своей красной полосы)
        doubleStripeBottom2: [{ x: 24, y: 82 }, { x: 76, y: 82 }],
        // Полковник: 1 по центру + 2 снизу на двух просветах
        doubleStripeColonel: [{ x: 50, y: 58 }, { x: 24, y: 82 }, { x: 76, y: 82 }],
        // Большая звезда у генерала армии — ниже, как на примере
        armyBig: [{ x: 50, y: 74 }]
    };
    const base = layouts[layout] || layouts.center;
    return base.slice(0, count);
}

function shoulderBoardHTML(rank) {
    const elite = rank.kind === 'general' && rank.elite ? ' shoulder-board--elite' : '';
    const cls = rank.kind === 'general'
        ? `shoulder-board shoulder-board--general${elite}`
        : 'shoulder-board shoulder-board--officer';
    const stripesCls = rank.stripes === 2 ? ' sb-stripes-2' : (rank.stripes === 1 ? ' sb-stripes-1' : '');
    const sizeCls =
        rank.starSize === 'army' ? ' shoulder-star--army'
            : (rank.starSize === 'large' ? ' shoulder-star--large' : ' shoulder-star--small');
    const positions = starPositions(rank.layout, rank.stars);
    const stars = positions.map((p) => `<span class="shoulder-star${sizeCls}" style="left:${p.x}%;top:${p.y}%;">★</span>`).join('');
    const emblem = rank.emblem === 'wreath'
        ? `<div class="shoulder-emblem" aria-hidden="true"><span class="wreath">❧❧</span><span class="mini-star">★</span><span class="wreath">❧❧</span></div>`
        : '';
    return `<div class="${cls}${stripesCls}"><div class="shoulder-board__inner"><div class="shoulder-board__stars">${emblem}${stars}</div></div><div class="shoulder-board__stripe"></div></div>`;
}

function shoulderPairHTML(rank) {
    return shoulderBoardHTML(rank) + shoulderBoardHTML(rank);
}

function shoulderBoardHTMLHorizontal(rank) {
    // Для таблички: один погон, горизонтально (как на реф-скрине)
    const html = shoulderBoardHTML(rank);
    return html.replace('shoulder-board ', 'shoulder-board shoulder-board--horizontal ');
}

function updateMilitaryRankHUD() {
    const row = document.getElementById('hudShoulderRow');
    const title = document.getElementById('hudRankTitle');
    const num = document.getElementById('hudRankLevelNum');
    if (!row || !title) return;
    const boughtLevel = clampInt(ownedRankLevel, -1, 10);
    const displayLevel = boughtLevel >= 0 ? boughtLevel : 0;
    const rank = MILITARY_RANKS[displayLevel] || MILITARY_RANKS[0];
    // В HUD показываем один погон (горизонтально)
    row.innerHTML = shoulderBoardHTMLHorizontal(rank);
    title.textContent = rank.name;
    if (num) num.textContent = String(displayLevel);
    const hint = document.getElementById('rankStripHint');
    if (hint) {
        const currentPlanetLevel = getLevel();
        const statusText = boughtLevel >= 0 ? 'куплено' : 'не куплено';
        hint.textContent = `Уровень планеты ${currentPlanetLevel} · Статус: ${statusText}`;
    }
    document.querySelectorAll('.ranks-preview-row').forEach((el) => {
        const lv = parseInt(el.getAttribute('data-rank-level'), 10);
        el.classList.toggle('ranks-preview-row--current', lv === displayLevel);
    });
}

function fillRanksPreviewGrid() {
    const grid = document.getElementById('ranksPreviewGrid');
    if (!grid) return;
    const currentPlanetLevel = getLevel();
    grid.innerHTML = MILITARY_RANKS.map((r) => {
        const lv = r.level;
        const salary = getRankSalaryPerMinute(lv);
        const cost = getRankCost(lv);
        const owned = ownedRankLevel >= lv;
        const lockedByOrder = lv > 0 && ownedRankLevel < lv - 1;
        const lockedByPlanet = currentPlanetLevel < lv;
        const canBuy = !owned && !lockedByOrder && !lockedByPlanet && coins >= cost;
        const status = owned ? 'owned' : (canBuy ? 'can' : 'locked');
        const btnText = owned ? '✅ Куплено' : (lockedByOrder || lockedByPlanet ? '🔒 Недоступно' : `Купить · ${formatCompactCoins(cost)} 🪙`);
        return `
        <div class="ranks-preview-row ranks-preview-row--${status}" data-rank-level="${lv}">
            <div class="ranks-preview-pair">${shoulderPairHTML(r)}</div>
            <div class="ranks-preview-meta">
                <div class="ranks-preview-level">Уровень ${lv}</div>
                <div class="ranks-preview-name">${r.name}</div>
                <div class="ranks-preview-salary">Пассивный доход: <b>+${formatCompactCoins(salary)}</b> / мин</div>
            </div>
            <button type="button" class="ranks-buy-btn ${owned || !canBuy ? 'disabled' : ''}" data-buy-rank="${lv}" ${owned || !canBuy ? 'disabled' : ''}>${btnText}</button>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-buy-rank]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const lv = parseInt(btn.getAttribute('data-buy-rank'), 10);
            buyRank(lv);
        });
    });
}

function setupBoostModalTabs() {
    const tabs = document.querySelectorAll('.boost-modal-tab');
    const panels = {
        instant: document.getElementById('boostTabInstant'),
        upgrades: document.getElementById('boostTabUpgrades'),
        ranks: document.getElementById('boostTabRanks')
    };
    const activate = (id) => {
        tabs.forEach((x) => x.classList.toggle('active', x.dataset.boostTab === id));
        Object.entries(panels).forEach(([k, p]) => {
            if (p) p.classList.toggle('active', k === id);
        });
        if (id === 'instant') refreshInfoChannelState();
    };
    tabs.forEach((t) => {
        t.addEventListener('click', () => {
            const id = t.dataset.boostTab;
            activate(id);
        });
    });
    activate('upgrades');
}

async function refreshInfoChannelState() {
    if (!userId) return;
    try {
        const res = await fetch(`${API_BASE}/api/tasks/info-channel?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return;
        const j = await res.json();
        if (!j.ok) return;
        if (j.configured === true) {
            infoChannelConfigured = true;
            infoChannelSubscribed = j.subscribed === true;
            infoChannelCanClaim = j.canClaim === true;
            instantTasksClaimed = { ...defaultInstantTasksClaimed(), channel: j.claimed === true };
            if (Number.isFinite(Number(j.taskPassiveBonusRate))) {
                taskPassiveBonusRate = Number(j.taskPassiveBonusRate);
            }
        } else {
            infoChannelConfigured = false;
            infoChannelSubscribed = false;
            infoChannelCanClaim = false;
        }
        updateTaskButtons();
        updateUI();
    } catch (e) {
        console.log('info-channel refresh:', e);
    }
}
let tapPersistTimer = null;

function schedulePersistAfterTap() {
    if (tapPersistTimer) clearTimeout(tapPersistTimer);
    tapPersistTimer = setTimeout(() => {
        tapPersistTimer = null;
        saveGame();
        syncWithBot();
    }, 48);
}

function flushTapPersistIfPending() {
    if (!tapPersistTimer) return;
    clearTimeout(tapPersistTimer);
    tapPersistTimer = null;
    saveGame();
    syncWithBot();
}

// ========== ЗВУК ==========
let soundEnabled = true;
let playTapSound = null;
let audioContext = null;

function initAudio() {
    if (audioContext) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.25;
        gainNode.connect(audioContext.destination);
        
        playTapSound = () => {
            if (!soundEnabled) return;
            if (audioContext.state === 'suspended') audioContext.resume();
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(gainNode);
            osc.frequency.value = 880;
            gain.gain.value = 0.15;
            osc.type = 'sine';
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
            osc.stop(audioContext.currentTime + 0.2);
        };
    } catch(e) { console.log('Web Audio не поддерживается'); }
}

// ========== 3D СЦЕНА ==========
function init3D() {
    const container = document.getElementById('canvas-container');
    if (!container) {
        console.error('❌ canvas-container не найден');
        return;
    }
    
    const scene = new THREE.Scene();
    // Убираем фон сцены, чтобы было видно звездное небо
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x050507, 0.0018);
    
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0.06, 4.05);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    
    // Проверяем поддержку WebGL
    if (!renderer.capabilities.isWebGL2) {
        console.warn('⚠️ WebGL2 не поддерживается, используется WebGL1');
    }
    
    // Устанавливаем размер канваса по размеру контейнера
    const updateRendererSize = () => {
        const containerRect = container.getBoundingClientRect();
        renderer.setSize(containerRect.width, containerRect.height);
        camera.aspect = containerRect.width / containerRect.height;
        camera.updateProjectionMatrix();
    };
    
    updateRendererSize();
    container.appendChild(renderer.domElement);
    
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(2, 3, 4);
    scene.add(mainLight);
    const fillLight = new THREE.PointLight(0x4466aa, 0.5);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);
    
    // Звёздное небо только в CSS (.game-area) на всю площадь; в WebGL только планета/эффекты.
    window.scene = scene;
    window.camera = camera;
    window.renderer = renderer;
    window.starsField = null;
    window.activeExplosions = [];
    
    // Создаем планету только один раз
    if (!window.planetCreated) {
        window.planetCreated = true;
        const level = getLevel();
        currentVisualLevel = level;
        console.log('🚀 Создаем планету, уровень:', level);
        if (level === 0) createStar();
        else createPlanet(level);
    }
    
    console.log('✅ 3D сцена инициализирована');
    
    // Запускаем анимацию
    function animate() {
        requestAnimationFrame(animate);
        if (window.planetMesh) {
            window.planetMesh.rotation.y += 0.005;
            const fx = window.planetMesh.userData;
            if (fx?.plasma && fx?.corona) {
                fx.pulsePhase += 0.03;
                const pulse = 1 + Math.sin(fx.pulsePhase) * 0.015;
                fx.plasma.scale.setScalar(pulse);
                fx.corona.scale.setScalar(1 + Math.cos(fx.pulsePhase * 0.8) * 0.02);
                fx.plasma.material.opacity = fx.kind === 'red-sun' ? 0.3 + Math.max(0, Math.sin(fx.pulsePhase)) * 0.15 : 0.3 + Math.max(0, Math.sin(fx.pulsePhase)) * 0.12;
                fx.corona.material.opacity = fx.kind === 'red-sun' ? 0.2 + Math.max(0, Math.cos(fx.pulsePhase * 1.3)) * 0.11 : 0.16 + Math.max(0, Math.cos(fx.pulsePhase * 1.2)) * 0.08;
            }
        }
        if (window.activeExplosions?.length) {
            const next = [];
            for (const exp of window.activeExplosions) {
                exp.life -= 0.02;
                exp.points.rotation.x += 0.02;
                exp.points.rotation.y += 0.03;
                exp.material.opacity = Math.max(0, exp.life);
                const position = exp.points.geometry.attributes.position;
                for (let i = 0; i < position.count; i++) {
                    position.setXYZ(
                        i,
                        position.getX(i) + exp.velocities[i * 3],
                        position.getY(i) + exp.velocities[i * 3 + 1],
                        position.getZ(i) + exp.velocities[i * 3 + 2]
                    );
                }
                position.needsUpdate = true;
                if (exp.life > 0) next.push(exp);
                else window.scene.remove(exp.points);
            }
            window.activeExplosions = next;
        }
        
        // Логируем количество объектов в сцене
        if (window.scene && window.scene.children.length > 20) {
            console.log('⚠️ СЛИШКОМ МНОГО ОБЪЕКТОВ В СЦЕНЕ:', window.scene.children.length);
        }
        
        renderer.render(scene, camera);
    }
    animate();
    
    // Обработка изменения размера окна
    window.addEventListener('resize', () => {
        updateRendererSize();
    });
}

// Планета/звезда
let planetMesh = null;
let isPlanetCreating = false; // Глобальная блокировка

function getPlanetSize(level) {
    const minSize = 0.98;
    const maxSize = 1.42;
    return Math.min(maxSize, minSize + (level * 0.05));
}

function getPlanetYOffset() {
    // Баланс между верхним дашбордом и BOOST без обрезки по верхнему краю.
    return 0.42;
}

function spawnLevelUpExplosion(level) {
    if (!window.scene || !window.planetMesh) return;

    const count = Math.min(220, 80 + level * 14);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const radius = getPlanetSize(level) * 0.6;

    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 0.02 + Math.random() * 0.04;
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        velocities[i * 3] = x * speed;
        velocities[i * 3 + 1] = y * speed;
        velocities[i * 3 + 2] = z * speed;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xffcf66,
        size: 0.05,
        transparent: true,
        opacity: 0.9
    });

    const points = new THREE.Points(geometry, material);
    points.position.copy(window.planetMesh.position);
    window.scene.add(points);
    window.activeExplosions.push({ points, material, velocities, life: 1 });
}

function createStar() {
    if (!window.scene) return;

    if (window.planetMesh) {
        window.scene.remove(window.planetMesh);
    }

    const size = getPlanetSize(0);
    const core = new THREE.Mesh(
        new THREE.SphereGeometry(size, 64, 64),
        new THREE.MeshStandardMaterial({
            color: 0x4a84ff,
            emissive: 0x1d6bff,
            emissiveIntensity: 1.35,
            roughness: 0.22,
            metalness: 0.03
        })
    );

    const plasma = new THREE.Mesh(
        new THREE.SphereGeometry(size * 1.05, 40, 40),
        new THREE.MeshBasicMaterial({
            color: 0x37b6ff,
            transparent: true,
            opacity: 0.28
        })
    );

    const corona = new THREE.Mesh(
        new THREE.SphereGeometry(size * 1.12, 36, 36),
        new THREE.MeshBasicMaterial({
            color: 0xc8f1ff,
            transparent: true,
            opacity: 0.14
        })
    );

    const starGroup = new THREE.Group();
    starGroup.add(core);
    starGroup.add(plasma);
    starGroup.add(corona);
    starGroup.userData = { plasma, corona, pulsePhase: Math.random() * Math.PI * 2, kind: 'blue-star' };
    starGroup.position.y = getPlanetYOffset();
    window.planetMesh = starGroup;
    window.scene.add(window.planetMesh);
    console.log('⭐ Создана синяя звезда (уровень 0)');
}

function createPlanet(level) {
    if (!window.scene) return;

    if (window.planetMesh) {
        window.scene.remove(window.planetMesh);
    }

    const palette = [
        0x999999, // Меркурий
        0xb84a3a, // Марс
        0xd3b07a, // Венера
        0x3a6db8, // Нептун
        0x80a8d6, // Уран
        0xd6bf8a, // Сатурн
        0xd9a85b, // Юпитер
        0xe6e6e6, // Луна
        0x2f7de1, // Земля
        0xffcc66  // Солнце
    ];
    const color = palette[Math.max(0, Math.min(level - 1, palette.length - 1))];

    if (level === 10) {
        const size = getPlanetSize(level);
        const sunCore = new THREE.Mesh(
            new THREE.SphereGeometry(size, 64, 64),
            new THREE.MeshStandardMaterial({
                color: 0xff4c1f,
                emissive: 0xff1a00,
                emissiveIntensity: 1.45,
                roughness: 0.26,
                metalness: 0.02
            })
        );

        const sunPlasma = new THREE.Mesh(
            new THREE.SphereGeometry(size * 1.1, 40, 40),
            new THREE.MeshBasicMaterial({
                color: 0xff7a1f,
                transparent: true,
                opacity: 0.33
            })
        );

        const sunCorona = new THREE.Mesh(
            new THREE.SphereGeometry(size * 1.23, 36, 36),
            new THREE.MeshBasicMaterial({
                color: 0xff2a00,
                transparent: true,
                opacity: 0.23
            })
        );

        const sunGroup = new THREE.Group();
        sunGroup.add(sunCore);
        sunGroup.add(sunPlasma);
        sunGroup.add(sunCorona);
        sunGroup.userData = { plasma: sunPlasma, corona: sunCorona, pulsePhase: Math.random() * Math.PI * 2, kind: 'red-sun' };
        sunGroup.position.y = getPlanetYOffset();
        window.planetMesh = sunGroup;
        window.scene.add(window.planetMesh);
    } else {
        const geometry = new THREE.SphereGeometry(getPlanetSize(level), 48, 48);
        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.8,
            metalness: 0.05
        });

        window.planetMesh = new THREE.Mesh(geometry, material);
        window.planetMesh.position.y = getPlanetYOffset();
        window.scene.add(window.planetMesh);
    }
    console.log(`🪐 Создана планета уровня ${level}`);
}

function updatePlanetByLevel() {
    if (!window.scene) return;
    const level = getLevel();

    if (currentVisualLevel === null) {
        currentVisualLevel = level;
    }
    if (currentVisualLevel === level) return;

    if (level > currentVisualLevel) {
        spawnLevelUpExplosion(level);
    }

    currentVisualLevel = level;
    if (level === 0) createStar();
    else createPlanet(level);
}

// ========== ИГРОВАЯ ЛОГИКА ==========
function getLevel() {
    if (hasSun) return 10;
    if (hasEarth) return 9;
    if (hasMoon) return 8;
    if (coins >= 10000000000) return 7;
    if (coins >= 1000000000) return 6;
    if (coins >= 100000000) return 5;
    if (coins >= 10000000) return 4;
    if (coins >= 1000000) return 3;
    if (coins >= 100000) return 2;
    if (coins >= 10000) return 1;
    return 0;
}

function getPassiveRate() {
    let rate = passiveIncomeLevel * 5 + taskPassiveBonusRate;
    if (hasSun) rate += 100000;
    else if (hasEarth) rate += 50000;
    else if (hasMoon) rate += 20000;
    rate += getRankSalaryPerMinute(getEffectiveRankLevel());
    return rate;
}

function updateUI() {
    const level = getLevel();
    const levelNames = ['⭐ Звезда', '☄️ Меркурий', '🔴 Марс', '🟠 Венера', '🔵 Нептун', '🧊 Уран', '🪐 Сатурн', '🟤 Юпитер', '🌙 Луна', '🌍 Земля', '☀️ Солнце'];
    const userLevelElem = document.getElementById('userLevel');
    if (userLevelElem) userLevelElem.textContent = `Уровень ${level} · ${levelNames[level]}`;
    
    document.getElementById('coins').textContent = formatCompactCoins(coins);
    document.getElementById('energyValue').textContent = `${Math.floor(energy)}/${maxEnergy}`;
    document.getElementById('energyFill').style.width = (energy / maxEnergy) * 100 + '%';
    document.getElementById('clickPower').textContent = clickPower;
    document.getElementById('energyCost').textContent = clickPower;
    document.getElementById('upgradeLevel').textContent = clickPower;
    document.getElementById('energyUpgradeLevel').textContent = energyUpgradeLevel;
    document.getElementById('passiveUpgradeLevel').textContent = passiveIncomeLevel;
    document.getElementById('clickUpgradeCostDisplay').textContent = `${formatCompactCoins(clickUpgradeCost)} 🪙`;
    const energyCostEl = document.getElementById('energyUpgradeCostDisplay');
    if (energyCostEl) energyCostEl.textContent = energyUpgradeLevel >= ENERGY_MAX_LEVEL ? '✅ Выполнено' : `${formatCompactCoins(energyUpgradeCost)} 🪙`;
    document.getElementById('passiveUpgradeCostDisplay').textContent = `${formatCompactCoins(passiveIncomeUpgradeCost)} 🪙`;
    const regenLvEl = document.getElementById('energyRegenSpeedLevelDisplay');
    const regenMaxEl = document.getElementById('energyRegenSpeedMaxDisplay');
    const regenStepEl = document.getElementById('energyRegenStepDisplay');
    const regenCostEl = document.getElementById('energyRegenSpeedCostDisplay');
    if (regenLvEl) regenLvEl.textContent = String(energyRegenSpeedLevel);
    if (regenMaxEl) regenMaxEl.textContent = String(ENERGY_REGEN_SPEED_MAX);
    if (regenStepEl) {
        const r = getEnergyRegenPerSecond();
        const sec = 1 / r;
        regenStepEl.textContent = `Шаг ~${sec.toFixed(2).replace('.', ',')} с`;
    }
    if (regenCostEl) {
        regenCostEl.textContent =
            energyRegenSpeedLevel >= ENERGY_REGEN_SPEED_MAX ? '✅ Макс.' : `${formatCompactCoins(energyRegenSpeedCost)} 🪙`;
    }
    const buyRegenBtn = document.getElementById('buyEnergyRegenSpeedUpgrade');
    if (buyRegenBtn) {
        const done = energyRegenSpeedLevel >= ENERGY_REGEN_SPEED_MAX;
        buyRegenBtn.disabled = done;
        buyRegenBtn.textContent = done ? '✅ Выполнено' : 'Купить';
        buyRegenBtn.classList.toggle('disabled', done);
    }
    const buyEnergyBtn = document.getElementById('buyEnergyUpgrade');
    if (buyEnergyBtn) {
        const isDone = energyUpgradeLevel >= ENERGY_MAX_LEVEL;
        buyEnergyBtn.disabled = isDone;
        buyEnergyBtn.textContent = isDone ? '✅ Выполнено' : 'Купить';
        buyEnergyBtn.classList.toggle('disabled', isDone);
    }
    
    let rate = getPassiveRate();
    passiveIncomeRate = rate;
    const rateLabel = formatCompactCoins(rate);
    document.getElementById('passiveIncomeRate').textContent = rateLabel;
    updatePlanetByLevel();
    
    document.getElementById('profileCoins').textContent = formatCompactCoins(coins);
    document.getElementById('profileClickPower').textContent = clickPower;
    document.getElementById('profileMaxEnergy').textContent = maxEnergy;
    document.getElementById('profilePassiveIncome').textContent = `${rateLabel} /мин`;
    document.getElementById('profileId').textContent = userId || 'Гость';
    document.getElementById('profileDate').textContent = new Date().toLocaleDateString();
    document.getElementById('dailyClickProgress').textContent = `${dailyClickCount}/${TASK_TARGETS.dailyClick}`;
    document.getElementById('dailyCoinsProgress').textContent = `${dailyCoinsEarned}/${TASK_TARGETS.dailyCoins}`;
    const dailyEnergyEl = document.getElementById('dailyEnergyProgress');
    if (dailyEnergyEl) dailyEnergyEl.textContent = `${dailyEnergySpent}/${TASK_TARGETS.dailyEnergy}`;
    const dailyUpgradeEl = document.getElementById('dailyUpgradeProgress');
    if (dailyUpgradeEl) dailyUpgradeEl.textContent = `${dailyUpgradesBought}/${TASK_TARGETS.dailyUpgrade}`;
    const dailyPassiveEl = document.getElementById('dailyPassiveProgress');
    if (dailyPassiveEl) dailyPassiveEl.textContent = `${Math.min(getPassiveRate(), TASK_TARGETS.dailyPassive)}/${TASK_TARGETS.dailyPassive}`;
    document.getElementById('weeklyClickProgress').textContent = `${weeklyClickCount}/${TASK_TARGETS.weeklyClick}`;
    document.getElementById('weeklyCoinsProgress').textContent = `${weeklyCoinsEarned}/${TASK_TARGETS.weeklyCoins}`;
    const weeklyEnergyEl = document.getElementById('weeklyEnergyProgress');
    if (weeklyEnergyEl) weeklyEnergyEl.textContent = `${weeklyEnergySpent}/${TASK_TARGETS.weeklyEnergy}`;
    const weeklyUpgradeEl = document.getElementById('weeklyUpgradeProgress');
    if (weeklyUpgradeEl) weeklyUpgradeEl.textContent = `${weeklyUpgradesBought}/${TASK_TARGETS.weeklyUpgrade}`;
    const weeklyPassiveEl = document.getElementById('weeklyPassiveProgress');
    if (weeklyPassiveEl) weeklyPassiveEl.textContent = `${Math.min(getPassiveRate(), TASK_TARGETS.weeklyPassive)}/${TASK_TARGETS.weeklyPassive}`;
    const nextGoalEl = document.getElementById('nextGoalText');
    if (nextGoalEl) {
        const lv = getLevel();
        const nextThresholds = [10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000];
        const target = nextThresholds[lv] || null;
        nextGoalEl.textContent = target
            ? `🎯 Следующая цель: ${formatCompactCoins(Math.max(0, target - Math.floor(coins)))} монет до уровня ${lv + 1}`
            : '🎯 Цель выполнена: максимальный уровень планеты достигнут';
    }
    updateTaskButtons();
    updatePremiumUI();
    updateMilitaryRankHUD();
}

function updatePremiumUI() {
    const hasJupiter = coins >= 10000000000;
    const moonReady = hasJupiter && !hasMoon;
    const earthReady = hasMoon && !hasEarth;
    const sunReady = hasEarth && !hasSun;
    const moonBtn = document.getElementById('buyMoon');
    const earthBtn = document.getElementById('buyEarth');
    const sunBtn = document.getElementById('buySun');
    const moonCard = document.getElementById('premiumMoonCard');
    const earthCard = document.getElementById('premiumEarthCard');
    const sunCard = document.getElementById('premiumSunCard');

    if (moonCard) moonCard.classList.remove('premium-locked');
    if (earthCard) earthCard.classList.remove('premium-locked');
    if (sunCard) sunCard.classList.remove('premium-locked');

    if (moonBtn) {
        moonBtn.disabled = hasMoon || !premiumPaymentConfig.paymentsEnabled || !moonReady;
        if (moonBtn.disabled) moonBtn.classList.add('disabled');
        else moonBtn.classList.remove('disabled');
        moonBtn.textContent = hasMoon ? '✅ КУПЛЕНО' : `${premiumPaymentConfig.paymentsEnabled ? 'Купить' : 'Скоро'} · ${premiumPaymentConfig.prices.moon} ₽`;
    }
    if (earthBtn) {
        earthBtn.disabled = hasEarth || !premiumPaymentConfig.paymentsEnabled || !earthReady;
        if (earthBtn.disabled) earthBtn.classList.add('disabled');
        else earthBtn.classList.remove('disabled');
        earthBtn.textContent = hasEarth ? '✅ КУПЛЕНО' : `${premiumPaymentConfig.paymentsEnabled ? 'Купить' : 'Скоро'} · ${premiumPaymentConfig.prices.earth} ₽`;
    }
    if (sunBtn) {
        sunBtn.disabled = hasSun || !premiumPaymentConfig.paymentsEnabled || !sunReady;
        if (sunBtn.disabled) sunBtn.classList.add('disabled');
        else sunBtn.classList.remove('disabled');
        sunBtn.textContent = hasSun ? '✅ КУПЛЕНО' : `${premiumPaymentConfig.paymentsEnabled ? 'Купить' : 'Скоро'} · ${premiumPaymentConfig.prices.sun} ₽`;
    }

    const moonCond = document.getElementById('moonCondition');
    const earthCond = document.getElementById('earthCondition');
    const sunCond = document.getElementById('sunCondition');

    const paymentText = premiumPaymentConfig.paymentsEnabled ? '✅ Оплата доступна в Telegram' : '🚧 Платежи скоро будут доступны';
    if (moonCond) moonCond.innerHTML = hasMoon ? '✅ Луна куплена' : (moonReady ? paymentText : '🔒 Требуется: сначала достичь 7 уровня');
    if (earthCond) earthCond.innerHTML = hasEarth ? '✅ Земля куплена' : (earthReady ? paymentText : '🔒 Требуется: сначала купить 8 уровень');
    if (sunCond) sunCond.innerHTML = hasSun ? '✅ Солнце куплено' : (sunReady ? paymentText : '🔒 Требуется: сначала купить 9 уровень');
}

async function loadPremiumConfig() {
    try {
        const res = await fetch(`${API_BASE}/api/premium/config`);
        if (!res.ok) return;
        const data = await res.json();
        premiumPaymentConfig = {
            paymentsEnabled: Boolean(data.paymentsEnabled),
            prices: {
                moon: data?.prices?.moon ?? 50,
                earth: data?.prices?.earth ?? 100,
                sun: data?.prices?.sun ?? 200
            }
        };
    } catch (e) {
        console.log('Ошибка загрузки premium config:', e);
    }
}

async function buyPremium(type) {
    const amount = premiumPaymentConfig.prices[type] || 0;
    const hasJupiter = coins >= 10000000000;
    if (type === 'moon' && !hasJupiter) {
        showMessage('🔒 8 уровень доступен только после 7 уровня', true);
        return;
    }
    if (type === 'earth' && !hasMoon) {
        showMessage('🔒 9 уровень доступен только после покупки 8 уровня', true);
        return;
    }
    if (type === 'sun' && !hasEarth) {
        showMessage('🔒 10 уровень доступен только после покупки 9 уровня', true);
        return;
    }

    if (!premiumPaymentConfig.paymentsEnabled) {
        showMessage(`🚧 Покупка уровня временно неактивна. Цена: ${amount} ₽`, true);
        return;
    }

    if (!userId) {
        showMessage('❌ Telegram-пользователь не определен', true);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/premium/invoice-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, type })
        });
        const data = await res.json();

        if (!res.ok || !data?.ok) {
            showMessage(data?.message || '❌ Не удалось создать платеж', true);
            return;
        }

        if (data?.provider === 'telegram_stars' && data?.invoiceLink) {
            if (tg?.openInvoice) tg.openInvoice(data.invoiceLink);
            else window.open(data.invoiceLink, '_blank');
            return;
        }
        if (data?.paymentUrl) {
            window.open(data.paymentUrl, '_blank');
            return;
        }
        showMessage('❌ Платежный URL не получен', true);
    } catch (e) {
        showMessage('❌ Ошибка при создании платежа', true);
    }
}

function saveGame(options = {}) {
    let { touchLastSeen = true } = options;
    if (touchLastSeen && !gameStateHydrated) {
        touchLastSeen = false;
    }
    const now = Date.now();
    const seenMark = touchLastSeen
        ? now
        : (isValidEpochMs(lastSeenAtMs) ? Math.floor(Number(lastSeenAtMs)) : 0);
    if (touchLastSeen) lastSeenAtMs = now;
    const gameData = {
        coins, energy, maxEnergy, clickPower, clickUpgradeCost, clickUpgradeLevel,
        energyUpgradeCost, energyUpgradeLevel, passiveIncomeLevel, passiveIncomeUpgradeCost,
        energyRegenSpeedLevel, energyRegenSpeedCost, taskPassiveBonusRate,
        dailyClickCount, dailyCoinsEarned, dailyEnergySpent, dailyUpgradesBought, dailyTasksClaimed,
        weeklyClickCount, weeklyCoinsEarned, weeklyEnergySpent, weeklyUpgradesBought, weeklyTasksClaimed,
        instantTasksClaimed,
        lastDailyCycleKey, lastWeeklyCycleKey,
        hasMoon, hasEarth, hasSun, soundEnabled,
        ownedRankLevel,
        lastSeenAtMs: seenMark
    };
    localStorage.setItem(gameStorageKey(), JSON.stringify(gameData));
}

function normalizeUpgradeCosts() {
    let changed = false;
    const safeClickPower = clampInt(clickPower || 1, 1, 100);
    if (safeClickPower !== clickPower) {
        clickPower = safeClickPower;
        changed = true;
    }
    if (clickUpgradeLevel !== clickPower) {
        clickUpgradeLevel = clickPower;
        changed = true;
    }
    const safeEnergy = Math.max(100, Math.min(ENERGY_MAX_VALUE, maxEnergy));
    if (safeEnergy !== maxEnergy) {
        maxEnergy = safeEnergy;
        if (energy > maxEnergy) energy = maxEnergy;
        changed = true;
    }
    const minEnergyLevelByValue = clampInt(Math.floor((maxEnergy - 100) / 50) + 1, 1, 9);
    const normalizedEnergyLevel = maxEnergy >= ENERGY_MAX_VALUE
        ? clampInt(Math.max(energyUpgradeLevel || 1, 9), 1, ENERGY_MAX_LEVEL)
        : clampInt(Math.max(energyUpgradeLevel || 1, minEnergyLevelByValue), 1, ENERGY_MAX_LEVEL);
    if (energyUpgradeLevel !== normalizedEnergyLevel) {
        energyUpgradeLevel = normalizedEnergyLevel;
        changed = true;
    }
    const levelByCost = clampInt(
        Math.floor(Math.log(Math.max(1, (Number(passiveIncomeUpgradeCost) || 500) / 500)) / Math.log(1.25) + 0.00001),
        0,
        100
    );
    const safePassiveLevel = clampInt(Math.min(passiveIncomeLevel || 0, levelByCost), 0, 100);
    if (safePassiveLevel !== passiveIncomeLevel) {
        passiveIncomeLevel = safePassiveLevel;
        changed = true;
    }
    const safeRegenSpeed = clampInt(energyRegenSpeedLevel || 0, 0, ENERGY_REGEN_SPEED_MAX);
    if (safeRegenSpeed !== energyRegenSpeedLevel) {
        energyRegenSpeedLevel = safeRegenSpeed;
        changed = true;
    }

    const expectedClickCost = Math.floor(100 * Math.pow(1.3, Math.max(0, clickUpgradeLevel - 1)));
    const expectedEnergyCost = Math.floor(200 * Math.pow(1.25, Math.max(0, energyUpgradeLevel - 1)));
    const expectedPassiveCost = Math.floor(500 * Math.pow(1.25, Math.max(0, passiveIncomeLevel)));
    const expectedRegenSpeedCost = Math.floor(
        ENERGY_REGEN_SPEED_BASE_COST * Math.pow(ENERGY_REGEN_SPEED_COST_MULT, energyRegenSpeedLevel)
    );

    if (!Number.isFinite(clickUpgradeCost) || clickUpgradeCost !== expectedClickCost) {
        clickUpgradeCost = expectedClickCost;
        changed = true;
    }
    if (!Number.isFinite(energyUpgradeCost) || energyUpgradeCost !== expectedEnergyCost) {
        energyUpgradeCost = expectedEnergyCost;
        changed = true;
    }
    if (!Number.isFinite(passiveIncomeUpgradeCost) || passiveIncomeUpgradeCost !== expectedPassiveCost) {
        passiveIncomeUpgradeCost = expectedPassiveCost;
        changed = true;
    }
    if (!Number.isFinite(energyRegenSpeedCost) || energyRegenSpeedCost !== expectedRegenSpeedCost) {
        energyRegenSpeedCost = expectedRegenSpeedCost;
        changed = true;
    }
    return changed;
}

function loadGame() {
    const saved = userId
        ? localStorage.getItem(gameStorageKey())
        : (localStorage.getItem(gameStorageKey()) || localStorage.getItem('starToPlanet'));
    let normalized = false;
    if (saved) {
        try {
            const data = JSON.parse(saved);
            coins = data.coins || 0;
            energy = data.energy ?? 100;
            maxEnergy = data.maxEnergy ?? 100;
            clickPower = data.clickPower || 1;
            clickUpgradeCost = data.clickUpgradeCost || 100;
            clickUpgradeLevel = data.clickUpgradeLevel || 1;
            energyUpgradeCost = data.energyUpgradeCost || 200;
            energyUpgradeLevel = data.energyUpgradeLevel || 1;
            passiveIncomeLevel = data.passiveIncomeLevel || 0;
            passiveIncomeUpgradeCost = data.passiveIncomeUpgradeCost || 500;
            energyRegenSpeedLevel = clampInt(data.energyRegenSpeedLevel ?? 0, 0, ENERGY_REGEN_SPEED_MAX);
            energyRegenSpeedCost = Number.isFinite(Number(data.energyRegenSpeedCost))
                ? Math.floor(Number(data.energyRegenSpeedCost))
                : ENERGY_REGEN_SPEED_BASE_COST;
            taskPassiveBonusRate = data.taskPassiveBonusRate || 0;
            dailyClickCount = data.dailyClickCount || 0;
            dailyCoinsEarned = data.dailyCoinsEarned || 0;
            dailyEnergySpent = data.dailyEnergySpent || 0;
            dailyUpgradesBought = data.dailyUpgradesBought || 0;
            dailyTasksClaimed = { ...defaultDailyTasksClaimed(), ...(data.dailyTasksClaimed || {}) };
            weeklyClickCount = data.weeklyClickCount || 0;
            weeklyCoinsEarned = data.weeklyCoinsEarned || 0;
            weeklyEnergySpent = data.weeklyEnergySpent || 0;
            weeklyUpgradesBought = data.weeklyUpgradesBought || 0;
            weeklyTasksClaimed = { ...defaultWeeklyTasksClaimed(), ...(data.weeklyTasksClaimed || {}) };
            instantTasksClaimed = { ...defaultInstantTasksClaimed(), ...(data.instantTasksClaimed || {}) };
            lastDailyCycleKey = typeof data.lastDailyCycleKey === 'string' ? data.lastDailyCycleKey : todayKey();
            lastWeeklyCycleKey = typeof data.lastWeeklyCycleKey === 'string' ? data.lastWeeklyCycleKey : weekKey();
            hasMoon = data.hasMoon || false;
            hasEarth = data.hasEarth || false;
            hasSun = data.hasSun || false;
            soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
            ownedRankLevel = Number.isFinite(Number(data.ownedRankLevel)) ? clampInt(data.ownedRankLevel, -1, 10) : -1;
            lastSeenAtMs = isValidEpochMs(data.lastSeenAtMs) ? Number(data.lastSeenAtMs) : 0;
            if (energy > maxEnergy) energy = maxEnergy;
            normalized = normalizeUpgradeCosts();
        } catch(e) { console.log(e); }
    }
    const currentDailyKey = todayKey();
    const currentWeeklyKey = weekKey();
    if (lastDailyCycleKey !== currentDailyKey) {
        dailyClickCount = 0;
        dailyCoinsEarned = 0;
        dailyEnergySpent = 0;
        dailyUpgradesBought = 0;
        dailyTasksClaimed = defaultDailyTasksClaimed();
        lastDailyCycleKey = currentDailyKey;
    }
    if (lastWeeklyCycleKey !== currentWeeklyKey) {
        weeklyClickCount = 0;
        weeklyCoinsEarned = 0;
        weeklyEnergySpent = 0;
        weeklyUpgradesBought = 0;
        weeklyTasksClaimed = defaultWeeklyTasksClaimed();
        lastWeeklyCycleKey = currentWeeklyKey;
    }
    hydrateClaimStateFromCycleCache();
    updateUI();
    rescheduleEnergyRegen();
    fillRanksPreviewGrid();
    // Не затираем метку последней активности до оффлайн-начисления на старте.
    if (normalized) saveGame({ touchLastSeen: false });
}

function ensureTaskCyclesCurrent() {
    const currentDailyKey = todayKey();
    const currentWeeklyKey = weekKey();
    let changed = false;

    if (lastDailyCycleKey !== currentDailyKey) {
        dailyClickCount = 0;
        dailyCoinsEarned = 0;
        dailyEnergySpent = 0;
        dailyUpgradesBought = 0;
        dailyTasksClaimed = defaultDailyTasksClaimed();
        lastDailyCycleKey = currentDailyKey;
        applyDailyTaskConfig();
        changed = true;
    }
    if (lastWeeklyCycleKey !== currentWeeklyKey) {
        weeklyClickCount = 0;
        weeklyCoinsEarned = 0;
        weeklyEnergySpent = 0;
        weeklyUpgradesBought = 0;
        weeklyTasksClaimed = defaultWeeklyTasksClaimed();
        lastWeeklyCycleKey = currentWeeklyKey;
        changed = true;
    }
    if (changed) {
        hydrateClaimStateFromCycleCache();
        applyDailyTaskConfig();
        updateTaskButtons();
        saveGame();
        syncWithBot();
        showMessage('🔄 Задания обновлены по новому циклу');
    }
}

// ========== СИНХРОНИЗАЦИЯ С БОТОМ ==========
async function syncWithBot() {
    if (!tg) return;
    
    const gameData = {
        coins: Math.floor(coins),
        energy: energy,
        maxEnergy: maxEnergy,
        clickPower: clickPower,
        passiveIncomeLevel: passiveIncomeLevel,
        taskPassiveBonusRate: taskPassiveBonusRate,
        ownedRankLevel: ownedRankLevel,
        hasMoon: hasMoon,
        hasEarth: hasEarth,
        hasSun: hasSun,
        clickUpgradeLevel: clickUpgradeLevel,
        clickUpgradeCost: clickUpgradeCost,
        energyUpgradeLevel: energyUpgradeLevel,
        energyUpgradeCost: energyUpgradeCost,
        passiveIncomeUpgradeCost: passiveIncomeUpgradeCost,
        energyRegenSpeedLevel: clampInt(energyRegenSpeedLevel, 0, ENERGY_REGEN_SPEED_MAX),
        energyRegenSpeedCost: energyRegenSpeedCost,
        soundEnabled: soundEnabled,
        dailyClickCount,
        dailyCoinsEarned,
        dailyEnergySpent,
        dailyUpgradesBought,
        weeklyClickCount,
        weeklyCoinsEarned,
        weeklyEnergySpent,
        weeklyUpgradesBought,
        dailyTasksClaimed,
        weeklyTasksClaimed,
        instantTasksClaimed,
        lastDailyCycleKey,
        lastWeeklyCycleKey,
        lastSeenAtMs: isValidEpochMs(lastSeenAtMs) ? Math.floor(Number(lastSeenAtMs)) : Math.floor(Date.now())
    };
    
    // В Mini App запуске через menu/start кнопки частый sendData может приводить к закрытию WebApp.
    // Сохраняем прогресс только через backend API.
    
    // Сохранение через API
    try {
        const response = await fetch(`${API_BASE}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, gameData: gameData })
        });
        const result = await response.json();
        console.log('📤 API ответ:', result);
    } catch(e) {
        console.error('❌ Ошибка API:', e);
    }
    
    // Также обновляем локально
    saveGame();
}

// Загрузка данных с сервера
async function loadFromServer() {
    if (!userId) return false;
    let loaded = false;
    try {
        console.log('🔄 Загрузка данных с сервера...');
        const response = await fetchWithTimeout(`${API_BASE}/api/user/${userId}`, {}, 28000);
        if (response.ok) {
            const data = await response.json();
            console.log('📥 Полученные данные:', data);
            if (data?.registered === false) {
                isRegistered = false;
                return false;
            }
            isRegistered = true;
            
            // coins с API может прийти числом или строкой (BIGINT); иначе блок не выполнялся — оффлайн не считался.
            const serverCoins = Number(data.coins);
            if (data && Number.isFinite(serverCoins)) {
                const preHydrateCoins = Math.floor(Number(coins) || 0);
                const preHydrateEnergy = Math.max(0, Number(energy) || 0);
                const preLocalLastSeen = isValidEpochMs(lastSeenAtMs) ? Number(lastSeenAtMs) : null;
                const serverCoinsInt = Math.floor(serverCoins);
                const serverEnergyVal = Number.isFinite(Number(data.energy)) ? Number(data.energy) : 100;
                // Если оффлайн уже применили локально по fallback-таймеру, не даём позднему серверу откатить UI.
                coins = offlineAppliedOnBoot ? Math.max(serverCoinsInt, preHydrateCoins) : serverCoinsInt;
                energy = offlineAppliedOnBoot ? Math.max(serverEnergyVal, preHydrateEnergy) : serverEnergyVal;
                maxEnergy = data.maxEnergy ?? 100;
                clickPower = data.clickPower || 1;
                passiveIncomeLevel = data.passiveIncomeLevel || 0;
                hasMoon = data.hasMoon || false;
                hasEarth = data.hasEarth || false;
                hasSun = data.hasSun || false;
                
                // Новые поля
                clickUpgradeLevel = data.clickUpgradeLevel || 1;
                clickUpgradeCost = data.clickUpgradeCost || 100;
                energyUpgradeLevel = data.energyUpgradeLevel || 1;
                energyUpgradeCost = data.energyUpgradeCost || 200;
                passiveIncomeUpgradeCost = data.passiveIncomeUpgradeCost || 500;
                energyRegenSpeedLevel = Number.isFinite(Number(data.energyRegenSpeedLevel))
                    ? clampInt(Number(data.energyRegenSpeedLevel), 0, ENERGY_REGEN_SPEED_MAX)
                    : 0;
                energyRegenSpeedCost = Number.isFinite(Number(data.energyRegenSpeedCost))
                    ? Math.floor(Number(data.energyRegenSpeedCost))
                    : Math.floor(ENERGY_REGEN_SPEED_BASE_COST * Math.pow(ENERGY_REGEN_SPEED_COST_MULT, energyRegenSpeedLevel));
                taskPassiveBonusRate = Number.isFinite(Number(data.taskPassiveBonusRate))
                    ? Number(data.taskPassiveBonusRate)
                    : (taskPassiveBonusRate || 0);
                infoChannelConfigured = data.infoChannelConfigured === true;
                infoChannelSubscribed = data.infoChannelSubscribed === true;
                infoChannelCanClaim = data.infoChannelCanClaim === true;
                if (Number.isFinite(Number(data.ownedRankLevel))) {
                    const serverOwnedRank = clampInt(data.ownedRankLevel, -1, 10);
                    // Защита от случайного отката звания: не понижаем локально купленное звание,
                    // если сервер вернул устаревшее состояние.
                    if (ownedRankLevel < 0 || serverOwnedRank >= ownedRankLevel) {
                        ownedRankLevel = serverOwnedRank;
                    }
                }
                const serverSeen = isValidEpochMs(data.lastSeenAtMs) ? Number(data.lastSeenAtMs) : null;
                if (serverSeen != null && preLocalLastSeen != null) {
                    lastSeenAtMs = Math.min(serverSeen, preLocalLastSeen);
                } else if (serverSeen != null) {
                    lastSeenAtMs = serverSeen;
                } else if (preLocalLastSeen != null) {
                    lastSeenAtMs = preLocalLastSeen;
                }
                if (!isValidEpochMs(lastSeenAtMs)) {
                    lastSeenAtMs = Date.now();
                }
                soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
                const taskState = (data.taskState && typeof data.taskState === 'object') ? data.taskState : null;
                if (taskState) {
                    dailyClickCount = Number(taskState.dailyClickCount || 0);
                    dailyCoinsEarned = Number(taskState.dailyCoinsEarned || 0);
                    dailyEnergySpent = Number(taskState.dailyEnergySpent || 0);
                    dailyUpgradesBought = Number(taskState.dailyUpgradesBought || 0);
                    weeklyClickCount = Number(taskState.weeklyClickCount || 0);
                    weeklyCoinsEarned = Number(taskState.weeklyCoinsEarned || 0);
                    weeklyEnergySpent = Number(taskState.weeklyEnergySpent || 0);
                    weeklyUpgradesBought = Number(taskState.weeklyUpgradesBought || 0);
                    dailyTasksClaimed = { ...defaultDailyTasksClaimed(), ...(taskState.dailyTasksClaimed || {}) };
                    weeklyTasksClaimed = { ...defaultWeeklyTasksClaimed(), ...(taskState.weeklyTasksClaimed || {}) };
                    instantTasksClaimed = { ...defaultInstantTasksClaimed(), ...(taskState.instantTasksClaimed || {}) };
                    lastDailyCycleKey = typeof taskState.lastDailyCycleKey === 'string' ? taskState.lastDailyCycleKey : todayKey();
                    lastWeeklyCycleKey = typeof taskState.lastWeeklyCycleKey === 'string' ? taskState.lastWeeklyCycleKey : weekKey();
                }
                
                if (energy > maxEnergy) energy = maxEnergy;
                normalizeUpgradeCosts();
                rescheduleEnergyRegen();
                if (!offlineAppliedOnBoot) {
                    applyOfflineEarnings();
                    offlineAppliedOnBoot = true;
                }
                updateUI();
                updateTaskButtons(); // Обновляем кнопки заданий
                loaded = true;
                
                console.log('✅ Данные загружены с сервера:', { coins, energy, maxEnergy, clickPower });
            } else {
                console.log('❌ Неверные данные с сервера:', data);
            }
        }
    } catch(e) { 
        console.log('❌ Ошибка загрузки:', e); 
    }
    
    if (loaded) {
        saveGame();
        syncWithBot();
    }
    return loaded;
}

// ========== ОБРАБОТКА КЛИКОВ ==========
function tapPointerKey(event) {
    if (event && typeof event.pointerId === 'number') return `p${event.pointerId}`;
    return 'mouse';
}

function handleClick(event) {
    const now = Date.now();
    const key = tapPointerKey(event);
    const last = lastTapByPointer.get(key) || 0;
    if (now - last < clickCooldown) return;
    lastTapByPointer.set(key, now);
    
    if (energy < clickPower) {
        showMessage('❌ Нет энергии!', true);
        return;
    }
    
    if (!audioContext) initAudio();
    if (playTapSound) playTapSound();
    
    energy -= clickPower;
    coins += clickPower;
    dailyClickCount++;
    weeklyClickCount++;
    dailyCoinsEarned += clickPower;
    weeklyCoinsEarned += clickPower;
    dailyEnergySpent += clickPower;
    weeklyEnergySpent += clickPower;
    
    updateUI();
    schedulePersistAfterTap();
    updateTaskButtons();
    
    // Эффект клика с анимацией
    const popup = document.createElement('div');
    popup.textContent = `+${clickPower}`;
    popup.style.position = 'fixed';
    popup.style.left = (event.clientX || window.innerWidth/2) + 'px';
    popup.style.top = (event.clientY || window.innerHeight/2) + 'px';
    popup.style.fontSize = '24px';
    popup.style.fontWeight = 'bold';
    popup.style.color = '#FFD60A';
    popup.style.pointerEvents = 'none';
    popup.style.zIndex = '10000';
    popup.style.animation = 'popupAnimation 0.8s ease-out';
    document.body.appendChild(popup);
    
    setTimeout(() => {
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
    }, 800);
    
    // Анимация планеты
    if (window.planetMesh) {
        window.planetMesh.rotation.x += 0.1;
        setTimeout(() => {
            if (window.planetMesh) {
                window.planetMesh.rotation.x = 0;
            }
        }, 100);
    }
    
    // Анимация канваса
    const container = document.getElementById('canvas-container');
    if (container) {
        container.style.transform = 'scale(0.95)';
        setTimeout(() => {
            if (container) {
                container.style.transform = 'scale(1.0)';
            }
        }, 100);
    }
}

/** Тап по планете: раньше слушали несуществующий #star-container */
function bindPlanetTapTargets() {
    const stage = document.querySelector('.planet-stage');
    const canvasBox = document.getElementById('canvas-container');
    const target = stage || canvasBox;
    if (!target) return;
    target.style.cursor = 'pointer';
    target.style.touchAction = 'manipulation';

    let skipNextClick = false;
    target.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        skipNextClick = true;
        handleClick(e);
        setTimeout(() => { skipNextClick = false; }, 450);
    });
    const releasePointer = (e) => {
        if (typeof e.pointerId === 'number') lastTapByPointer.delete(`p${e.pointerId}`);
    };
    target.addEventListener('pointerup', releasePointer);
    target.addEventListener('pointercancel', releasePointer);
    target.addEventListener('lostpointercapture', releasePointer);
    target.addEventListener('click', (e) => {
        if (skipNextClick) return;
        handleClick(e);
    });
}

// ========== БУСТЫ ==========
function upgradeClick() {
    if (ignoreRapidBoostTap()) return;
    const cost = clickUpgradeCost;
    if (coins >= cost && clickPower < 100) {
        coins -= cost;
        clickPower++;
        clickUpgradeLevel++;
        dailyUpgradesBought++;
        weeklyUpgradesBought++;
        clickUpgradeCost = Math.floor(clickUpgradeCost * 1.3);
        updateUI(); saveGame(); syncWithBot();
        showMessage(`✅ Сила клика +1 (${clickPower})`);
    } else if (clickPower >= 100) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage(`❌ Нужно ${formatCompactCoins(cost)} монет`, true);
}

function upgradeEnergy() {
    if (ignoreRapidBoostTap()) return;
    const cost = energyUpgradeCost;
    if (coins >= cost && energyUpgradeLevel < ENERGY_MAX_LEVEL) {
        coins -= cost;
        if (maxEnergy < ENERGY_MAX_VALUE) {
            maxEnergy = Math.min(ENERGY_MAX_VALUE, maxEnergy + 50);
            energy = Math.min(maxEnergy, energy + 50);
        }
        energyUpgradeLevel++;
        dailyUpgradesBought++;
        weeklyUpgradesBought++;
        energyUpgradeCost = Math.floor(energyUpgradeCost * 1.25);
        updateUI(); saveGame(); syncWithBot();
        if (energyUpgradeLevel >= ENERGY_MAX_LEVEL) showMessage('✅ Выполнено: энергия прокачана до максимума');
        else showMessage(`✅ Макс. энергия +50 (${maxEnergy})`);
    } else if (energyUpgradeLevel >= ENERGY_MAX_LEVEL) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage(`❌ Нужно ${formatCompactCoins(cost)} монет`, true);
}

function upgradePassive() {
    if (ignoreRapidBoostTap()) return;
    const cost = passiveIncomeUpgradeCost;
    if (coins >= cost && passiveIncomeLevel < 100) {
        coins -= cost;
        passiveIncomeLevel++;
        dailyUpgradesBought++;
        weeklyUpgradesBought++;
        passiveIncomeUpgradeCost = Math.floor(passiveIncomeUpgradeCost * 1.25);
        updateUI(); saveGame(); syncWithBot();
        showMessage(`✅ Пассивный доход +5/мин (${getPassiveRate()}/мин)`);
    } else if (passiveIncomeLevel >= 100) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage(`❌ Нужно ${formatCompactCoins(cost)} монет`, true);
}

function upgradeEnergyRegenSpeed() {
    if (ignoreRapidBoostTap()) return;
    const cost = energyRegenSpeedCost;
    if (coins >= cost && energyRegenSpeedLevel < ENERGY_REGEN_SPEED_MAX) {
        coins -= cost;
        energyRegenSpeedLevel++;
        dailyUpgradesBought++;
        weeklyUpgradesBought++;
        energyRegenSpeedCost = Math.floor(
            ENERGY_REGEN_SPEED_BASE_COST * Math.pow(ENERGY_REGEN_SPEED_COST_MULT, energyRegenSpeedLevel)
        );
        rescheduleEnergyRegen();
        updateUI();
        saveGame();
        syncWithBot();
        showMessage(`✅ Скорость энергии: уровень ${energyRegenSpeedLevel}/${ENERGY_REGEN_SPEED_MAX}`);
    } else if (energyRegenSpeedLevel >= ENERGY_REGEN_SPEED_MAX) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage(`❌ Нужно ${formatCompactCoins(cost)} монет`, true);
}

// ========== ЗАДАНИЯ ==========
function setTaskClaimButton(btn, canClaim) {
    if (!btn) return;
    if (canClaim) {
        btn.classList.remove('disabled');
        btn.disabled = false;
    } else {
        btn.classList.add('disabled');
        btn.disabled = true;
    }
}

function setTaskCardVisible(selector, visible) {
    const card = document.querySelector(selector);
    if (card) card.style.display = visible ? '' : 'none';
}

function updateTasksDoneMessages() {
    const dailyDone = Object.values(dailyTasksClaimed).every(Boolean);
    const weeklyDone = Object.values(weeklyTasksClaimed).every(Boolean);
    const dailyDoneEl = document.getElementById('dailyTasksDoneMessage');
    const weeklyDoneEl = document.getElementById('weeklyTasksDoneMessage');
    if (dailyDoneEl) dailyDoneEl.style.display = dailyDone ? 'block' : 'none';
    if (weeklyDoneEl) weeklyDoneEl.style.display = weeklyDone ? 'block' : 'none';
}

function updateTaskButtons() {
    setTaskClaimButton(document.getElementById('dailyClickClaim'), dailyClickCount >= TASK_TARGETS.dailyClick && !dailyTasksClaimed.click);
    setTaskClaimButton(document.getElementById('dailyCoinsClaim'), dailyCoinsEarned >= TASK_TARGETS.dailyCoins && !dailyTasksClaimed.coins);
    setTaskClaimButton(document.getElementById('dailyEnergyClaim'), dailyEnergySpent >= TASK_TARGETS.dailyEnergy && !dailyTasksClaimed.energy);
    setTaskClaimButton(document.getElementById('dailyUpgradeClaim'), dailyUpgradesBought >= TASK_TARGETS.dailyUpgrade && !dailyTasksClaimed.upgrade);
    setTaskClaimButton(document.getElementById('dailyPassiveClaim'), getPassiveRate() >= TASK_TARGETS.dailyPassive && !dailyTasksClaimed.passive);
    setTaskClaimButton(document.getElementById('weeklyClickClaim'), weeklyClickCount >= TASK_TARGETS.weeklyClick && !weeklyTasksClaimed.click);
    setTaskClaimButton(document.getElementById('weeklyCoinsClaim'), weeklyCoinsEarned >= TASK_TARGETS.weeklyCoins && !weeklyTasksClaimed.coins);
    setTaskClaimButton(document.getElementById('weeklyEnergyClaim'), weeklyEnergySpent >= TASK_TARGETS.weeklyEnergy && !weeklyTasksClaimed.energy);
    setTaskClaimButton(document.getElementById('weeklyUpgradeClaim'), weeklyUpgradesBought >= TASK_TARGETS.weeklyUpgrade && !weeklyTasksClaimed.upgrade);
    setTaskClaimButton(document.getElementById('weeklyPassiveClaim'), getPassiveRate() >= TASK_TARGETS.weeklyPassive && !weeklyTasksClaimed.passive);
    const canClaimInstantChannel = !instantTasksClaimed.channel
        && (infoChannelConfigured ? infoChannelCanClaim : instantTaskChannelOpened);
    setTaskClaimButton(document.getElementById('boostInstantClaimInfoChannelBtn'), canClaimInstantChannel);
    const instantClaimBtn = document.getElementById('boostInstantClaimInfoChannelBtn');
    const instantOpenBtn = document.getElementById('boostInstantOpenInfoChannelBtn');
    const instantActionsWrap = document.getElementById('boostInstantChannelActions');
    const doneHint = document.getElementById('boostInstantChannelDoneHint');
    if (doneHint) doneHint.style.display = instantTasksClaimed.channel ? 'block' : 'none';
    if (instantClaimBtn) {
        if (instantTasksClaimed.channel) {
            instantClaimBtn.textContent = '✅ Выполнено';
            instantClaimBtn.disabled = true;
            instantClaimBtn.classList.add('disabled');
            if (instantOpenBtn) instantOpenBtn.style.display = 'none';
            if (instantActionsWrap) instantActionsWrap.classList.add('single');
        } else {
            instantClaimBtn.textContent = '+20/мин';
            if (instantOpenBtn) instantOpenBtn.style.display = '';
            if (instantActionsWrap) instantActionsWrap.classList.remove('single');
        }
    }

    setTaskCardVisible('[data-daily-task="1"]', !dailyTasksClaimed.click);
    setTaskCardVisible('[data-daily-task="2"]', !dailyTasksClaimed.coins);
    setTaskCardVisible('[data-daily-task="3"]', !dailyTasksClaimed.energy);
    setTaskCardVisible('[data-daily-task="4"]', !dailyTasksClaimed.upgrade);
    setTaskCardVisible('[data-daily-task="5"]', !dailyTasksClaimed.passive);
    setTaskCardVisible('[data-weekly-task="1"]', !weeklyTasksClaimed.click);
    setTaskCardVisible('[data-weekly-task="2"]', !weeklyTasksClaimed.coins);
    setTaskCardVisible('[data-weekly-task="3"]', !weeklyTasksClaimed.energy);
    setTaskCardVisible('[data-weekly-task="4"]', !weeklyTasksClaimed.upgrade);
    setTaskCardVisible('[data-weekly-task="5"]', !weeklyTasksClaimed.passive);
    updateTasksDoneMessages();
}

function openInfoChannel(markOpened = false) {
    if (markOpened && !infoChannelConfigured) instantTaskChannelOpened = true;
    const boostModal = document.getElementById('boostModal');
    boostModal?.classList.remove('active');
    try {
        if (tg?.openTelegramLink) tg.openTelegramLink(INFO_CHANNEL_URL);
        else window.open(INFO_CHANNEL_URL, '_blank');
    } catch (e) {
        window.open(INFO_CHANNEL_URL, '_blank');
    }
    // Страхуемся от "черного экрана" после возврата из внешней ссылки.
    setTimeout(() => {
        restoreActivePanelView();
        updateUI();
        refreshInfoChannelState();
    }, 350);
    setTimeout(() => {
        restoreActivePanelView();
        updateUI();
        refreshInfoChannelState();
    }, 1400);
    updateTaskButtons();
    refreshInfoChannelState();
}

function ensurePanelVisibleHeartbeat() {
    const activePanel = document.querySelector('.tab-panel.active, .game-area.active');
    const gameArea = document.getElementById('gameArea');
    if (!activePanel && gameArea) {
        restoreActivePanelView();
        updateUI();
    }
}

async function claimInstantChannelTask() {
    if (instantTasksClaimed.channel) {
        showMessage('ℹ️ Вы уже получили награду');
        return;
    }
    if (infoChannelConfigured) {
        if (!userId) {
            showMessage('ℹ️ Войдите через Telegram, чтобы получить награду', true);
            return;
        }
        if (infoChannelClaimInFlight) return;
        infoChannelClaimInFlight = true;
        try {
            const res = await fetch(`${API_BASE}/api/tasks/claim-info-channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const j = await res.json().catch(() => ({}));
            if (res.ok && j.ok) {
                if (j.already) {
                    showMessage(j.message || 'ℹ️ Вы уже получили награду');
                    instantTasksClaimed = { ...defaultInstantTasksClaimed(), channel: true };
                } else {
                    instantTasksClaimed = { ...defaultInstantTasksClaimed(), ...(j.instantTasksClaimed || { channel: true }) };
                    if (Number.isFinite(Number(j.taskPassiveBonusRate))) {
                        taskPassiveBonusRate = Number(j.taskPassiveBonusRate);
                    } else {
                        taskPassiveBonusRate += 20;
                    }
                    showMessage('🎉 Пассивный доход +20/мин');
                }
                updateUI();
                saveGame();
                syncWithBot();
                await refreshInfoChannelState();
                return;
            }
            showMessage(j.message || 'Не удалось выдать награду', true);
            await refreshInfoChannelState();
        } catch (e) {
            console.error(e);
            showMessage('Ошибка сети. Попробуйте снова.', true);
        } finally {
            infoChannelClaimInFlight = false;
        }
        return;
    }
    if (!instantTaskChannelOpened) {
        showMessage('ℹ️ Сначала нажмите «Перейти» и откройте канал.', true);
        return;
    }
    instantTasksClaimed.channel = true;
    showMessage(applyTaskReward({ type: 'passive', value: 20 }));
    updateUI();
    saveGame();
    syncWithBot();
}

function applyTaskReward(reward) {
    if (typeof reward === 'number') {
        coins += reward;
        return `🎉 +${formatCompactCoins(reward)} монет!`;
    }
    if (reward?.type === 'passive') {
        const gained = Math.max(0, Number(reward.value) || 0);
        taskPassiveBonusRate += gained;
        return gained > 0 ? `🎉 Пассивный доход +${gained}/мин` : '⚠️ Награда недоступна';
    }
    return '🎉 Награда получена!';
}

async function claimTask(taskId, reward, type) {
    if (claimInFlight.has(type)) return;
    claimInFlight.add(type);
    const mapTypeToKey = {
        daily_click: ['daily', 'click'],
        daily_coins: ['daily', 'coins'],
        daily_energy: ['daily', 'energy'],
        daily_upgrade: ['daily', 'upgrade'],
        daily_passive: ['daily', 'passive'],
        weekly_click: ['weekly', 'click'],
        weekly_coins: ['weekly', 'coins'],
        weekly_energy: ['weekly', 'energy'],
        weekly_upgrade: ['weekly', 'upgrade'],
        weekly_passive: ['weekly', 'passive']
    };
    const pair = mapTypeToKey[type];
    if (!pair) {
        claimInFlight.delete(type);
        showMessage('❌ Задание недоступно!', true);
        return;
    }
    const [scope, taskKey] = pair;
    const cycleMap = getCycleClaimMap(scope);
    if (cycleMap?.[taskKey]) {
        if (scope === 'daily') dailyTasksClaimed[taskKey] = true;
        if (scope === 'weekly') weeklyTasksClaimed[taskKey] = true;
        updateUI();
        updateTaskButtons();
        claimInFlight.delete(type);
        showMessage('ℹ️ Награда за это задание уже получена', true);
        return;
    }

    if (type === 'daily_click' && !dailyTasksClaimed.click && dailyClickCount >= TASK_TARGETS.dailyClick) { 
        dailyTasksClaimed.click = true; 
        setCycleClaim('daily', 'click', true);
        showMessage(applyTaskReward(reward)); 
        saveGame();
        updateTaskButtons(); // Обновляем кнопки
    }
    else if (type === 'daily_coins' && !dailyTasksClaimed.coins && dailyCoinsEarned >= TASK_TARGETS.dailyCoins) { 
        dailyTasksClaimed.coins = true; 
        setCycleClaim('daily', 'coins', true);
        showMessage(applyTaskReward(reward)); 
        saveGame();
        updateTaskButtons(); // Обновляем кнопки
    }
    else if (type === 'weekly_click' && !weeklyTasksClaimed.click && weeklyClickCount >= TASK_TARGETS.weeklyClick) { 
        weeklyTasksClaimed.click = true; 
        setCycleClaim('weekly', 'click', true);
        showMessage(applyTaskReward(reward)); 
        saveGame();
        updateTaskButtons(); // Обновляем кнопки
    }
    else if (type === 'weekly_coins' && !weeklyTasksClaimed.coins && weeklyCoinsEarned >= TASK_TARGETS.weeklyCoins) { 
        weeklyTasksClaimed.coins = true; 
        setCycleClaim('weekly', 'coins', true);
        showMessage(applyTaskReward(reward)); 
        saveGame();
        updateTaskButtons(); // Обновляем кнопки
    }
    else if (type === 'daily_energy' && !dailyTasksClaimed.energy && dailyEnergySpent >= TASK_TARGETS.dailyEnergy) {
        dailyTasksClaimed.energy = true;
        setCycleClaim('daily', 'energy', true);
        showMessage(applyTaskReward(reward));
        saveGame();
        updateTaskButtons();
    }
    else if (type === 'daily_upgrade' && !dailyTasksClaimed.upgrade && dailyUpgradesBought >= TASK_TARGETS.dailyUpgrade) {
        dailyTasksClaimed.upgrade = true;
        setCycleClaim('daily', 'upgrade', true);
        showMessage(applyTaskReward(reward));
        saveGame();
        updateTaskButtons();
    }
    else if (type === 'daily_passive' && !dailyTasksClaimed.passive && getPassiveRate() >= TASK_TARGETS.dailyPassive) {
        dailyTasksClaimed.passive = true;
        setCycleClaim('daily', 'passive', true);
        showMessage(applyTaskReward(reward));
        saveGame();
        updateTaskButtons();
    }
    else if (type === 'weekly_energy' && !weeklyTasksClaimed.energy && weeklyEnergySpent >= TASK_TARGETS.weeklyEnergy) {
        weeklyTasksClaimed.energy = true;
        setCycleClaim('weekly', 'energy', true);
        showMessage(applyTaskReward(reward));
        saveGame();
        updateTaskButtons();
    }
    else if (type === 'weekly_upgrade' && !weeklyTasksClaimed.upgrade && weeklyUpgradesBought >= TASK_TARGETS.weeklyUpgrade) {
        weeklyTasksClaimed.upgrade = true;
        setCycleClaim('weekly', 'upgrade', true);
        showMessage(applyTaskReward(reward));
        saveGame();
        updateTaskButtons();
    }
    else if (type === 'weekly_passive' && !weeklyTasksClaimed.passive && getPassiveRate() >= TASK_TARGETS.weeklyPassive) {
        weeklyTasksClaimed.passive = true;
        setCycleClaim('weekly', 'passive', true);
        showMessage(applyTaskReward(reward));
        saveGame();
        updateTaskButtons();
    }
    else {
        showMessage('❌ Задание недоступно!', true);
    }
    claimInFlight.delete(type);
    updateUI(); syncWithBot(); updateTaskButtons();
}

// ========== РЕЙТИНГ ==========
async function loadLeaderboard() {
    const container = document.getElementById('leaderboardList');
    if (!container) return;
    container.innerHTML = '<div class="leaderboard-item glass-panel">🏆 Загрузка...</div>';
    try {
        const response = await fetchWithTimeout(`${API_BASE}/api/leaderboard`, {}, 25000);
        if (!response.ok) {
            container.innerHTML = '<div class="leaderboard-item glass-panel">❌ Не удалось загрузить рейтинг</div>';
            return;
        }
        const players = await response.json();
        if (!Array.isArray(players) || players.length === 0) {
            container.innerHTML = '<div class="leaderboard-item glass-panel">Пока никого в таблице — сыграйте и сохраните прогресс</div>';
            return;
        }
        let currentRankText = '#—';
        container.innerHTML = players.map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            const name = (p.username && `@${p.username}`) || p.first_name || 'Аноним';
            const coinsVal = Number(p.coins) || 0;
            const lvl = getLevelForCoins(coinsVal);
            const tid = p.telegram_id != null ? p.telegram_id : p.id;
            const isCurrent = userId != null && String(tid) === String(userId);
            if (isCurrent) currentRankText = `#${i + 1}`;
            return `<div class="leaderboard-item" style="${isCurrent ? 'border:1px solid #ffd700;background:rgba(255,215,0,0.1);' : ''}"><div class="leaderboard-rank ${i < 3 ? `top-${i + 1}` : ''}">${medal}</div><div class="leaderboard-name">${name} ${isCurrent ? '👤' : ''}</div><div class="leaderboard-coins">${formatCompactCoins(coinsVal)} 🪙</div><div class="leaderboard-level">Уровень ${lvl}</div></div>`;
        }).join('');
        const profileRankEl = document.getElementById('profileRank');
        const friendsRankEl = document.getElementById('leaderboardRank');
        if (profileRankEl) profileRankEl.textContent = currentRankText;
        if (friendsRankEl) friendsRankEl.textContent = currentRankText;
    } catch (e) {
        console.log(e);
        container.innerHTML = '<div class="leaderboard-item glass-panel">❌ Ошибка сети</div>';
    }
}

function renderReferralLineList(containerId, items, emptyHtml) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items.length) {
        el.innerHTML = emptyHtml;
        return;
    }
    el.innerHTML = items
        .map((u) => {
            const name = (u.username && `@${u.username}`) || u.first_name || `ID ${u.telegram_id}`;
            const coinsVal = Number(u.coins || 0);
            return `<div class="level-item"><span>${name}</span><span>${formatCompactCoins(coinsVal)} 🪙</span></div>`;
        })
        .join('');
}

async function loadFriends() {
    if (!userId) {
        renderFriendsFallback();
        return;
    }
    const container = document.getElementById('level1List');
    if (!container) return;
    const loading = `<div class="level-item"><span>⏳ Загрузка рефералов...</span><span></span></div>`;
    container.innerHTML = loading;
    ['level2List', 'level3List', 'level4List'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = loading;
    });
    try {
        const res = await fetchWithTimeout(`${API_BASE}/api/friends/${userId}`, {}, 25000);
        const data = await res.json();
        if (!res.ok || !data?.success) {
            renderFriendsFallback();
            return;
        }
        const refs = Array.isArray(data.referrals) ? data.referrals : [];
        const line2 = Array.isArray(data.referralLine2) ? data.referralLine2 : [];
        const line3 = Array.isArray(data.referralLine3) ? data.referralLine3 : [];
        const line4 = Array.isArray(data.referralLine4) ? data.referralLine4 : [];
        const referralCount = Number(data.referralsCount || refs.length || 0);
        const bonus = Number(data.totalReferralBonus || 0);
        const referralCountEl = document.getElementById('referralCount');
        const referralBonusEl = document.getElementById('referralBonus');
        const profileReferralsEl = document.getElementById('profileReferrals');
        if (referralCountEl) referralCountEl.textContent = String(referralCount);
        if (referralBonusEl) referralBonusEl.textContent = String(bonus);
        if (profileReferralsEl) profileReferralsEl.textContent = String(referralCount);

        const empty1 = `<div class="level-item"><span>👥 Пока нет приглашенных. Поделитесь ссылкой ниже</span><span></span></div>`;
        const empty2 = `<div class="level-item"><span>✨ Пока никого во 2-й линии</span><span></span></div>`;
        const empty3 = `<div class="level-item"><span>💫 Пока никого в 3-й линии</span><span></span></div>`;
        const empty4 = `<div class="level-item"><span>💎 Пока никого в 4-й линии</span><span></span></div>`;

        renderReferralLineList('level1List', refs, empty1);
        renderReferralLineList('level2List', line2, empty2);
        renderReferralLineList('level3List', line3, empty3);
        renderReferralLineList('level4List', line4, empty4);
    } catch (e) {
        renderFriendsFallback();
    }
}

function updateReferralLink() { 
    const linkInput = document.getElementById('referralLink'); 
    if(linkInput && userId) linkInput.value = `https://t.me/startoplanet_bot?start=ref_${userId}`; 
}

function copyReferralLink() { 
    const input = document.getElementById('referralLink'); 
    if(input) { input.select(); document.execCommand('copy'); showMessage('✅ Ссылка скопирована'); } 
}

function shareReferralLink() {
    const input = document.getElementById('referralLink');
    if(input && tg && tg.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`);
    } else if(input) {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`, '_blank');
    }
}

// ========== ПАНЕЛИ ==========
function setupTabs() {
    const panels = {
        game: document.getElementById('gameArea'),
        tasks: document.getElementById('tasksPanel'),
        friends: document.getElementById('friendsPanel'),
        profile: document.getElementById('profilePanel'),
        leaderboard: document.getElementById('leaderboardPanel'),
        airdrop: document.getElementById('airdropPanel')
    };
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Скрываем все панели
            Object.values(panels).forEach(p => { 
                if(p) {
                    p.style.display = 'none';
                    p.classList.remove('active');
                }
            });
            
            // Показываем выбранную панель
            if (panels[tab]) {
                if (tab === 'game') {
                    panels[tab].style.display = 'flex';
                } else {
                    panels[tab].style.display = 'block';
                }
                panels[tab].classList.add('active');
            }
            
            if (tab === 'leaderboard') loadLeaderboard();
            if (tab === 'friends') loadFriends();
        });
    });
}

function restoreActivePanelView() {
    const panels = {
        game: document.getElementById('gameArea'),
        tasks: document.getElementById('tasksPanel'),
        friends: document.getElementById('friendsPanel'),
        profile: document.getElementById('profilePanel'),
        leaderboard: document.getElementById('leaderboardPanel'),
        airdrop: document.getElementById('airdropPanel')
    };
    const activeBtn = document.querySelector('.nav-btn.active') || document.querySelector('.nav-btn[data-tab="game"]');
    const activeTab = activeBtn?.dataset?.tab || 'game';
    if (!document.querySelector('.nav-btn.active')) {
        document.querySelector('.nav-btn[data-tab="game"]')?.classList.add('active');
    }
    Object.values(panels).forEach((p) => {
        if (!p) return;
        p.style.display = 'none';
        p.classList.remove('active');
    });
    const target = panels[activeTab] || panels.game;
    if (target) {
        target.style.display = activeTab === 'game' ? 'flex' : 'block';
        target.classList.add('active');
    }
}

function ensureUiRecoveredOrReload() {
    const panels = document.querySelectorAll('.tab-panel.active, .game-area.active');
    if (panels.length > 0) return;
    restoreActivePanelView();
    updateUI();
    // Крайний fallback, если после возврата Telegram все равно оставил черный экран.
    setTimeout(() => {
        const stillEmpty = document.querySelectorAll('.tab-panel.active, .game-area.active').length === 0;
        if (stillEmpty) window.location.reload();
    }, 450);
}

function setupTasksTabs() {
    const tabs = document.querySelectorAll('.tasks-tab');
    const contents = {
        daily: document.getElementById('dailyTasks'),
        weekly: document.getElementById('weeklyTasks'),
        premium: document.getElementById('premiumTasks')
    };
    tabs.forEach(t => {
        t.addEventListener('click', () => {
            const target = t.dataset.tasksTab;
            tabs.forEach(tt => tt.classList.remove('active'));
            t.classList.add('active');
            Object.values(contents).forEach(c => c?.classList.remove('active'));
            if (contents[target]) contents[target].classList.add('active');
        });
    });
}

function showMessage(text, isError = false) {
    const msg = document.getElementById('message');
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isError ? '#ff6b6b' : '#FFD60A';
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
}

function applyPassiveIncome() { 
    if (passiveIncomeRate > 0) { 
        coins += passiveIncomeRate;
        dailyCoinsEarned += passiveIncomeRate;
        weeklyCoinsEarned += passiveIncomeRate;
        updateUI(); 
        saveGame(); 
        syncWithBot(); 
    } 
}

function prefetchStartupSocialPanels() {
    if (startupSocialPrefetchDone) return;
    startupSocialPrefetchDone = true;
    // Только после гидратации профиля: иначе параллельные запросы к тому же API
    // конкурируют с /api/user и откладывают оффлайн-начисление (видно на записи экрана).
    Promise.resolve().then(() => loadLeaderboard()).catch((e) => console.log('startup leaderboard:', e));
    Promise.resolve().then(() => loadFriends()).catch((e) => console.log('startup friends:', e));
}

/**
 * Скорость восстановления энергии (энерг/с), онлайн и офлайн одинаково.
 * Ур. 0: база ONLINE_ENERGY_REGEN_PER_SEC (2/с → 500 энергии за ~250 с).
 * Ур. 1…MAX: линейно к rMax, где rMax сдвинут от базы пропорционально maxEnergy/ENERGY_MAX_VALUE,
 * так что при maxEnergy=500 на макс. уровне: 500/rMax ≈ ENERGY_REGEN_FULL_TARGET_SEC (≈2 мин 45 с).
 */
function getEnergyRegenPerSecond() {
    const lv = clampInt(energyRegenSpeedLevel, 0, ENERGY_REGEN_SPEED_MAX);
    const r0 = ONLINE_ENERGY_REGEN_PER_SEC;
    if (lv <= 0) return r0;
    const rAtFullCap = ENERGY_MAX_VALUE / ENERGY_REGEN_FULL_TARGET_SEC;
    const scaleToCap = Math.min(1, Math.max(0, maxEnergy) / ENERGY_MAX_VALUE);
    const rMax = r0 + (rAtFullCap - r0) * scaleToCap;
    const t = lv / ENERGY_REGEN_SPEED_MAX;
    return r0 + (rMax - r0) * t;
}

function rescheduleEnergyRegen() {
    if (energyRegenIntervalId != null) {
        clearInterval(energyRegenIntervalId);
        energyRegenIntervalId = null;
    }
    lastEnergyRegenAtMs = Date.now();
    energyRegenIntervalId = setInterval(rechargeEnergy, ENERGY_REGEN_TICK_MS);
}

function rechargeEnergy() {
    if (energy >= maxEnergy) return;
    const now = Date.now();
    let dt = (now - lastEnergyRegenAtMs) / 1000;
    lastEnergyRegenAtMs = now;
    if (!Number.isFinite(dt) || dt <= 0) dt = ENERGY_REGEN_TICK_MS / 1000;
    if (dt > 3) dt = 3;
    const add = getEnergyRegenPerSecond() * dt;
    energy = Math.min(maxEnergy, energy + add);
    updateUI();
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
    await ensureTelegramUserResolved(20, 300);
    const registerBtn = document.getElementById('registerProfileBtn');
    const registrationHelp = document.getElementById('registrationHelp');
    if (!userId) {
        showRegistrationOverlay(true);
        if (registerBtn) {
            registerBtn.disabled = true;
            registerBtn.textContent = 'Ожидаем Telegram...';
        }
        if (registrationHelp) registrationHelp.textContent = 'Получаем данные Telegram. Если долго, закройте и откройте игру снова.';
        const waitTimer = setInterval(async () => {
            const ok = await ensureTelegramUserResolved(3, 350);
            if (!ok) return;
            clearInterval(waitTimer);
            window.location.reload();
        }, 1200);
        return;
    }
    const registrationStatus = await checkRegistrationStatus(1, 250);
    const alreadyRegistered = registrationStatus === true;
    const unknownRegistrationState = registrationStatus === null;
    const registerIntent = isRegisterIntentLaunch();
    const canBypassRegistrationOverlay = alreadyRegistered || getCachedRegistered();
    isRegistered = canBypassRegistrationOverlay;
    const shouldShowRegistrationOverlay = !canBypassRegistrationOverlay && (registerIntent || registrationStatus === false);
    if (shouldShowRegistrationOverlay) {
        showRegistrationOverlay(true);
        if (!userId && registerBtn) {
            registerBtn.disabled = true;
            registerBtn.textContent = 'Ожидаем Telegram...';
            if (registrationHelp) registrationHelp.textContent = 'Подождите, получаем данные Telegram...';
            const waitTimer = setInterval(async () => {
                const ok = await ensureTelegramUserResolved(3, 300);
                if (!ok) return;
                clearInterval(waitTimer);
                window.location.reload();
            }, 1200);
            return;
        }
        if (registrationHelp) {
            const refId = getLaunchReferrerId();
            registrationHelp.textContent = refId
                ? `Вы приглашены игроком #${refId}. Нажмите «Регистрация», чтобы попасть в его линию и начать игру.`
                : 'Нажмите «Регистрация», чтобы создать профиль и начать игру.';
        }
        if (registerIntent && registerBtn && !isRegistering && userId) {
            isRegistering = true;
            registerBtn.disabled = true;
            registerBtn.textContent = 'Создаем профиль...';
            if (registrationHelp) registrationHelp.textContent = 'Регистрируем профиль...';
            const result = await registerCurrentUser();
            if (result.ok || result.created === false) {
                setCachedRegistered(true);
                window.location.reload();
                return;
            }
            isRegistering = false;
            registerBtn.disabled = false;
            registerBtn.textContent = 'Регистрация';
            if (registrationHelp) registrationHelp.textContent = result.message || 'Ошибка регистрации. Попробуйте еще раз.';
        }
        if (registerBtn) {
            registerBtn.addEventListener('click', async () => {
                if (isRegistering) return;
                isRegistering = true;
                registerBtn.disabled = true;
                registerBtn.textContent = 'Создаем профиль...';
                const preCheck = await checkRegistrationStatus(2, 450);
                if (preCheck === true) {
                    showMessage('ℹ️ Профиль уже зарегистрирован');
                    setCachedRegistered(true);
                    window.location.reload();
                    return;
                }
                const result = await registerCurrentUser();
                if (!result.ok) {
                    let fallbackRegistered = await checkRegistrationStatus(2, 500);
                    for (let i = 0; i < 4 && fallbackRegistered === null; i++) {
                        await new Promise((resolve) => setTimeout(resolve, 1200));
                        fallbackRegistered = await checkRegistrationStatus(1, 400);
                    }
                    if (fallbackRegistered || getCachedRegistered()) {
                        showMessage('ℹ️ Профиль найден, продолжаем вход');
                        setCachedRegistered(true);
                        window.location.reload();
                        return;
                    }
                    showMessage(result.message || 'Ошибка регистрации', true);
                    if (registrationHelp) registrationHelp.textContent = result.message || 'Ошибка регистрации. Попробуйте еще раз.';
                    registerBtn.disabled = false;
                    registerBtn.textContent = 'Регистрация';
                    isRegistering = false;
                    return;
                }
                showMessage(result.created === false ? 'ℹ️ Вы уже зарегистрированы' : '✅ Регистрация завершена');
                window.location.reload();
            });
        }
        return;
    }
    showRegistrationOverlay(false);

    // При неопределенном статусе (cold start) не блокируем UI: тихо перепроверяем профиль в фоне.
    if (!canBypassRegistrationOverlay && unknownRegistrationState && userId) {
        let attempts = 0;
        const probe = setInterval(async () => {
            attempts += 1;
            const retryStatus = await checkRegistrationStatus(1, 350);
            if (retryStatus === true) {
                clearInterval(probe);
                setCachedRegistered(true);
                window.location.reload();
                return;
            }
            if (retryStatus === false || attempts >= 8) {
                clearInterval(probe);
            }
        }, 1200);
    }

    loadGame();
    applyDailyTaskConfig();
    setupTabs();
    setupTasksTabs();
    if (bootOfflineFallbackTimer) clearTimeout(bootOfflineFallbackTimer);
    // Если серверная гидратация затянулась, применяем локальный оффлайн и продолжаем работу.
    // При позднем ответе /api/user защита в loadFromServer не даст откатить начисления.
    bootOfflineFallbackTimer = setTimeout(() => {
        if (offlineAppliedOnBoot) return;
        const gained = applyOfflineEarnings();
        offlineAppliedOnBoot = true;
        gameStateHydrated = true;
        updateUI();
        saveGame({ touchLastSeen: false });
        if (gained) syncWithBot();
    }, 9000);

    // Не блокируем запуск интерфейса из-за сетевых запросов (важно для Menu button/cold start).
    Promise.resolve().then(async () => {
        let hydrated = false;
        try {
            for (let attempt = 0; attempt < 6; attempt++) {
                hydrated = await loadFromServer();
                if (hydrated) break;
                await new Promise((resolve) => setTimeout(resolve, 1200 + attempt * 600));
            }
            if (!offlineAppliedOnBoot) {
                applyOfflineEarnings();
                offlineAppliedOnBoot = true;
                updateUI();
                saveGame();
                syncWithBot();
            }
            if (bootOfflineFallbackTimer) {
                clearTimeout(bootOfflineFallbackTimer);
                bootOfflineFallbackTimer = null;
            }
            // Сразу после профиля/оффлайна: иначе длинные ретраи держат gameStateHydrated=false,
            // пользователь открывает рейтинг — второй fetch конкурирует с /api/user и тянет тайминги.
            gameStateHydrated = true;
            // Premium-конфиг не должен блокировать отображение рейтинга/друзей и завершение гидратации.
            loadPremiumConfig().catch((e) => console.log('premium config:', e));
            updateUI();
            fillRanksPreviewGrid();
            updateMilitaryRankHUD();
            if (hydrated && !startupSocialPrefetchDone) prefetchStartupSocialPanels();
        } catch (e) {
            console.log('Отложенная серверная инициализация:', e);
        } finally {
            if (bootOfflineFallbackTimer) {
                clearTimeout(bootOfflineFallbackTimer);
                bootOfflineFallbackTimer = null;
            }
            if (!gameStateHydrated) gameStateHydrated = true;
        }
    });
    
    // Инициализируем 3D только если canvas-container существует
    const container = document.getElementById('canvas-container');
    if (container) {
        init3D(); // Добавляем инициализацию 3D сцены
    } else {
        console.log('⚠️ canvas-container не найден, 3D сцена не инициализирована');
    }
    bindPlanetTapTargets();
    
    updateReferralLink();
    
    document.getElementById('buyClickUpgrade')?.addEventListener('click', upgradeClick);
    document.getElementById('buyEnergyUpgrade')?.addEventListener('click', upgradeEnergy);
    document.getElementById('buyEnergyRegenSpeedUpgrade')?.addEventListener('click', upgradeEnergyRegenSpeed);
    document.getElementById('buyPassiveUpgrade')?.addEventListener('click', upgradePassive);
    document.getElementById('openInfoChannelProfileBtn')?.addEventListener('click', () => openInfoChannel(false));
    document.getElementById('boostInstantOpenInfoChannelBtn')?.addEventListener('click', () => openInfoChannel(true));
    document.getElementById('boostInstantClaimInfoChannelBtn')?.addEventListener('click', claimInstantChannelTask);
    document.getElementById('boostInstantRestoreEnergyBtn')?.addEventListener('click', () => showMessage('⏳ Скоро: восстановление энергии через рекламу'));
    document.getElementById('boostInstantIncomeX2Btn')?.addEventListener('click', () => showMessage('⏳ Скоро: x2 доход через рекламу'));
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyReferralLink);
    document.getElementById('shareLinkBtn')?.addEventListener('click', shareReferralLink);
    document.getElementById('dailyClickClaim')?.addEventListener('click', () => claimTask('dailyClickClaim', DAILY_REWARDS.click, 'daily_click'));
    document.getElementById('dailyCoinsClaim')?.addEventListener('click', () => claimTask('dailyCoinsClaim', DAILY_REWARDS.coins, 'daily_coins'));
    document.getElementById('dailyEnergyClaim')?.addEventListener('click', () => claimTask('dailyEnergyClaim', DAILY_REWARDS.energy, 'daily_energy'));
    document.getElementById('dailyUpgradeClaim')?.addEventListener('click', () => claimTask('dailyUpgradeClaim', DAILY_REWARDS.upgrade, 'daily_upgrade'));
    document.getElementById('dailyPassiveClaim')?.addEventListener('click', () => claimTask('dailyPassiveClaim', { type: 'passive', value: DAILY_REWARDS.passive }, 'daily_passive'));
    document.getElementById('weeklyClickClaim')?.addEventListener('click', () => claimTask('weeklyClickClaim', WEEKLY_REWARDS.click, 'weekly_click'));
    document.getElementById('weeklyCoinsClaim')?.addEventListener('click', () => claimTask('weeklyCoinsClaim', WEEKLY_REWARDS.coins, 'weekly_coins'));
    document.getElementById('weeklyEnergyClaim')?.addEventListener('click', () => claimTask('weeklyEnergyClaim', WEEKLY_REWARDS.energy, 'weekly_energy'));
    document.getElementById('weeklyUpgradeClaim')?.addEventListener('click', () => claimTask('weeklyUpgradeClaim', WEEKLY_REWARDS.upgrade, 'weekly_upgrade'));
    document.getElementById('weeklyPassiveClaim')?.addEventListener('click', () => claimTask('weeklyPassiveClaim', { type: 'passive', value: WEEKLY_REWARDS.passive }, 'weekly_passive'));
    document.getElementById('buyMoon')?.addEventListener('click', () => buyPremium('moon'));
    document.getElementById('buyEarth')?.addEventListener('click', () => buyPremium('earth'));
    document.getElementById('buySun')?.addEventListener('click', () => buyPremium('sun'));
    
    const boostBtn = document.getElementById('boostBtn');
    const boostModal = document.getElementById('boostModal');
    const closeBoost = document.getElementById('closeBoostModal');
    setupBoostModalTabs();
    fillRanksPreviewGrid();
    updateMilitaryRankHUD();

    if (boostBtn) boostBtn.onclick = () => {
        document.querySelectorAll('.boost-modal-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.boostTab === 'upgrades'));
        document.querySelectorAll('.boost-tab-panel').forEach((panel) => panel.classList.remove('active'));
        document.getElementById('boostTabUpgrades')?.classList.add('active');
        boostModal.classList.add('active');
    };
    if (closeBoost) closeBoost.onclick = () => boostModal.classList.remove('active');
    if (boostModal) boostModal.onclick = (e) => { if (e.target === boostModal) boostModal.classList.remove('active'); };
    
    setInterval(applyPassiveIncome, 60000);
    rescheduleEnergyRegen();
    setInterval(ensureTaskCyclesCurrent, 30000);
    setInterval(ensurePanelVisibleHeartbeat, 2000);
    
    const raysContainer = document.getElementById('raysContainer');
    if(raysContainer) for(let i=0;i<12;i++) { const ray = document.createElement('div'); ray.className = 'ray'; raysContainer.appendChild(ray); }
    
    const gameArea = document.getElementById('gameArea');
    if (gameArea) gameArea.style.display = 'flex';

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushTapPersistIfPending();
            saveGame({ touchLastSeen: false });
            return;
        }
        let gained = false;
        if (gameStateHydrated) {
            gained = applyOfflineEarnings({ silentToast: true });
            lastEnergyRegenAtMs = Date.now();
            saveGame();
            if (gained) syncWithBot();
        }
        boostModal?.classList.remove('active');
        applyViewportHeight();
        applyTopHudVisibilityFix();
        restoreActivePanelView();
        updateUI();
        setTimeout(ensureUiRecoveredOrReload, 220);
    });
    window.addEventListener('pagehide', () => {
        flushTapPersistIfPending();
        saveGame({ touchLastSeen: false });
    });
    window.addEventListener('focus', () => {
        let gained = false;
        if (gameStateHydrated) {
            gained = applyOfflineEarnings({ silentToast: true });
            lastEnergyRegenAtMs = Date.now();
            saveGame();
            if (gained) syncWithBot();
        }
        boostModal?.classList.remove('active');
        restoreActivePanelView();
        updateUI();
        setTimeout(ensureUiRecoveredOrReload, 220);
    });
    
    if(!document.querySelector('#popup-animation')) {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes popupAnimation {
                0% { transform: scale(0.8) rotate(0deg); opacity: 0; }
                50% { transform: scale(1.2) rotate(180deg); opacity: 1; }
                100% { transform: scale(1) rotate(360deg); opacity: 0; }
            }
            .popup-animation {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 24px;
                font-weight: bold;
                color: #FFD60A;
                pointer-events: none;
                z-index: 10000;
            }
        `;
        document.head.appendChild(style);
    }
    
    console.log('✅ Игра загружена! 3D планеты, мультитап, звук, реферальная программа, задания');
    
    const soundToggleBtn = document.getElementById('soundToggle');
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
            showMessage(soundEnabled ? '🔊 Звук включён' : '🔇 Звук выключен');
        });
    }
});