import * as THREE from 'three';

// Канонизируем домен, чтобы все сценарии запуска использовали один origin и общее localStorage.
if (window.location.hostname === 'star-to-planet-bot.onrender.com') {
    const target = `https://startoplanet.onrender.com${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
}

// ========== API БЭКЕНДА ==========
const API_BASE = window.API_BASE || 'https://startoplanet.onrender.com';

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
    const container = document.getElementById('level1List');
    if (container) container.innerHTML = `<div class="level-item"><span>👥 Пригласите друзей через реферальную ссылку</span><span></span></div>`;
    const referralCount = document.getElementById('referralCount');
    const referralBonus = document.getElementById('referralBonus');
    const profileReferrals = document.getElementById('profileReferrals');
    if (referralCount) referralCount.textContent = '0';
    if (referralBonus) referralBonus.textContent = '0';
    if (profileReferrals) profileReferrals.textContent = '0';
}

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
let passiveIncomeRate = 0;
let taskPassiveBonusRate = 0;
const ENERGY_MAX_VALUE = 500;
const ENERGY_MAX_LEVEL = 10;

// ========== ЗВАНИЯ: ЭКОНОМИКА (превью, localStorage) ==========
let ownedRankLevel = -1; // -1 = ничего не куплено
let lastSeenAtMs = Date.now();
const OFFLINE_CAP_MINUTES = 180; // 3 часа
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
    return owned;
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

function applyOfflineEarnings() {
    const now = Date.now();
    const last = Number(lastSeenAtMs) || now;
    const minutes = Math.floor((now - last) / 60000);
    const offlineMinutes = Math.max(0, Math.min(minutes, OFFLINE_CAP_MINUTES));
    if (offlineMinutes <= 0) return;

    // Считаем пассивку по состоянию ДО оффлайн начисления (чтобы не разгонять уровень «сам из себя»).
    const effRank = clampInt(ownedRankLevel, -1, 10);
    let perMinute = passiveIncomeLevel * 5 + taskPassiveBonusRate;
    if (hasSun) perMinute += 100000;
    else if (hasEarth) perMinute += 50000;
    else if (hasMoon) perMinute += 20000;
    perMinute += getRankSalaryPerMinute(effRank);

    const offlineCoins = offlineMinutes * perMinute;
    coins += offlineCoins;
    dailyCoinsEarned += offlineCoins;
    weeklyCoinsEarned += offlineCoins;
    const offlineEnergyRecover = Math.min(maxEnergy - energy, offlineMinutes * 60);
    if (offlineEnergyRecover > 0) energy += offlineEnergyRecover;
    showMessage(`⏱️ Оффлайн доход за ${offlineMinutes} мин: +${(offlineMinutes * perMinute).toLocaleString()} 🪙`);
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
    weeklyClick: 1000,
    weeklyCoins: 5000,
    weeklyEnergy: 1000,
    weeklyUpgrade: 5
};

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
        const btnText = owned ? '✅ Куплено' : (lockedByOrder || lockedByPlanet ? '🔒 Недоступно' : `Купить · ${cost.toLocaleString()} 🪙`);
        return `
        <div class="ranks-preview-row ranks-preview-row--${status}" data-rank-level="${lv}">
            <div class="ranks-preview-pair">${shoulderPairHTML(r)}</div>
            <div class="ranks-preview-meta">
                <div class="ranks-preview-level">Уровень ${lv}</div>
                <div class="ranks-preview-name">${r.name}</div>
                <div class="ranks-preview-salary">Пассивный доход: <b>+${salary.toLocaleString()}</b> / мин</div>
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
        upgrades: document.getElementById('boostTabUpgrades'),
        ranks: document.getElementById('boostTabRanks')
    };
    tabs.forEach((t) => {
        t.addEventListener('click', () => {
            const id = t.dataset.boostTab;
            tabs.forEach((x) => x.classList.toggle('active', x === t));
            Object.entries(panels).forEach(([k, p]) => {
                if (p) p.classList.toggle('active', k === id);
            });
        });
    });
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
    
    document.getElementById('coins').textContent = Math.floor(coins);
    document.getElementById('energyValue').textContent = `${Math.floor(energy)}/${maxEnergy}`;
    document.getElementById('energyFill').style.width = (energy / maxEnergy) * 100 + '%';
    document.getElementById('clickPower').textContent = clickPower;
    document.getElementById('energyCost').textContent = clickPower;
    document.getElementById('upgradeLevel').textContent = clickPower;
    document.getElementById('energyUpgradeLevel').textContent = energyUpgradeLevel;
    document.getElementById('passiveUpgradeLevel').textContent = passiveIncomeLevel;
    document.getElementById('clickUpgradeCostDisplay').textContent = `${clickUpgradeCost} 🪙`;
    const energyCostEl = document.getElementById('energyUpgradeCostDisplay');
    if (energyCostEl) energyCostEl.textContent = energyUpgradeLevel >= ENERGY_MAX_LEVEL ? '✅ Выполнено' : `${energyUpgradeCost} 🪙`;
    document.getElementById('passiveUpgradeCostDisplay').textContent = `${passiveIncomeUpgradeCost} 🪙`;
    const buyEnergyBtn = document.getElementById('buyEnergyUpgrade');
    if (buyEnergyBtn) {
        const isDone = energyUpgradeLevel >= ENERGY_MAX_LEVEL;
        buyEnergyBtn.disabled = isDone;
        buyEnergyBtn.textContent = isDone ? '✅ Выполнено' : 'Купить';
        buyEnergyBtn.classList.toggle('disabled', isDone);
    }
    
    let rate = getPassiveRate();
    passiveIncomeRate = rate;
    document.getElementById('passiveIncomeRate').textContent = rate;
    updatePlanetByLevel();
    
    document.getElementById('profileCoins').textContent = Math.floor(coins);
    document.getElementById('profileClickPower').textContent = clickPower;
    document.getElementById('profileMaxEnergy').textContent = maxEnergy;
    document.getElementById('profilePassiveIncome').textContent = passiveIncomeRate;
    document.getElementById('profileId').textContent = userId || 'Гость';
    document.getElementById('profileDate').textContent = new Date().toLocaleDateString();
    document.getElementById('dailyClickProgress').textContent = `${dailyClickCount}/${TASK_TARGETS.dailyClick}`;
    document.getElementById('dailyCoinsProgress').textContent = `${dailyCoinsEarned}/${TASK_TARGETS.dailyCoins}`;
    const dailyEnergyEl = document.getElementById('dailyEnergyProgress');
    if (dailyEnergyEl) dailyEnergyEl.textContent = `${dailyEnergySpent}/${TASK_TARGETS.dailyEnergy}`;
    const dailyUpgradeEl = document.getElementById('dailyUpgradeProgress');
    if (dailyUpgradeEl) dailyUpgradeEl.textContent = `${dailyUpgradesBought}/${TASK_TARGETS.dailyUpgrade}`;
    const dailyPassiveEl = document.getElementById('dailyPassiveProgress');
    if (dailyPassiveEl) dailyPassiveEl.textContent = `${Math.min(getPassiveRate(), 10)}/10`;
    document.getElementById('weeklyClickProgress').textContent = `${weeklyClickCount}/${TASK_TARGETS.weeklyClick}`;
    document.getElementById('weeklyCoinsProgress').textContent = `${weeklyCoinsEarned}/${TASK_TARGETS.weeklyCoins}`;
    const weeklyEnergyEl = document.getElementById('weeklyEnergyProgress');
    if (weeklyEnergyEl) weeklyEnergyEl.textContent = `${weeklyEnergySpent}/${TASK_TARGETS.weeklyEnergy}`;
    const weeklyUpgradeEl = document.getElementById('weeklyUpgradeProgress');
    if (weeklyUpgradeEl) weeklyUpgradeEl.textContent = `${weeklyUpgradesBought}/${TASK_TARGETS.weeklyUpgrade}`;
    const weeklyPassiveEl = document.getElementById('weeklyPassiveProgress');
    if (weeklyPassiveEl) weeklyPassiveEl.textContent = `${Math.min(getPassiveRate(), 40)}/40`;
    const nextGoalEl = document.getElementById('nextGoalText');
    if (nextGoalEl) {
        const lv = getLevel();
        const nextThresholds = [10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000];
        const target = nextThresholds[lv] || null;
        nextGoalEl.textContent = target
            ? `🎯 Следующая цель: ${Math.max(0, target - Math.floor(coins)).toLocaleString()} монет до уровня ${lv + 1}`
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

function saveGame() {
    const gameData = {
        coins, energy, maxEnergy, clickPower, clickUpgradeCost, clickUpgradeLevel,
        energyUpgradeCost, energyUpgradeLevel, passiveIncomeLevel, passiveIncomeUpgradeCost, taskPassiveBonusRate,
        dailyClickCount, dailyCoinsEarned, dailyEnergySpent, dailyUpgradesBought, dailyTasksClaimed,
        weeklyClickCount, weeklyCoinsEarned, weeklyEnergySpent, weeklyUpgradesBought, weeklyTasksClaimed,
        lastDailyCycleKey, lastWeeklyCycleKey,
        hasMoon, hasEarth, hasSun, soundEnabled,
        ownedRankLevel,
        lastSeenAtMs: Date.now()
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

    const expectedClickCost = Math.floor(100 * Math.pow(1.3, Math.max(0, clickUpgradeLevel - 1)));
    const expectedEnergyCost = Math.floor(200 * Math.pow(1.25, Math.max(0, energyUpgradeLevel - 1)));
    const expectedPassiveCost = Math.floor(500 * Math.pow(1.25, Math.max(0, passiveIncomeLevel)));

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
            lastDailyCycleKey = typeof data.lastDailyCycleKey === 'string' ? data.lastDailyCycleKey : todayKey();
            lastWeeklyCycleKey = typeof data.lastWeeklyCycleKey === 'string' ? data.lastWeeklyCycleKey : weekKey();
            hasMoon = data.hasMoon || false;
            hasEarth = data.hasEarth || false;
            hasSun = data.hasSun || false;
            soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
            ownedRankLevel = Number.isFinite(Number(data.ownedRankLevel)) ? clampInt(data.ownedRankLevel, -1, 10) : -1;
            lastSeenAtMs = Number.isFinite(Number(data.lastSeenAtMs)) ? Number(data.lastSeenAtMs) : Date.now();
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
    // Оффлайн начисление (до 3 часов)
    applyOfflineEarnings();
    lastSeenAtMs = Date.now();
    updateUI();
    fillRanksPreviewGrid();
    if (normalized) saveGame();
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
        hasMoon: hasMoon,
        hasEarth: hasEarth,
        hasSun: hasSun,
        clickUpgradeLevel: clickUpgradeLevel,
        clickUpgradeCost: clickUpgradeCost,
        energyUpgradeLevel: energyUpgradeLevel,
        energyUpgradeCost: energyUpgradeCost,
        passiveIncomeUpgradeCost: passiveIncomeUpgradeCost,
        soundEnabled: soundEnabled
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
        const response = await fetch(`${API_BASE}/api/user/${userId}`);
        if (response.ok) {
            const data = await response.json();
            console.log('📥 Полученные данные:', data);
            if (data?.registered === false) {
                isRegistered = false;
                return false;
            }
            isRegistered = true;
            
            // Проверяем что данные валидны
            if (data && typeof data.coins === 'number') {
                coins = Math.floor(data.coins);
                energy = data.energy ?? 100;
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
                taskPassiveBonusRate = data.taskPassiveBonusRate || taskPassiveBonusRate || 0;
                soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
                
                if (energy > maxEnergy) energy = maxEnergy;
                normalizeUpgradeCosts();
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
    
    if (loaded) saveGame();
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
    else showMessage(`❌ Нужно ${cost} монет`, true);
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
    else showMessage(`❌ Нужно ${cost} монет`, true);
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
    else showMessage(`❌ Нужно ${cost} монет`, true);
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
    setTaskClaimButton(document.getElementById('dailyPassiveClaim'), getPassiveRate() >= 10 && !dailyTasksClaimed.passive);
    setTaskClaimButton(document.getElementById('weeklyClickClaim'), weeklyClickCount >= TASK_TARGETS.weeklyClick && !weeklyTasksClaimed.click);
    setTaskClaimButton(document.getElementById('weeklyCoinsClaim'), weeklyCoinsEarned >= TASK_TARGETS.weeklyCoins && !weeklyTasksClaimed.coins);
    setTaskClaimButton(document.getElementById('weeklyEnergyClaim'), weeklyEnergySpent >= TASK_TARGETS.weeklyEnergy && !weeklyTasksClaimed.energy);
    setTaskClaimButton(document.getElementById('weeklyUpgradeClaim'), weeklyUpgradesBought >= TASK_TARGETS.weeklyUpgrade && !weeklyTasksClaimed.upgrade);
    setTaskClaimButton(document.getElementById('weeklyPassiveClaim'), getPassiveRate() >= 40 && !weeklyTasksClaimed.passive);

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

function applyTaskReward(reward) {
    if (typeof reward === 'number') {
        coins += reward;
        return `🎉 +${reward} монет!`;
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
    else if (type === 'daily_passive' && !dailyTasksClaimed.passive && getPassiveRate() >= 10) {
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
    else if (type === 'weekly_passive' && !weeklyTasksClaimed.passive && getPassiveRate() >= 40) {
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
        const response = await fetch(`${API_BASE}/api/leaderboard`);
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
            return `<div class="leaderboard-item" style="${isCurrent ? 'border:1px solid #ffd700;background:rgba(255,215,0,0.1);' : ''}"><div class="leaderboard-rank ${i < 3 ? `top-${i + 1}` : ''}">${medal}</div><div class="leaderboard-name">${name} ${isCurrent ? '👤' : ''}</div><div class="leaderboard-coins">${coinsVal.toLocaleString()} 🪙</div><div class="leaderboard-level">Уровень ${lvl}</div></div>`;
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

async function loadFriends() {
    if (!userId) {
        renderFriendsFallback();
        return;
    }
    const container = document.getElementById('level1List');
    if (!container) return;
    container.innerHTML = `<div class="level-item"><span>⏳ Загрузка рефералов...</span><span></span></div>`;
    try {
        const res = await fetch(`${API_BASE}/api/friends/${userId}`);
        const data = await res.json();
        if (!res.ok || !data?.success) {
            renderFriendsFallback();
            return;
        }
        const refs = Array.isArray(data.referrals) ? data.referrals : [];
        const referralCount = Number(data.referralsCount || refs.length || 0);
        const bonus = Number(data.totalReferralBonus || 0);
        const referralCountEl = document.getElementById('referralCount');
        const referralBonusEl = document.getElementById('referralBonus');
        const profileReferralsEl = document.getElementById('profileReferrals');
        if (referralCountEl) referralCountEl.textContent = String(referralCount);
        if (referralBonusEl) referralBonusEl.textContent = String(bonus);
        if (profileReferralsEl) profileReferralsEl.textContent = String(referralCount);

        if (!refs.length) {
            container.innerHTML = `<div class="level-item"><span>👥 Пока нет приглашенных. Поделитесь ссылкой ниже</span><span></span></div>`;
            return;
        }
        container.innerHTML = refs.map((u) => {
            const name = (u.username && `@${u.username}`) || u.first_name || `ID ${u.telegram_id}`;
            const coinsVal = Number(u.coins || 0).toLocaleString();
            return `<div class="level-item"><span>${name}</span><span>${coinsVal} 🪙</span></div>`;
        }).join('');
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

function setupTasksTabs() {
    const tabs = document.querySelectorAll('.tasks-tab');
    const contents = { daily: document.getElementById('dailyTasks'), weekly: document.getElementById('weeklyTasks'), premium: document.getElementById('premiumTasks') };
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

function rechargeEnergy() { 
    if (energy < maxEnergy) { 
        // Плавное восстановление энергии
        const energyToAdd = Math.min(1, maxEnergy - energy);
        energy += energyToAdd;
        updateUI(); 
    }
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
    setupTabs();
    setupTasksTabs();

    // Не блокируем запуск интерфейса из-за сетевых запросов (важно для Menu button/cold start).
    Promise.resolve().then(async () => {
        let hydrated = false;
        for (let attempt = 0; attempt < 6; attempt++) {
            hydrated = await loadFromServer();
            if (hydrated) break;
            await new Promise((resolve) => setTimeout(resolve, 1200 + attempt * 600));
        }
        await loadPremiumConfig();
        updateUI();
        fillRanksPreviewGrid();
        updateMilitaryRankHUD();
        // После догрузки профиля повторяем сетевые вкладки.
        if (hydrated) {
            loadLeaderboard();
            loadFriends();
        }
    }).catch((e) => console.log('Отложенная серверная инициализация:', e));
    
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
    document.getElementById('buyPassiveUpgrade')?.addEventListener('click', upgradePassive);
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyReferralLink);
    document.getElementById('shareLinkBtn')?.addEventListener('click', shareReferralLink);
    document.getElementById('dailyClickClaim')?.addEventListener('click', () => claimTask('dailyClickClaim', 50, 'daily_click'));
    document.getElementById('dailyCoinsClaim')?.addEventListener('click', () => claimTask('dailyCoinsClaim', 500, 'daily_coins'));
    document.getElementById('dailyEnergyClaim')?.addEventListener('click', () => claimTask('dailyEnergyClaim', 300, 'daily_energy'));
    document.getElementById('dailyUpgradeClaim')?.addEventListener('click', () => claimTask('dailyUpgradeClaim', 200, 'daily_upgrade'));
    document.getElementById('dailyPassiveClaim')?.addEventListener('click', () => claimTask('dailyPassiveClaim', { type: 'passive', value: 10 }, 'daily_passive'));
    document.getElementById('weeklyClickClaim')?.addEventListener('click', () => claimTask('weeklyClickClaim', 1000, 'weekly_click'));
    document.getElementById('weeklyCoinsClaim')?.addEventListener('click', () => claimTask('weeklyCoinsClaim', 2500, 'weekly_coins'));
    document.getElementById('weeklyEnergyClaim')?.addEventListener('click', () => claimTask('weeklyEnergyClaim', 1500, 'weekly_energy'));
    document.getElementById('weeklyUpgradeClaim')?.addEventListener('click', () => claimTask('weeklyUpgradeClaim', 2000, 'weekly_upgrade'));
    document.getElementById('weeklyPassiveClaim')?.addEventListener('click', () => claimTask('weeklyPassiveClaim', { type: 'passive', value: 25 }, 'weekly_passive'));
    document.getElementById('buyMoon')?.addEventListener('click', () => buyPremium('moon'));
    document.getElementById('buyEarth')?.addEventListener('click', () => buyPremium('earth'));
    document.getElementById('buySun')?.addEventListener('click', () => buyPremium('sun'));
    
    const boostBtn = document.getElementById('boostBtn');
    const boostModal = document.getElementById('boostModal');
    const closeBoost = document.getElementById('closeBoostModal');
    setupBoostModalTabs();
    fillRanksPreviewGrid();
    updateMilitaryRankHUD();

    if (boostBtn) boostBtn.onclick = () => boostModal.classList.add('active');
    if (closeBoost) closeBoost.onclick = () => boostModal.classList.remove('active');
    if (boostModal) boostModal.onclick = (e) => { if (e.target === boostModal) boostModal.classList.remove('active'); };
    
    setInterval(applyPassiveIncome, 60000);
    setInterval(rechargeEnergy, 1000);
    
    const raysContainer = document.getElementById('raysContainer');
    if(raysContainer) for(let i=0;i<12;i++) { const ray = document.createElement('div'); ray.className = 'ray'; raysContainer.appendChild(ray); }
    
    const gameArea = document.getElementById('gameArea');
    if (gameArea) gameArea.style.display = 'flex';

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushTapPersistIfPending();
    });
    window.addEventListener('pagehide', flushTapPersistIfPending);
    
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
    
    // Загружаем лидерборд и друзей после инициализации
    setTimeout(() => {
        loadLeaderboard();
        loadFriends();
    }, 1000);
    
    const soundToggleBtn = document.getElementById('soundToggle');
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
            showMessage(soundEnabled ? '🔊 Звук включён' : '🔇 Звук выключен');
        });
    }
});