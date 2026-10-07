const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Music = require('../models/Music');

const router = express.Router();

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Admin yetkisi gerekli.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'roid_secret_key');

    const user = await User.findById(decoded.id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Bu işlem için admin yetkisi gerekir.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token geçersiz.' });
  }
};

// Tüm kullanıcıları getir
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Kullanıcılar yüklenemedi.' });
  }
});

// Bekleyen müzikleri getir
router.get('/pending-music', adminMiddleware, async (req, res) => {
  try {
    const musics = await Music.find({ status: 'pending' })
      .populate('addedBy', 'username email')
      .sort({ createdAt: -1 });

    res.json({ musics });
  } catch (error) {
    console.error('Get pending music error:', error);
    res.status(500).json({ message: 'Bekleyen müzikler yüklenemedi.' });
  }
});

// Müzik onaylama
router.post('/music/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);
    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    music.status = 'approved';
    music.validationStatus = music.validationStatus || 'working';
    music.adminNotes = req.body.adminNotes || '';
    await music.save();

    res.json({ message: 'Müzik onaylandı.', music });
  } catch (error) {
    console.error('Approve music error:', error);
    res.status(500).json({ message: 'Onay işlemi sırasında hata oluştu.' });
  }
});

// Müzik reddetme
router.post('/music/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);
    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    music.status = 'rejected';
    music.adminNotes = req.body.adminNotes || 'Admin tarafından reddedildi.';
    await music.save();

    res.json({ message: 'Müzik reddedildi.', music });
  } catch (error) {
    console.error('Reject music error:', error);
    res.status(500).json({ message: 'Reddetme işlemi sırasında hata oluştu.' });
  }
});

// Kullanıcıyı banlama
router.post('/users/:id/ban', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    user.banned = true;
    await user.save();

    res.json({ message: 'Kullanıcı banlandı.', user });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ message: 'Ban işlemi sırasında hata oluştu.' });
  }
});

// Kullanıcıyı unbanlama
router.post('/users/:id/unban', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    user.banned = false;
    await user.save();

    res.json({ message: 'Kullanıcı ban kaldırıldı.', user });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ message: 'Ban kaldırma işlemi sırasında hata oluştu.' });
  }
});

// Kullanıcıyı silme
router.delete('/users/:id/delete', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    await user.deleteOne();
    await Music.deleteMany({ addedBy: user._id });

    res.json({ message: 'Kullanıcı ve müzikleri silindi.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Silme işlemi sırasında hata oluştu.' });
  }
});

// Mavi tik verme/kaldırma
router.post('/users/:id/blue-verify', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    user.isBlueVerified = !user.isBlueVerified;
    await user.save();

    res.json({
      message: user.isBlueVerified ? 'Mavi tik verildi.' : 'Mavi tik kaldırıldı.',
      user,
    });
  } catch (error) {
    console.error('Blue verify error:', error);
    res.status(500).json({ message: 'Mavi tik işlemi sırasında hata oluştu.' });
  }
});

module.exports = router;
