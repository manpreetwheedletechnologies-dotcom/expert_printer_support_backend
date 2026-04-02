const { v4: uuidv4 } = require('uuid');
const Chat = require('../models/Chat.model');
const Lead = require('../models/Lead.model');
const User = require('../models/User.model');
const path = require('path');

// ─── POST /api/chat/initiate  (visitor starts chat) ──────────────────────────
// Chat stays "waiting" — agent must manually accept from dashboard
exports.initiateChat = async (req, res) => {
  try {
    const { name, email, phone, printerBrand, printerModel, issueType, initialMessage } = req.body;

    const roomId = `room_${uuidv4()}`;

    const chat = await Chat.create({
      roomId,
      visitor:      { name, email, phone },
      queryContext: { printerBrand, printerModel, issueType, initialMessage },
      status:       'waiting',
      messages:     initialMessage
        ? [{ sender: 'visitor', text: initialMessage }]
        : [],
    });

    // Notify ALL agents — shows as card in Incoming Chat Requests on dashboard
    const io = req.app.get('io');
    io.to('agents_room').emit('chat_queue_update', {
      action:      'waiting',
      roomId,
      visitor:     { name, email, phone },
      queryContext: { printerBrand, printerModel, issueType, initialMessage },
    });

    res.status(201).json({ success: true, roomId, status: 'waiting' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/chat/history/:roomId ───────────────────────────────────────────
exports.getChatHistory = async (req, res) => {
  try {
    const chat = await Chat.findOne({ roomId: req.params.roomId })
      .populate('assignedAgent', 'name email avatar');
    if (!chat) return res.status(404).json({ success: false, message: 'Chat session not found' });
    res.json({ success: true, chat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/chat/queue  (agents see waiting chats) ─────────────────────────
exports.getQueue = async (req, res) => {
  try {
    const queue = await Chat.find({ status: 'waiting' }).sort({ createdAt: 1 });
    res.json({ success: true, queue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/chat/my-chats  (agent sees their active chats) ─────────────────
exports.getMyChats = async (req, res) => {
  try {
    const chats = await Chat.find({
      assignedAgent: req.user._id,
      status: { $in: ['active', 'waiting'] },
    }).sort({ updatedAt: -1 });
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/chat/:roomId/close ─────────────────────────────────────────────
exports.closeChat = async (req, res) => {
  try {
    const { rating, feedback, convertToLead } = req.body;
    const chat = await Chat.findOne({ roomId: req.params.roomId });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

    chat.status   = 'closed';
    chat.duration = Math.floor((Date.now() - chat.createdAt) / 1000);
    if (rating)   chat.rating   = rating;
    if (feedback) chat.feedback = feedback;

    if (convertToLead) {
      const lead = await Lead.create({
        name:        chat.visitor.name,
        email:       chat.visitor.email,
        phone:       chat.visitor.phone,
        message:     chat.queryContext.initialMessage || 'Via chat',
        printerBrand: chat.queryContext.printerBrand,
        printerModel: chat.queryContext.printerModel,
        issueType:    chat.queryContext.issueType,
        source:       'chatbot',
        chatSession:  chat._id,
        assignedTo:   chat.assignedAgent,
      });
      chat.lead = lead._id;
    }

    await chat.save();

    if (chat.assignedAgent) {
      await User.findByIdAndUpdate(chat.assignedAgent, {
        $pull: { activeChats: chat._id },
      });
    }

    const io = req.app.get('io');
    io.to(chat.roomId).emit('chat_closed', { roomId: chat.roomId });
    io.to('agents_room').emit('chat_queue_update', { action: 'closed', roomId: chat.roomId });

    res.json({ success: true, message: 'Chat closed', chat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/chat/all  (admin) ──────────────────────────────────────────────
exports.getAllChats = async (req, res) => {
  try {
    const { status, agentId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status)  filter.status = status;
    if (agentId) filter.assignedAgent = agentId;

    const total = await Chat.countDocuments(filter);
    const chats = await Chat.find(filter)
      .populate('assignedAgent', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    const { roomId } = req.params;

    const chat = await Chat.findOne({ roomId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileUrl = `/uploads/chat/${req.file.filename}`;
    const isImage = req.file.mimetype.startsWith('image/');

    return res.status(201).json({
      success: true,
      file: {
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        type: isImage ? 'image' : 'file',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};