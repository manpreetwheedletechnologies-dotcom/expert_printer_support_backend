const router  = require('express').Router();
const { protect, authorise } = require('../middlewares/auth.middleware');
const {
  getDashboardStats, createAgent,
  getAgents, updateAgent, deleteAgent,
} = require('../controllers/admin.controller');

const Lead = require('../models/Lead.model');
const Chat = require('../models/Chat.model');
const CMS  = require('../models/CMS.model');

router.use(protect, authorise('admin'));

// Stats
router.get('/stats', getDashboardStats);

// Leads
router.get('/leads', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const leads = await Lead.find(filter).populate('assignedTo', 'name email').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, leads });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/leads/:id/status', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    req.app.get('io').to('agents_room').emit('lead_updated', { id: lead._id, status: lead.status });
    res.json({ success: true, lead });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/leads/:id', async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    req.app.get('io').to('agents_room').emit('lead_deleted', { id: req.params.id });
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Chats
router.get('/chats', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    const chats = await Chat.find(filter).populate('assignedAgent', 'name email').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, chats });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Agents
router.get('/agents',        getAgents);
router.post('/agents',       createAgent);
router.put('/agents/:id',    updateAgent);
router.delete('/agents/:id', deleteAgent);

// Website / CMS
router.get('/website', async (req, res) => {
  try {
    const items = await CMS.find().sort({ order: 1 });
    const fields = items.map((doc) => ({
      id:          doc._id,
      key:         doc.slug,
      label:       doc.title,
      type:        doc.type,
      value:       doc.content?.hero?.heading || doc.content?.body || '',
      isPublished: doc.isPublished,
    }));
    res.json({ success: true, fields });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/website', async (req, res) => {
  try {
    const { key, value } = req.body;
    const doc = await CMS.findOneAndUpdate(
      { slug: key },
      { $set: { 'content.body': value, 'content.hero.heading': value, lastEditedBy: req.user._id } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Content not found' });
    res.json({ success: true, doc });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Update chat status (admin only) ──────────────────────────────────────────
router.patch('/chats/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['waiting', 'active', 'closed', 'resolved'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
    }

    const chat = await Chat.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

    // Notify all connected clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(chat.roomId).emit('chat_status_updated', { roomId: chat.roomId, status });
      io.to('agents_room').emit('chat_queue_update', { action: status === 'closed' ? 'closed' : 'updated', roomId: chat.roomId });
    }

    res.json({ success: true, chat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;