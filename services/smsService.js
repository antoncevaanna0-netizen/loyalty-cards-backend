// backend/services/smsService.js
const https = require('https');

async function sendVerificationSMS(phone, code) {
    // Очищаем номер от лишних символов
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
    
    const message = `Ваш код подтверждения: ${code}`;
    const apiKey = process.env.SMS_API_KEY;
    
    // Формируем URL для SMS.ru
    const url = `https://sms.ru/sms/send?api_id=${apiKey}&to=${cleanPhone}&msg=${encodeURIComponent(message)}&json=1`;
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    
                    if (response.status === 'OK') {
                        console.log(`SMS отправлено на ${phone}`);
                        resolve(true);
                    } else {
                        console.error('Ошибка SMS:', response);
                        // Всё равно продолжаем — код покажем в консоли
                        resolve(false);
                    }
                } catch (error) {
                    console.error('Ошибка парсинга ответа SMS:', error);
                    resolve(false);
                }
            });
        }).on('error', (error) => {
            console.error('Ошибка отправки SMS:', error);
            resolve(false);
        });
    });
}

module.exports = { sendVerificationSMS };