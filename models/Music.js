const mongoose = require('mongoose');

const musicSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    robloxId: {
      type: String,
      required: true,
      trim: true,
    },
    tag: {
      type: String,
      default: 'New',
      trim: true,
      maxlength: 30,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    validationStatus: {
      type: String,
      enum: ['working', 'broken'],
      default: 'broken',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'working', 'broken'],
      default: 'pending',
    },
    adminNotes: {
      type: String,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Music', musicSchema);
