const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Music = require('../models/Music');
const Follow = require('../models/Follow');
const VerificationCode = require('../models/VerificationCode');
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

    const user = await User.findById(decoded.id);
    if (!user || user.banned) {
      return res.status(403).json({ message: 'Hesabınız erişime kapalı.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token geçersiz.' });
  }
};

// Kullanıcı profilini getir
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const musicCount = await Music.countDocuments({ addedBy: user._id, status: 'approved' });
    const followers = await Follow.countDocuments({ following: user._id });
    const following = await Follow.countDocuments({ follower: user._id });

    let isFollowing = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'roid_secret_key');
        const currentUser = await User.findById(decoded.id);

        if (currentUser) {
          const followRecord = await Follow.findOne({
            follower: currentUser._id,
            following: user._id,
          });

          isFollowing = !!followRecord;
        }
      } catch (error) {
        isFollowing = false;
      }
    }

    res.json({
      user,
      musicCount,
      followers,
      following,
      isFollowing,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Profil yüklenemedi.' });
  }
});

// Kullanıcının müziklerini getir
router.get('/:userId/musics', async (req, res) => {
  try {
    const musics = await Music.find({
      addedBy: req.params.userId,
      status: 'approved',
    }).sort({ createdAt: -1 });

    res.json({ musics });
  } catch (error) {
    console.error('Get user musics error:', error);
    res.status(500).json({ message: 'Müzik listesi yüklenemedi.' });
  }
});

// Kullanıcıyı takip etme/bırakma
router.post('/:userId/follow', authMiddleware, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    if (req.user._id.toString() === req.params.userId) {
      return res.status(400).json({ message: 'Kendinizi takip edemezsiniz.' });
    }

    const existing = await Follow.findOne({
      follower: req.user._id,
      following: req.params.userId,
    });

    if (existing) {
      await Follow.deleteOne({ _id: existing._id });
      return res.json({ message: 'Takip bırakıldı.', isFollowing: false });
    }

    await Follow.create({
      follower: req.user._id,
      following: req.params.userId,
    });

    res.json({ message: 'Takip başladı.', isFollowing: true });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ message: 'İşlem başarısız.' });
  }
});

// Profil düzenle (bio ve tema)
router.put('/edit/profile', authMiddleware, async (req, res) => {
  try {
    const { bio, theme } = req.body;

    if (bio && bio.length > 220) {
      return res.status(400).json({ message: 'Bio 220 karakterden fazla olamaz.' });
    }

    if (theme && !['dark', 'midnight', 'neon'].includes(theme)) {
      return res.status(400).json({ message: 'Geçersiz tema.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        bio: bio !== undefined ? bio : req.user.bio,
        theme: theme || req.user.theme,
      },
      { new: true }
    );

    res.json({ message: 'Profil güncellendi.', user });
  } catch (error) {
    console.error('Edit profile error:', error);
    res.status(500).json({ message: 'Profil güncellenemedi.' });
  }
});

// E-posta değişim isteği
router.post('/change-email/request', authMiddleware, async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({ message: 'Yeni e-posta gerekli.' });
    }

    const existing = await User.findOne({ email: newEmail.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'Bu e-posta zaten kullanılıyor.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await VerificationCode.deleteMany({
      userId: req.user._id,
      purpose: 'email_change',
    });

    await VerificationCode.create({
      userId: req.user._id,
      code,
      purpose: 'email_change',
      email: newEmail.toLowerCase(),
      expiresAt,
    });

    await sendVerificationEmail(newEmail, code, 'email_change');

    res.json({ message: 'Doğrulama kodu yeni e-posta adresine gönderildi.' });
  } catch (error) {
    console.error('Change email request error:', error);
    res.status(500).json({ message: 'İstek başarısız.' });
  }
});

// E-posta değişimi doğrula
router.post('/change-email/verify', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;

    const verification = await VerificationCode.findOne({
      userId: req.user._id,
      purpose: 'email_change',
    }).sort({ createdAt: -1 });

    if (!verification || verification.code !== code) {
      return res.status(400).json({ message: 'Kod yanlış.' });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: 'Kod süresi doldu.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { email: verification.email },
      { new: true }
    );

    await VerificationCode.deleteMany({ userId: req.user._id, purpose: 'email_change' });

    res.json({ message: 'E-posta değiştirildi.', user });
  } catch (error) {
    console.error('Change email verify error:', error);
    res.status(500).json({ message: 'İşlem başarısız.' });
  }
});

// Şifre değişim isteği
router.post('/change-password/request', authMiddleware, async (req, res) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await VerificationCode.deleteMany({
      userId: req.user._id,
      purpose: 'password_change',
    });

    await VerificationCode.create({
      userId: req.user._id,
      code,
      purpose: 'password_change',
      email: req.user.email,
      expiresAt,
    });

    await sendVerificationEmail(req.user.email, code, 'password_change');

    res.json({ message: 'Doğrulama kodu e-posta adresinize gönderildi.' });
  } catch (error) {
    console.error('Password request error:', error);
    res.status(500).json({ message: 'İstek başarısız.' });
  }
});

// Şifre değişimi doğrula
router.post('/change-password/verify', authMiddleware, async (req, res) => {
  try {
    const { code, newPassword } = req.body;

    if (!code || !newPassword) {
      return res.status(400).json({ message: 'Kod ve yeni şifre gerekli.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const verification = await VerificationCode.findOne({
      userId: req.user._id,
      purpose: 'password_change',
    }).sort({ createdAt: -1 });

    if (!verification || verification.code !== code) {
      return res.status(400).json({ message: 'Kod yanlış.' });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: 'Kod süresi doldu.' });
    }

    const user = await User.findById(req.user._id);
    user.password = newPassword;
    await user.save();

    await VerificationCode.deleteMany({ userId: req.user._id, purpose: 'password_change' });

    res.json({ message: 'Şifre değiştirildi.' });
  } catch (error) {
    console.error('Password verify error:', error);
    res.status(500).json({ message: 'İşlem başarısız.' });
  }
});

module.exports = router;
