const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    // Visitor details from contact form
    name:    { type: String, required: true, trim: true },
    email:   { type: String, required: true, trim: true, lowercase: true },
    phone:   { type: String, trim: true },
    message: { type: String, required: true },
    amount:  { type: Number, default: 0 },

    // Printer info (optional - for printer support queries)
    printerBrand:  { type: String, trim: true },
    printerModel:  { type: String, trim: true },
    issueType: {
      type: String,
      enum: ['installation', 'driver', 'connectivity', 'hardware', 'ink', 'other'],
      default: 'other',
    },

    // Source tracking
    source: {
      type: String,
      enum: ['contact_form', 'help_form', 'chatbot', 'phone', 'walk_in'],
      default: 'contact_form',
    },

    // CRM status
    status: {
      type: String,
      enum: ['new', 'contacted', 'in_progress', 'resolved', 'closed'],
      default: 'new',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },

    // Assignment
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: [
      {
        text: String,
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // Linked chat session (if lead came from chatbot)
    chatSession: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
  },
  { timestamps: true }
);

// Index for fast queries
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ email: 1 });
leadSchema.index({ assignedTo: 1 });

module.exports = mongoose.model('Lead', leadSchema);