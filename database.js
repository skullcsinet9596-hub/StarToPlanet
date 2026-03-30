const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;

async function initializeDatabase() {
    db = await open({
        filename: path.join(__dirname, 'game.db'),
        driver: sqlite3.Database
    });

    // Таблица пользователей (с новыми полями)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            telegram_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            energy INTEGER DEFAULT 100,
            max_energy INTEGER DEFAULT 100,
            coins BIGINT DEFAULT 0,
            total_coins_earned BIGINT DEFAULT 0,
            level INTEGER DEFAULT 1,
            planet_type TEXT DEFAULT 'star',
            click_power INTEGER DEFAULT 1,
            auto_miners INTEGER DEFAULT 0,
            recharge_rate INTEGER DEFAULT 10,
            last_energy_recharge DATETIME DEFAULT CURRENT_TIMESTAMP,
            referrer_id INTEGER,
            referrals_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            total_passive_earned BIGINT DEFAULT 0,
            referral_level1_count INTEGER DEFAULT 0,
            referral_level2_count INTEGER DEFAULT 0,
            referral_level3_count INTEGER DEFAULT 0
        )
    `);

    // Таблица рефералов
    await db.exec(`
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER,
            referred_id INTEGER UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            bonus_paid BOOLEAN DEFAULT 0,
            FOREIGN KEY (referrer_id) REFERENCES users(telegram_id),
            FOREIGN KEY (referred_id) REFERENCES users(telegram_id)
        )
    `);

    // Таблица рейтинга
    await db.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            telegram_id INTEGER PRIMARY KEY,
            coins BIGINT DEFAULT 0,
            level INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
        )
    `);

    // Таблица бонусов
    await db.exec(`
        CREATE TABLE IF NOT EXISTS referral_bonuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER,
            referred_id INTEGER,
            amount INTEGER,
            level INTEGER,
            source TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    return db;
}

async function getUser(telegramId) {
    return await db.get('SELECT * FROM users WHERE telegram_id = ?', telegramId);
}

// Получение всей реферальной цепочки (вверх)
async function getReferralChain(telegramId) {
    const chain = { level1: null, level2: null, level3: null };
    let currentId = telegramId;
    let level = 1;
    
    while (currentId && level <= 3) {
        const user = await getUser(currentId);
        if (user && user.referrer_id) {
            if (level === 1) chain.level1 = user.referrer_id;
            if (level === 2) chain.level2 = user.referrer_id;
            if (level === 3) chain.level3 = user.referrer_id;
            currentId = user.referrer_id;
            level++;
        } else {
            break;
        }
    }
    return chain;
}

// Получение рефералов по уровням (вниз)
async function getReferralsByLevel(telegramId) {
    const level1 = await db.all(`
        SELECT * FROM users WHERE referrer_id = ? LIMIT 5
    `, telegramId);
    
    const level1Ids = level1.map(u => u.telegram_id);
    
    let level2 = [];
    if (level1Ids.length) {
        level2 = await db.all(`
            SELECT * FROM users WHERE referrer_id IN (${level1Ids.map(() => '?').join(',')}) LIMIT 5
        `, level1Ids);
    }
    
    const level2Ids = level2.map(u => u.telegram_id);
    
    let level3 = [];
    if (level2Ids.length) {
        level3 = await db.all(`
            SELECT * FROM users WHERE referrer_id IN (${level2Ids.map(() => '?').join(',')}) LIMIT 5
        `, level2Ids);
    }
    
    return { level1, level2, level3 };
}

// Логирование бонусов
async function logReferralBonus(referrerId, referredId, amount, level, source) {
    await db.run(`
        INSERT INTO referral_bonuses (referrer_id, referred_id, amount, level, source)
        VALUES (?, ?, ?, ?, ?)
    `, referrerId, referredId, amount, level, source);
}

// Начисление бонусов по реферальной цепочке
async function distributeReferralBonus(telegramId, amount, source = 'click') {
    const chain = await getReferralChain(telegramId);
    
    if (chain.level1) {
        const bonus1 = Math.floor(amount * 0.5);
        if (bonus1 > 0) {
            await addCoins(chain.level1, bonus1);
            await logReferralBonus(chain.level1, telegramId, bonus1, 1, source);
        }
    }
    
    if (chain.level2) {
        const bonus2 = Math.floor(amount * 0.2);
        if (bonus2 > 0) {
            await addCoins(chain.level2, bonus2);
            await logReferralBonus(chain.level2, telegramId, bonus2, 2, source);
        }
    }
    
    if (chain.level3) {
        const bonus3 = Math.floor(amount * 0.1);
        if (bonus3 > 0) {
            await addCoins(chain.level3, bonus3);
            await logReferralBonus(chain.level3, telegramId, bonus3, 3, source);
        }
    }
}

async function addCoins(telegramId, amount, source = 'click') {
    await db.run(`
        UPDATE users 
        SET coins = coins + ?, total_coins_earned = total_coins_earned + ?
        WHERE telegram_id = ?
    `, amount, amount, telegramId);
    
    await db.run(`
        UPDATE leaderboard 
        SET coins = coins + ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
    `, amount, telegramId);
    
    if (source === 'click' || source === 'passive') {
        await distributeReferralBonus(telegramId, amount, source);
    }
}

async function createUser(telegramId, username, firstName, referrerId = null) {
    const existing = await getUser(telegramId);
    if (existing) return existing;

    await db.run(`
        INSERT INTO users (telegram_id, username, first_name, referrer_id)
        VALUES (?, ?, ?, ?)
    `, telegramId, username, firstName, referrerId);

    if (referrerId && referrerId !== telegramId) {
        const referrer = await getUser(referrerId);
        if (referrer) {
            await db.run(`
                INSERT INTO referrals (referrer_id, referred_id)
                VALUES (?, ?)
            `, referrerId, telegramId);

            await db.run(`
                UPDATE users 
                SET referrals_count = referrals_count + 1,
                    referral_level1_count = referral_level1_count + 1
                WHERE telegram_id = ?
            `, referrerId);

            await addCoins(referrerId, 1000);
            await addCoins(telegramId, 500);
        }
    }

    await db.run(`
        INSERT INTO leaderboard (telegram_id, coins)
        VALUES (?, ?)
    `, telegramId, 0);

    return await getUser(telegramId);
}

async function updateUserProgress(telegramId, coins, clickPower, maxEnergy) {
    await db.run(`
        UPDATE users 
        SET coins = ?, click_power = ?, max_energy = ?
        WHERE telegram_id = ?
    `, coins, clickPower, maxEnergy, telegramId);
    
    await db.run(`
        UPDATE leaderboard 
        SET coins = ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
    `, coins, telegramId);
}

async function getReferrals(telegramId) {
    return await db.all(`
        SELECT u.telegram_id, u.username, u.first_name, u.coins, u.level, r.created_at
        FROM referrals r
        JOIN users u ON r.referred_id = u.telegram_id
        WHERE r.referrer_id = ?
        ORDER BY r.created_at DESC
    `, telegramId);
}

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

module.exports = {
    initializeDatabase,
    getUser,
    createUser,
    addCoins,
    updateUserProgress,
    getReferrals,
    getReferralsByLevel,
    getLeaderboard,
    getStats
};