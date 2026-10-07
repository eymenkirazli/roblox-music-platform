const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { sendVerificationEmail } = require('../utils/email');

const router = express.Router();

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Giriş gerekli.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'roid_secret_key');

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.banned) {
      return res.status(403).json({ message: 'Hesabınız erişime kapalı.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token geçersiz.' });
  }
};

router.get('/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
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

    const musicCount = await prisma.music.count({
      where: { addedById: user.id, status: 'approved' },
    });

    const followers = await prisma.follow.count({ where: { followingId: user.id } });
    const following = await prisma.follow.count({ where: { followerId: user.id } });

    let isFollowing = false;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'roid_secret_key');
        const currentUser = await prisma.user.findUnique({ where: { id: decoded.id } });

        if (currentUser) {
          const followRecord = await prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentUser.id,
                followingId: user.id,
              },
            },
          });
          isFollowing = !!followRecord;
        }
      } catch (error) {
        isFollowing = false;
      }
    }

    res.json({ user, musicCount, followers, following, isFollowing });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Profil yüklenemedi.' });
  }
});

router.get('/:userId/musics', async (req, res) => {
  try {
    const musics = await prisma.music.findMany({
      where: {
        addedById: req.params.userId,
        status: 'approved',
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ musics });
  } catch (error) {
    console.error('User musics error:', error);
    res.status(500).json({ message: 'Müzik listesi yüklenemedi.' });
  }
});

router.post('/:userId/follow', authMiddleware, async (req, res) => {
  try {
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!targetUser) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    if (req.user.id === req.params.userId) {
      return res.status(400).json({ message: 'Kendinizi takip edemezsiniz.' });
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user.id,
          followingId: req.params.userId,
        },
      },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      return res.json({ message: 'Takip bırakıldı.', isFollowing: false });
    }

    await prisma.follow.create({
      data: {
        followerId: req.user.id,
        followingId: req.params.userId,
      },
    });

    res.json({ message: 'Takip başladı.', isFollowing: true });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ message: 'İşlem başarısız.' });
  }
});

router.put('/edit/profile', authMiddleware, async (req, res) => {
  try {
    const { bio, theme } = req.body;

    if (bio && bio.length > 220) {
      return res.status(400).json({ message: 'Bio 220 karakterden fazla olamaz.' });
    }

    if (theme && !['dark', 'midnight', 'neon'].includes(theme)) {
      return res.status(400).json({ message: 'Geçersiz tema.' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        bio: bio !== undefined ? bio : req.user.bio,
        theme: theme || req.user.theme,
      },
    });

    res.json({ message: 'Profil güncellendi.', user });
  } catch (error) {
    console.error('Edit profile error:', error);
    res.status(500).json({ message: 'Profil güncellenemedi.' });
  }
});

router.post('/change-email/request', authMiddleware, async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({ message: 'Yeni e-posta gerekli.' });
    }

    const normalizedNewEmail = String(newEmail).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedNewEmail } });

    if (existing) {
      return res.status(409).json({ message: 'Bu e-posta zaten kullanılıyor.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.verificationCode.deleteMany({
      where: { userId: req.user.id, purpose: 'email_change' },
    });

    await prisma.verificationCode.create({
      data: {
        userId: req.user.id,
        code,
        purpose: 'email_change',
        email: normalizedNewEmail,
        expiresAt,
      },
    });

    await sendVerificationEmail(normalizedNewEmail, code, 'email_change');

    res.json({ message: 'Doğrulama kodu yeni e-posta adresine gönderildi.' });
  } catch (error) {
    console.error('Change email request error:', error);
    res.status(500).json({ message: 'İstek başarısız.' });
  }
});

router.post('/change-email/verify', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;

    const verification = await prisma.verificationCode.findFirst({
      where: { userId: req.user.id, purpose: 'email_change' },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification || verification.code !== code) {
      return res.status(400).json({ message: 'Kod yanlış.' });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: 'Kod süresi doldu.' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { email: verification.email },
    });

    await prisma.verificationCode.deleteMany({
      where: { userId: req.user.id, purpose: 'email_change' },
    });

    res.json({ message: 'E-posta değiştirildi.', user });
  } catch (error) {
    console.error('Change email verify error:', error);
    res.status(500).json({ message: 'İşlem başarısız.' });
  }
});

router.post('/change-password/request', authMiddleware, async (req, res) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.verificationCode.deleteMany({
      where: { userId: req.user.id, purpose: 'password_change' },
    });

    await prisma.verificationCode.create({
      data: {
        userId: req.user.id,
        code,
        purpose: 'password_change',
        email: req.user.email,
        expiresAt,
      },
    });

    await sendVerificationEmail(req.user.email, code, 'password_change');

    res.json({ message: 'Doğrulama kodu e-posta adresinize gönderildi.' });
  } catch (error) {
    console.error('Password request error:', error);
    res.status(500).json({ message: 'İstek başarısız.' });
  }
});

router.post('/change-password/verify', authMiddleware, async (req, res) => {
  try {
    const { code, newPassword } = req.body;

    if (!code || !newPassword) {
      return res.status(400).json({ message: 'Kod ve yeni şifre gerekli.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const verification = await prisma.verificationCode.findFirst({
      where: { userId: req.user.id, purpose: 'password_change' },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification || verification.code !== code) {
      return res.status(400).json({ message: 'Kod yanlış.' });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: 'Kod süresi doldu.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    await prisma.verificationCode.deleteMany({
      where: { userId: req.user.id, purpose: 'password_change' },
    });

    res.json({ message: 'Şifre değiştirildi.' });
  } catch (error) {
    console.error('Password verify error:', error);
    res.status(500).json({ message: 'İşlem başarısız.' });
  }
});

module.exports = router;
