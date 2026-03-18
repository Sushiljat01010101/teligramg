document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  const gallery = document.getElementById('gallery');
  const tabs = document.querySelectorAll('.tab');
  const emptyState = document.getElementById('empty-state');
  const themeToggle = document.getElementById('themeToggle');
  const searchInput = document.getElementById('searchInput');
  const html = document.documentElement;

  // Lightbox elements
  const lightbox = document.getElementById('lightbox');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxMediaCont = document.getElementById('lightbox-media-container');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxDownload = document.getElementById('lightbox-download');
  
  let currentFilter = 'all';
  let allMedia = [];

  // Search Input Listener
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderGallery();
    });
  }

  // Initialize Theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);

  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });

  // Fetch initial media
  fetchMedia();

  async function fetchMedia() {
    try {
      const res = await fetch('/api/media?limit=100');
      const data = await res.json();
      allMedia = data;
      renderTabs();
      renderGallery();
    } catch (err) {
      console.error("Failed to fetch media", err);
    }
  }

  // Socket listener for real-time updates
  socket.on('new_media', (mediaItem) => {
    // Determine if we need to update captions internally
    if (mediaItem.mediaGroupId && mediaItem.caption) {
      // It's a captioned album part. Update existing local media with the same mediaGroupId!
      allMedia.forEach(m => {
        if (m.mediaGroupId === mediaItem.mediaGroupId) {
          m.caption = mediaItem.caption;
        }
      });
    }

    // Check if it already exists (prevent duplicates on edge cases)
    if (!allMedia.find(m => m.messageId === mediaItem.messageId)) {
      allMedia.unshift(mediaItem);
    }

    renderTabs();
    renderGallery();
  });

  // Socket listeners for deletes
  socket.on('media_deleted', (id) => {
    allMedia = allMedia.filter(m => m.id !== id);
    renderTabs();
    renderGallery();
  });

  socket.on('category_deleted', (caption) => {
    allMedia = allMedia.filter(m => m.caption !== caption);
    renderTabs();
    renderGallery();
  });

  // Dynamic Tabs Creation
  function renderTabs() {
    const defaultTabs = [
      { id: 'all', label: 'All Media' },
      { id: 'photo', label: 'Photos' },
      { id: 'video', label: 'Videos' },
      { id: 'document', label: 'Documents' }
    ];

    // Extract unique captions
    const uniqueCaptions = [...new Set(allMedia
      .filter(m => m.type !== 'document' && m.caption && m.caption.trim() !== '')
      .map(m => m.caption)
    )];

    const allTabs = [...defaultTabs];
    uniqueCaptions.forEach(cap => {
      // Skip very long captions or system filenames
      if (cap.length < 35 && !cap.includes('.')) {
        allTabs.push({ id: `caption:${cap}`, label: `📁 ${cap}` });
      } else if (cap.length >= 35) {
        // Fallback for long captions
        allTabs.push({ id: `caption:${cap}`, label: `📁 ${cap.substring(0, 20)}...` });
      }
    });

    const tabsContainer = document.querySelector('.tabs');
    tabsContainer.innerHTML = '';

    allTabs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (currentFilter === t.id ? ' active' : '');
      btn.setAttribute('data-filter', t.id);
      btn.innerText = t.label;
      btn.addEventListener('click', () => {
        currentFilter = t.id;
        renderTabs(); // update active state
        renderGallery();
      });
      tabsContainer.appendChild(btn);
    });
  }

  function renderGallery() {
    gallery.innerHTML = '';
    const headerDiv = document.getElementById('gallery-header');
    if (headerDiv) headerDiv.innerHTML = '';
    
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    // Add "Delete Category" button if we are looking at a specific folder
    if (currentFilter.startsWith('caption:')) {
      const targetCaption = currentFilter.replace('caption:', '');
      const delBtn = document.createElement('button');
      delBtn.className = 'btn delete-btn';
      delBtn.innerText = '🗑️ Delete Entire Folder';
      delBtn.onclick = async () => {
        if(confirm(`Are you sure you want to delete all media in "${targetCaption}"?`)){
          await fetch(`/api/category/${encodeURIComponent(targetCaption)}`, { method: 'DELETE' });
          currentFilter = 'all'; // Reset filter
        }
      };
      if (headerDiv) headerDiv.appendChild(delBtn);
    }
    
    const filtered = allMedia.filter(item => {
      // 1. Text Search Filter
      if (query) {
        if (!item.caption || !item.caption.toLowerCase().includes(query)) {
          return false;
        }
      }

      // 2. Tab Category Filter
      if (currentFilter === 'all') return true;
      if (currentFilter === 'photo' && item.type === 'photo') return true;
      if (currentFilter === 'video' && item.type === 'video') return true;
      if (currentFilter === 'document' && item.type === 'document') return true;
      if (currentFilter.startsWith('caption:')) {
        const targetCaption = currentFilter.replace('caption:', '');
        return item.caption === targetCaption;
      }
      return false;
    });

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
      filtered.forEach((item, index) => {
        const card = createCard(item, index);
        gallery.appendChild(card);
      });
    }
  }

  function createCard(item, index) {
    const formatBytes = (bytes = 0) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const date = new Date(item.date * 1000).toLocaleDateString();
    
    const div = document.createElement('div');
    div.className = 'media-card glass';
    div.style.animationDelay = `${index * 0.05}s`;

    let mediaHTML = '';
    const proxyUrl = `/api/proxy/${item.fileId}`;
    
    if (item.type === 'photo') {
      mediaHTML = `<div class="media-content-container"><img src="${proxyUrl}" class="media-thumbnail" alt="${item.caption || 'Photo'}" loading="lazy" /></div>`;
    } else if (item.type === 'video') {
      mediaHTML = `
        <div class="media-content-container">
          <video src="${proxyUrl}" class="media-thumbnail"></video>
          <div class="video-icon-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>`;
    } else {
      mediaHTML = `
        <div class="document-card">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <strong>${item.caption || 'Document'}</strong>
        </div>`;
    }

    div.innerHTML = `
      <button class="card-delete-btn" aria-label="Delete">🗑️</button>
      ${mediaHTML}
      <div class="media-info">
        ${item.type !== 'document' && item.caption ? `<div class="media-caption">${item.caption}</div>` : ''}
        <div class="media-meta">${date} &bull; ${formatBytes(item.size)}</div>
      </div>
    `;

    // Handle delete action
    const deleteBtn = div.querySelector('.card-delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // prevent opening lightbox
      if (confirm('Are you sure you want to delete this media?')) {
        await fetch('/api/media/' + item.id, { method: 'DELETE' });
      }
    });

    // Click handler for Lightbox or Download
    div.addEventListener('click', () => {
      if (item.type === 'document') {
        // Automatically download via proxy endpoint
        const a = document.createElement('a');
        a.href = proxyUrl;
        a.download = item.caption || 'document';
        a.target = '_blank';
        a.click();
      } else {
        openLightbox(item, proxyUrl);
      }
    });

    return div;
  }

  function openLightbox(item, url) {
    lightboxMediaCont.innerHTML = '';
    
    if (item.type === 'photo') {
      const img = document.createElement('img');
      img.src = url;
      lightboxMediaCont.appendChild(img);
    } else if (item.type === 'video') {
      const vid = document.createElement('video');
      vid.src = url;
      vid.controls = true;
      vid.autoplay = true;
      lightboxMediaCont.appendChild(vid);
    }

    lightboxCaption.textContent = item.caption || '';
    lightboxDownload.href = url;
    lightboxDownload.download = item.caption || `media_${item.type}`;
    
    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
    lightboxMediaCont.innerHTML = ''; // Stop video playback
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    // Close if clicked outside the content
    if (e.target.classList.contains('lightbox-overlay')) {
      closeLightbox();
    }
  });

  // Handle ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
      closeLightbox();
    }
  });
});
