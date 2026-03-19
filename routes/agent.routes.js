const router = require('express').Router();
const { protect, authorise } = require('../middlewares/auth.middleware');
const User = require('../models/User.model');
const Chat = require('../models/Chat.model');
const Lead = require('../models/Lead.model');

// ── Agent list ────────────────────────────────────────────────────────────────
router.get('/', protect, authorise('agent', 'admin'), async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent', isActive: true })
      .select('name email isAvailable department activeChats lastSeen avatar')
      .sort({ isAvailable: -1, name: 1 });
    res.json({ success: true, agents });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Agent profile update ──────────────────────────────────────────────────────
router.put('/profile', protect, authorise('agent'), async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    const agent = await User.findByIdAndUpdate(req.user._id, { name, phone, avatar }, { new: true }).select('-password');
    res.json({ success: true, agent });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Agent stats ───────────────────────────────────────────────────────────────
router.get('/stats', protect, authorise('agent'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [my_leads, active_chats, resolved_today, all_closed_chats] = await Promise.all([
      // Count leads assigned to agent OR linked via chat
      (async () => {
        const agentChatIds = await Chat.find({ assignedAgent: req.user._id }).select('_id lead').lean();
        const chatLeadIds = agentChatIds.map(c => c.lead).filter(Boolean);
        return Lead.countDocuments({
          $or: [
            { assignedTo: req.user._id },
            { _id: { $in: chatLeadIds } },
            { chatSession: { $in: agentChatIds.map(c => c._id) } },
          ],
        });
      })(),

      // Active chats assigned to this agent
      Chat.countDocuments({ assignedAgent: req.user._id, status: 'active' }),

      // Leads resolved today by this agent
      Lead.countDocuments({
        assignedTo: req.user._id,
        status:     'resolved',
        updatedAt:  { $gte: today },
      }),

      // All closed chats for avg response calc
      Chat.find({
        assignedAgent: req.user._id,
        status:        'closed',
        waitTime:      { $exists: true, $gt: 0 },
      }).select('waitTime').limit(50),
    ]);

    // Average response time in minutes
    let avg_response = '—';
    if (all_closed_chats.length > 0) {
      const avgSeconds = all_closed_chats.reduce((sum, c) => sum + (c.waitTime || 0), 0) / all_closed_chats.length;
      avg_response = avgSeconds < 60
        ? `${Math.round(avgSeconds)}s`
        : `${Math.round(avgSeconds / 60)}m`;
    }

    res.json({
      success: true,
      my_leads,
      active_chats,
      resolved_today,
      avg_response,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Agent leads ───────────────────────────────────────────────────────────────
router.get('/leads', protect, authorise('agent'), async (req, res) => {
  try {
    // Get all chats this agent has ever handled
    const agentChatIds = await Chat.find({ assignedAgent: req.user._id })
      .select('_id lead')
      .lean();

    // Collect lead IDs linked to those chats
    const chatLeadIds = agentChatIds
      .map(c => c.lead)
      .filter(Boolean);

    // Single query: leads assigned to agent OR linked via chat session
    const leads = await Lead.find({
      $or: [
        { assignedTo: req.user._id },
        { _id: { $in: chatLeadIds } },
        { chatSession: { $in: agentChatIds.map(c => c._id) } },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(200);

    console.log(`[agent/leads] agent=${req.user._id} found=${leads.length}`);
    res.json({ success: true, leads });
  } catch (err) {
    console.error('[agent/leads] error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/leads/:id/status', protect, authorise('agent'), async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    req.app.get('io').to('agents_room').emit('lead_updated', { id: lead._id, status: lead.status });
    res.json({ success: true, lead });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Agent chats ───────────────────────────────────────────────────────────────
// Returns:
//   - ALL "waiting" chats (any agent can pick these up)
//   - "active" chats assigned to this agent
router.get('/chats', protect, authorise('agent'), async (req, res) => {
  try {
    const chats = await Chat.find({
      $or: [
        { status: 'waiting' },                                    // unassigned — all agents see
        { status: 'active', assignedAgent: req.user._id },       // assigned to this agent
      ],
    })
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({ success: true, chats });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Accept a chat — assigns to agent, creates a lead, notifies visitor
router.post('/chats/:id/accept', protect, authorise('agent'), async (req, res) => {
  try {
    const waitTime = Math.floor((Date.now() - (await Chat.findById(req.params.id))?.createdAt) / 1000);

    const chat = await Chat.findByIdAndUpdate(
      req.params.id,
      {
        status:        'active',
        assignedAgent: req.user._id,
        agentSocketId: null,
        waitTime,
      },
      { new: true }
    );
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

    // Add to agent active chats
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { activeChats: chat._id } });

    // Auto-create a lead and assign to this agent so it shows in My Leads
    let lead = await Lead.findOne({ chatSession: chat._id });
    if (!lead) {
      lead = await Lead.create({
        name:         chat.visitor?.name  || 'Visitor',
        email:        chat.visitor?.email || '',
        phone:        chat.visitor?.phone || '',
        message:      chat.queryContext?.initialMessage || 'Via chat',
        printerBrand: chat.queryContext?.printerBrand || '',
        printerModel: chat.queryContext?.printerModel || '',
        issueType:    chat.queryContext?.issueType    || 'other',
        source:       'chatbot',
        status:       'contacted',
        assignedTo:   req.user._id,
        chatSession:  chat._id,
      });
      // Link lead back to chat
      chat.lead = lead._id;
      await chat.save();
    } else if (!lead.assignedTo) {
      lead.assignedTo = req.user._id;
      lead.status     = 'contacted';
      await lead.save();
    }

    const io = req.app.get('io');

    // Tell the visitor an agent connected
    io.to(chat.roomId).emit('agent_connected', {
      message:   'A support agent has joined. How can we help you?',
      agentId:   req.user._id,
      timestamp: new Date(),
    });

    // Update queue on all dashboards — removes from other agents' request cards
    io.to('agents_room').emit('chat_queue_update', {
      action:  'accepted',
      roomId:  chat.roomId,
      agentId: req.user._id,
    });

    // Notify admin
    io.to('admin_room').emit('new_lead', {
      id:        lead._id,
      name:      lead.name,
      email:     lead.email,
      issueType: lead.issueType,
      status:    lead.status,
      createdAt: lead.createdAt,
    });

    res.json({ success: true, chat, lead });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Resolve / close a chat — also marks linked lead as resolved
router.post('/chats/:id/resolve', protect, authorise('agent'), async (req, res) => {
  try {
    const chat = await Chat.findByIdAndUpdate(req.params.id, { status: 'closed' }, { new: true });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

    await User.findByIdAndUpdate(req.user._id, { $pull: { activeChats: chat._id } });

    // Mark linked lead as resolved
    if (chat.lead) {
      await Lead.findByIdAndUpdate(chat.lead, { status: 'resolved' });
    } else {
      await Lead.findOneAndUpdate({ chatSession: chat._id }, { status: 'resolved' });
    }

    const io = req.app.get('io');
    io.to(chat.roomId).emit('chat_closed', { roomId: chat.roomId });
    io.to('agents_room').emit('chat_queue_update', { action: 'closed', roomId: chat.roomId });

    res.json({ success: true, chat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


// Agent performance stats (admin only)
router.get('/:id/stats', protect, authorise('admin'), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const agentId  = new mongoose.Types.ObjectId(req.params.id);
    const [totalChats, closedChats, assignedLeads, resolvedLeads] = await Promise.all([
      Chat.countDocuments({ assignedAgent: agentId }),
      Chat.countDocuments({ assignedAgent: agentId, status: 'closed' }),
      Lead.countDocuments({ assignedTo: agentId }),
      Lead.countDocuments({ assignedTo: agentId, status: 'resolved' }),
    ]);
    res.json({ success: true, stats: { totalChats, closedChats, assignedLeads, resolvedLeads } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;