# 🖨️ Printer Support — Backend API

Node.js + Express + MongoDB + Socket.IO backend for a printer support platform with real-time live chat, lead management, agent dashboard, and CMS.

---

## 📁 Project Structure

```
printer-support-backend/
├── server.js                    # Entry point — Express + Socket.IO
├── seeder.js                    # Run once to seed admin + sample data
├── .env.example                 # Copy to .env and fill in values
│
├── config/
│   └── db.js                    # MongoDB connection
│
├── models/
│   ├── User.model.js            # Visitors, Agents, Admins
│   ├── Lead.model.js            # Contact form submissions / CRM
│   ├── Chat.model.js            # Chat sessions + messages
│   └── CMS.model.js             # Website content (pages, FAQs)
│
├── controllers/
│   ├── auth.controller.js       # Register, login, profile
│   ├── leads.controller.js      # Create & manage leads
│   ├── chat.controller.js       # REST endpoints for chat sessions
│   ├── cms.controller.js        # Content management
│   └── admin.controller.js      # Stats, agent management
│
├── routes/
│   ├── auth.routes.js
│   ├── leads.routes.js
│   ├── chat.routes.js
│   ├── agent.routes.js
│   ├── cms.routes.js
│   └── admin.routes.js
│
├── middlewares/
│   └── auth.middleware.js       # JWT protect + role authorise
│
├── sockets/
│   └── chat.socket.js           # ⚡ All real-time logic lives here
│
├── services/
│   └── email.service.js         # Lead notifications, confirmations
│
└── utils/
    └── socket-client.example.js # Frontend integration guide
```

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, SMTP settings

# 3. Seed default admin and sample data
node seeder.js

# 4. Start development server
npm run dev
```

**Default credentials after seeding:**
- Admin: `admin@yourprintershop.com` / `Admin@12345`
- Agent: `agent1@support.com` / `Agent@12345`

---

## 📡 REST API Reference

### Auth
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/login` | Public | Login (visitor/agent/admin) |
| POST | `/api/auth/register` | Public | Register visitor account |
| GET  | `/api/auth/me` | Protected | Get current user |
| PUT  | `/api/auth/update-password` | Protected | Change password |

### Leads (Contact Form)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/leads` | Public | Submit contact form |
| GET  | `/api/leads` | Agent/Admin | List leads (filter by status, priority) |
| GET  | `/api/leads/:id` | Agent/Admin | Get single lead |
| PUT  | `/api/leads/:id` | Agent/Admin | Update status, assign, add note |
| DELETE | `/api/leads/:id` | Admin | Delete lead |

### Chat
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/chat/initiate` | Public | Chatbot creates session, auto-assigns agent |
| GET  | `/api/chat/history/:roomId` | Public | Fetch message history |
| GET  | `/api/chat/queue` | Agent/Admin | See waiting chats |
| GET  | `/api/chat/my-chats` | Agent | Agent's active chats |
| POST | `/api/chat/:roomId/close` | Agent/Admin | Close session, optionally convert to lead |
| GET  | `/api/chat/all` | Admin | All sessions with filters |

### CMS (Website Content)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/cms` | Public | List published content (`?type=faq`) |
| GET | `/api/cms/:slug` | Public | Get page by slug |
| POST | `/api/cms` | Admin | Create content |
| PUT  | `/api/cms/:id` | Admin | Update content |
| PATCH | `/api/cms/:id/publish` | Admin | Toggle publish |
| DELETE | `/api/cms/:id` | Admin | Delete content |

### Admin
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/admin/stats` | Admin | Dashboard counts |
| GET | `/api/admin/agents` | Admin | List all agents |
| POST | `/api/admin/agents` | Admin | Create agent account |
| PUT  | `/api/admin/agents/:id` | Admin | Update agent |
| DELETE | `/api/admin/agents/:id` | Admin | Deactivate agent |

---

## ⚡ Real-Time Socket.IO Events

### Visitor → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join_chat` | `{ roomId, visitorName }` | Join a chat room |
| `send_message` | `{ roomId, text, sender }` | Send a message |
| `typing_start` | `{ roomId, sender }` | Show typing indicator |
| `typing_stop` | `{ roomId, sender }` | Hide typing indicator |

### Agent → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `accept_chat` | `{ roomId }` | Pick up a waiting chat |
| `send_message` | `{ roomId, text, sender, senderId }` | Reply to visitor |
| `set_availability` | `{ isAvailable }` | Go on/off duty |
| `mark_read` | `{ roomId }` | Mark messages as read |

### Server → Client
| Event | Who Receives | Description |
|-------|-------------|-------------|
| `receive_message` | Room members | New message in room |
| `chat_history` | Joiner | Full message history on join |
| `agent_connected` | Visitor | Agent has joined the chat |
| `typing_indicator` | Room members | `{ sender, isTyping }` |
| `new_chat_assigned` | Agent | Auto-assigned new chat |
| `chat_queue_update` | agents_room | Queue added/removed/accepted |
| `new_lead` | agents_room | New contact form submission |
| `lead_updated` | agents_room | Lead status changed |
| `messages_read` | Room members | Read receipts |
| `chat_closed` | Room members | Session ended |

---

## 🔄 Chat Flow Explained

```
Visitor opens chatbot
       ↓
Chatbot collects: name, email, phone, printer brand, issue
       ↓
POST /api/chat/initiate  →  creates Chat doc, finds free agent
       ↓
If agent available  →  status: "active"  →  agent notified via socket
If no agent         →  status: "waiting" →  queued in agents_room
       ↓
socket: join_chat(roomId)  ←  both visitor and agent join same room
       ↓
socket: send_message  ↔  real-time bidirectional messaging
       ↓
Agent closes chat  →  POST /api/chat/:roomId/close
       →  optionally convertToLead: true  →  creates Lead record
```

---

## 🛡️ Roles & Permissions

| Feature | Visitor | Agent | Admin |
|---------|---------|-------|-------|
| Submit contact form | ✅ | ✅ | ✅ |
| Start chat session | ✅ | ✅ | ✅ |
| View own leads | — | ✅ | ✅ |
| View all leads | — | — | ✅ |
| Manage agents | — | — | ✅ |
| Edit website content | — | — | ✅ |
| View dashboard stats | — | — | ✅ |
