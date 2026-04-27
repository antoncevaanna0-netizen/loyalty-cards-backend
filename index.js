const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const promotionRoutes = require('./routes/promotions');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS САМЫМ ПЕРВЫМ, до всего
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send('Сервер работает! 🚀');
});

app.get('/api/check-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ message: 'База данных подключена!', time: result.rows[0].now });
    } catch (error) {
        res.status(500).json({ error: 'Нет подключения к базе данных' });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});