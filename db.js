import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
        sslmode: 'verify-full'
    },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
});

// Создание таблицы
export async function initDB() {
    const query = `
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            name VARCHAR(255) DEFAULT 'Игрок',
            coins BIGINT DEFAULT 0,
            energy INT DEFAULT 100,
            max_energy INT DEFAULT 100,
            click_power INT DEFAULT 1,
            passive_income_level INT DEFAULT 0,
            click_upgrade_level INT DEFAULT 1,
            energy_upgrade_level INT DEFAULT 1,
            has_moon BOOLEAN DEFAULT FALSE,
            has_earth BOOLEAN DEFAULT FALSE,
            has_sun BOOLEAN DEFAULT FALSE,
            last_active_time BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
            total_clicks BIGINT DEFAULT 0
        );
    `;
    try {
        await pool.query(query);
        console.log('✅ Таблица users создана/проверена');
        return true;
    } catch (err) {
        console.error('❌ Ошибка создания таблицы:', err.message);
        return false;
    }
}

// Получить пользователя (всегда возвращает объект)
export async function getUser(userId) {
    try {
        let res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (res.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (id, name, last_active_time) VALUES ($1, $2, $3)',
                [userId, 'Игрок', Date.now()]
            );
            res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        }
        
        if (res.rows.length === 0) {
            return {
                id: userId,
                name: 'Игрок',
                coins: 0,
                energy: 100,
                max_energy: 100,
                click_power: 1,
                passive_income_level: 0,
                click_upgrade_level: 1,
                energy_upgrade_level: 1,
                has_moon: false,
                has_earth: false,
                has_sun: false,
                last_active_time: Date.now(),
                total_clicks: 0
            };
        }
        
        return res.rows[0];
    } catch (err) {
        console.error('❌ Ошибка getUser:', err.message);
        return {
            id: userId,
            name: 'Игрок',
            coins: 0,
            energy: 100,
            max_energy: 100,
            click_power: 1,
            passive_income_level: 0,
            click_upgrade_level: 1,
            energy_upgrade_level: 1,
            has_moon: false,
            has_earth: false,
            has_sun: false,
            last_active_time: Date.now(),
            total_clicks: 0
        };
    }
}

// Обновить пользователя
export async function updateUser(userId, data) {
    try {
        const user = await getUser(userId);
        if (!user) return false;
        
        const updatedUser = { ...user, ...data };
        const query = `
            UPDATE users SET
                name = $2, coins = $3, energy = $4, max_energy = $5,
                click_power = $6, passive_income_level = $7,
                click_upgrade_level = $8, energy_upgrade_level = $9,
                has_moon = $10, has_earth = $11, has_sun = $12,
                last_active_time = $13, total_clicks = $14
            WHERE id = $1
        `;
        await pool.query(query, [
            userId, 
            updatedUser.name || 'Игрок', 
            updatedUser.coins !== undefined ? updatedUser.coins : 0,
            updatedUser.energy !== undefined ? updatedUser.energy : 100,
            updatedUser.max_energy !== undefined ? updatedUser.max_energy : 100,
            updatedUser.click_power !== undefined ? updatedUser.click_power : 1,
            updatedUser.passive_income_level !== undefined ? updatedUser.passive_income_level : 0,
            updatedUser.click_upgrade_level !== undefined ? updatedUser.click_upgrade_level : 1,
            updatedUser.energy_upgrade_level !== undefined ? updatedUser.energy_upgrade_level : 1,
            updatedUser.has_moon || false,
            updatedUser.has_earth || false,
            updatedUser.has_sun || false,
            updatedUser.last_active_time || Date.now(),
            updatedUser.total_clicks || 0
        ]);
        return true;
    } catch (err) {
        console.error('❌ Ошибка updateUser:', err.message);
        return false;
    }
}

// Топ игроков
export async function getTopPlayers(limit = 10) {
    try {
        const res = await pool.query(
            'SELECT id, name, coins FROM users ORDER BY coins DESC LIMIT $1',
            [limit]
        );
        return res.rows;
    } catch (err) {
        console.error('❌ Ошибка getTopPlayers:', err.message);
        return [];
    }
}

// Место в рейтинге
export async function getPlayerRank(userId) {
    try {
        const res = await pool.query(
            'SELECT COUNT(*) FROM users WHERE coins > (SELECT COALESCE(coins, 0) FROM users WHERE id = $1)',
            [userId]
        );
        return parseInt(res.rows[0].count) + 1;
    } catch (err) {
        console.error('❌ Ошибка getPlayerRank:', err.message);
        return 1;
    }
}

// Всего игроков
export async function getTotalPlayers() {
    try {
        const res = await pool.query('SELECT COUNT(*) FROM users');
        return parseInt(res.rows[0].count);
    } catch (err) {
        console.error('❌ Ошибка getTotalPlayers:', err.message);
        return 0;
    }
}