// backend/index.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const promotionRoutes = require('./routes/promotions');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// 🔒 Базовая защита заголовков
app.use(helmet());

// 🔒 Ограничение запросов (защита от DDoS и брутфорса)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов с одного IP
    message: { error: 'Слишком много запросов. Попробуйте позже.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Более строгое ограничение для авторизации
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 10, // максимум 10 попыток
    message: { error: 'Слишком много попыток. Попробуйте через 15 минут.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' })); // Ограничение размера запроса

// Подключаем маршруты
app.use('/api/auth', authLimiter, authRoutes); // Строгий лимит для авторизации
app.use('/api/cards', cardRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send('Сервер работает! 🚀');
});

app.get('/api/check-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            message: 'База данных подключена!',
            time: result.rows[0].now
        });
    } catch (error) {
        console.error('Ошибка подключения к БД:', error.message);
        res.status(500).json({ error: 'Нет подключения к базе данных' });
    }
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
    console.log(`🔒 Сервер запущен на порту ${PORT} (безопасный режим)`);
});