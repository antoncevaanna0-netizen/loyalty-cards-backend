// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { sendVerificationEmail } = require('../services/emailService');
const { sendVerificationSMS } = require('../services/smsService');
const https = require('https');

// Временное хранилище кодов и попыток
const verificationCodes = new Map();
const loginAttempts = new Map(); // Защита от перебора паролей

// Очистка старых данных каждые 5 минут
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of verificationCodes) {
        if (now > value.expiresAt) verificationCodes.delete(key);
    }
    for (const [key, value] of loginAttempts) {
        if (now > value.blockUntil) loginAttempts.delete(key);
    }
}, 5 * 60 * 1000);

// Проверка hCaptcha
async function verifyCaptcha(token) {
    return new Promise((resolve) => {
        const data = `response=${token}&secret=${process.env.HCAPTCHA_SECRET}`;
        
        const options = {
            hostname: 'hcaptcha.com',
            path: '/siteverify',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    resolve(result.success);
                } catch {
                    resolve(false);
                }
            });
        });

        req.on('error', () => resolve(false));
        req.write(data);
        req.end();
    });
}

// Шаг 1: Запрос кода подтверждения
router.post('/request-code', [
    body('contact').notEmpty().withMessage('Введите телефон или email'),
    body('captchaToken').notEmpty().withMessage('Подтвердите, что вы не робот'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { contact, captchaToken } = req.body;

    // Проверяем CAPTCHA
    const isCaptchaValid = await verifyCaptcha(captchaToken);
    if (!isCaptchaValid) {
        return res.status(400).json({ error: 'CAPTCHA не пройдена. Попробуйте снова.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log(`\n========== НОВЫЙ КОД ==========`);
    console.log(`Контакт: ${contact}`);
    console.log(`Код: ${code}`);
    console.log(`================================\n`);

    verificationCodes.set(contact, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000
    });

    const isEmail = contact.includes('@');

    try {
        if (isEmail) {
            await sendVerificationEmail(contact, code);
            console.log(`✅ Email отправлен на ${contact}`);
        } else {
            const smsSent = await sendVerificationSMS(contact, code);
            if (smsSent) {
                console.log(`✅ SMS отправлено на ${contact}`);
            } else {
                console.log(`⚠️ Не удалось отправить SMS на ${contact}`);
            }
        }

        res.json({
            message: `Код подтверждения отправлен на ${isEmail ? 'email' : 'телефон'}`,
            testCode: code
        });

    } catch (error) {
        console.error('Ошибка отправки:', error);
        res.json({
            message: `Не удалось отправить код, используйте проверочный код`,
            testCode: code
        });
    }
});

// Шаг 2: Проверка кода и создание аккаунта
router.post('/verify-code', [
    body('contact').notEmpty().withMessage('Введите телефон или email'),
    body('code').notEmpty().withMessage('Введите код подтверждения'),
    body('first_name').notEmpty().withMessage('Введите имя').isLength({ max: 50 }),
    body('last_name').notEmpty().withMessage('Введите фамилию').isLength({ max: 50 }),
    body('password').isLength({ min: 6, max: 100 }).withMessage('Пароль от 6 до 100 символов'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { contact, code, first_name, last_name, middle_name, birth_date, gender, password } = req.body;

    const savedData = verificationCodes.get(contact);
    
    if (!savedData) {
        return res.status(400).json({ error: 'Код не был запрошен. Запросите код заново.' });
    }

    if (Date.now() > savedData.expiresAt) {
        verificationCodes.delete(contact);
        return res.status(400).json({ error: 'Срок действия кода истёк. Запросите новый код.' });
    }

    if (savedData.code !== code) {
        return res.status(400).json({ error: 'Неверный код. Проверьте код и попробуйте снова.' });
    }

    const isEmail = contact.includes('@');
    
    const existingQuery = isEmail
        ? 'SELECT id FROM users WHERE email = $1'
        : 'SELECT id FROM users WHERE phone = $1';
    
    const existing = await pool.query(existingQuery, [contact]);
    if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Этот контакт уже зарегистрирован' });
    }

    try {
        const saltRounds = 12; // Увеличили сложность хеширования
        const password_hash = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            `INSERT INTO users (phone, email, first_name, last_name, middle_name, birth_date, gender, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, first_name, last_name, phone, email`,
            [
                isEmail ? null : contact,
                isEmail ? contact : null,
                first_name,
                last_name,
                middle_name || null,
                birth_date || null,
                gender || null,
                password_hash
            ]
        );

        const user = result.rows[0];
        verificationCodes.delete(contact);

        const token = jwt.sign(
            { userId: user.id, contact: isEmail ? user.email : user.phone },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        console.log(`✅ Пользователь создан: ${user.first_name} ${user.last_name}\n`);

        res.status(201).json({
            message: 'Регистрация успешна!',
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                contact: isEmail ? user.email : user.phone
            }
        });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка при регистрации' });
    }
});

// Шаг 3: Вход по паролю (с защитой от брутфорса)
router.post('/login', [
    body('contact').notEmpty().withMessage('Введите телефон или email'),
    body('password').notEmpty().withMessage('Введите пароль'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { contact, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // Проверяем блокировку
    const attemptData = loginAttempts.get(ip);
    if (attemptData && Date.now() < attemptData.blockUntil) {
        const minutesLeft = Math.ceil((attemptData.blockUntil - Date.now()) / 60000);
        return res.status(429).json({ 
            error: `Слишком много попыток. Попробуйте через ${minutesLeft} мин.` 
        });
    }

    const isEmail = contact.includes('@');

    try {
        const query = isEmail
            ? 'SELECT * FROM users WHERE email = $1'
            : 'SELECT * FROM users WHERE phone = $1';
        
        const result = await pool.query(query, [contact]);
        
        if (result.rows.length === 0) {
            // Засчитываем неудачную попытку
            trackFailedAttempt(ip);
            return res.status(400).json({ error: 'Неверный логин или пароль' });
        }

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            trackFailedAttempt(ip);
            return res.status(400).json({ error: 'Неверный логин или пароль' });
        }

        // Успешный вход — сбрасываем попытки
        loginAttempts.delete(ip);

        const token = jwt.sign(
            { userId: user.id, contact: isEmail ? user.email : user.phone },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Вход выполнен успешно!',
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                contact: isEmail ? user.email : user.phone
            }
        });

    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка при входе' });
    }
});

// Отслеживание неудачных попыток входа
function trackFailedAttempt(ip) {
    const now = Date.now();
    const data = loginAttempts.get(ip) || { count: 0, blockUntil: 0 };

    data.count += 1;

    if (data.count >= 5) {
        data.blockUntil = now + 15 * 60 * 1000; // Блокировка на 15 минут
        console.log(`🔒 IP ${ip} заблокирован на 15 минут (${data.count} попыток)`);
    } else {
        console.log(`⚠️ Неудачная попытка входа с IP ${ip} (${data.count}/5)`);
    }

    loginAttempts.set(ip, data);
}

module.exports = router;