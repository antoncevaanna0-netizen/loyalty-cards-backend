// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// Вход администратора
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM admins WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Неверный логин или пароль' });
        }

        const admin = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, admin.password_hash);

        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Неверный логин или пароль' });
        }

        const token = jwt.sign(
            { adminId: admin.id, username: admin.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ message: 'Вход выполнен!', token });
    } catch (error) {
        console.error('Ошибка входа админа:', error);
        res.status(500).json({ error: 'Ошибка при входе' });
    }
});

// Получить всех пользователей
router.get('/users', auth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.phone, u.email, u.first_name, u.last_name, u.middle_name, 
                    u.birth_date, u.gender, u.created_at,
                    c.card_number, c.balance, c.id as card_id
             FROM users u
             LEFT JOIN cards c ON u.id = c.user_id
             ORDER BY u.created_at DESC`
        );

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({ error: 'Ошибка при получении пользователей' });
    }
});

// Получить историю бонусов пользователя
router.get('/users/:id/bonuses', auth, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT b.*, c.card_number
             FROM bonuses b
             JOIN cards c ON b.card_id = c.id
             WHERE c.user_id = $1
             ORDER BY b.created_at DESC
             LIMIT 50`,
            [id]
        );

        res.json({ bonuses: result.rows });
    } catch (error) {
        console.error('Ошибка получения бонусов:', error);
        res.status(500).json({ error: 'Ошибка при получении бонусов' });
    }
});

// Начислить бонусы пользователю
router.post('/users/:id/add-bonus', auth, async (req, res) => {
    const { id } = req.params;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Укажите положительное количество бонусов' });
    }

    try {
        const cardResult = await pool.query(
            'SELECT * FROM cards WHERE user_id = $1',
            [id]
        );

        if (cardResult.rows.length === 0) {
            return res.status(404).json({ error: 'У пользователя нет карты' });
        }

        const card = cardResult.rows[0];

        await pool.query(
            'UPDATE cards SET balance = balance + $1 WHERE id = $2',
            [amount, card.id]
        );

        await pool.query(
            `INSERT INTO bonuses (card_id, operation_type, amount, description)
             VALUES ($1, $2, $3, $4)`,
            [card.id, 'accrual', amount, description || 'Начисление администратором']
        );

        res.json({ message: `Начислено ${amount} бонусов`, new_balance: card.balance + amount });
    } catch (error) {
        console.error('Ошибка начисления бонусов:', error);
        res.status(500).json({ error: 'Ошибка при начислении бонусов' });
    }
});

// Списать бонусы у пользователя
router.post('/users/:id/deduct-bonus', auth, async (req, res) => {
    const { id } = req.params;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Укажите положительное количество бонусов' });
    }

    try {
        const cardResult = await pool.query(
            'SELECT * FROM cards WHERE user_id = $1',
            [id]
        );

        if (cardResult.rows.length === 0) {
            return res.status(404).json({ error: 'У пользователя нет карты' });
        }

        const card = cardResult.rows[0];

        if (card.balance < amount) {
            return res.status(400).json({ error: 'Недостаточно бонусов для списания' });
        }

        await pool.query(
            'UPDATE cards SET balance = balance - $1 WHERE id = $2',
            [amount, card.id]
        );

        await pool.query(
            `INSERT INTO bonuses (card_id, operation_type, amount, description)
             VALUES ($1, $2, $3, $4)`,
            [card.id, 'deduction', amount, description || 'Списание администратором']
        );

        res.json({ message: `Списано ${amount} бонусов`, new_balance: card.balance - amount });
    } catch (error) {
        console.error('Ошибка списания бонусов:', error);
        res.status(500).json({ error: 'Ошибка при списании бонусов' });
    }
});

