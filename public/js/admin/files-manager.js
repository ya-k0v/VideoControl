// files-manager.js - Управление списком файлов
import { adminFetch } from './auth.js';
import { getFileDisplayInfo } from '../shared/file-utils.js';

export async function loadFilesWithStatus(deviceId) {
  const res = await adminFetch(`/api/devices/${deviceId}/files-with-status`);
  return await res.json();
}

export async function refreshFilesPanel(deviceId, panelEl) {
  const files = await loadFilesWithStatus(deviceId);
  const filesData = files.map(f => ({
    safeName: f.name || f.safeName,
    originalName: f.originalName,
    status: f.status || 'ready',
    progress: f.progress || 100,
    canPlay: f.canPlay !== false,
    error: f.error || null,
    resolution: f.resolution || null
  }));
  
  panelEl.innerHTML = `<ul class="list" style="display:grid; gap:var(--space-sm)">${filesData.map(file => {
    const info = getFileDisplayInfo(file.safeName, file.originalName, file.resolution);
    const isProcessing = file.status === 'processing' || file.status === 'checking';
    let statusIcon = '';
    if (info.isVideo) {
      statusIcon = isProcessing ? '⏳' : file.status === 'error' ? '✗' : '✓';
    }
    return `<li class="file-item" draggable="${file.canPlay}" data-device-id="${deviceId}" data-file-name="${encodeURIComponent(file.safeName)}"><div class="file-item-header"><div style="flex:1; min-width:0;"><span class="file-item-name">${file.originalName}</span></div><div style="display:flex; gap:4px;">${statusIcon ? `<span>${statusIcon}</span>` : ''}${info.resolutionLabel ? `<span style="font-size:10px">${info.resolutionLabel}</span>` : ''}<span class="file-item-type">${info.typeLabel}</span></div></div></li>`;
  }).join('')}</ul>`;
}
