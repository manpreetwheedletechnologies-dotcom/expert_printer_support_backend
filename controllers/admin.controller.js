const User = require('../models/User.model');
const Lead = require('../models/Lead.model');
const Chat = require('../models/Chat.model');

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalLeads, newLeads, openChats, waitingChats,
      totalAgents, activeAgents, resolvedToday
    ] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ status: 'new' }),
      Chat.countDocuments({ status: 'active' }),
      Chat.countDocuments({ status: 'waiting' }),
      User.countDocuments({ role: 'agent' }),
      User.countDocuments({ role: 'agent', isAvailable: true }),
      Lead.countDocuments({
        status: 'resolved',
        updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    ]);

    res.json({
      success: true,
      // Flat fields — frontend reads these directly
      total_leads:   totalLeads,
      active_chats:  openChats,
      resolved:      resolvedToday,
      total_agents:  totalAgents,
      // Extra fields
      newLeads,
      waitingChats,
      activeAgents,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/admin/agents  (create agent account) ──────────────────────────
exports.createAgent = async (req, res) => {
  try {
    const { name, email, password, phone, department } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });

    const agent = await User.create({ name, email, password, phone, department, role: 'agent' });

    res.status(201).json({
      success: true,
      agent: { id: agent._id, name: agent.name, email: agent.email, department: agent.department },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/agents ────────────────────────────────────────────────────
exports.getAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ success: true, agents });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/admin/agents/:id ────────────────────────────────────────────────
exports.updateAgent = async (req, res) => {
  try {
    const { name, phone, department, isActive } = req.body;
    const agent = await User.findByIdAndUpdate(
      req.params.id,
      { name, phone, department, isActive },
      { new: true }
    ).select('-password');

    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/admin/agents/:id ────────────────────────────────────────────
exports.deleteAgent = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Agent deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};