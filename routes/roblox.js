const express = require('express');
const axios = require('axios');

const router = express.Router();

const validateRobloxAsset = async (robloxId) => {
  try {
    const response = await axios.get(
      `https://economy.roblox.com/v1/assets/${robloxId}/details`,
      { timeout: 10000 }
    );

    const asset = response.data;

    if (!asset || asset.errors) {
      return {
        valid: false,
        message: 'Roblox asset doğrulanamadı.',
      };
    }

    const typeId = Number(asset.TypeId);

    if (typeId === 3) {
      return {
        valid: true,
        message: 'Audio asset doğrulandı.',
      };
    }

    return {
      valid: false,
      message: 'Bu Roblox asset bir ses/Audio değil.',
    };
  } catch (error) {
    return {
      valid: false,
      message: 'Roblox API hatası veya asset bulunamadı.',
    };
  }
};

// Roblox asset kontrol etme
router.get('/check/:robloxId', async (req, res) => {
  try {
    const { robloxId } = req.params;
    const result = await validateRobloxAsset(robloxId);
    res.json(result);
  } catch (error) {
    console.error('Roblox check error:', error);
    res.status(500).json({ valid: false, message: 'Kontrol sırasında hata oluştu.' });
  }
});

module.exports = { router, validateRobloxAsset };
