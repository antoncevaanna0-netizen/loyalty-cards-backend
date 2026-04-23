// backend/routes/promotions.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// Получить все активные акции (для пользователей)
router.get('/', auth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, description, conditions, start_date, end_date 
             FROM promotions 
             WHERE is_active = true 
             AND end_date >= CURRENT_DATE 
             ORDER BY end_date ASC`
        );

        res.json({ promotions: result.rows });
    } catch (error) {
        console.error('Ошибка получения акций:', error);
        res.status(500).json({ error: 'Ошибка при получении акций' });
    }
});

// Получить все акции (для админа)
router.get('/all', auth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM promotions ORDER BY created_at DESC`
        );

        res.json({ promotions: result.rows });
    } catch (error) {
        console.error('Ошибка получения всех акций:', error);
        res.status(500).json({ error: 'Ошибка при получении акций' });
    }
});

// Создать акцию (админ)
router.post('/', auth, async (req, res) => {
    const { title, description, conditions, start_date, end_date } = req.body;

    if (!title || !description) {
        return res.status(400).json({ error: 'Название и описание обязательны' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO promotions (title, description, conditions, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [title, description, conditions || '', start_date, end_date]
        );

        res.status(201).json({
            message: 'Акция создана!',
            promotion: result.rows[0]
        });
    } catch (error) {
        console.error('Ошибка создания акции:', error);
        res.status(500).json({ error: 'Ошибка при создании акции' });
    }
});

// Обновить акцию (админ)
router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { title, description, conditions, start_date, end_date, is_active } = req.body;

    try {
        const result = await pool.query(
            `UPDATE promotions 
             SET title = COALESCE($1, title),
                 description = COALESCE($2, description),
                 conditions = COALESCE($3, conditions),
                 start_date = COALESCE($4, start_date),
                 end_date = COALESCE($5, end_date),
                 is_active = COALESCE($6, is_active)
             WHERE id = $7
             RETURNING *`,
            [title, description, conditions, start_date, end_date, is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Акция не найдена' });
        }

        res.json({
            message: 'Акция обновлена!',
            promotion: result.rows[0]
        });
    } catch (error) {
        console.error('Ошибка обновления акции:', error);
        res.status(500).json({ error: 'Ошибка при обновлении акции' });
    }
});

// Удалить акцию (админ)
router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM promotions WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Акция не найдена' });
        }

        res.json({ message: 'Акция удалена!' });
    } catch (error) {
        console.error('Ошибка удаления акции:', error);
        res.status(500).json({ error: 'Ошибка при удалении акции' });
    }
});

module.exports = router;