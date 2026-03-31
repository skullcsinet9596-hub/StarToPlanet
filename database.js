const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;

async function initializeDatabase() {
    db = await open({
        filename: path.join(__dirname, 'game.db'),
        driver: sqlite3.Database
    });

    // Таблица пользователей (расширенная)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            telegram_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            coins BIGINT DEFAULT 0,
            energy INTEGER DEFAULT 1000,
            max_energy INTEGER DEFAULT 1000,
            click_power INTEGER DEFAULT 1,
            click_upgrade_level INTEGER DEFAULT 1,
            click_upgrade_cost INTEGER DEFAULT 100,
            energy_upgrade_level INTEGER DEFAULT 1,
            energy_upgrade_cost INTEGER DEFAULT 200,
            passive_income_level INTEGER DEFAULT 0,
            passive_income_cost INTEGER DEFAULT 500,
            level INTEGER DEFAULT 1,
            referrals_count INTEGER DEFAULT 0,
            premium_level INTEGER DEFAULT 0,
            has_moon INTEGER DEFAULT 0,
            has_earth INTEGER DEFAULT 0,
            has_sun INTEGER DEFAULT 0,
            sound_enabled INTEGER DEFAULT 1,
            referrer_id INTEGER,
            last_daily_bonus DATE,
            daily_streak INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Таблица рефералов
    await db.exec(`
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER,
            referred_id INTEGER UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Таблица лидерборда
    await db.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            telegram_id INTEGER PRIMARY KEY,
            coins BIGINT DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Таблица ежедневных заданий
    await db.exec(`
        CREATE TABLE IF NOT EXISTS daily_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER,
            date DATE,
            clicks INTEGER DEFAULT 0,
            coins_earned INTEGER DEFAULT 0,
            click_claimed INTEGER DEFAULT 0,
            coins_claimed INTEGER DEFAULT 0,
            FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
            UNIQUE(telegram_id, date)
        )
    `);

    // Таблица еженедельных заданий
    await db.exec(`
        CREATE TABLE IF NOT EXISTS weekly_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER,
            week_start DATE,
            clicks INTEGER DEFAULT 0,
            coins_earned INTEGER DEFAULT 0,
            click_claimed INTEGER DEFAULT 0,
            coins_claimed INTEGER DEFAULT 0,
            FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
            UNIQUE(telegram_id, week_start)
        )
    `);

    return db;
}

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

async function getUser(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    return await db.get('SELECT * FROM users WHERE telegram_id = ?', telegramId);
}

async function createUser(telegramId, username, firstName, referrerId = null) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    
    const existing = await getUser(telegramId);
    if (existing) return existing;

    await db.run(`
        INSERT INTO users (telegram_id, username, first_name, referrer_id, energy, max_energy, click_upgrade_level, click_upgrade_cost, energy_upgrade_level, energy_upgrade_cost, passive_income_level, passive_income_cost, sound_enabled)
        VALUES (?, ?, ?, ?, 1000, 1000, 1, 100, 1, 200, 0, 500, 1)
    `, telegramId, username, firstName, referrerId);

    if (referrerId && referrerId !== telegramId && !isNaN(parseInt(referrerId))) {
        const referrer = await getUser(referrerId);
        if (referrer) {
            await db.run(`INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)`, referrerId, telegramId);
            await db.run(`UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = ?`, referrerId);
            await addCoins(referrerId, 1000);
            await addCoins(telegramId, 500);
        }
    }

    await db.run(`INSERT INTO leaderboard (telegram_id, coins) VALUES (?, 0)`, telegramId);
    return await getUser(telegramId);
}

async function addCoins(telegramId, amount) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    await db.run(`UPDATE users SET coins = coins + ? WHERE telegram_id = ?`, amount, telegramId);
    await db.run(`UPDATE leaderboard SET coins = coins + ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`, amount, telegramId);
}

async function addEnergy(telegramId, amount) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    await db.run(`UPDATE users SET energy = MIN(max_energy, energy + ?) WHERE telegram_id = ?`, amount, telegramId);
}

async function updateUserGameData(telegramId, gameData) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    await db.run(`
        UPDATE users SET
            coins = ?,
            energy = ?,
            max_energy = ?,
            click_power = ?,
            click_upgrade_level = ?,
            click_upgrade_cost = ?,
            energy_upgrade_level = ?,
            energy_upgrade_cost = ?,
            passive_income_level = ?,
            passive_income_cost = ?,
            has_moon = ?,
            has_earth = ?,
            has_sun = ?,
            sound_enabled = ?
        WHERE telegram_id = ?
    `, [
        gameData.coins, gameData.energy, gameData.maxEnergy,
        gameData.clickPower, gameData.clickUpgradeLevel, gameData.clickUpgradeCost,
        gameData.energyUpgradeLevel, gameData.energyUpgradeCost,
        gameData.passiveIncomeLevel, gameData.passiveIncomeUpgradeCost,
        gameData.hasMoon ? 1 : 0, gameData.hasEarth ? 1 : 0, gameData.hasSun ? 1 : 0,
        gameData.soundEnabled ? 1 : 0,
        telegramId
    ]);

    await db.run(`UPDATE leaderboard SET coins = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`, gameData.coins, telegramId);
}

async function updateUserProgress(telegramId, coins, clickPower, maxEnergy, premiumLevel = 0) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    await db.run(`
        UPDATE users SET coins = ?, click_power = ?, max_energy = ?, premium_level = ?
        WHERE telegram_id = ?
    `, coins, clickPower, maxEnergy, premiumLevel, telegramId);
    await db.run(`UPDATE leaderboard SET coins = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`, coins, telegramId);
}

// ========== РЕФЕРАЛЫ ==========

async function getReferrals(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return [];
    return await db.all(`
        SELECT u.telegram_id, u.username, u.first_name, u.coins, r.created_at
        FROM referrals r
        JOIN users u ON r.referred_id = u.telegram_id
        WHERE r.referrer_id = ?
        ORDER BY r.created_at DESC
    `, telegramId);
}

async function getReferralsByLevel(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return { level1: [], level2: [], level3: [] };
    
    const level1 = await db.all(`SELECT * FROM users WHERE referrer_id = ? LIMIT 5`, telegramId);
    const level1Ids = level1.map(u => u.telegram_id);
    
    let level2 = [];
    if (level1Ids.length) {
        const placeholders = level1Ids.map(() => '?').join(',');
        level2 = await db.all(`SELECT * FROM users WHERE referrer_id IN (${placeholders}) LIMIT 5`, level1Ids);
    }
    
    const level2Ids = level2.map(u => u.telegram_id);
    let level3 = [];
    if (level2Ids.length) {
        const placeholders = level2Ids.map(() => '?').join(',');
        level3 = await db.all(`SELECT * FROM users WHERE referrer_id IN (${placeholders}) LIMIT 5`, level2Ids);
    }
    
    return { level1, level2, level3 };
}

// ========== ЕЖЕДНЕВНЫЕ ЗАДАНИЯ ==========

async function getDailyTasks(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    const today = new Date().toISOString().split('T')[0];
    let task = await db.get(`SELECT * FROM daily_tasks WHERE telegram_id = ? AND date = ?`, telegramId, today);
    
    if (!task) {
        await db.run(`
            INSERT INTO daily_tasks (telegram_id, date, clicks, coins_earned, click_claimed, coins_claimed)
            VALUES (?, ?, 0, 0, 0, 0)
        `, telegramId, today);
        task = await db.get(`SELECT * FROM daily_tasks WHERE telegram_id = ? AND date = ?`, telegramId, today);
    }
    
    return task;
}

async function updateDailyProgress(telegramId, clicks, coinsEarned) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    const today = new Date().toISOString().split('T')[0];
    await db.run(`
        INSERT INTO daily_tasks (telegram_id, date, clicks, coins_earned)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_id, date) DO UPDATE SET
            clicks = clicks + ?,
            coins_earned = coins_earned + ?
    `, telegramId, today, clicks, coinsEarned, clicks, coinsEarned);
}

async function claimDailyTask(telegramId, taskType) {
    if (!telegramId || isNaN(parseInt(telegramId))) return { success: false };
    const today = new Date().toISOString().split('T')[0];
    const task = await getDailyTasks(telegramId);
    
    if (taskType === 'click' && !task.click_claimed && task.clicks >= 100) {
        await db.run(`UPDATE daily_tasks SET click_claimed = 1 WHERE telegram_id = ? AND date = ?`, telegramId, today);
        await addCoins(telegramId, 100);
        return { success: true, reward: 100 };
    }
    
    if (taskType === 'coins' && !task.coins_claimed && task.coins_earned >= 500) {
        await db.run(`UPDATE daily_tasks SET coins_claimed = 1 WHERE telegram_id = ? AND date = ?`, telegramId, today);
        await addCoins(telegramId, 500);
        return { success: true, reward: 500 };
    }
    
    return { success: false };
}

// ========== ЕЖЕНЕДЕЛЬНЫЕ ЗАДАНИЯ ==========

function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

async function getWeeklyTasks(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    const weekStart = getWeekStart();
    let task = await db.get(`SELECT * FROM weekly_tasks WHERE telegram_id = ? AND week_start = ?`, telegramId, weekStart);
    
    if (!task) {
        await db.run(`
            INSERT INTO weekly_tasks (telegram_id, week_start, clicks, coins_earned, click_claimed, coins_claimed)
            VALUES (?, ?, 0, 0, 0, 0)
        `, telegramId, weekStart);
        task = await db.get(`SELECT * FROM weekly_tasks WHERE telegram_id = ? AND week_start = ?`, telegramId, weekStart);
    }
    
    return task;
}

async function updateWeeklyProgress(telegramId, clicks, coinsEarned) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    const weekStart = getWeekStart();
    await db.run(`
        INSERT INTO weekly_tasks (telegram_id, week_start, clicks, coins_earned)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_id, week_start) DO UPDATE SET
            clicks = clicks + ?,
            coins_earned = coins_earned + ?
    `, telegramId, weekStart, clicks, coinsEarned, clicks, coinsEarned);
}

async function claimWeeklyTask(telegramId, taskType) {
    if (!telegramId || isNaN(parseInt(telegramId))) return { success: false };
    const weekStart = getWeekStart();
    const task = await getWeeklyTasks(telegramId);
    
    if (taskType === 'click' && !task.click_claimed && task.clicks >= 1000) {
        await db.run(`UPDATE weekly_tasks SET click_claimed = 1 WHERE telegram_id = ? AND week_start = ?`, telegramId, weekStart);
        await addCoins(telegramId, 1000);
        return { success: true, reward: 1000 };
    }
    
    if (taskType === 'coins' && !task.coins_claimed && task.coins_earned >= 5000) {
        await db.run(`UPDATE weekly_tasks SET coins_claimed = 1 WHERE telegram_id = ? AND week_start = ?`, telegramId, weekStart);
        await addCoins(telegramId, 2500);
        return { success: true, reward: 2500 };
    }
    
    return { success: false };
}

// ========== ЕЖЕДНЕВНЫЙ БОНУС ==========

async function claimDailyBonus(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return { success: false, message: 'Неверный ID' };
    
    const today = new Date().toISOString().split('T')[0];
    const user = await getUser(telegramId);
    
    if (!user) return { success: false, message: 'Пользователь не найден' };
    
    if (user.last_daily_bonus === today) {
        return { success: false, message: 'Бонус уже получен сегодня!' };
    }
    
    let streak = user.daily_streak || 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (user.last_daily_bonus === yesterdayStr) {
        streak = Math.min(streak + 1, 7);
    } else {
        streak = 1;
    }
    
    const bonuses = [100, 200, 300, 500, 800, 1200, 2000];
    const bonus = bonuses[streak - 1] || 2000;
    
    await addCoins(telegramId, bonus);
    await db.run(`UPDATE users SET last_daily_bonus = ?, daily_streak = ? WHERE telegram_id = ?`, today, streak, telegramId);
    
    return { success: true, bonus, streak };
}

// ========== ЛИДЕРБОРД ==========

async function getLeaderboard(limit = 100) {
    return await db.all(`
        SELECT u.telegram_id, u.username, u.first_name, l.coins, u.level, u.referrals_count
        FROM leaderboard l
        JOIN users u ON l.telegram_id = u.telegram_id
        ORDER BY l.coins DESC
        LIMIT ?
    `, limit);
}

async function getStats(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    const user = await getUser(telegramId);
    const referrals = await getReferrals(telegramId);
    
    const leaderboardPosition = await db.get(`
        SELECT COUNT(*) + 1 as position
        FROM leaderboard
        WHERE coins > (SELECT coins FROM leaderboard WHERE telegram_id = ?)
    `, telegramId);
    
    return {
        user,
        referralsCount: referrals.length,
        referrals,
        leaderboardPosition: leaderboardPosition?.position || 1,
        totalReferralBonus: (user?.referrals_count || 0) * 1000
    };
}

async function toggleSound(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return false;
    const user = await getUser(telegramId);
    const newState = user.sound_enabled ? 0 : 1;
    await db.run(`UPDATE users SET sound_enabled = ? WHERE telegram_id = ?`, newState, telegramId);
    return newState;
}

module.exports = {
    initializeDatabase,
    getUser,
    createUser,
    addCoins,
    addEnergy,
    updateUserGameData,
    updateUserProgress,
    getReferrals,
    getReferralsByLevel,
    getLeaderboard,
    getStats,
    getDailyTasks,
    updateDailyProgress,
    claimDailyTask,
    getWeeklyTasks,
    updateWeeklyProgress,
    claimWeeklyTask,
    claimDailyBonus,
    toggleSound
};