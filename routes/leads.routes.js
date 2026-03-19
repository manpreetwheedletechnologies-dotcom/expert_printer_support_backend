const router = require('express').Router();
const { createLead, getLeads, getLead, updateLead, deleteLead } = require('../controllers/leads.controller');
const { protect, authorise } = require('../middlewares/auth.middleware');

router.post('/',         createLead);                                   // public - contact form
router.get('/',          protect, authorise('agent','admin'), getLeads);
router.get('/:id',       protect, authorise('agent','admin'), getLead);
router.put('/:id',       protect, authorise('agent','admin'), updateLead);
router.delete('/:id',    protect, authorise('admin'),         deleteLead);

module.exports = router;
