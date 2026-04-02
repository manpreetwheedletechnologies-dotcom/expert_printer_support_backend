

// ─── Message Sub-Schema ────────────────────────────────────────────────────────
const mongoose = require('mongoose');

// ─── Message Sub-Schema ────────────────────────────────────────────────────────
const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ['visitor', 'agent', 'bot', 'system'],
      required: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // text stays optional for file/image messages
    text: { type: String, default: '' },

    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system_event'],
      default: 'text',
    },

    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

// const messageSchema = new mongoose.Schema(
//   {
//     sender: {
//       type: String,
//       enum: ['visitor', 'agent', 'bot', 'system'],
//       required: true,
//     },
//     senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     text: { type: String, required: true },
//     type: {
//       type: String,
//       enum: ['text', 'image', 'file', 'system_event'],
//       default: 'text',
//     },
//     fileUrl: { type: String },
//     isRead: { type: Boolean, default: false },
//     readAt: { type: Date },
//   },
//   { timestamps: true }
// );

// ─── Chat Session Schema ───────────────────────────────────────────────────────
const chatSchema = new mongoose.Schema(
  {
    // Unique room identifier (used by Socket.IO)
    roomId: { type: String, required: true, unique: true },

    // Visitor info (collected by chatbot before agent handoff)
    visitor: {
      name:    { type: String, required: true },
      email:   { type: String, required: true, lowercase: true },
      phone:   { type: String },
      socketId: { type: String },  // current socket connection
    },

    // Printer query context (collected by chatbot)
    queryContext: {
      printerBrand:  String,
      printerModel:  String,
      issueType:     String,
      initialMessage: String,
      amount:         { type: Number, default: 0 },
    },

    // Agent assignment
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    agentSocketId: { type: String },

    // Status flow: waiting → active → closed
    status: {
      type: String,
      enum: ['bot',       // chatbot collecting info
             'waiting',   // queued, waiting for agent
             'active',    // agent connected
             'closed',    // session ended
             'missed'],   // no agent available
      default: 'bot',
    },

    messages: [messageSchema],

    // Admin joining
    adminJoined: { type: Boolean, default: false },
    adminId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Visitor online status (real-time)
    visitorOnline: { type: Boolean, default: false },
    visitorLastSeen: { type: Date },

    // Metrics
    waitTime: { type: Number },          // seconds visitor waited
    duration: { type: Number },          // seconds chat lasted
    rating: { type: Number, min: 1, max: 5 },
    feedback: { type: String },

    // If chat converted to a lead
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  },
  { timestamps: true }
);

// Index for fast lookups
chatSchema.index({ roomId: 1 });
chatSchema.index({ status: 1, createdAt: -1 });
chatSchema.index({ assignedAgent: 1, status: 1 });
chatSchema.index({ 'visitor.email': 1 });

module.exports = mongoose.model('Chat', chatSchema);