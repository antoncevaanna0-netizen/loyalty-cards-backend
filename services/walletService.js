// backend/services/walletService.js
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

// Создание pass для Apple Wallet
async function createApplePass(cardData, userName) {
    const passId = uuidv4();
    const serialNumber = cardData.card_number.replace(/-/g, '');
    
    // Данные pass
    const passJson = {
        formatVersion: 1,
        passTypeIdentifier: "pass.com.company.loyaltycard",
        serialNumber: serialNumber,
        teamIdentifier: "TEAM123456",
        organizationName: "Компания",
        description: "Карта лояльности",
        foregroundColor: "rgb(255, 255, 255)",
        backgroundColor: "rgb(102, 126, 234)",
        labelColor: "rgb(255, 255, 255)",
        logoText: "Карта лояльности",
        barcode: {
            message: JSON.stringify({
                cardNumber: cardData.card_number,
                userId: cardData.user_id
            }),
            format: "PKBarcodeFormatQR",
            messageEncoding: "iso-8859-1"
        },
        storeCard: {
            primaryFields: [
                {
                    key: "balance",
                    label: "Баланс",
                    value: `${cardData.balance} бонусов`
                }
            ],
            secondaryFields: [
                {
                    key: "cardnumber",
                    label: "Номер карты",
                    value: cardData.card_number
                }
            ],
            auxiliaryFields: [
                {
                    key: "name",
                    label: "Владелец",
                    value: userName
                }
            ]
        }
    };

    // Создаём временную папку
    const tempDir = path.join(__dirname, '../temp', passId);
    fs.mkdirSync(tempDir, { recursive: true });

    // Сохраняем pass.json
    fs.writeFileSync(
        path.join(tempDir, 'pass.json'),
        JSON.stringify(passJson, null, 2)
    );

    // Создаём простую иконку (1x1 пиксель, замени на реальную)
    const iconPath = path.join(tempDir, 'icon.png');
    fs.writeFileSync(iconPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

    // Копируем иконку для retina
    fs.copyFileSync(iconPath, path.join(tempDir, 'icon@2x.png'));

    // Создаём манифест
    const manifest = {
        'pass.json': null,
        'icon.png': null,
        'icon@2x.png': null
    };

    // Создаём pkpass (zip) файл
    const pkpassPath = path.join(tempDir, 'card.pkpass');
    const output = fs.createWriteStream(pkpassPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
        output.on('close', () => {
            resolve(pkpassPath);
        });

        archive.on('error', reject);
        archive.pipe(output);

        // Добавляем файлы
        archive.file(path.join(tempDir, 'pass.json'), { name: 'pass.json' });
        archive.file(path.join(tempDir, 'icon.png'), { name: 'icon.png' });
        archive.file(path.join(tempDir, 'icon@2x.png'), { name: 'icon@2x.png' });
        archive.file(path.join(tempDir, 'pass.json'), { name: 'manifest.json' });
        archive.file(path.join(tempDir, 'pass.json'), { name: 'signature' });

        archive.finalize();
    });
}

// Создание ссылки для Google Wallet (упрощённая версия)
function createGoogleWalletLink(cardData, userName) {
    // Google Wallet использует JWT-токены, но для простоты
    // мы создадим веб-страницу с QR-кодом
    const walletData = {
        cardNumber: cardData.card_number,
        balance: cardData.balance,
        userName: userName
    };
    
    const encodedData = Buffer.from(JSON.stringify(walletData)).toString('base64');
    
    // Возвращаем ссылку на сохранение
    return {
        link: `https://pay.google.com/gp/v/save/${encodedData}`,
        qrData: JSON.stringify(walletData)
    };
}

// Очистка временных файлов
function cleanupTempFiles(passId) {
    const tempDir = path.join(__dirname, '../temp', passId);
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

module.exports = { createApplePass, createGoogleWalletLink, cleanupTempFiles };