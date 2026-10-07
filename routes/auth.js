const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const VerificationCode = require("../models/VerificationCode");
const { sendVerificationEmail } = require("../utils/email");

const router = express.Router();

const generateToken = (user) =>
  jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    process.env.JWT_SECRET || "roid_secret_key",
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

const createVerificationCode = async (user, purpose, email) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await VerificationCode.deleteMany({ userId: user._id, purpose, email });
  await VerificationCode.create({ userId: user._id, code, purpose, email, expiresAt });
  await sendVerificationEmail(email, code, purpose);

  return code;
};

// Kayıt
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Tüm alanlar zorunludur." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Şifre en az 6 karakter olmalıdır." });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ message: "Bu e-posta veya kullanıcı adı kullanılmaktadır." });
    }

    const user = new User({
      username,
      email,
      password,
      isVerified: false,
      isAdmin: email.toLowerCase() === (process.env.ADMIN_EMAIL || "admin@roid.local").toLowerCase(),
    });

    await user.save();
    await createVerificationCode(user, "register", email);

    res.status(201).json({
      message: "Kayıt başarılı. E-posta adresinize doğrulama kodu gönderildi.",
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Kayıt sırasında hata oluştu." });
  }
});

// E-posta Doğrulama
router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "E-posta ve kod gerekli." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    const verification = await VerificationCode.findOne({
      userId: user._id,
      email: email.toLowerCase(),
    }).sort({ createdAt: -1 });

    if (!verification || verification.code !== code) {
      return res.status(400).json({ message: "Kod yanlış veya bulunamadı." });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: "Kod süresi doldu." });
    }

    user.isVerified = true;
    await user.save();
    await VerificationCode.deleteMany({ userId: user._id });

    const token = generateToken(user);
    res.json({
      message: "E-posta doğrulandı.",
      token,
      user: { id: user._id, username: user.username, email: user.email, isVerified: true },
    });
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({ message: "Doğrulama sırasında hata." });
  }
});

// Giriş
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "E-posta ve şifre gerekli." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: "Kullanıcı bulunamadı." });
    }

    if (user.banned) {
      return res.status(403).json({ message: "Hesabınız banlanmıştır." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Şifre yanlış." });
    }

    if (!user.isVerified) {
      await createVerificationCode(user, "register", user.email);
      return res.status(403).json({ message: "E-posta doğrulanmadı. Yeni kod gönderildi." });
    }

    const token = generateToken(user);
    res.json({
      message: "Giriş başarılı.",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isVerified: user.isVerified,
        isAdmin: user.isAdmin,
        theme: user.theme,
        isBlueVerified: user.isBlueVerified,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Giriş sırasında hata." });
  }
});

// Mevcut Kullanıcı Bilgisi
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token gerekli." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "roid_secret_key");
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ message: "Token geçersiz." });
  }
});

module.exports = router;
