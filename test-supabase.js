require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres.npyprxwicosukliybwgs',
    password: 'RfQp90Sm82IcSKJ5',
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()')
    .then(res => {
        console.log('✅ Подключение успешно!', res.rows[0]);
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Ошибка:', err.message);
        process.exit(1);
    });