require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { insertMedia } = require('./database');

const token = process.env.BOT_TOKEN;
const chatIdStr = process.env.CHAT_ID;

// Prevent crashing if token is not available yet
if (!token) {
  console.warn("WARNING: BOT_TOKEN is not defined. The Telegram Bot will not start.");
  module.exports = { initBot: () => {} };
  return;
}

const bot = new TelegramBot(token, { polling: true });

function initBot(io) {
  bot.on('message', async (msg) => {
    // Optional: Filter by specific CHAT_ID if provided
    if (chatIdStr && msg.chat.id.toString() !== chatIdStr) return;

    let fileData = null;
    const mediaGroupId = msg.media_group_id || null;

    if (msg.photo && msg.photo.length > 0) {
      // Telegram sends multiple sizes for photos, get the largest one
      const photo = msg.photo[msg.photo.length - 1];
      fileData = {
        messageId: msg.message_id,
        mediaGroupId: mediaGroupId,
        fileId: photo.file_id,
        fileUniqueId: photo.file_unique_id,
        type: 'photo',
        caption: msg.caption || '',
        mimeType: 'image/jpeg',
        date: msg.date,
        size: photo.file_size
      };
    } else if (msg.video) {
      fileData = {
        messageId: msg.message_id,
        mediaGroupId: mediaGroupId,
        fileId: msg.video.file_id,
        fileUniqueId: msg.video.file_unique_id,
        type: 'video',
        caption: msg.caption || '',
        mimeType: msg.video.mime_type,
        date: msg.date,
        size: msg.video.file_size
      };
    } else if (msg.document) {
      // Exclude application/zip or general files if you only want media? 
      // The requirement says "image video aur files hogi unko read karega" (all files).
      fileData = {
        messageId: msg.message_id,
        mediaGroupId: mediaGroupId,
        fileId: msg.document.file_id,
        fileUniqueId: msg.document.file_unique_id,
        type: 'document',
        caption: msg.caption || msg.document.file_name || '',
        mimeType: msg.document.mime_type,
        date: msg.date,
        size: msg.document.file_size
      };
    } else if (msg.animation) {
      fileData = {
        messageId: msg.message_id,
        mediaGroupId: mediaGroupId,
        fileId: msg.animation.file_id,
        fileUniqueId: msg.animation.file_unique_id,
        type: 'video', // we can treat gifs/animations as video
        caption: msg.caption || '',
        mimeType: msg.animation.mime_type,
        date: msg.date,
        size: msg.animation.file_size
      };
    } else if (msg.audio) {
      fileData = {
        messageId: msg.message_id,
        mediaGroupId: mediaGroupId,
        fileId: msg.audio.file_id,
        fileUniqueId: msg.audio.file_unique_id,
        type: 'audio',
        caption: msg.caption || msg.audio.title || msg.audio.file_name || '',
        mimeType: msg.audio.mime_type,
        date: msg.date,
        size: msg.audio.file_size
      };
    }

    if (fileData) {
      const inserted = await insertMedia(fileData);
      if (inserted) {
        console.log(`Saved new media: ${fileData.type}`);
        // Emit to socket clients so frontend updates instantly
        io.emit('new_media', inserted);
      }
    }
  });

  bot.on("polling_error", console.log);
  console.log("Telegram Bot initialized and polling...");
}

// Function to fetch file stream or buffer directly via bot api 
// (For proxying to the frontend so the url doesn't expire)
async function getFileStreamOrUrl(fileId) {
  try {
    const fileLink = await bot.getFileLink(fileId);
    return fileLink;
  } catch (err) {
    console.error("Error fetching file link:", err);
    return null;
  }
}

module.exports = { initBot, getFileStreamOrUrl };
