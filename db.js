import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Создание таблицы, если её нет
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
    await pool.query(query);
    console.log('✅ Таблица users создана/проверена');
}

// Получить пользователя
export async function getUser(userId) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (res.rows.length === 0) {
        await pool.query('INSERT INTO users (id) VALUES ($1)', [userId]);
        return getUser(userId);
    }
    return res.rows[0];
}

// Обновить пользователя
export async function updateUser(userId, data) {
    const user = await getUser(userId);
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
        userId, updatedUser.name, updatedUser.coins, updatedUser.energy,
        updatedUser.max_energy, updatedUser.click_power,
        updatedUser.passive_income_level, updatedUser.click_upgrade_level,
        updatedUser.energy_upgrade_level, updatedUser.has_moon,
        updatedUser.has_earth, updatedUser.has_sun,
        updatedUser.last_active_time, updatedUser.total_clicks
    ]);
}

// Топ игроков
export async function getTopPlayers(limit = 10) {
    const res = await pool.query(
        'SELECT id, name, coins FROM users ORDER BY coins DESC LIMIT $1',
        [limit]
    );
    return res.rows;
}

// Место в рейтинге
export async function getPlayerRank(userId) {
    const res = await pool.query(
        'SELECT COUNT(*) FROM users WHERE coins > (SELECT coins FROM users WHERE id = $1)',
        [userId]
    );
    return parseInt(res.rows[0].count) + 1;
}

// Всего игроков
export async function getTotalPlayers() {
    const res = await pool.query('SELECT COUNT(*) FROM users');
    return parseInt(res.rows[0].count);
}