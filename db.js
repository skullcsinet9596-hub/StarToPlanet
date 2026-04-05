import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Neon.tech работает с SSL без дополнительных сертификатов
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: true  // Безопасное подключение
    },
    connectionTimeoutMillis: 10000
});

export async function checkConnection() {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('✅ Подключение к Neon.tech установлено');
        return true;
    } catch (err) {
        console.error('❌ Ошибка подключения к Neon.tech:', err.message);
        return false;
    }
}

// ========== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ ==========

export async function initDB() {
    try {
        // Удаляем все таблицы и создаем заново
        console.log('🔄 Пересоздание таблиц...');
        
        await pool.query('DROP TABLE IF EXISTS weekly_tasks CASCADE');
        await pool.query('DROP TABLE IF EXISTS daily_tasks CASCADE');
        await pool.query('DROP TABLE IF EXISTS leaderboard CASCADE');
        await pool.query('DROP TABLE IF EXISTS referrals CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');
        
        console.log('🗑️ Старые таблицы удалены');
        
        // Таблица пользователей
        await pool.query(`
            CREATE TABLE users (
                telegram_id BIGINT PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                coins BIGINT DEFAULT 0,
                energy INTEGER DEFAULT 100,
                max_energy INTEGER DEFAULT 100,
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
                has_moon BOOLEAN DEFAULT FALSE,
                has_earth BOOLEAN DEFAULT FALSE,
                has_sun BOOLEAN DEFAULT FALSE,
                sound_enabled BOOLEAN DEFAULT TRUE,
                referrer_id BIGINT,
                last_daily_bonus DATE,
                daily_streak INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица рефералов
        await pool.query(`
            CREATE TABLE referrals (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT,
                referred_id BIGINT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица лидерборда
        await pool.query(`
            CREATE TABLE leaderboard (
                telegram_id BIGINT PRIMARY KEY,
                coins BIGINT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица ежедневных заданий
        await pool.query(`
            CREATE TABLE daily_tasks (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT,
                date DATE,
                clicks INTEGER DEFAULT 0,
                coins_earned INTEGER DEFAULT 0,
                click_claimed BOOLEAN DEFAULT FALSE,
                coins_claimed BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
                UNIQUE(telegram_id, date)
            )
        `);

        // Таблица еженедельных заданий
        await pool.query(`
            CREATE TABLE weekly_tasks (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT,
                week_start DATE,
                clicks INTEGER DEFAULT 0,
                coins_earned INTEGER DEFAULT 0,
                click_claimed BOOLEAN DEFAULT FALSE,
                coins_claimed BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
                UNIQUE(telegram_id, week_start)
            )
        `);

        console.log('✅ Все таблицы созданы/проверены');
    } catch (err) {
        console.error('❌ Ошибка создания таблиц:', err.message);
    }
}

export async function getUser(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    try {
        const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
        return res.rows[0] || null;
    } catch (err) {
        console.error('Ошибка getUser:', err.message);
        return null;
    }
}

export async function createUser(telegramId, username, firstName, referrerId = null) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    
    const existing = await getUser(telegramId);
    if (existing) return existing;

    try {
        await pool.query(`
            INSERT INTO users (telegram_id, username, first_name, referrer_id, energy, max_energy, click_upgrade_level, click_upgrade_cost, energy_upgrade_level, energy_upgrade_cost, passive_income_level, passive_income_cost, sound_enabled)
            VALUES ($1, $2, $3, $4, 100, 100, 1, 100, 1, 200, 0, 500, true)
        `, [telegramId, username, firstName, referrerId]);

        if (referrerId && referrerId !== telegramId && !isNaN(parseInt(referrerId))) {
            const referrer = await getUser(referrerId);
            if (referrer) {
                const existingReferral = await pool.query(
                    'SELECT * FROM referrals WHERE referrer_id = $1 AND referred_id = $2',
                    [referrerId, telegramId]
                );
                
                if (existingReferral.rows.length === 0) {
                    await pool.query('INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)', [referrerId, telegramId]);
                    await pool.query('UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = $1', referrerId);
                    await addCoins(referrerId, 1000);
                    await addCoins(telegramId, 500);
                }
            }
        }

        await pool.query('INSERT INTO leaderboard (telegram_id, coins) VALUES ($1, 0)', [telegramId]);
        return await getUser(telegramId);
    } catch (err) {
        console.error('Ошибка createUser:', err.message);
        return null;
    }
}

export async function addCoins(telegramId, amount) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    try {
        await pool.query('UPDATE users SET coins = coins + $1 WHERE telegram_id = $2', [amount, telegramId]);
        await pool.query('UPDATE leaderboard SET coins = coins + $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', [amount, telegramId]);
    } catch (err) {
        console.error('Ошибка addCoins:', err.message);
    }
}

export async function addEnergy(telegramId, amount) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    try {
        await pool.query('UPDATE users SET energy = LEAST(max_energy, energy + $1) WHERE telegram_id = $2', [amount, telegramId]);
    } catch (err) {
        console.error('Ошибка addEnergy:', err.message);
    }
}

export async function updateUser(telegramId, data) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    
    try {
        // Строим динамический UPDATE запрос
        const fields = [];
        const values = [];
        let paramCount = 1;
        
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }
        
        if (fields.length === 0) return await getUser(telegramId);
        
        const query = `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = $${paramCount}`;
        values.push(telegramId);
        
        await pool.query(query, values);
        
        // Обновляем лидерборд если изменились монеты
        if (data.coins !== undefined) {
            await pool.query('UPDATE leaderboard SET coins = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', [data.coins, telegramId]);
        }
        
        return await getUser(telegramId);
    } catch (err) {
        console.error('Ошибка updateUser:', err.message);
        return null;
    }
}

export async function updateUserGameData(telegramId, gameData) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    try {
        await pool.query(`
            UPDATE users SET
                coins = $1,
                energy = $2,
                max_energy = $3,
                click_power = $4,
                click_upgrade_level = $5,
                click_upgrade_cost = $6,
                energy_upgrade_level = $7,
                energy_upgrade_cost = $8,
                passive_income_level = $9,
                passive_income_cost = $10,
                has_moon = $11,
                has_earth = $12,
                has_sun = $13,
                sound_enabled = $14
            WHERE telegram_id = $15
        `, [
            gameData.coins, gameData.energy, gameData.maxEnergy,
            gameData.clickPower, gameData.clickUpgradeLevel, gameData.clickUpgradeCost,
            gameData.energyUpgradeLevel, gameData.energyUpgradeCost,
            gameData.passiveIncomeLevel, gameData.passiveIncomeUpgradeCost,
            gameData.hasMoon, gameData.hasEarth, gameData.hasSun,
            gameData.soundEnabled,
            gameData.premiumLevel,
            gameData.level,
            telegramId
        ]);

        await pool.query('UPDATE leaderboard SET coins = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', [gameData.coins, telegramId]);
    } catch (err) {
        console.error('Ошибка updateUserGameData:', err.message);
    }
}

export async function updateUserProgress(telegramId, coins, clickPower, maxEnergy, premiumLevel = 0, level = 1) {
if (!telegramId || isNaN(parseInt(telegramId))) return;
try {
await pool.query(`
UPDATE users SET coins = $1, click_power = $2, max_energy = $3, premium_level = $4, level = $5
WHERE telegram_id = $6
`, [coins, clickPower, maxEnergy, premiumLevel, level, telegramId]);
await pool.query('UPDATE leaderboard SET coins = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2', [coins, telegramId]);
} catch (err) {
console.error('Ошибка updateUserProgress:', err.message);
}
}

export async function getPlayerRank(userId) {
try {
const res = await pool.query(
'SELECT COUNT(*) FROM users WHERE coins > (SELECT COALESCE(coins,0) FROM users WHERE telegram_id=$1)',
[userId]
);
return parseInt(res.rows[0].count) + 1;
} catch (err) {
return 1;
}
}

export async function getLeaderboard(limit = 100) {
try {
const res = await pool.query(`
SELECT u.telegram_id, u.username, u.first_name, l.coins, u.level, u.referrals_count
FROM leaderboard l
JOIN users u ON l.telegram_id = u.telegram_id
ORDER BY l.coins DESC
LIMIT $1
`, [limit]);
return res.rows;
} catch (err) {
console.error('Ошибка getLeaderboard:', err.message);
return [];
}
}

export async function getStats(telegramId) {
if (!telegramId || isNaN(parseInt(telegramId))) return null;
    
try {
const user = await getUser(telegramId);
const referrals = await getReferrals(telegramId);
        
const leaderboardPositionRes = await pool.query(`
SELECT COUNT(*) + 1 as position
FROM leaderboard
WHERE coins > (SELECT coins FROM leaderboard WHERE telegram_id = $1)
`, [telegramId]);
        
return {
user,
referralsCount: referrals.length,
referrals,
leaderboardPosition: leaderboardPositionRes.rows[0]?.position || 1,
totalReferralBonus: (user?.referrals_count || 0) * 1000
};
} catch (err) {
console.error('Ошибка getStats:', err.message);
return null;
}
}

export async function getReferrals(telegramId) {
if (!telegramId || isNaN(parseInt(telegramId))) return [];
try {
const res = await pool.query(`
SELECT u.telegram_id, u.username, u.first_name, u.coins, r.created_at
FROM referrals r
JOIN users u ON r.referred_id = u.telegram_id
WHERE r.referrer_id = $1
ORDER BY r.created_at DESC
`, [telegramId]);
return res.rows;
} catch (err) {
console.error('Ошибка getReferrals:', err.message);
return [];
}
}

export async function claimDailyBonus(telegramId) {
if (!telegramId || isNaN(parseInt(telegramId))) return { success: false, message: 'Неверный ID' };
    
const today = new Date().toISOString().split('T')[0];
    
try {
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
await pool.query('UPDATE users SET last_daily_bonus = $1, daily_streak = $2 WHERE telegram_id = $3', [today, streak, telegramId]);
        
return { success: true, bonus, streak };
} catch (err) {
console.error('Ошибка claimDailyBonus:', err.message);
return { success: false, message: 'Ошибка сервера' };
}
}

export async function toggleSound(telegramId) {
if (!telegramId || isNaN(parseInt(telegramId))) return false;
    
try {
const user = await getUser(telegramId);
if (!user) return false;
        
const newState = !user.sound_enabled;
await pool.query('UPDATE users SET sound_enabled = $1 WHERE telegram_id = $2', [newState, telegramId]);
return newState;
} catch (err) {
console.error('Ошибка toggleSound:', err.message);
return false;
}
}