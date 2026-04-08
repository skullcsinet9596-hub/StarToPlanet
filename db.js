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
        // Безопасная инициализация: только создаем недостающие таблицы
        console.log('🔄 Проверка и создание таблиц...');
        
        // Таблица пользователей
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

        // Таблица рефералов
        await pool.query(`
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT,
                referred_id BIGINT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица лидерборда
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                telegram_id BIGINT PRIMARY KEY,
                coins BIGINT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица ежедневных заданий
        await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_tasks (
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
            CREATE TABLE IF NOT EXISTS weekly_tasks (
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

        // Таблица платежей Premium
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                product_type TEXT NOT NULL,
                provider TEXT NOT NULL,
                provider_invoice_id TEXT UNIQUE NOT NULL,
                amount_rub INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                paid_at TIMESTAMP
            )
        `);

        // Конфиг экономики (для админ-панели)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_starts (
                telegram_id BIGINT PRIMARY KEY,
                first_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                starts_count INTEGER DEFAULT 1
            )
        `);

        // Индексы и ограничения для стабильности/безопасности
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_referrer_id ON users(referrer_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_telegram_id ON payments(telegram_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC)`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_invoice_id ON payments(provider_invoice_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_starts_first_started_at ON bot_starts(first_started_at DESC)`);

        console.log('✅ Таблицы готовы');
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

export async function getReferralAncestors(telegramId, maxDepth = 8) {
    if (!telegramId || isNaN(parseInt(telegramId))) return [];
    try {
        const res = await pool.query(`
            WITH RECURSIVE chain AS (
                SELECT telegram_id, referrer_id, 1 AS depth
                FROM users
                WHERE telegram_id = $1
                UNION ALL
                SELECT u.telegram_id, u.referrer_id, c.depth + 1
                FROM users u
                JOIN chain c ON u.telegram_id = c.referrer_id
                WHERE c.depth < $2
            )
            SELECT referrer_id AS ancestor_id, depth
            FROM chain
            WHERE referrer_id IS NOT NULL
            ORDER BY depth ASC
        `, [telegramId, maxDepth]);
        return res.rows;
    } catch (err) {
        console.error('Ошибка getReferralAncestors:', err.message);
        return [];
    }
}

export async function getReferralLineCounts(telegramId, maxDepth = 8) {
    if (!telegramId || isNaN(parseInt(telegramId))) return {};
    try {
        const res = await pool.query(`
            WITH RECURSIVE tree AS (
                SELECT telegram_id, referrer_id, 0 AS depth
                FROM users
                WHERE telegram_id = $1
                UNION ALL
                SELECT u.telegram_id, u.referrer_id, t.depth + 1
                FROM users u
                JOIN tree t ON u.referrer_id = t.telegram_id
                WHERE t.depth < $2
            )
            SELECT depth, COUNT(*)::int AS cnt
            FROM tree
            WHERE depth > 0
            GROUP BY depth
            ORDER BY depth
        `, [telegramId, maxDepth]);

        const counts = {};
        for (const row of res.rows) counts[Number(row.depth)] = Number(row.cnt);
        return counts;
    } catch (err) {
        console.error('Ошибка getReferralLineCounts:', err.message);
        return {};
    }
}

async function canAttachToReferrer(referrerId) {
    const lineCaps = { 1: 5, 2: 15, 3: 25 };
    const totalCap = 500;

    const referrer = await getUser(referrerId);
    if (!referrer) return false;

    const ancestors = await getReferralAncestors(referrerId, 7);
    const impacted = [{ ancestor_id: referrerId, depth: 1 }, ...ancestors.map(a => ({ ancestor_id: a.ancestor_id, depth: a.depth + 1 }))];

    for (const item of impacted) {
        const depth = Number(item.depth);
        const ancestorId = Number(item.ancestor_id);
        if (!ancestorId || depth > 8) continue;

        const counts = await getReferralLineCounts(ancestorId, 8);
        const lineCount = Number(counts[depth] || 0);
        const totalCount = Object.values(counts).reduce((sum, v) => sum + Number(v || 0), 0);

        const cap = lineCaps[depth];
        if (cap !== undefined && lineCount >= cap) return false;
        if (totalCount >= totalCap) return false;
    }

    return true;
}

async function pickRandomAvailableReferrer(excludeTelegramId = null) {
    try {
        // Берем случайную выборку кандидатов и ищем первого, кто проходит лимиты линий/сети.
        const candidatesRes = await pool.query(
            `SELECT telegram_id
             FROM users
             WHERE ($1::bigint IS NULL OR telegram_id <> $1)
             ORDER BY RANDOM()
             LIMIT 80`,
            [excludeTelegramId]
        );
        for (const row of candidatesRes.rows) {
            const candidateId = Number(row.telegram_id);
            if (!candidateId) continue;
            const ok = await canAttachToReferrer(candidateId);
            if (ok) return candidateId;
        }
    } catch (err) {
        console.error('Ошибка pickRandomAvailableReferrer:', err.message);
    }
    return null;
}

export async function createUser(telegramId, username, firstName, referrerId = null) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    
    const existing = await getUser(telegramId);
    if (existing) return existing;

    try {
        let effectiveReferrerId = null;
        if (referrerId && referrerId !== telegramId && !isNaN(parseInt(referrerId))) {
            const canAttach = await canAttachToReferrer(referrerId);
            if (canAttach) effectiveReferrerId = referrerId;
            else console.log(`⚠️ Реферальная привязка отклонена для ${telegramId} к ${referrerId} (лимиты линий/сети)`);
        } else {
            // Если пользователь пришел без реферальной ссылки — назначаем случайного игрока.
            effectiveReferrerId = await pickRandomAvailableReferrer(telegramId);
            if (effectiveReferrerId) {
                console.log(`🎲 Пользователь ${telegramId} прикреплен к случайному рефереру ${effectiveReferrerId}`);
            } else {
                console.log(`ℹ️ Для пользователя ${telegramId} не найден доступный случайный реферер`);
            }
        }

        await pool.query(`
            INSERT INTO users (telegram_id, username, first_name, referrer_id, energy, max_energy, click_upgrade_level, click_upgrade_cost, energy_upgrade_level, energy_upgrade_cost, passive_income_level, passive_income_cost, sound_enabled, last_seen_at)
            VALUES ($1, $2, $3, $4, 100, 100, 1, 100, 1, 200, 0, 500, true, CURRENT_TIMESTAMP)
        `, [telegramId, username, firstName, effectiveReferrerId]);

        if (effectiveReferrerId) {
            const referrer = await getUser(effectiveReferrerId);
            if (referrer) {
                const existingReferral = await pool.query(
                    'SELECT * FROM referrals WHERE referrer_id = $1 AND referred_id = $2',
                    [effectiveReferrerId, telegramId]
                );
                
                if (existingReferral.rows.length === 0) {
                    await pool.query('INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)', [effectiveReferrerId, telegramId]);
                    await pool.query('UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = $1', [effectiveReferrerId]);
                    await addCoins(effectiveReferrerId, 1000);
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

export async function trackBotStart(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    try {
        await pool.query(`
            INSERT INTO bot_starts (telegram_id, first_started_at, last_started_at, starts_count)
            VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
            ON CONFLICT (telegram_id) DO UPDATE SET
                last_started_at = CURRENT_TIMESTAMP,
                starts_count = bot_starts.starts_count + 1
        `, [telegramId]);
    } catch (err) {
        console.error('Ошибка trackBotStart:', err.message);
    }
}

export async function distributeReferralRewards(telegramId, earnedAmount) {
    if (!telegramId || isNaN(parseInt(telegramId))) return;
    const amount = Math.floor(Number(earnedAmount) || 0);
    if (amount <= 0) return;

    const rates = { 1: 0.5, 2: 0.2, 3: 0.1 };
    try {
        const ancestors = await getReferralAncestors(telegramId, 3);
        for (const a of ancestors) {
            const depth = Number(a.depth);
            const ancestorId = Number(a.ancestor_id);
            const rate = rates[depth];
            if (!ancestorId || !rate) continue;
            const bonus = Math.floor(amount * rate);
            if (bonus > 0) await addCoins(ancestorId, bonus);
        }
    } catch (err) {
        console.error('Ошибка distributeReferralRewards:', err.message);
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
                sound_enabled = $14,
                premium_level = $15,
                level = $16,
                last_seen_at = CURRENT_TIMESTAMP
            WHERE telegram_id = $17
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

// ========== PAYMENTS ==========
export async function createPaymentInvoice({ telegramId, productType, provider, providerInvoiceId, amountRub, metadata = {} }) {
    if (!telegramId || !productType || !provider || !providerInvoiceId) return null;
    try {
        const res = await pool.query(`
            INSERT INTO payments (telegram_id, product_type, provider, provider_invoice_id, amount_rub, status, metadata)
            VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)
            ON CONFLICT (provider_invoice_id) DO UPDATE SET
                metadata = EXCLUDED.metadata
            RETURNING *
        `, [telegramId, productType, provider, providerInvoiceId, amountRub, JSON.stringify(metadata || {})]);
        return res.rows[0] || null;
    } catch (err) {
        console.error('Ошибка createPaymentInvoice:', err.message);
        return null;
    }
}

export async function getPaymentByProviderInvoiceId(providerInvoiceId) {
    if (!providerInvoiceId) return null;
    try {
        const res = await pool.query('SELECT * FROM payments WHERE provider_invoice_id = $1', [providerInvoiceId]);
        return res.rows[0] || null;
    } catch (err) {
        console.error('Ошибка getPaymentByProviderInvoiceId:', err.message);
        return null;
    }
}

export async function markPaymentPaid(providerInvoiceId, metadataPatch = {}) {
    if (!providerInvoiceId) return { updated: false, payment: null };
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const currentRes = await client.query('SELECT * FROM payments WHERE provider_invoice_id = $1 FOR UPDATE', [providerInvoiceId]);
        const current = currentRes.rows[0];
        if (!current) {
            await client.query('ROLLBACK');
            return { updated: false, payment: null };
        }
        if (current.status === 'paid') {
            await client.query('COMMIT');
            return { updated: false, payment: current };
        }

        const mergedMetadata = { ...(current.metadata || {}), ...(metadataPatch || {}) };
        const updRes = await client.query(`
            UPDATE payments
            SET status = 'paid', paid_at = CURRENT_TIMESTAMP, metadata = $2::jsonb
            WHERE provider_invoice_id = $1
            RETURNING *
        `, [providerInvoiceId, JSON.stringify(mergedMetadata)]);
        await client.query('COMMIT');
        return { updated: true, payment: updRes.rows[0] || null };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка markPaymentPaid:', err.message);
        return { updated: false, payment: null };
    } finally {
        client.release();
    }
}

export async function listPayments(limit = 100) {
    try {
        const res = await pool.query(`
            SELECT p.*, u.username, u.first_name
            FROM payments p
            LEFT JOIN users u ON u.telegram_id = p.telegram_id
            ORDER BY p.created_at DESC
            LIMIT $1
        `, [Math.max(1, Math.min(500, Number(limit) || 100))]);
        return res.rows;
    } catch (err) {
        console.error('Ошибка listPayments:', err.message);
        return [];
    }
}

// ========== ADMIN HELPERS ==========
export async function searchUsersAdmin(query = '', limit = 50) {
    try {
        const q = String(query || '').trim();
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
        if (!q) {
            const res = await pool.query(`
                SELECT telegram_id, username, first_name, coins, level, referrals_count, referrer_id, created_at
                FROM users
                ORDER BY created_at DESC
                LIMIT $1
            `, [safeLimit]);
            return res.rows;
        }
        const numeric = Number(q);
        if (Number.isFinite(numeric)) {
            const res = await pool.query(`
                SELECT telegram_id, username, first_name, coins, level, referrals_count, referrer_id, created_at
                FROM users
                WHERE telegram_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            `, [numeric, safeLimit]);
            return res.rows;
        }
        const like = `%${q}%`;
        const res = await pool.query(`
            SELECT telegram_id, username, first_name, coins, level, referrals_count, referrer_id, created_at
            FROM users
            WHERE username ILIKE $1 OR first_name ILIKE $1
            ORDER BY coins DESC
            LIMIT $2
        `, [like, safeLimit]);
        return res.rows;
    } catch (err) {
        console.error('Ошибка searchUsersAdmin:', err.message);
        return [];
    }
}

export async function getReferralTreeAdmin(rootTelegramId, maxDepth = 4) {
    if (!rootTelegramId || isNaN(parseInt(rootTelegramId))) return [];
    try {
        const res = await pool.query(`
            WITH RECURSIVE tree AS (
                SELECT telegram_id, referrer_id, username, first_name, coins, 0 AS depth
                FROM users
                WHERE telegram_id = $1
                UNION ALL
                SELECT u.telegram_id, u.referrer_id, u.username, u.first_name, u.coins, t.depth + 1
                FROM users u
                JOIN tree t ON u.referrer_id = t.telegram_id
                WHERE t.depth < $2
            )
            SELECT * FROM tree ORDER BY depth ASC, coins DESC
        `, [rootTelegramId, Math.max(1, Math.min(8, Number(maxDepth) || 4))]);
        return res.rows;
    } catch (err) {
        console.error('Ошибка getReferralTreeAdmin:', err.message);
        return [];
    }
}

export async function updateEconomyConfig(configPatch = {}) {
    try {
        const key = 'economy_config';
        const currentRes = await pool.query('SELECT value FROM app_config WHERE key = $1', [key]);
        const current = currentRes.rows[0]?.value || {};
        const next = { ...current, ...configPatch, updatedAt: new Date().toISOString() };
        await pool.query(`
            INSERT INTO app_config (key, value, updated_at)
            VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP
        `, [key, JSON.stringify(next)]);
        return next;
    } catch (err) {
        console.error('Ошибка updateEconomyConfig:', err.message);
        return null;
    }
}

export async function getEconomyConfig() {
    try {
        const res = await pool.query('SELECT value FROM app_config WHERE key = $1', ['economy_config']);
        return res.rows[0]?.value || null;
    } catch (err) {
        console.error('Ошибка getEconomyConfig:', err.message);
        return null;
    }
}

export async function adjustUserAdmin(telegramId, patch = {}) {
    if (!telegramId || isNaN(parseInt(telegramId))) return null;
    const allow = ['coins', 'level', 'has_moon', 'has_earth', 'has_sun'];
    const updates = {};
    for (const key of allow) {
        if (patch[key] !== undefined) updates[key] = patch[key];
    }
    if (!Object.keys(updates).length) return await getUser(telegramId);
    return await updateUser(telegramId, updates);
}

export async function deleteUserAdmin(telegramId) {
    if (!telegramId || isNaN(parseInt(telegramId))) return { ok: false, message: 'Неверный telegramId' };
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const targetRes = await client.query('SELECT telegram_id FROM users WHERE telegram_id = $1 FOR UPDATE', [telegramId]);
        if (!targetRes.rows.length) {
            await client.query('ROLLBACK');
            return { ok: false, message: 'Пользователь не найден' };
        }

        await client.query('UPDATE users SET referrer_id = NULL WHERE referrer_id = $1', [telegramId]);
        await client.query('DELETE FROM referrals WHERE referrer_id = $1 OR referred_id = $1', [telegramId]);
        await client.query('DELETE FROM leaderboard WHERE telegram_id = $1', [telegramId]);
        await client.query('DELETE FROM daily_tasks WHERE telegram_id = $1', [telegramId]);
        await client.query('DELETE FROM weekly_tasks WHERE telegram_id = $1', [telegramId]);
        await client.query('DELETE FROM payments WHERE telegram_id = $1', [telegramId]);
        await client.query('DELETE FROM bot_starts WHERE telegram_id = $1', [telegramId]);
        await client.query('DELETE FROM users WHERE telegram_id = $1', [telegramId]);

        await client.query(`
            UPDATE users u
            SET referrals_count = COALESCE(x.cnt, 0)
            FROM (
                SELECT referrer_id, COUNT(*)::int AS cnt
                FROM referrals
                GROUP BY referrer_id
            ) x
            WHERE u.telegram_id = x.referrer_id
        `);
        await client.query(`
            UPDATE users
            SET referrals_count = 0
            WHERE telegram_id NOT IN (SELECT DISTINCT referrer_id FROM referrals)
        `);

        await client.query('COMMIT');
        return { ok: true, deletedTelegramId: Number(telegramId) };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка deleteUserAdmin:', err.message);
        return { ok: false, message: 'Ошибка удаления пользователя' };
    } finally {
        client.release();
    }
}

export async function getMarketingMetricsAdmin() {
    try {
        const [arrivedRes, registeredRes, d1Res, d3Res, invitersRes] = await Promise.all([
            pool.query('SELECT COUNT(*)::int AS cnt FROM bot_starts'),
            pool.query('SELECT COUNT(*)::int AS cnt FROM users'),
            pool.query(`
                SELECT COUNT(*)::int AS cnt
                FROM users
                WHERE last_seen_at >= created_at + INTERVAL '1 day'
            `),
            pool.query(`
                SELECT COUNT(*)::int AS cnt
                FROM users
                WHERE last_seen_at >= created_at + INTERVAL '3 day'
            `),
            pool.query('SELECT COUNT(*)::int AS cnt FROM users WHERE referrals_count > 0')
        ]);

        return {
            arrived: Number(arrivedRes.rows[0]?.cnt || 0),
            registered: Number(registeredRes.rows[0]?.cnt || 0),
            returnedD1: Number(d1Res.rows[0]?.cnt || 0),
            returnedD3: Number(d3Res.rows[0]?.cnt || 0),
            invitedAtLeastOne: Number(invitersRes.rows[0]?.cnt || 0)
        };
    } catch (err) {
        console.error('Ошибка getMarketingMetricsAdmin:', err.message);
        return null;
    }
}