// Получить статистику
router.get('/stats', auth, async (req, res) => {
    try {
        // Основная статистика
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
        const totalCards = await pool.query('SELECT COUNT(*) FROM cards');
        const totalBonuses = await pool.query('SELECT COALESCE(SUM(balance), 0) FROM cards');
        const activePromotions = await pool.query(
            "SELECT COUNT(*) FROM promotions WHERE is_active = true AND end_date >= CURRENT_DATE"
        );

        // Статистика по дням недели
        const byWeekday = await pool.query(`
            SELECT 
                EXTRACT(DOW FROM created_at) as day_of_week,
                COUNT(*) as count
            FROM users 
            WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY day_of_week 
            ORDER BY day_of_week
        `);

        // Статистика по дням (для графика)
        const byDay = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM users 
            WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(created_at) 
            ORDER BY date
        `);

        // Статистика по полу
        const byGender = await pool.query(`
            SELECT 
                COALESCE(gender, 'not_specified') as gender,
                COUNT(*) as count
            FROM users 
            GROUP BY gender
        `);

        // Статистика по возрасту
        const byAge = await pool.query(`
            SELECT 
                CASE 
                    WHEN birth_date IS NULL THEN 'Не указан'
                    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) < 18 THEN 'До 18'
                    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) BETWEEN 18 AND 25 THEN '18-25'
                    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) BETWEEN 26 AND 35 THEN '26-35'
                    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) BETWEEN 36 AND 50 THEN '36-50'
                    ELSE '50+'
                END as age_group,
                COUNT(*) as count
            FROM users 
            GROUP BY age_group
        `);

        // Топ пользователей по бонусам
        const topUsers = await pool.query(`
            SELECT u.first_name, u.last_name, u.email, u.phone, c.balance, c.card_number
            FROM cards c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.balance DESC
            LIMIT 10
        `);

        // Активность за последние 7 дней
        const weeklyActivity = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                operation_type,
                COUNT(*) as count,
                SUM(amount) as total_amount
            FROM bonuses 
            WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(created_at), operation_type
            ORDER BY date DESC
        `);

        // Сумма всех операций
        const totalOperations = await pool.query(`
            SELECT 
                operation_type,
                COUNT(*) as count,
                SUM(amount) as total
            FROM bonuses 
            GROUP BY operation_type
        `);

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalCards: parseInt(totalCards.rows[0].count),
            totalBonuses: parseInt(totalBonuses.rows[0].sum) || 0,
            activePromotions: parseInt(activePromotions.rows[0].count),
            byWeekday: byWeekday.rows,
            byDay: byDay.rows,
            byGender: byGender.rows,
            byAge: byAge.rows,
            topUsers: topUsers.rows,
            weeklyActivity: weeklyActivity.rows,
            totalOperations: totalOperations.rows
        });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
});

// Поиск пользователей
router.get('/users/search', auth, async (req, res) => {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
        return res.status(400).json({ error: 'Введите минимум 2 символа для поиска' });
    }

    try {
        const result = await pool.query(
            `SELECT u.id, u.phone, u.email, u.first_name, u.last_name, u.middle_name,
                    u.birth_date, u.gender, u.created_at,
                    c.card_number, c.balance, c.id as card_id
             FROM users u
             LEFT JOIN cards c ON u.id = c.user_id
             WHERE 
                u.first_name ILIKE $1 OR
                u.last_name ILIKE $1 OR
                u.email ILIKE $1 OR
                u.phone ILIKE $1 OR
                c.card_number ILIKE $1
             ORDER BY u.created_at DESC
             LIMIT 50`,
            [`%${q}%`]
        );

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({ error: 'Ошибка при поиске' });
    }
});

// Экспорт пользователей в JSON (для CSV на фронте)
router.get('/users/export', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id,
                u.first_name as "Имя",
                u.last_name as "Фамилия",
                u.middle_name as "Отчество",
                u.email as "Email",
                u.phone as "Телефон",
                u.gender as "Пол",
                u.birth_date as "Дата рождения",
                COALESCE(c.card_number, 'Нет карты') as "Номер карты",
                COALESCE(c.balance, 0) as "Баланс",
                u.created_at as "Дата регистрации"
            FROM users u
            LEFT JOIN cards c ON u.id = c.user_id
            ORDER BY u.created_at DESC
        `);

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        res.status(500).json({ error: 'Ошибка при экспорте' });
    }
});

module.exports = router;