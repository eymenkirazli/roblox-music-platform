const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendVerificationEmail = async (email, code, purpose) => {
  const purposeMap = {
    register: {
      subject: 'ROID - E-posta Doğrulama Kodu',
      text: `Doğrulama kodunuz: ${code}\nBu kod 10 dakika boyunca geçerlidir.`,
    },
    email_change: {
      subject: 'ROID - E-posta Değişikliği Doğrulama Kodu',
      text: `Yeni e-posta doğrulama kodunuz: ${code}\nBu kod 10 dakika boyunca geçerlidir.`,
    },
    password_change: {
      subject: 'ROID - Şifre Sıfırlama Kodu',
      text: `Şifre sıfırlama kodunuz: ${code}\nBu kod 10 dakika boyunca geçerlidir.`,
    },
  };

  const config = purposeMap[purpose];
  if (!config) return false;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: config.subject,
      text: config.text,
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

module.exports = { sendVerificationEmail };
