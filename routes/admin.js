const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { validateRobloxAsset } = require('./roblox');

const router = express.Router();

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Oturum açmanız gerekiyor.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'roid_secret_key');
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      return res.status(401).json({ message: 'Geçersiz kullanıcı.' });
    }

    if (user.banned) {
      return res.status(403).json({ message: 'Bu hesap banlanmıştır.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Geçersiz token.' });
  }
};

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;

    const musics = await prisma.music.findMany({
      where: {
        status: 'approved',
        ...(search
          ? {
              title: {
                contains: String(search),
                mode: 'insensitive',
              },
            }
          : {}),
      },
      include: {
        addedBy: {
          select: {
            id: true,
            username: true,
            isBlueVerified: true,
            isAdmin: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ musics });
  } catch (error) {
    console.error('Get music error:', error);
    res.status(500).json({ message: 'Müzikler yüklenirken hata oluştu.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const music = await prisma.music.findUnique({
      where: { id: req.params.id },
      include: {
        addedBy: {
          select: {
            id: true,
            username: true,
            isBlueVerified: true,
            isAdmin: true,
          },
        },
      },
    });

    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    res.json({ music });
  } catch (error) {
    console.error('Get music by id error:', error);
    res.status(500).json({ message: 'Müzik detayları getirilemedi.' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, robloxId, tag } = req.body;

    if (!title || !robloxId) {
      return res.status(400).json({ message: 'Şarkı adı ve Roblox ID gerekli.' });
    }

    if (!req.user.isVerified) {
      return res.status(403).json({ message: 'Müzik paylaşmadan önce e-posta doğrulamanız gerekli.' });
    }

    if (req.user.banned) {
      return res.status(403).json({ message: 'Hesabınız engellendiği için müzik paylaşamazsınız.' });
    }

    const robloxCheck = await validateRobloxAsset(robloxId);
    const music = await prisma.music.create({
      data: {
        title,
        robloxId,
        tag: tag || 'New',
        addedById: req.user.id,
        validationStatus: robloxCheck.valid ? 'working' : 'broken',
        status: robloxCheck.valid ? 'pending' : 'broken',
        likes: [],
        dislikes: [],
      },
      include: {
        addedBy: {
          select: {
            id: true,
            username: true,
            isBlueVerified: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Müzik gönderimi yapıldı. Admin onayı bekliyor.',
      music,
    });
  } catch (error) {
    console.error('Add music error:', error);
    res.status(500).json({ message: 'Müzik eklenirken hata oluştu.' });
  }
});

router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    const music = await prisma.music.findUnique({ where: { id: req.params.id } });

    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    const likes = music.likes || [];
    const dislikes = music.dislikes || [];
    const userId = req.user.id;

    let updatedLikes = likes;
    let updatedDislikes = dislikes;

    if (likes.includes(userId)) {
      updatedLikes = likes.filter((id) => id !== userId);
    } else {
      updatedLikes = [...likes, userId];
      updatedDislikes = dislikes.filter((id) => id !== userId);
    }

    const updatedMusic = await prisma.music.update({
      where: { id: music.id },
      data: {
        likes: updatedLikes,
        dislikes: updatedDislikes,
      },
    });

    res.json({ message: 'Like güncellendi.', music: updatedMusic });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ message: 'Like işlemi sırasında hata oluştu.' });
  }
});

router.post('/:id/dislike', authMiddleware, async (req, res) => {
  try {
    const music = await prisma.music.findUnique({ where: { id: req.params.id } });

    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    const likes = music.likes || [];
    const dislikes = music.dislikes || [];
    const userId = req.user.id;

    let updatedLikes = likes;
    let updatedDislikes = dislikes;

    if (dislikes.includes(userId)) {
      updatedDislikes = dislikes.filter((id) => id !== userId);
    } else {
      updatedDislikes = [...dislikes, userId];
      updatedLikes = likes.filter((id) => id !== userId);
    }

    const updatedMusic = await prisma.music.update({
      where: { id: music.id },
      data: {
        likes: updatedLikes,
        dislikes: updatedDislikes,
      },
    });

    res.json({ message: 'Dislike güncellendi.', music: updatedMusic });
  } catch (error) {
    console.error('Dislike error:', error);
    res.status(500).json({ message: 'Dislike işlemi sırasında hata oluştu.' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const music = await prisma.music.findUnique({ where: { id: req.params.id } });

    if (!music) {
      return res.status(404).json({ message: 'Müzik bulunamadı.' });
    }

    if (music.addedById !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Bu müziği silmeye yetkiniz yok.' });
    }

    await prisma.music.delete({ where: { id: music.id } });
    res.json({ message: 'Müzik silindi.' });
  } catch (error) {
    console.error('Delete music error:', error);
    res.status(500).json({ message: 'Müzik silinirken hata oluştu.' });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        username: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const music = await prisma.music.findMany({
      where: { addedById: user.id, status: 'approved' },
      orderBy: { createdAt: 'desc' },
    });

    const followCount = await prisma.follow.count({ where: { followingId: user.id } });
    const followingCount = await prisma.follow.count({ where: { followerId: user.id } });

    res.json({ user, music, followCount, followingCount });
  } catch (error) {
    console.error('User music profile error:', error);
    res.status(500).json({ message: 'Profil bilgisi alınamadı.' });
  }
});

module.exports = router;
