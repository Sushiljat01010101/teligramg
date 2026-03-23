require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { insertMedia, getAllActiveUsers } = require('./database');

// Map to store active bot instances by userId
const activeBots = new Map();

async function initAllBots(io) {
  try {
    const users = await getAllActiveUsers();
    console.log(`Found ${users.length} active users with bot configurations.`);
    for (const user of users) {
      if (user.telegram_bot_token) {
        startUserBot(user.id, user.telegram_bot_token, user.telegram_chat_id, io);
      }
    }
  } catch (err) {
    console.error("Error initializing all bots:", err);
  }
}

function startUserBot(userId, token, chatIdStr, io) {
  // Stop existing bot if running
  if (activeBots.has(userId)) {
    try {
      const oldBot = activeBots.get(userId);
      oldBot.stopPolling();
    } catch(e) {}
    activeBots.delete(userId);
  }

  if (!token) return;

  try {
    const bot = new TelegramBot(token, { polling: true });
    
    bot.on('message', async (msg) => {
      // Filter by specific CHAT_ID if provided for this user
      if (chatIdStr && msg.chat.id.toString() !== chatIdStr) return;

      let fileData = null;
      const mediaGroupId = msg.media_group_id || null;

      if (msg.photo && msg.photo.length > 0) {
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
          type: 'video',
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
        const inserted = await insertMedia(userId, fileData);
        if (inserted) {
          console.log(`Saved new media for user ${userId}: ${fileData.type}`);
          // Emit to specific user's socket room
          io.to(`user_${userId}`).emit('new_media', inserted);
        }
      }
    });

    bot.on("polling_error", (err) => console.log(`Polling error for user ${userId}:`, err.message));
    
    activeBots.set(userId, bot);
    console.log(`Started Telegram Bot for user ${userId}`);
  } catch (err) {
    console.error(`Failed to start bot for user ${userId}:`, err);
  }
}

async function getFileStreamOrUrl(userId, fileId) {
  const bot = activeBots.get(userId);
  if (!bot) return null;

  try {
    const fileLink = await bot.getFileLink(fileId);
    return fileLink;
  } catch (err) {
    console.error(`Error fetching file link for user ${userId}:`, err);
    return null;
  }
}

module.exports = { initAllBots, startUserBot, getFileStreamOrUrl };
