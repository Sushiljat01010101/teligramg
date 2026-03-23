require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_KEY is missing in .env! Database features will not work.");
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

module.exports = {
  // --- USER AUTHENTICATION & PROFILE ---
  createUser: async (username, passwordHash) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([{ username, password: passwordHash }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Error creating user:", err.message);
      return null;
    }
  },

  getUserByUsername: async (username) => {
    try {
      const { data } = await supabase.from('users').select('*').eq('username', username).single();
      return data;
    } catch (err) {
      return null;
    }
  },

  getUserById: async (id) => {
    try {
      const { data } = await supabase.from('users').select('*').eq('id', id).single();
      return data;
    } catch (err) {
      return null;
    }
  },

  updateUserBotConfig: async (id, botToken, chatId) => {
    try {
      if (botToken) {
        // Ensure no other user is using this bot token
        const { data: existing } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_bot_token', botToken)
          .neq('id', id)
          .single();

        if (existing) {
          throw new Error('TOKEN_IN_USE');
        }
      }

      const { data, error } = await supabase
        .from('users')
        .update({ telegram_bot_token: botToken, telegram_chat_id: chatId })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      if (err.message === 'TOKEN_IN_USE') throw err;
      console.error("Error updating user config:", err.message);
      return null;
    }
  },

  getAllActiveUsers: async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .not('telegram_bot_token', 'is', null)
        .neq('telegram_bot_token', '');
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("Error fetching active users:", err.message);
      return [];
    }
  },

  // --- MEDIA FUNCTIONS ---
  insertMedia: async (userId, data) => {
    try {
      // Prevent duplicates by messageId per user
      const { data: existing } = await supabase
        .from('media')
        .select('id')
        .match({ messageId: data.messageId, user_id: userId })
        .single();

      if (existing) return null;

      let newMedia = { ...data, user_id: userId };

      // Auto-sync captions for albums
      if (newMedia.mediaGroupId) {
        if (newMedia.caption) {
          await supabase
            .from('media')
            .update({ caption: newMedia.caption })
            .match({ mediaGroupId: newMedia.mediaGroupId, user_id: userId });
        } else {
          const { data: sibling } = await supabase
            .from('media')
            .select('caption')
            .match({ mediaGroupId: newMedia.mediaGroupId, user_id: userId })
            .not('caption', 'is', null)
            .limit(1)
            .single();

          if (sibling && sibling.caption) {
            newMedia.caption = sibling.caption;
          }
        }
      }

      const { data: inserted, error } = await supabase
        .from('media')
        .insert([newMedia])
        .select()
        .single();

      if (error) {
        console.error("Supabase Insert Error:", error);
        return null;
      }
      return inserted;
    } catch (err) {
      console.error("Database integration error:", err);
      return null;
    }
  },
  
  getMedia: async (userId, limit = 50, offset = 0) => {
    try {
      const { data, error } = await supabase
        .from('media')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("Supabase getMedia Error:", err);
      return [];
    }
  },
  
  getMediaById: async (userId, id) => {
    try {
      const { data } = await supabase.from('media').select('*').match({ id: id, user_id: userId }).single();
      return data;
    } catch (err) {
      return null;
    }
  },
  
  deleteMedia: async (userId, id) => {
    try {
      const { error } = await supabase.from('media').delete().match({ id: id, user_id: userId });
      return !error;
    } catch (err) {
      console.error("Supabase deleteMedia Error:", err);
      return false;
    }
  },
  
  deleteMediaByCaption: async (userId, caption) => {
    try {
      const { error } = await supabase.from('media').delete().match({ caption: caption, user_id: userId });
      return !error;
    } catch (err) {
      console.error("Supabase deleteMediaByCaption Error:", err);
      return false;
    }
  }
};
