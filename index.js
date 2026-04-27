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

// Доверять прокси (нужно для Railway)
app.set('trust proxy', 1);

// Базовая защита заголовков
//app.use(helmet());

// Ограничение запросов
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Слишком много запросов. Попробуйте позже.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Слишком много попыток. Попробуйте через 15 минут.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' }));

app.use('/api/auth', authLimiter, authRoutes);
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

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
