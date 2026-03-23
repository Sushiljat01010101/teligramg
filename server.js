require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const request = require('https'); 

const { 
  getMedia, deleteMedia, deleteMediaByCaption, 
  createUser, getUserByUsername, getUserById, updateUserBotConfig 
} = require('./database');
const { authenticateToken, generateToken, JWT_SECRET } = require('./auth');
const jwt = require('jsonwebtoken');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Init Telegram Bots for all active users
const { initAllBots, startUserBot, getFileStreamOrUrl } = require('./bot');
initAllBots(io);

// Socket Middleware for Auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Authentication error'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  if (socket.user) {
    socket.join(`user_${socket.user.id}`);
  }
});

// --- AUTH API ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  
  const existing = await getUserByUsername(username);
  if (existing) return res.status(400).json({ error: 'Username taken' });

  const hash = await bcrypt.hash(password, 10);
  const user = await createUser(username, hash);
  if (!user) return res.status(500).json({ error: 'Database error' });

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await getUserByUsername(username);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

// --- PROFILE API ---
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ telegram_bot_token: user.telegram_bot_token, telegram_chat_id: user.telegram_chat_id });
});

app.post('/api/user/profile', authenticateToken, async (req, res) => {
  const { telegram_bot_token, telegram_chat_id } = req.body;

  // 1. Verify token is authentic
  if (telegram_bot_token) {
    try {
      const testBot = new TelegramBot(telegram_bot_token, { polling: false });
      await testBot.getMe();
    } catch (err) {
      return res.status(400).json({ error: 'Invalid Telegram Bot Token. Please check BotFather.' });
    }
  }

  try {
    const user = await updateUserBotConfig(req.user.id, telegram_bot_token, telegram_chat_id);
    if (!user) return res.status(500).json({ error: 'Database error while saving profile.' });

    // Update dynamic bot
    startUserBot(user.id, user.telegram_bot_token, user.telegram_chat_id, io);
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'TOKEN_IN_USE') {
      return res.status(400).json({ error: 'This Bot Token is already registered to another user.' });
    }
    return res.status(500).json({ error: 'Unknown Server Error' });
  }
});

// --- MEDIA API ---
app.get('/api/media', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const type = req.query.type || 'all';
    const caption = req.query.caption || null;
    const search = req.query.search || null;
    
    const items = await require('./database').getMedia(req.user.id, limit, offset, type, caption, search);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await require('./database').getCategories(req.user.id);
    res.json(categories);
  } catch (err) {
    res.json([]);
  }
});

// Proxy endpoint
app.get('/api/proxy/:fileId', authenticateToken, async (req, res) => {
  const fileId = req.params.fileId;
  const userId = req.user.id;
  if (!fileId) return res.status(400).send('File ID required');

  try {
    const fileUrl = await getFileStreamOrUrl(userId, fileId);
    if (!fileUrl) return res.status(404).send('File not found/Bot inactive');

    request.get(fileUrl, (externalRes) => {
      if (externalRes.headers['content-type']) res.setHeader('Content-Type', externalRes.headers['content-type']);
      if (externalRes.headers['content-length']) res.setHeader('Content-Length', externalRes.headers['content-length']);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      
      externalRes.pipe(res);
    }).on('error', (err) => {
      console.error("Proxy error:", err);
      res.status(500).send('Proxy error');
    });

  } catch (err) {
    console.error("Error in proxy:", err);
    res.status(500).send('Server Error');
  }
});

app.delete('/api/media/:id', authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id);
  const success = await deleteMedia(req.user.id, id);
  if (success) {
    io.to(`user_${req.user.id}`).emit('media_deleted', id);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.delete('/api/category/:caption', authenticateToken, async (req, res) => {
  const caption = req.params.caption;
  const success = await deleteMediaByCaption(req.user.id, caption);
  if (success) {
    io.to(`user_${req.user.id}`).emit('category_deleted', caption);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
