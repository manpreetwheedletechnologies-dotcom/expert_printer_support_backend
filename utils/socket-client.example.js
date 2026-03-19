/**
 * socket-client.example.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Copy this into your frontend project.
 * Install: npm install socket.io-client
 *
 * This covers two clients:
 *   1. VISITOR  — the chatbot widget on your website
 *   2. AGENT    — the support dashboard
 */

import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:5000';

// ═════════════════════════════════════════════════════════════════════════════
// 1. VISITOR CHATBOT WIDGET
// ═════════════════════════════════════════════════════════════════════════════

export const createVisitorSocket = () => {
  // Visitor connects WITHOUT a token
  const socket = io(SERVER_URL, { withCredentials: true });

  /**
   * Step 1 — After chatbot collects visitor info, call the REST API to
   *           initiate the session, then join the returned roomId.
   */
  const startChat = async (visitorInfo) => {
    // POST to backend to create the session and get a roomId
    const res = await fetch(`${SERVER_URL}/api/chat/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visitorInfo),
    });
    const { roomId } = await res.json();

    // Join the Socket.IO room
    socket.emit('join_chat', { roomId, visitorName: visitorInfo.name });

    return roomId;
  };

  /** Step 2 — Send a message */
  const sendMessage = (roomId, text) => {
    socket.emit('send_message', {
      roomId,
      text,
      sender: 'visitor',
    });
  };

  /** Step 3 — Typing indicators */
  const startTyping = (roomId) => socket.emit('typing_start', { roomId, sender: 'visitor' });
  const stopTyping  = (roomId) => socket.emit('typing_stop',  { roomId, sender: 'visitor' });

  // ── Incoming events ──────────────────────────────────────────────────────
  socket.on('chat_history',    (messages)  => console.log('History:', messages));
  socket.on('receive_message', (msg)       => console.log('New message:', msg));
  socket.on('agent_connected', (data)      => console.log('Agent joined:', data.message));
  socket.on('typing_indicator',(data)      => console.log(`Agent typing: ${data.isTyping}`));
  socket.on('chat_closed',     ()          => console.log('Chat ended'));

  return { socket, startChat, sendMessage, startTyping, stopTyping };
};


// ═════════════════════════════════════════════════════════════════════════════
// 2. AGENT DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

export const createAgentSocket = (jwtToken) => {
  // Agent connects WITH a JWT token in the handshake
  const socket = io(SERVER_URL, {
    withCredentials: true,
    auth: { token: jwtToken },
  });

  socket.on('connect', () => console.log('Agent socket connected'));

  /** Agent accepts a chat from the waiting queue */
  const acceptChat = (roomId) => {
    socket.emit('accept_chat', { roomId });
    socket.emit('join_chat', { roomId });
  };

  /** Send a message as agent */
  const sendMessage = (roomId, text, agentId) => {
    socket.emit('send_message', {
      roomId,
      text,
      sender: 'agent',
      senderId: agentId,
    });
  };

  /** Toggle availability (go on/off duty) */
  const setAvailability = (isAvailable) => {
    socket.emit('set_availability', { isAvailable });
  };

  /** Mark all messages in a room as read */
  const markRead = (roomId) => socket.emit('mark_read', { roomId });

  // ── Incoming events (wire these to your dashboard UI state) ──────────────
  socket.on('new_chat_assigned',  (chat)  => console.log('New chat assigned:', chat.roomId));
  socket.on('chat_queue_update',  (data)  => console.log('Queue update:', data));
  socket.on('receive_message',    (msg)   => console.log('Message in room:', msg.roomId, msg.text));
  socket.on('visitor_message_notification', (n) => console.log('Unread from visitor:', n.roomId));
  socket.on('new_lead',           (lead)  => console.log('New lead submitted:', lead));
  socket.on('lead_updated',       (lead)  => console.log('Lead updated:', lead));
  socket.on('typing_indicator',   (data)  => console.log(`Visitor typing: ${data.isTyping}`));
  socket.on('chat_accepted',      (data)  => console.log('Chat accepted:', data.roomId));
  socket.on('error',              (err)   => console.error('Socket error:', err.message));

  return { socket, acceptChat, sendMessage, setAvailability, markRead };
};
