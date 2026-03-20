const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const cors       = require('cors');
require('dotenv').config();

const app    = express();
const compression = require('compression');
const server = http.createServer(app);

app.use(compression());


const io = new Server(server, {
  cors: {
    origin:      process.env.CLIENT_URL || 'http://localhost:3000',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:4173',
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth',   require('./routes/auth.routes'));
app.use('/api/leads',  require('./routes/leads.routes'));
app.use('/api/chat',   require('./routes/chat.routes'));
app.use('/api/agent',  require('./routes/agent.routes'));
app.use('/api/agents', require('./routes/agent.routes'));
app.use('/api/cms',    require('./routes/cms.routes'));
app.use('/api/admin',  require('./routes/admin.routes'));
app.use('/api/scrape', require('./routes/scraper.routes'));

// Chatbot alias: PrinterBot posts to /api/chats/new
const { initiateChat } = require('./controllers/chat.controller');
app.post('/api/chats/new', initiateChat);

app.get('/health', (_req, res) =>
  res.json({ status: 'OK', timestamp: new Date() })
);

require('./sockets/chat.socket')(io);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () =>
      console.log(`🚀  Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error('❌  MongoDB connection error:', err.message);
    process.exit(1);
  });