// ── chat.routes.js ────────────────────────────────────────────────────────────
const router = require('express').Router();
const {
  initiateChat, getChatHistory, getQueue,
  getMyChats, closeChat, getAllChats,
} = require('../controllers/chat.controller');
const { protect, authorise } = require('../middlewares/auth.middleware');

router.post('/initiate',               initiateChat);                             // public (chatbot)
router.get('/history/:roomId',         getChatHistory);                           // public (visitor)
router.get('/queue',                   protect, authorise('agent','admin'), getQueue);
router.get('/my-chats',                protect, authorise('agent'),         getMyChats);
router.post('/:roomId/close',          protect, authorise('agent','admin'), closeChat);
router.get('/all',                     protect, authorise('admin'),         getAllChats);

module.exports = router;
