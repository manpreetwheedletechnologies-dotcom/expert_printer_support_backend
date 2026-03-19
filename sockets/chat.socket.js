/**
 * chat.socket.js
 * ──────────────────────────────────────────────────────────────
 * Handles ALL real-time communication:
 *   - Visitor ↔ Agent chat
 *   - Agent availability updates
 *   - Live queue changes on dashboard
 *   - Typing indicators, read receipts
 * ──────────────────────────────────────────────────────────────
 *
 * ROOM STRATEGY:
 *   • Each chat session → unique room  e.g. "room_<uuid>"
 *   • All agents join   → "agents_room"
 *   • Admin joins       → "admin_room"
 *
 * CONNECTION FLOW:
 *   Visitor:  connect → join_chat(roomId) → send messages
 *   Agent:    connect (with JWT) → join agents_room → accept/pick chats
 */

const { verifySocketToken } = require('../middlewares/auth.middleware');
const Chat = require('../models/Chat.model');
const User = require('../models/User.model');

module.exports = (io) => {

  // ─── Middleware: authenticate agents/admins ─────────────────────────────────
  // Visitors connect without a token; agents/admins pass token in handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      const decoded = verifySocketToken(token);
      if (decoded) {
        socket.userId   = decoded.id;
        socket.userRole = decoded.role || 'visitor';
      }
    }
    next(); // visitors pass through without token
  });

  // ─── On connection ───────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`🔌  Socket connected: ${socket.id} (role: ${socket.userRole || 'visitor'})`);

    // ── AGENT / ADMIN SETUP ────────────────────────────────────────────────────
    if (socket.userRole === 'agent' || socket.userRole === 'admin') {

      socket.join('agents_room');
      if (socket.userRole === 'admin') socket.join('admin_room');

      // Save agent's current socketId so we can push direct notifications
      User.findByIdAndUpdate(socket.userId, { socketId: socket.id, lastSeen: Date.now() }).catch(console.error);

      // Broadcast updated agent online status to admin
      io.to('admin_room').emit('agent_online', { agentId: socket.userId, socketId: socket.id });
    }

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: visitor or agent joins a chat room
    // Emitted by: website chatbot widget (visitor) OR agent dashboard
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('join_chat', async ({ roomId, visitorName }) => {
      socket.join(roomId);
      console.log(`📥  ${visitorName || socket.userId || 'Unknown'} joined room: ${roomId}`);

      // Update visitor's socketId in DB for direct pushes
      await Chat.findOneAndUpdate(
        { roomId },
        { 'visitor.socketId': socket.id }
      ).catch(console.error);

      // Send chat history to the joiner
      const chat = await Chat.findOne({ roomId }).lean().catch(() => null);
      if (chat) socket.emit('chat_history', chat.messages || []);

      // Tell the other party someone joined
      socket.to(roomId).emit('user_joined', {
        message: `${visitorName || 'Agent'} has joined the chat`,
        timestamp: new Date(),
      });
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: send a message
    // Emitted by: visitor chatbot widget OR agent dashboard
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('send_message', async ({ roomId, text, sender, senderId, type = 'text' }) => {
      if (!roomId || !text) return;

      const message = {
        sender,
        senderId: senderId || null,
        text,
        type,
        createdAt: new Date(),
        isRead: false,
      };

      // Persist to MongoDB
      await Chat.findOneAndUpdate(
        { roomId },
        { $push: { messages: message }, updatedAt: new Date() }
      ).catch(console.error);

      // Broadcast to everyone in room (including sender for confirmation)
      io.to(roomId).emit('receive_message', { ...message, roomId });

      // Notify agent dashboard if message is from visitor
      if (sender === 'visitor') {
        io.to('agents_room').emit('visitor_message_notification', {
          roomId,
          preview: text.substring(0, 80),
          timestamp: new Date(),
        });
      }
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: typing indicator
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('typing_start', ({ roomId, sender }) => {
      socket.to(roomId).emit('typing_indicator', { sender, isTyping: true });
    });

    socket.on('typing_stop', ({ roomId, sender }) => {
      socket.to(roomId).emit('typing_indicator', { sender, isTyping: false });
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: agent accepts a waiting chat from queue
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('accept_chat', async ({ roomId }) => {
      try {
        const chat = await Chat.findOneAndUpdate(
          { roomId, status: 'waiting' },
          {
            assignedAgent: socket.userId,
            agentSocketId: socket.id,
            status: 'active',
            waitTime: 0,
          },
          { new: true }
        );

        if (!chat) {
          return socket.emit('error', { message: 'Chat already taken or not found' });
        }

        socket.join(roomId);

        // Add chat to agent's active list
        await User.findByIdAndUpdate(socket.userId, { $addToSet: { activeChats: chat._id } });

        // Tell the visitor an agent has connected
        io.to(roomId).emit('agent_connected', {
          message: 'A support agent has joined. How can we help you?',
          agentId: socket.userId,
          timestamp: new Date(),
        });

        // Update queue view on all agent dashboards
        io.to('agents_room').emit('chat_queue_update', {
          action: 'accepted',
          roomId,
          agentId: socket.userId,
        });

        socket.emit('chat_accepted', { roomId, chat });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: agent toggles availability (on/off duty)
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('set_availability', async ({ isAvailable }) => {
      await User.findByIdAndUpdate(socket.userId, { isAvailable }).catch(console.error);
      io.to('agents_room').emit('agent_availability_changed', {
        agentId: socket.userId,
        isAvailable,
      });
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: mark messages as read
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('mark_read', async ({ roomId }) => {
      await Chat.updateOne(
        { roomId },
        { $set: { 'messages.$[elem].isRead': true, 'messages.$[elem].readAt': new Date() } },
        { arrayFilters: [{ 'elem.isRead': false }] }
      ).catch(console.error);

      socket.to(roomId).emit('messages_read', { roomId });
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: agent requests admin to join a chat
    // Agent clicks "Request Admin" button on their dashboard
    // Admin sees a notification badge and can click "Join Chat"
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('request_admin', async ({ roomId }) => {
      try {
        const chat = await Chat.findOne({ roomId }).lean();
        if (!chat) return socket.emit('error', { message: 'Chat not found' });

        // Notify all admins in admin_room
        io.to('admin_room').emit('admin_join_request', {
          roomId,
          requestedBy: socket.userId,
          visitor:     chat.visitor,
          issue:       chat.queryContext?.initialMessage || '',
          timestamp:   new Date(),
        });

        // Confirm to the agent
        socket.emit('admin_requested', { roomId, message: 'Admin has been notified.' });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: admin accepts the join request and enters the chat
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('admin_join_chat', async ({ roomId }) => {
      try {
        socket.join(roomId);

        // Update DB — mark admin as observer
        await Chat.findOneAndUpdate(
          { roomId },
          { $set: { adminJoined: true, adminId: socket.userId } }
        );

        // Notify everyone in the room that admin joined
        io.to(roomId).emit('admin_joined', {
          message:   'Admin has joined the conversation.',
          adminId:   socket.userId,
          timestamp: new Date(),
        });

        // Remove the pending request from all admin dashboards
        io.to('admin_room').emit('admin_request_resolved', { roomId });

        socket.emit('admin_join_confirmed', { roomId });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: admin declines the join request
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('admin_decline_request', ({ roomId }) => {
      io.to('admin_room').emit('admin_request_resolved', { roomId });
      // Notify the agent their request was declined
      Chat.findOne({ roomId }).then(chat => {
        if (chat?.agentSocketId) {
          io.to(chat.agentSocketId).emit('admin_declined', {
            roomId,
            message: 'Admin is currently unavailable.',
          });
        }
      }).catch(() => {});
    });

    // ───────────────────────────────────────────────────────────────────────────
    // EVENT: disconnect
    // ───────────────────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`❌  Socket disconnected: ${socket.id}`);

      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, {
          lastSeen: Date.now(),
          socketId: null,
        }).catch(console.error);

        io.to('admin_room').emit('agent_offline', { agentId: socket.userId });
      }
    });
  });
};
// NOTE: The above file already has the module.exports wrapper.
// The code below is appended as a comment — actual addition is done via str_replace.