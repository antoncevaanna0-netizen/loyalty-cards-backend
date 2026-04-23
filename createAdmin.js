// backend/createAdmin.js
const bcrypt = require('bcryptjs');
const pool = require('./db/pool');

async function createAdmin() {
    const username = 'admin';
    const password = 'admin123';
    
    const password_hash = await bcrypt.hash(password, 10);
    
    try {
        // Удаляем старого админа если есть
        await pool.query('DELETE FROM admins WHERE username = $1', [username]);
        
        // Создаём нового
        await pool.query(
            'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
            [username, password_hash]
        );
        
        console.log('Администратор создан!');
        console.log(`Логин: ${username}`);
        console.log(`Пароль: ${password}`);
        console.log(`Хеш: ${password_hash}`);
    } catch (error) {
        console.error('Ошибка:', error);
    } finally {
        process.exit();
    }
}

createAdmin();