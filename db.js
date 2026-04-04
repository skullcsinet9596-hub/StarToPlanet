import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Загружаем сертификат Supabase
const certPath = path.join(__dirname, 'prod-ca-2021.crt');
let sslConfig = null;

if (fs.existsSync(certPath)) {
    console.log('✅ SSL сертификат Supabase загружен');
    sslConfig = {
        ca: fs.readFileSync(certPath).toString(),
        rejectUnauthorized: true
    };
} else {
    console.warn('⚠️ SSL сертификат не найден, используем безопасный режим');
    sslConfig = { rejectUnauthorized: true };
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
    connectionTimeoutMillis: 10000
});

export async function checkConnection() {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('✅ Безопасное SSL подключение к Supabase установлено');
        return true;
    } catch (err) {
        console.error('❌ Ошибка подключения к Supabase:', err.message);
        return false;
    }
}

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
            has_moon BOOLEAN DEFAULT FALSE,
            has_earth BOOLEAN DEFAULT FALSE,
            has_sun BOOLEAN DEFAULT FALSE,
            last_active_time BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
        )
    `;
    try {
        await pool.query(query);
        console.log('✅ Таблица users создана');
    } catch (err) {
        console.error('❌ Ошибка создания таблицы:', err.message);
    }
}

export async function getUser(userId) {
    try {
        let res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0) {
            await pool.query('INSERT INTO users (id) VALUES ($1)', [userId]);
            res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        }
        return res.rows[0];
    } catch (err) {
        console.error('Ошибка getUser:', err.message);
        return {
            id: userId,
            name: 'Игрок',
            coins: 0,
            energy: 100,
            max_energy: 100,
            click_power: 1,
            passive_income_level: 0,
            has_moon: false,
            has_earth: false,
            has_sun: false
        };
    }
}

export async function updateUser(userId, data) {
    try {
        const user = await getUser(userId);
        const updated = { ...user, ...data };
        await pool.query(
            `UPDATE users SET 
                name=$2, coins=$3, energy=$4, max_energy=$5,
                click_power=$6, passive_income_level=$7,
                has_moon=$8, has_earth=$9, has_sun=$10, last_active_time=$11
            WHERE id=$1`,
            [userId, updated.name, updated.coins, updated.energy,
             updated.max_energy, updated.click_power, updated.passive_income_level,
             updated.has_moon, updated.has_earth, updated.has_sun, Date.now()]
        );
    } catch (err) {
        console.error('Ошибка updateUser:', err.message);
    }
}

export async function getTopPlayers(limit = 10) {
    try {
        const res = await pool.query(
            'SELECT id, name, coins FROM users ORDER BY coins DESC LIMIT $1',
            [limit]
        );
        return res.rows;
    } catch (err) {
        return [];
    }
}

export async function getPlayerRank(userId) {
    try {
        const res = await pool.query(
            'SELECT COUNT(*) FROM users WHERE coins > (SELECT COALESCE(coins,0) FROM users WHERE id=$1)',
            [userId]
        );
        return parseInt(res.rows[0].count) + 1;
    } catch (err) {
        return 1;
    }
}

export async function getTotalPlayers() {
    try {
        const res = await pool.query('SELECT COUNT(*) FROM users');
        return parseInt(res.rows[0].count);
    } catch (err) {
        return 0;
    }
}