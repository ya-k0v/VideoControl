// ui-helpers.js - UI вспомогательные функции
export function clearDetail() {
  const pane = document.getElementById('detailPane');
  if (pane) pane.innerHTML = '';
}

export function clearFilesPane() {
  const meta = document.getElementById('filesPaneMeta');
  if (meta) meta.innerHTML = '';
  const panel = document.getElementById('filesPanel');
  if (panel) panel.innerHTML = '';
}

export function openDevice(deviceId) {
  const url = new URL(location.href);
  url.searchParams.set('device', deviceId);
  history.replaceState(null, '', url.toString());
}
