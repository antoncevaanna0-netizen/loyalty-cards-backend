// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
    try {
        // Получаем токен из заголовка
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        const token = authHeader.split(' ')[1];
        
        // Проверяем токен
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Недействительный токен' });
    }
}

module.exports = auth;