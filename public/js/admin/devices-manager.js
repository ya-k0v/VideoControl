// devices-manager.js - Управление устройствами
export async function loadDevices(adminFetch, sortDevices, nodeNames) {
  const res = await adminFetch('/api/devices');
  let devices = await res.json();
  devices = sortDevices(devices, nodeNames);
  return devices;
}

export function renderTVList(devicesCache, readyDevices, currentDeviceId, nodeNames, tvPage, getPageSize, sortDevices) {
  const tvList = document.getElementById('tvList');
  if (!tvList) return;
  
  if (!devicesCache.length) {
    tvList.innerHTML = '<li class="item" style="text-align:center; padding:var(--space-xl)"><div style="width:100%"><div class="title">Нет устройств</div><div class="meta">Откройте плеер или добавьте устройство</div></div></li>';
    const pager = document.getElementById('tvPager');
    if (pager) pager.innerHTML = '';
    return;
  }
  
  const sorted = sortDevices(devicesCache);
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const start = tvPage * pageSize;
  const end = Math.min(start + pageSize, sorted.length);
  const pageItems = sorted.slice(start, end);
  
  tvList.innerHTML = pageItems.map(d => {
    const name = d.name || nodeNames[d.device_id] || d.device_id;
    const filesCount = d.files?.length ?? 0;
    const isActive = d.device_id === currentDeviceId;
    const isReady = readyDevices.has(d.device_id);
    return `<li class="tvTile${isActive ? ' active' : ''}" data-id="${d.device_id}"><div class="tvTile-content"><div class="tvTile-header"><div class="title tvTile-name">${name}</div><span class="tvTile-status ${isReady ? 'online' : 'offline'}" title="${isReady ? 'Готов' : 'Не готов'}"></span></div><div class="meta tvTile-meta">ID: ${d.device_id}</div><div class="meta">Файлов: ${filesCount}</div></div></li>`;
  }).join('');
}
