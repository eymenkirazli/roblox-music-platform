const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const router = express.Router();

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Admin yetkisi gerekli.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'roid_secret_key');

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Bu işlem için admin yetkisi gerekir.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token geçersiz.' });
  }
};

router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
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
        updatedAt: true,
      },
    });
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Kullanıcılar yüklenemedi.' });
  }
});

router.get('/pending-music', adminMiddleware, async (req, res) => {
  try {
    const musics = await prisma.music.findMany({
      where: { status: 'pending' },
      include: {
        addedBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ musics });
  } catch (error) {
    console.error('Get pending music error:', error);
    res.status(500).json({ message: 'Bekleyen müzikler yüklenemedi.' });
  }
});

router.post('/music/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const music = await prisma.music.findUnique({ where: { id: req.params.id } });
    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    const updated = await prisma.music.update({
      where: { id: music.id },
      data: {
        status: 'approved',
        validationStatus: music.validationStatus || 'working',
        adminNotes: req.body.adminNotes || '',
      },
    });

    res.json({ message: 'Müzik onaylandı.', music: updated });
  } catch (error) {
    console.error('Approve music error:', error);
    res.status(500).json({ message: 'Onay işlemi sırasında hata oluştu.' });
  }
});

router.post('/music/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const music = await prisma.music.findUnique({ where: { id: req.params.id } });
    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    const updated = await prisma.music.update({
      where: { id: music.id },
      data: {
        status: 'rejected',
        adminNotes: req.body.adminNotes || 'Admin tarafından reddedildi.',
      },
    });

    res.json({ message: 'Müzik reddedildi.', music: updated });
  } catch (error) {
    console.error('Reject music error:', error);
    res.status(500).json({ message: 'Reddetme işlemi sırasında hata oluştu.' });
  }
});

router.post('/users/:id/ban', adminMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { banned: true },
    });

    res.json({ message: 'Kullanıcı banlandı.', user: updated });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ message: 'Ban işlemi sırasında hata oluştu.' });
  }
});

router.post('/users/:id/unban', adminMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { banned: false },
    });

    res.json({ message: 'Kullanıcı ban kaldırıldı.', user: updated });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ message: 'Ban kaldırma işlemi sırasında hata oluştu.' });
  }
});

router.delete('/users/:id/delete', adminMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    await prisma.follow.deleteMany({
      where: {
        OR: [{ followerId: user.id }, { followingId: user.id }],
      },
    });

    await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
    await prisma.music.deleteMany({ where: { addedById: user.id } });
    await prisma.user.delete({ where: { id: user.id } });

    res.json({ message: 'Kullanıcı ve müzikleri silindi.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Silme işlemi sırasında hata oluştu.' });
  }
});

router.post('/users/:id/blue-verify', adminMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isBlueVerified: !user.isBlueVerified },
    });

    res.json({
      message: updated.isBlueVerified ? 'Mavi tik verildi.' : 'Mavi tik kaldırıldı.',
      user: updated,
    });
  } catch (error) {
    console.error('Blue verify error:', error);
    res.status(500).json({ message: 'Mavi tik işlemi sırasında hata oluştu.' });
  }
});

module.exports = router;
