const CMS = require('../models/CMS.model');

// ─── GET /api/cms/:slug  (public) ─────────────────────────────────────────────
exports.getContent = async (req, res) => {
  try {
    const doc = await CMS.findOne({ slug: req.params.slug, isPublished: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Content not found' });
    res.json({ success: true, content: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/cms?type=faq  (public — list by type) ──────────────────────────
exports.listContent = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { isPublished: true };
    if (type) filter.type = type;
    const items = await CMS.find(filter).sort({ order: 1, createdAt: -1 }).select('-__v');
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/cms  (admin) ───────────────────────────────────────────────────
exports.createContent = async (req, res) => {
  try {
    const doc = await CMS.create({ ...req.body, lastEditedBy: req.user._id });
    res.status(201).json({ success: true, content: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/cms/:id  (admin) ────────────────────────────────────────────────
exports.updateContent = async (req, res) => {
  try {
    const doc = await CMS.findByIdAndUpdate(
      req.params.id,
      { ...req.body, lastEditedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Content not found' });
    res.json({ success: true, content: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/cms/:id/publish  (admin) ─────────────────────────────────────
exports.togglePublish = async (req, res) => {
  try {
    const doc = await CMS.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Content not found' });

    doc.isPublished = !doc.isPublished;
    doc.publishedAt = doc.isPublished ? new Date() : null;
    doc.lastEditedBy = req.user._id;
    await doc.save();

    res.json({ success: true, isPublished: doc.isPublished });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/cms/:id  (admin) ─────────────────────────────────────────────
exports.deleteContent = async (req, res) => {
  try {
    await CMS.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Content deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
