const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const musicRoutes = require('./routes/music');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const { router: robloxRoutes } = require('./routes/roblox');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Bağlantısı
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/roid_platform';
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Vercel'da bağlantı hatası durumunda uygulama kapanmasın
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ Running in production mode without MongoDB. API calls may fail.');
    } else {
      process.exit(1);
    }
  }
};

// Bağlantı başlat
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/roblox', robloxRoutes);

// Static Frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health Check Endpoint (Vercel için)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Local development için server başlat
if (process.env.NODE_ENV !== 'production') {
  const startServer = async () => {
    try {
      app.listen(PORT, () => {
        console.log(`🚀 ROID server running on http://localhost:${PORT}`);
      });
    } catch (error) {
      console.error('❌ Server start failed:', error.message);
      process.exit(1);
    }
  };

  startServer();
}

// Vercel Serverless Export
module.exports = app;
