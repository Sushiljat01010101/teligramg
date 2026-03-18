require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_KEY is missing in .env! Database features will not work.");
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

module.exports = {
  insertMedia: async (data) => {
    try {
      // Prevent duplicates by messageId
      const { data: existing } = await supabase
        .from('media')
        .select('id')
        .eq('messageId', data.messageId)
        .single();

      if (existing) return null;

      let newMedia = { ...data };

      // Auto-sync captions for albums (media_group_id)
      if (newMedia.mediaGroupId) {
        if (newMedia.caption) {
          // This image has the caption, update all existing ones in the same album
          await supabase
            .from('media')
            .update({ caption: newMedia.caption })
            .eq('mediaGroupId', newMedia.mediaGroupId);
        } else {
          // This image lacks a caption, try to find one from the album
          const { data: sibling } = await supabase
            .from('media')
            .select('caption')
            .eq('mediaGroupId', newMedia.mediaGroupId)
            .not('caption', 'is', null)
            .limit(1)
            .single();

          if (sibling && sibling.caption) {
            newMedia.caption = sibling.caption;
          }
        }
      }

      // Insert new media
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
  
  getMedia: async (limit = 50, offset = 0) => {
    try {
      const { data, error } = await supabase
        .from('media')
        .select('*')
        .order('date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("Supabase getMedia Error:", err);
      return [];
    }
  },
  
  getMediaById: async (id) => {
    try {
      const { data } = await supabase.from('media').select('*').eq('id', id).single();
      return data;
    } catch (err) {
      return null;
    }
  },
  
  deleteMedia: async (id) => {
    try {
      const { error } = await supabase.from('media').delete().eq('id', id);
      return !error;
    } catch (err) {
      console.error("Supabase deleteMedia Error:", err);
      return false;
    }
  },
  
  deleteMediaByCaption: async (caption) => {
    try {
      const { error } = await supabase.from('media').delete().eq('caption', caption);
      return !error;
    } catch (err) {
      console.error("Supabase deleteMediaByCaption Error:", err);
      return false;
    }
  }
};
