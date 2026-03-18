require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const { getMedia } = require('./database');
const request = require('https'); // For manually proxying the telegram file

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Init Telegram Bot
const { initBot, getFileStreamOrUrl } = require('./bot');
initBot(io);

// API endpoint to fetch all media
app.get('/api/media', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const items = await getMedia(limit, offset);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

// Proxy endpoint to prevent URL expiration and CORS issues on canvas/video
app.get('/api/proxy/:fileId', async (req, res) => {
  const fileId = req.params.fileId;
  if (!fileId) return res.status(400).send('File ID required');

  try {
    const fileUrl = await getFileStreamOrUrl(fileId);
    if (!fileUrl) return res.status(404).send('File not found in Telegram');

    // Proxy the request directly to Telegram servers
    request.get(fileUrl, (externalRes) => {
      // Pipe the headers
      if (externalRes.headers['content-type']) {
        res.setHeader('Content-Type', externalRes.headers['content-type']);
      }
      if (externalRes.headers['content-length']) {
        res.setHeader('Content-Length', externalRes.headers['content-length']);
      }
      // Security headers for browser caching (optional, since fileId represents a unique file content)
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

// Delete individual media
app.delete('/api/media/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const success = await require('./database').deleteMedia(id);
  if (success) {
    io.emit('media_deleted', id);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Delete category (all media with the same caption)
app.delete('/api/category/:caption', async (req, res) => {
  const caption = req.params.caption; // exact caption string
  const success = await require('./database').deleteMediaByCaption(caption);
  if (success) {
    io.emit('category_deleted', caption);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
