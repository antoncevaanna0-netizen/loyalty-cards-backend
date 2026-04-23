// backend/routes/cards.js
const path = require('path'); 
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// Генерация уникального номера карты
// Генерация уникального номера карты
function generateCardNumber() {
    // Формат: LC-XXXX-XXXX (LC = Loyalty Card) — 13 символов
    const chars = '0123456789';
    let number = 'LC-';
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 4; j++) {
            number += chars[Math.floor(Math.random() * chars.length)];
        }
        if (i < 1) number += '-';
    }
    return number;
}

// Создание новой карты
router.post('/create', auth, async (req, res) => {
    const userId = req.user.userId;

    try {
        // Проверяем, есть ли уже карта у пользователя
        const existing = await pool.query(
            'SELECT * FROM cards WHERE user_id = $1',
            [userId]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ 
                error: 'У вас уже есть карта лояльности',
                card: existing.rows[0]
            });
        }

        // Генерируем уникальный номер карты
        let cardNumber;
        let isUnique = false;
        
        while (!isUnique) {
            cardNumber = generateCardNumber();
            const check = await pool.query(
                'SELECT id FROM cards WHERE card_number = $1',
                [cardNumber]
            );
            if (check.rows.length === 0) isUnique = true;
        }

        // Создаём карту
        const result = await pool.query(
            `INSERT INTO cards (user_id, card_number, balance)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, cardNumber, 100] // Приветственные 100 бонусов
        );

        const card = result.rows[0];

        // Генерируем QR-код с данными карты
        const qrData = JSON.stringify({
            cardNumber: card.card_number,
            userId: userId,
            type: 'loyalty_card'
        });

        const qrCode = await QRCode.toDataURL(qrData);

        // Начисляем приветственные бонусы
        await pool.query(
            `INSERT INTO bonuses (card_id, operation_type, amount, description)
             VALUES ($1, $2, $3, $4)`,
            [card.id, 'accrual', 100, 'Приветственные бонусы']
        );

        res.status(201).json({
            message: 'Карта успешно создана!',
            card: {
                id: card.id,
                card_number: card.card_number,
                balance: card.balance,
                qr_code: qrCode,
                created_at: card.created_at
            }
        });

    } catch (error) {
        console.error('Ошибка создания карты:', error);
        res.status(500).json({ error: 'Ошибка при создании карты' });
    }
});

// Получение информации о карте пользователя
router.get('/my-card', auth, async (req, res) => {
    const userId = req.user.userId;

    try {
        const result = await pool.query(
            'SELECT * FROM cards WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Карта не найдена' });
        }

        const card = result.rows[0];

        // Получаем историю операций
        const bonuses = await pool.query(
            'SELECT * FROM bonuses WHERE card_id = $1 ORDER BY created_at DESC LIMIT 10',
            [card.id]
        );

        // Генерируем QR-код
        const qrData = JSON.stringify({
            cardNumber: card.card_number,
            userId: userId,
            type: 'loyalty_card'
        });
        const qrCode = await QRCode.toDataURL(qrData);

        res.json({
            card: {
                id: card.id,
                card_number: card.card_number,
                balance: card.balance,
                qr_code: qrCode,
                created_at: card.created_at
            },
            bonuses: bonuses.rows
        });

    } catch (error) {
        console.error('Ошибка получения карты:', error);
        res.status(500).json({ error: 'Ошибка при получении карты' });
    }
});

// Начисление бонусов (для администратора или автоматическое)
router.post('/add-bonus', auth, async (req, res) => {
    const { amount, description } = req.body;
    const userId = req.user.userId;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Укажите положительное количество бонусов' });
    }

    try {
        // Получаем карту пользователя
        const cardResult = await pool.query(
            'SELECT * FROM cards WHERE user_id = $1',
            [userId]
        );

        if (cardResult.rows.length === 0) {
            return res.status(404).json({ error: 'Карта не найдена' });
        }

        const card = cardResult.rows[0];

        // Обновляем баланс
        await pool.query(
            'UPDATE cards SET balance = balance + $1 WHERE id = $2',
            [amount, card.id]
        );

        // Записываем операцию
        await pool.query(
            `INSERT INTO bonuses (card_id, operation_type, amount, description)
             VALUES ($1, $2, $3, $4)`,
            [card.id, 'accrual', amount, description || 'Начисление бонусов']
        );

        res.json({
            message: `Начислено ${amount} бонусов`,
            new_balance: card.balance + amount
        });

    } catch (error) {
        console.error('Ошибка начисления бонусов:', error);
        res.status(500).json({ error: 'Ошибка при начислении бонусов' });
    }
});

module.exports = router;


const walletService = require('../services/walletService');
const fs = require('fs');

// Получить Apple Wallet pass
router.get('/apple-wallet', auth, async (req, res) => {
    const userId = req.user.userId;

    try {
        const cardResult = await pool.query(
            'SELECT c.*, u.first_name, u.last_name FROM cards c JOIN users u ON c.user_id = u.id WHERE c.user_id = $1',
            [userId]
        );

        if (cardResult.rows.length === 0) {
            return res.status(404).json({ error: 'Карта не найдена' });
        }

        const card = cardResult.rows[0];
        const userName = `${card.first_name} ${card.last_name}`;

        const pkpassPath = await walletService.createApplePass(card, userName);

        res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
        res.setHeader('Content-Disposition', `attachment; filename="loyalty-card.pkpass"`);

        const fileStream = fs.createReadStream(pkpassPath);
        fileStream.pipe(res);

        // Очищаем временные файлы после отправки
        fileStream.on('end', () => {
            const passId = path.basename(path.dirname(pkpassPath));
            walletService.cleanupTempFiles(passId);
        });

    } catch (error) {
        console.error('Ошибка создания Apple Wallet pass:', error);
        res.status(500).json({ error: 'Ошибка создания pass для Apple Wallet' });
    }
});

// Получить ссылку для Google Wallet
router.get('/google-wallet', auth, async (req, res) => {
    const userId = req.user.userId;

    try {
        const cardResult = await pool.query(
            'SELECT c.*, u.first_name, u.last_name FROM cards c JOIN users u ON c.user_id = u.id WHERE c.user_id = $1',
            [userId]
        );

        if (cardResult.rows.length === 0) {
            return res.status(404).json({ error: 'Карта не найдена' });
        }

        const card = cardResult.rows[0];
        const userName = `${card.first_name} ${card.last_name}`;

        const walletData = walletService.createGoogleWalletLink(card, userName);

        res.json(walletData);

    } catch (error) {
        console.error('Ошибка создания Google Wallet ссылки:', error);
        res.status(500).json({ error: 'Ошибка создания ссылки для Google Wallet' });
    }
});