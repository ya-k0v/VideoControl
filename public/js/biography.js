/**
 * Biography Module - Public View
 * Поиск и просмотр биографий
 */

// Глобальное состояние
let currentBiography = null;
let currentMediaIndex = 0;

// DOM элементы
const searchInput = document.getElementById('searchInput');
const suggestions = document.getElementById('suggestions');
const content = document.getElementById('biographyContent');
const emptyState = document.getElementById('emptyState');
const lightbox = document.getElementById('lightbox');

// ========================================
// Debounce Helper
// ========================================

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ========================================
// Search with Autocomplete
// ========================================

searchInput.addEventListener('input', debounce(async (e) => {
  const query = e.target.value.trim();
  
  // Скрыть suggestions если запрос короткий
  if (query.length < 2) {
    suggestions.style.display = 'none';
    return;
  }
  
  try {
    const results = await fetch(`/api/biographies/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json());
    
    if (results.length === 0) {
      suggestions.innerHTML = '<div class="suggestion-item" style="cursor:default;color:var(--muted);">Не найдено</div>';
      suggestions.style.display = 'block';
    } else {
      suggestions.innerHTML = results.map(bio => `
        <div class="suggestion-item" data-id="${bio.id}">
          <strong>${bio.full_name}</strong><br/>
          <span style="font-size:0.875rem;color:var(--muted);">
            ${bio.birth_year || '?'} - ${bio.death_year || 'н.в.'}
            ${bio.rank ? ` • ${bio.rank}` : ''}
          </span>
        </div>
      `).join('');
      suggestions.style.display = 'block';
    }
  } catch (error) {
    console.error('[Biography] Search error:', error);
    suggestions.innerHTML = '<div class="suggestion-item" style="cursor:default;color:var(--error);">Ошибка поиска</div>';
    suggestions.style.display = 'block';
  }
}, 300));

// ========================================
// Click on Suggestion
// ========================================

suggestions.addEventListener('click', async (e) => {
  const item = e.target.closest('.suggestion-item');
  if (!item || !item.dataset.id) return;
  
  await loadBiography(item.dataset.id);
  suggestions.style.display = 'none';
  searchInput.value = '';
});

// Скрыть suggestions при клике вне
document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
    suggestions.style.display = 'none';
  }
});

// ========================================
// Load Biography
// ========================================

async function loadBiography(id) {
  try {
    const bio = await fetch(`/api/biographies/${id}`).then(r => r.json());
    
    if (!bio) {
      alert('Биография не найдена');
      return;
    }
    
    currentBiography = bio;
    renderBiography(bio);
    
    // Скрыть empty state
    if (emptyState) emptyState.style.display = 'none';
    content.style.display = 'block';
    
  } catch (error) {
    console.error('[Biography] Load error:', error);
    alert('Ошибка загрузки биографии');
  }
}

// ========================================
// Render Biography
// ========================================

function renderBiography(bio) {
  content.innerHTML = `
    <div class="biography-header">
      <img src="${bio.photo_base64 || '/icon.svg'}" 
           class="biography-photo" 
           alt="${bio.full_name}"
           onerror="this.src='/icon.svg'"/>
      <div class="biography-info">
        <h1>${bio.full_name}</h1>
        <div class="biography-info-item">
          <strong>Годы жизни:</strong> 
          <span>${bio.birth_year || '?'} - ${bio.death_year || 'н.в.'}</span>
        </div>
        ${bio.rank ? `
          <div class="biography-info-item">
            <strong>Звание:</strong> 
            <span>${bio.rank}</span>
          </div>
        ` : ''}
      </div>
    </div>
    
    <div class="biography-text">
      ${bio.biography || '<em style="color:var(--muted);">Биография отсутствует</em>'}
    </div>
    
    ${bio.media && bio.media.length > 0 ? `
      <h2 class="media-section-title">Дополнительные материалы (${bio.media.length})</h2>
      <div class="media-gallery">
        ${bio.media.map((m, i) => renderMediaItem(m, i)).join('')}
      </div>
    ` : ''}
  `;
}

// ========================================
// Render Media Item
// ========================================

function renderMediaItem(media, index) {
  if (media.type === 'photo') {
    return `
      <div class="media-item" onclick="window.openLightbox(${index})">
        <img src="${media.media_base64}" alt="${media.caption || ''}" loading="lazy"/>
        ${media.caption ? `<div class="media-item-caption">${media.caption}</div>` : ''}
      </div>
    `;
  } else {
    return `
      <div class="media-item" onclick="window.openLightbox(${index})">
        <video src="${media.media_base64}" preload="metadata"></video>
        ${media.caption ? `<div class="media-item-caption">${media.caption}</div>` : ''}
      </div>
    `;
  }
}

// ========================================
// Lightbox
// ========================================

window.openLightbox = (index) => {
  if (!currentBiography || !currentBiography.media) return;
  
  currentMediaIndex = index;
  const media = currentBiography.media[index];
  const totalMedia = currentBiography.media.length;
  
  lightbox.innerHTML = `
    <div class="lightbox-overlay">
      <button class="lightbox-close" onclick="window.closeLightbox()">✕ Закрыть</button>
      
      ${index > 0 ? `
        <button class="lightbox-nav prev" onclick="window.prevMedia()">←</button>
      ` : ''}
      
      ${index < totalMedia - 1 ? `
        <button class="lightbox-nav next" onclick="window.nextMedia()">→</button>
      ` : ''}
      
      <div class="lightbox-content">
        ${media.type === 'photo' 
          ? `<img src="${media.media_base64}" alt="${media.caption || ''}"/>` 
          : `<video src="${media.media_base64}" controls autoplay style="max-width:100%;max-height:90vh;"/>`
        }
        ${media.caption ? `
          <div style="text-align:center;color:white;margin-top:16px;font-size:1rem;">
            ${media.caption}
          </div>
        ` : ''}
      </div>
      
      <div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:white;font-size:0.875rem;">
        ${index + 1} / ${totalMedia}
      </div>
    </div>
  `;
  
  lightbox.style.display = 'block';
  document.body.style.overflow = 'hidden';
};

window.closeLightbox = () => {
  lightbox.style.display = 'none';
  lightbox.innerHTML = '';
  document.body.style.overflow = '';
};

window.prevMedia = () => {
  if (currentMediaIndex > 0) {
    window.openLightbox(currentMediaIndex - 1);
  }
};

window.nextMedia = () => {
  if (currentMediaIndex < currentBiography.media.length - 1) {
    window.openLightbox(currentMediaIndex + 1);
  }
};

// Закрыть lightbox по Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lightbox.style.display === 'block') {
    window.closeLightbox();
  } else if (e.key === 'ArrowLeft' && lightbox.style.display === 'block') {
    window.prevMedia();
  } else if (e.key === 'ArrowRight' && lightbox.style.display === 'block') {
    window.nextMedia();
  }
});

console.log('[Biography] ✅ Module loaded');

