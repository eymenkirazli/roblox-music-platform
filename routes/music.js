const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Music = require("../models/Music");
const Follow = require("../models/Follow");
const { validateRobloxAsset } = require("./roblox");

const router = express.Router();

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Oturum açmanız gerekiyor." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "roid_secret_key");
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    if (user.banned) {
      return res.status(403).json({ message: "Bu hesap banlanmıştır." });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Geçersiz token." });
  }
};

router.get("/", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = {
      status: "approved",
    };

    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    const musics = await Music.find(query)
      .populate("addedBy", "username isBlueVerified isAdmin")
      .sort({ createdAt: -1 });

    res.json({ musics });
  } catch (error) {
    console.error("Get music error:", error);
    res.status(500).json({ message: "Müzikler yüklenirken hata oluştu." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const music = await Music.findById(req.params.id).populate("addedBy", "username isBlueVerified isAdmin");

    if (!music) {
      return res.status(404).json({ message: "Müzik bulunamadı." });
    }

    res.json({ music });
  } catch (error) {
    console.error("Get music by id error:", error);
    res.status(500).json({ message: "Müzik detayları getirilemedi." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { title, robloxId, tag } = req.body;

    if (!title || !robloxId) {
      return res.status(400).json({ message: "Şarkı adı ve Roblox ID gerekli." });
    }

    if (!req.user.isVerified) {
      return res.status(403).json({ message: "Müzik paylaşmadan önce e-posta doğrulamanız gerekli." });
    }

    if (req.user.banned) {
      return res.status(403).json({ message: "Hesabınız engellendiği için müzik paylaşamazsınız." });
    }

    const robloxCheck = await validateRobloxAsset(robloxId);

    const newMusic = new Music({
      title,
      robloxId,
      tag: tag || "New",
      addedBy: req.user._id,
      validationStatus: robloxCheck.valid ? "working" : "broken",
      status: robloxCheck.valid ? "pending" : "broken",
      likes: [],
      dislikes: [],
    });

    await newMusic.save();

    const populatedMusic = await Music.findById(newMusic._id).populate("addedBy", "username isBlueVerified");

    res.status(201).json({
      message: "Müzik gönderimi yapıldı. Admin onayı bekliyor.",
      music: populatedMusic,
    });
  } catch (error) {
    console.error("Add music error:", error);
    res.status(500).json({ message: "Müzik eklenirken hata oluştu." });
  }
});

router.post("/:id/like", authMiddleware, async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);

    if (!music) {
      return res.status(404).json({ message: "Müzik bulunamadı." });
    }

    const userId = req.user._id.toString();

    if (music.likes.includes(userId)) {
      music.likes = music.likes.filter((id) => id.toString() !== userId);
    } else {
      music.likes.push(userId);
      music.dislikes = music.dislikes.filter((id) => id.toString() !== userId);
    }

    await music.save();
    res.json({ message: "Like güncellendi.", music });
  } catch (error) {
    console.error("Like error:", error);
    res.status(500).json({ message: "Like işlemi sırasında hata oluştu." });
  }
});

router.post("/:id/dislike", authMiddleware, async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);

    if (!music) {
      return res.status(404).json({ message: "Müzik bulunamadı." });
    }

    const userId = req.user._id.toString();

    if (music.dislikes.includes(userId)) {
      music.dislikes = music.dislikes.filter((id) => id.toString() !== userId);
    } else {
      music.dislikes.push(userId);
      music.likes = music.likes.filter((id) => id.toString() !== userId);
    }

    await music.save();
    res.json({ message: "Dislike güncellendi.", music });
  } catch (error) {
    console.error("Dislike error:", error);
    res.status(500).json({ message: "Dislike işlemi sırasında hata oluştu." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);

    if (!music) {
      return res.status(404).json({ message: "Müzik bulunamadı." });
    }

    if (music.addedBy.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: "Bu müziği silmeye yetkiniz yok." });
    }

    await music.deleteOne();
    res.json({ message: "Müzik silindi." });
  } catch (error) {
    console.error("Delete music error:", error);
    res.status(500).json({ message: "Müzik silinirken hata oluştu." });
  }
});

router.get("/user/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    const musicList = await Music.find({ addedBy: user._id, status: "approved" }).sort({ createdAt: -1 });
    const followCount = await Follow.countDocuments({ following: user._id });
    const followingCount = await Follow.countDocuments({ follower: user._id });

    res.json({
      user,
      music: musicList,
      followCount,
      followingCount,
    });
  } catch (error) {
    console.error("User music profile error:", error);
    res.status(500).json({ message: "Profil bilgisi alınamadı." });
  }
});

module.exports = router;
