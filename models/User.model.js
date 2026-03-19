const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,          // never returned by default
    },
    role: {
      type: String,
      enum: ['visitor', 'agent', 'admin'],
      default: 'visitor',
    },
    phone: { type: String, trim: true },
    avatar: { type: String },

    // Agent-specific fields
    isAvailable: { type: Boolean, default: true },
    activeChats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    department: { type: String, default: 'General' },

    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
