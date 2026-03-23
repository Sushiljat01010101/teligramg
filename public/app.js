document.addEventListener('DOMContentLoaded', () => {
  let socket = null;
  const gallery = document.getElementById('gallery');
  const emptyState = document.getElementById('empty-state');
  const themeToggle = document.getElementById('themeToggle');
  const searchInput = document.getElementById('searchInput');
  const html = document.documentElement;

  // View Elements
  const authView = document.getElementById('auth-view');
  const appView = document.getElementById('app-view');
  const authForm = document.getElementById('auth-form');
  const authUsername = document.getElementById('auth-username');
  const authPassword = document.getElementById('auth-password');
  const authSwitchBtn = document.getElementById('auth-switch-btn');
  const authTitle = document.getElementById('auth-title');
  const authBtn = document.getElementById('auth-submit-btn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Profile Elements
  const profileToggle = document.getElementById('profileToggle');
  const profileModal = document.getElementById('profile-modal');
  const profileClose = document.getElementById('profile-close');
  const profileForm = document.getElementById('profile-form');
  const profileBotToken = document.getElementById('profile-bot-token');
  const profileChatId = document.getElementById('profile-chat-id');

  // Lightbox elements
  const lightbox = document.getElementById('lightbox');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxMediaCont = document.getElementById('lightbox-media-container');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxDownload = document.getElementById('lightbox-download');
  
  let currentFilter = 'all';
  let allMedia = [];
  let isLogin = true;

  // Initialize Theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);

  // Toast System
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'i'}</div>
      <div class="toast-message">${message}</div>
    `;
    document.body.appendChild(toast);
    
    // trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });

  // Check Auth on load
  checkAuth();

  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    };
  }

  async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      showAuth();
      return;
    }

    try {
      const res = await fetch('/api/user/profile', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        profileBotToken.value = data.telegram_bot_token || '';
        profileChatId.value = data.telegram_chat_id || '';
        showApp();
      } else {
        localStorage.removeItem('token');
        showAuth();
      }
    } catch(err) {
      showAuth();
    }
  }

  function showAuth() {
    authView.classList.remove('section-hidden');
    appView.classList.add('section-hidden');
  }

  function showApp() {
    authView.classList.add('section-hidden');
    appView.classList.remove('section-hidden');
    
    // Connect socket
    if (socket) socket.disconnect();
    socket = io({ auth: { token: localStorage.getItem('token') } });
    setupSocketListeners();
    
    fetchMedia();
  }

  authSwitchBtn.addEventListener('click', () => {
    isLogin = !isLogin;
    authTitle.innerText = isLogin ? 'Login' : 'Register';
    authBtn.innerText = isLogin ? 'Login' : 'Register';
    document.getElementById('auth-switch-text').innerText = isLogin ? "Don't have an account?" : "Already have an account?";
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const originalText = authBtn.innerText;
    authBtn.innerText = 'Loading...';
    authBtn.disabled = true;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername.value, password: authPassword.value })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        showToast(`Welcome ${isLogin ? 'back' : ''}, ${data.user.username}!`, 'success');
        checkAuth();
      } else {
        showToast(data.error || 'Authentication failed', 'error');
      }
    } catch(err) {
      showToast('Network error while authenticating', 'error');
    } finally {
      authBtn.innerText = originalText;
      authBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    if (socket) socket.disconnect();
    showToast('Logged out successfully', 'success');
    showAuth();
  });

  // Profile Modal
  profileToggle.addEventListener('click', () => profileModal.classList.remove('hidden'));
  profileClose.addEventListener('click', () => profileModal.classList.add('hidden'));

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const profileSaveBtn = document.getElementById('profile-save-btn');
    const originalText = profileSaveBtn.innerText;
    profileSaveBtn.innerText = 'Verifying Token...';
    profileSaveBtn.disabled = true;

    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          telegram_bot_token: profileBotToken.value,
          telegram_chat_id: profileChatId.value
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Bot Configuration Saved! Successfully connected.', 'success');
        profileModal.classList.add('hidden');
      } else {
        showToast(data.error || 'Failed to save profile', 'error');
      }
    } catch(err) {
      showToast('Network error while saving profile', 'error');
    } finally {
      profileSaveBtn.innerText = originalText;
      profileSaveBtn.disabled = false;
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderGallery();
    });
  }

  async function fetchMedia() {
    try {
      const res = await fetch('/api/media?limit=100', { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      allMedia = data;
      renderTabs();
      renderGallery();
    } catch (err) {
      console.error("Failed to fetch media", err);
    }
  }

  function setupSocketListeners() {
    socket.on('new_media', (mediaItem) => {
      if (mediaItem.mediaGroupId && mediaItem.caption) {
        allMedia.forEach(m => {
          if (m.mediaGroupId === mediaItem.mediaGroupId) {
            m.caption = mediaItem.caption;
          }
        });
      }

      if (!allMedia.find(m => m.messageId === mediaItem.messageId)) {
        allMedia.unshift(mediaItem);
      }
      renderTabs();
      renderGallery();
    });

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
  }

  function renderTabs() {
    const defaultTabs = [
      { id: 'all', label: 'All Media' },
      { id: 'photo', label: 'Photos' },
      { id: 'video', label: 'Videos' },
      { id: 'document', label: 'Documents' }
    ];

    const uniqueCaptions = [...new Set(allMedia
      .filter(m => m.type !== 'document' && m.caption && m.caption.trim() !== '')
      .map(m => m.caption)
    )];

    const allTabs = [...defaultTabs];
    uniqueCaptions.forEach(cap => {
      if (cap.length < 35 && !cap.includes('.')) {
        allTabs.push({ id: `caption:${cap}`, label: `📁 ${cap}` });
      } else if (cap.length >= 35) {
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
        renderTabs(); 
        renderGallery();
      });
      tabsContainer.appendChild(btn);
    });
  }

  function renderGallery() {
    gallery.innerHTML = '';
    const headerDiv = document.getElementById('gallery-header');
    if (headerDiv) headerDiv.innerHTML = '';
    
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    if (currentFilter.startsWith('caption:')) {
      const targetCaption = currentFilter.replace('caption:', '');
      const delBtn = document.createElement('button');
      delBtn.className = 'btn delete-btn';
      delBtn.innerText = '🗑️ Delete Entire Folder';
      delBtn.onclick = async () => {
        if(confirm(`Are you sure you want to delete all media in "${targetCaption}"?`)){
          await fetch(`/api/category/${encodeURIComponent(targetCaption)}`, { 
            method: 'DELETE',
            headers: getHeaders()
          });
          currentFilter = 'all'; 
        }
      };
      if (headerDiv) headerDiv.appendChild(delBtn);
    }
    
    const filtered = allMedia.filter(item => {
      if (query && (!item.caption || !item.caption.toLowerCase().includes(query))) return false;
      if (currentFilter === 'all') return true;
      if (currentFilter === 'photo' && item.type === 'photo') return true;
      if (currentFilter === 'video' && item.type === 'video') return true;
      if (currentFilter === 'document' && item.type === 'document') return true;
      if (currentFilter.startsWith('caption:')) return item.caption === currentFilter.replace('caption:', '');
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

    const token = localStorage.getItem('token');
    const proxyUrl = `/api/proxy/${item.fileId}?token=${token}`;
    
    let mediaHTML = '';
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

    const deleteBtn = div.querySelector('.card-delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); 
      if (confirm('Are you sure you want to delete this media?')) {
        await fetch('/api/media/' + item.id, { 
          method: 'DELETE',
          headers: getHeaders()
        });
      }
    });

    div.addEventListener('click', () => {
      if (item.type === 'document') {
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
    lightboxMediaCont.innerHTML = ''; 
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target.classList.contains('lightbox-overlay')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox();
  });
});
