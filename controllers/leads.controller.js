const Lead = require('../models/Lead.model');
const { sendLeadNotificationEmail } = require('../services/email.service');

// ─── POST /api/leads  (public — contact form) ─────────────────────────────────
exports.createLead = async (req, res) => {
  try {
    const { name, email, phone, message, printerBrand, printerModel, issueType, source } = req.body;

    const lead = await Lead.create({
      name, email, phone, message,
      printerBrand, printerModel, issueType,
      source: source || 'contact_form',
    });

    // Notify agents via Socket.IO
    const io = req.app.get('io');
    io.to('agents_room').emit('new_lead', {
      id: lead._id,
      name: lead.name,
      email: lead.email,
      issueType: lead.issueType,
      status: lead.status,
      createdAt: lead.createdAt,
    });

    // Send email notification to admin/team
    await sendLeadNotificationEmail(lead).catch(console.error);

    res.status(201).json({ success: true, message: 'Your query has been submitted. We will contact you shortly.', lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/leads  (agent/admin) ───────────────────────────────────────────
exports.getLeads = async (req, res) => {
  try {
    const { status, priority, assignedTo, page = 1, limit = 20, search } = req.query;
    const filter = {};

    if (status)     filter.status = status;
    if (priority)   filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;

    // Agents only see their own leads
    if (req.user.role === 'agent') filter.assignedTo = req.user._id;

    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Lead.countDocuments(filter);
    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), leads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/leads/:id ───────────────────────────────────────────────────────
exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('chatSession');

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/leads/:id ───────────────────────────────────────────────────────
exports.updateLead = async (req, res) => {
  try {
    const { status, priority, assignedTo, note } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (status)     lead.status = status;
    if (priority)   lead.priority = priority;
    if (assignedTo) lead.assignedTo = assignedTo;
    if (note) {
      lead.notes.push({ text: note, addedBy: req.user._id });
    }

    await lead.save();

    // Notify dashboard in real time
    const io = req.app.get('io');
    io.to('agents_room').emit('lead_updated', { id: lead._id, status: lead.status, priority: lead.priority });

    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/leads/:id  (admin only) ─────────────────────────────────────
exports.deleteLead = async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
