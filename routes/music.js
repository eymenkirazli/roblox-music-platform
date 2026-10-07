const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { sendVerificationEmail } = require('../utils/email');

const router = express.Router();

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_SECRET || 'roid_secret_key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const createVerificationCode = async (user, purpose, email) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.verificationCode.deleteMany({
    where: { userId: user.id, purpose, email: email.toLowerCase() },
  });

  await prisma.verificationCode.create({
    data: {
      userId: user.id,
      code,
      purpose,
      email: email.toLowerCase(),
      expiresAt,
    },
  });

  await sendVerificationEmail(email, code, purpose);
  return code;
};

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Tüm alanlar zorunludur.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsername = String(username).trim();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
      },
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Bu e-posta veya kullanıcı adı kullanılmaktadır.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        password: hashedPassword,
        isAdmin: normalizedEmail === (process.env.ADMIN_EMAIL || 'admin@roid.local').toLowerCase(),
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    await createVerificationCode({ id: user.id }, 'register', user.email);

    res.status(201).json({
      message: 'Kayıt başarılı. E-posta adresinize doğrulama kodu gönderildi.',
      user,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Kayıt sırasında hata oluştu.' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'E-posta ve kod gerekli.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const verification = await prisma.verificationCode.findFirst({
      where: { userId: user.id, email: normalizedEmail },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification || verification.code !== code) {
      return res.status(400).json({ message: 'Kod yanlış veya bulunamadı.' });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: 'Kod süresi doldu.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    await prisma.verificationCode.deleteMany({ where: { userId: user.id } });

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        email: true,
        isVerified: true,
        isAdmin: true,
        theme: true,
      },
    });

    const token = generateToken(updatedUser);

    res.json({
      message: 'E-posta doğrulandı.',
      token,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ message: 'Doğrulama sırasında hata.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'E-posta ve şifre gerekli.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({ message: 'Kullanıcı bulunamadı.' });
    }

    if (user.banned) {
      return res.status(403).json({ message: 'Hesabınız banlanmıştır.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Şifre yanlış.' });
    }

    if (!user.isVerified) {
      await createVerificationCode(user, 'register', user.email);
      return res.status(403).json({ message: 'E-posta doğrulanmadı. Yeni kod gönderildi.' });
    }

    const token = generateToken(user);

    res.json({
      message: 'Giriş başarılı.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.isVerified,
        isAdmin: user.isAdmin,
        theme: user.theme,
        isBlueVerified: user.isBlueVerified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Giriş sırasında hata.' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token gerekli.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'roid_secret_key');

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        isVerified: true,
        isAdmin: true,
        isBlueVerified: true,
        banned: true,
        theme: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ message: 'Token geçersiz.' });
  }
});

module.exports = router;
