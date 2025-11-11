/**
 * System Monitor Module
 * Отображает состояние сервера: CPU, RAM, Disk
 */

let systemInfoInterval = null;
let fetchFunction = null;

/**
 * Инициализация системного монитора
 */
export function initSystemMonitor(adminFetch) {
  console.log('Initializing system monitor...');
  
  fetchFunction = adminFetch;
  
  // Создаем UI для системной информации
  createSystemMonitorUI();
  
  // Загружаем данные сразу
  loadSystemInfo();
  
  // Обновляем каждые 5 секунд
  systemInfoInterval = setInterval(loadSystemInfo, 5000);
}

/**
 * Создать UI для системного монитора
 */
function createSystemMonitorUI() {
  // Проверяем, не создан ли уже
  if (document.getElementById('system-monitor')) {
    return;
  }

  // Находим специальный контейнер для монитора
  const centerDiv = document.getElementById('systemMonitorContainer');
  if (!centerDiv) {
    console.warn('System monitor container not found');
    return;
  }

  const monitorHTML = `
    <div id="system-monitor" class="system-monitor">
      <div class="system-stat" id="cpu-stat" title="Загрузка процессора">
        <span class="stat-icon">🖥️</span>
        <span class="stat-value" id="cpu-value">--</span>
        <div class="stat-bar">
          <div class="stat-bar-fill" id="cpu-bar"></div>
        </div>
      </div>
      
      <div class="system-stat" id="ram-stat" title="Использование оперативной памяти">
        <span class="stat-icon">💾</span>
        <span class="stat-value" id="ram-value">--</span>
        <div class="stat-bar">
          <div class="stat-bar-fill" id="ram-bar"></div>
        </div>
      </div>
      
      <div class="system-stat" id="disk-stat" title="Свободное место на диске">
        <span class="stat-icon">💿</span>
        <span class="stat-value" id="disk-value">--</span>
        <div class="stat-bar">
          <div class="stat-bar-fill" id="disk-bar"></div>
        </div>
      </div>
      
      <div class="system-stat" id="uptime-stat" title="Время работы сервера">
        <span class="stat-icon">⏱️</span>
        <span class="stat-value" id="uptime-value">--</span>
      </div>
    </div>
  `;

  centerDiv.innerHTML = monitorHTML;
  
  // Добавляем стили
  addSystemMonitorStyles();
}

/**
 * Загрузить информацию о системе
 */
async function loadSystemInfo() {
  if (!fetchFunction) {
    console.warn('System monitor: fetchFunction not set');
    return;
  }
  
  try {
    const response = await fetchFunction('/api/system/info');
    
    if (!response.ok) {
      console.error('Failed to load system info:', response.status);
      return;
    }

    const data = await response.json();
    updateSystemMonitorUI(data);
    
  } catch (error) {
    console.error('Error loading system info:', error);
  }
}

/**
 * Обновить UI с данными системы
 */
function updateSystemMonitorUI(data) {
  // CPU
  const cpuValue = document.getElementById('cpu-value');
  const cpuBar = document.getElementById('cpu-bar');
  if (cpuValue && cpuBar && data.cpu) {
    cpuValue.textContent = `${data.cpu.usage}%`;
    cpuBar.style.width = `${data.cpu.usage}%`;
    cpuBar.style.backgroundColor = getColorByUsage(data.cpu.usage);
  }

  // RAM
  const ramValue = document.getElementById('ram-value');
  const ramBar = document.getElementById('ram-bar');
  if (ramValue && ramBar && data.memory) {
    const usagePercent = parseFloat(data.memory.usagePercent);
    ramValue.textContent = `${usagePercent.toFixed(0)}%`;
    ramBar.style.width = `${usagePercent}%`;
    ramBar.style.backgroundColor = getColorByUsage(usagePercent);
  }

  // Disk
  const diskValue = document.getElementById('disk-value');
  const diskBar = document.getElementById('disk-bar');
  if (diskValue && diskBar && data.disk) {
    const usagePercent = parseFloat(data.disk.usagePercent);
    diskValue.textContent = `${usagePercent.toFixed(0)}%`;
    diskBar.style.width = `${usagePercent}%`;
    diskBar.style.backgroundColor = getColorByUsage(usagePercent);
  }

  // Uptime
  const uptimeValue = document.getElementById('uptime-value');
  if (uptimeValue && data.processUptimeFormatted) {
    uptimeValue.textContent = data.processUptimeFormatted;
  }
}

/**
 * Получить цвет по проценту использования
 */
function getColorByUsage(percent) {
  // Используем CSS переменные из app.css
  const root = getComputedStyle(document.documentElement);
  const success = root.getPropertyValue('--success').trim() || '#10b981';
  const warning = root.getPropertyValue('--warning').trim() || '#f59e0b';
  const danger = root.getPropertyValue('--danger').trim() || '#ef4444';
  
  if (percent < 50) return success;
  if (percent < 75) return warning;
  return danger;
}

/**
 * Добавить стили для системного монитора
 */
function addSystemMonitorStyles() {
  const styleId = 'system-monitor-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .system-monitor {
      display: flex;
      align-items: center;
      gap: var(--space-lg);
      padding: var(--space-sm) var(--space-xl);
      background: var(--brand-light);
      border-radius: var(--radius-sm);
      border: var(--border-2);
    }

    .system-stat {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      position: relative;
    }

    .system-stat:not(:last-child)::after {
      content: '';
      position: absolute;
      right: calc(-1 * var(--space-sm));
      width: 1px;
      height: 24px;
      background: var(--muted-2);
      opacity: 0.3;
    }

    .stat-icon {
      font-size: var(--font-size-lg);
      line-height: 1;
      opacity: 0.8;
    }

    .stat-value {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      color: var(--text);
      min-width: 45px;
      text-align: center;
    }

    .stat-bar {
      width: 50px;
      height: 6px;
      background: var(--panel-2);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .stat-bar-fill {
      height: 100%;
      background: var(--success);
      border-radius: var(--radius-sm);
      transition: width var(--transition-base), background-color var(--transition-base);
    }

    /* Адаптивность */
    @media (max-width: 1200px) {
      #uptime-stat {
        display: none;
      }
    }

    @media (max-width: 900px) {
      .system-monitor {
        gap: var(--space-md);
        padding: var(--space-xs) var(--space-md);
      }
      
      .stat-bar {
        width: 40px;
      }
      
      .stat-value {
        font-size: var(--font-size-xs);
        min-width: 35px;
      }
      
      .stat-icon {
        font-size: var(--font-size-base);
      }
    }

    @media (max-width: 768px) {
      .system-monitor {
        display: none;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Остановить мониторинг
 */
export function stopSystemMonitor() {
  if (systemInfoInterval) {
    clearInterval(systemInfoInterval);
    systemInfoInterval = null;
  }
}

export default {
  initSystemMonitor,
  stopSystemMonitor
};

