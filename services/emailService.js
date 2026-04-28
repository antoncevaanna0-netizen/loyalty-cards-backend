const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendVerificationEmail(toEmail, code) {
    const msg = {
        to: toEmail,
        from: process.env.EMAIL_USER,
        subject: 'Код подтверждения регистрации',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0;">Карты лояльности</h1>
                </div>
                <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #333;">Подтверждение регистрации</h2>
                    <p style="color: #666; font-size: 16px;">Ваш код подтверждения:</p>
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea;">${code}</span>
                    </div>
                    <p style="color: #999; font-size: 14px;">Код действителен в течение 10 минут.</p>
                </div>
            </div>
        `
    };

    await sgMail.send(msg);
}

module.exports = { sendVerificationEmail };