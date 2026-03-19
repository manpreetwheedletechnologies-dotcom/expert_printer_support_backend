const router = require('express').Router();
const {
  getContent, listContent, createContent,
  updateContent, togglePublish, deleteContent,
} = require('../controllers/cms.controller');
const { protect, authorise } = require('../middlewares/auth.middleware');

// Public routes — website fetches these
router.get('/',          listContent);          // ?type=faq | ?type=page
router.get('/:slug',     getContent);           // /api/cms/homepage

// Admin-only routes
router.post('/',         protect, authorise('admin'), createContent);
router.put('/:id',       protect, authorise('admin'), updateContent);
router.patch('/:id/publish', protect, authorise('admin'), togglePublish);
router.delete('/:id',    protect, authorise('admin'), deleteContent);

module.exports = router;
