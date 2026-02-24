const logic = window.QALogic;

if (!logic) {
  throw new Error('QALogic not loaded');
}

const {
  parseLines,
  compareLocationCodes,
  uniqueCaseInsensitive,
  parseGroupValues,
  normalizeConfig,
  groupLocations,
  groupByTitle,
  buildOutputMatrix,
  buildPrioritySet,
} = logic;

const STORAGE_KEY = 'qa-locations-settings-v1';
const INPUTS_STORAGE_KEY = 'qa-locations-inputs-v1';
const VIEW_STORAGE_KEY = 'qa-locations-view-v1';
const HOLD_VIEW_KEY = 'qa-locations-hold-view-v1';
const DEFAULT_SETTINGS = {
  groups: [
    { title: 'pallets', values: ['a', 'b', 'c', 'lud', 'prm', 'slp'] },
    { title: 'efg', values: ['e', 'f', 'g', 'gft', 'hvc', 'hwk', 'hvb'] },
    { title: 'hjkl', values: ['h', 'j', 'k', 'l'] },
    { title: 'mnst', values: ['m', 'n', 's', 't', 'mez'] },
  ],
  maxRows: 20,
  columnGap: 1,
};

const views = {
  main: document.getElementById('main-view'),
  settings: document.getElementById('settings-view'),
  result: document.getElementById('result-view'),
};

const locationsInput = document.getElementById('locations');
const prioritiesInput = document.getElementById('priorities');
const tableContainer = document.getElementById('table-container');
const summary = document.getElementById('summary');
const resultActionStatus = document.getElementById('result-action-status');
const importLocationsBtn = document.getElementById('import-locations-btn');
const importPrioritiesBtn = document.getElementById('import-priorities-btn');

const createBtn = document.getElementById('create');
const resetBtn = document.getElementById('reset');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsSaveBtn = document.getElementById('settings-save');
const settingsResetBtn = document.getElementById('settings-reset');
const addGroupBtn = document.getElementById('add-group');
const resultBackBtn = document.getElementById('result-back');
const copyTableImageBtn = document.getElementById('copy-table-image');
const saveTableImageBtn = document.getElementById('save-table-image');

const groupsList = document.getElementById('groups-list');
const maxRowsInput = document.getElementById('max-rows');
const columnGapInput = document.getElementById('column-gap');
const holdViewToggle = document.getElementById('hold-view');

let settingsState = loadSettings();
let holdViewEnabled = false;

function getStorage() {
  if (window.chrome?.storage?.local) {
    return {
      async get(key) {
        const result = await window.chrome.storage.local.get(key);
        return result?.[key];
      },
      async set(key, value) {
        await window.chrome.storage.local.set({ [key]: value });
      },
      async remove(key) {
        await window.chrome.storage.local.remove(key);
      },
    };
  }
  return {
    async get(key) {
      const raw = window.localStorage.getItem(key);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw);
      } catch (err) {
        console.warn('Failed to parse stored value.', err);
        return undefined;
      }
    },
    async set(key, value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    async remove(key) {
      window.localStorage.removeItem(key);
    },
  };
}

const storage = getStorage();

applyStaticIcons();

function showView(viewKey) {
  Object.values(views).forEach((view) => view.classList.add('hidden'));
  views[viewKey].classList.remove('hidden');
  if (holdViewEnabled) {
    storage.set(VIEW_STORAGE_KEY, viewKey);
  }
}

function loadSettings() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return normalizeConfig(DEFAULT_SETTINGS);
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch (err) {
    console.warn('Failed to load settings, falling back to defaults.', err);
    return normalizeConfig(DEFAULT_SETTINGS);
  }
}

function saveSettings(config) {
  const normalized = normalizeConfig(config);
  settingsState = normalized;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

async function loadHoldViewEnabled() {
  const saved = await storage.get(HOLD_VIEW_KEY);
  return saved === true;
}

function setHoldViewEnabled(enabled) {
  holdViewEnabled = enabled;
  storage.set(HOLD_VIEW_KEY, enabled);
  if (enabled) {
    storage.set(VIEW_STORAGE_KEY, getCurrentViewKey());
  }
}

function getCurrentViewKey() {
  return Object.keys(views).find((key) => !views[key].classList.contains('hidden')) || 'main';
}

async function loadLastViewKey() {
  const saved = await storage.get(VIEW_STORAGE_KEY);
  if (saved && views[saved]) return saved;
  return 'main';
}

async function loadInputs() {
  const saved = await storage.get(INPUTS_STORAGE_KEY);
  if (!saved || typeof saved !== 'object') return;
  if (typeof saved.locations === 'string') locationsInput.value = saved.locations;
  if (typeof saved.priorities === 'string') prioritiesInput.value = saved.priorities;
}

function saveInputs() {
  storage.set(INPUTS_STORAGE_KEY, {
    locations: locationsInput.value,
    priorities: prioritiesInput.value,
  });
}

function clearInputsStorage() {
  storage.remove(INPUTS_STORAGE_KEY);
}

function setResultActionStatus(message, tone = '') {
  if (!resultActionStatus) return;
  resultActionStatus.textContent = message || '';
  resultActionStatus.classList.remove('success', 'error');
  if (tone) {
    resultActionStatus.classList.add(tone);
  }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate PNG image.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function renderTablePngBlob() {
  const table = tableContainer.querySelector('table');
  if (!table) {
    throw new Error('No table available to export.');
  }

  if (typeof window.html2canvas !== 'function') {
    throw new Error('html2canvas is not loaded. Add vendor/html2canvas.min.js to enable PNG export.');
  }
  const canvas = await window.html2canvas(table, {
    backgroundColor: '#ffffff',
    scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1)),
    useCORS: true,
  });
  return canvasToPngBlob(canvas);
}

function downloadPngBlob(blob, filename = 'qa-locations-table.png') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyTableAsPng() {
  setResultActionStatus('Rendering PNG...');

  try {
    const pngBlob = await renderTablePngBlob();

    if (navigator.clipboard?.write && typeof window.ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      setResultActionStatus('Table copied to clipboard as PNG. Paste into chat.', 'success');
      return;
    }

    downloadPngBlob(pngBlob);
    setResultActionStatus('Clipboard image copy unavailable. Downloaded qa-locations-table.png.', 'success');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to render/copy PNG.';
    setResultActionStatus(message, 'error');
    console.error('Failed to copy table as PNG', err);
  }
}

async function saveTableAsPng() {
  setResultActionStatus('Rendering PNG...');

  try {
    const pngBlob = await renderTablePngBlob();
    downloadPngBlob(pngBlob);
    setResultActionStatus('Saved qa-locations-table.png.', 'success');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save PNG.';
    setResultActionStatus(message, 'error');
    console.error('Failed to save table as PNG', err);
  }
}

function openImporterPage(target) {
  const url = new URL(chrome.runtime.getURL('import.html'));
  if (target) {
    url.searchParams.set('target', target);
  }
  window.open(url.toString(), '_blank');
}

function renderTable(matrix, prioritySet) {
  tableContainer.replaceChildren();

  if (!matrix.headers.length) {
    tableContainer.textContent = 'No data to display.';
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  matrix.groupTitles.forEach((title, index) => {
    const th = document.createElement('th');
    const colSpan = matrix.groupColumns[index] || 1;
    th.textContent = title;
    th.colSpan = colSpan;
    headerRow.appendChild(th);

    if (index < matrix.groupTitles.length - 1 && matrix.groupColumns[index] !== undefined) {
      for (let g = 0; g < settingsState.columnGap; g += 1) {
        const gap = document.createElement('th');
        gap.classList.add('gap');
        headerRow.appendChild(gap);
      }
    }
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  matrix.rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((value, idx) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (!matrix.headers[idx]) {
        td.classList.add('gap');
      }
      if (value && prioritySet.has(value.toUpperCase())) {
        td.classList.add('priority');
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableContainer.appendChild(table);
}

function createArrangement() {
  const locations = uniqueCaseInsensitive(parseLines(locationsInput.value)).sort(compareLocationCodes);
  const priorities = uniqueCaseInsensitive(parseLines(prioritiesInput.value)).sort(compareLocationCodes);

  if (locations.length === 0) {
    summary.textContent = 'Add at least one location.';
    tableContainer.replaceChildren();
    showView('result');
    return;
  }

  const config = settingsState;
  const grouped = groupLocations(locations, config);
  const titleGrouped = groupByTitle(grouped, config);
  const titleOrder = config.groups.map((group) => group.title);
  const matrix = buildOutputMatrix(titleOrder, titleGrouped, config.maxRows, config.columnGap);
  const prioritySet = buildPrioritySet(locations, priorities);

  renderTable(matrix, prioritySet);

  const maxRowsLabel = config.maxRows > 0 ? config.maxRows : 'no limit';
  summary.textContent = `${locations.length} locations, ${matrix.headers.length} columns, max rows ${maxRowsLabel}, gap ${config.columnGap}.`;
  showView('result');
}

function resetForm() {
  locationsInput.value = '';
  prioritiesInput.value = '';
  clearInputsStorage();
}

function openSettings() {
  populateSettingsUI(settingsState);
  showView('settings');
}

function closeSettings() {
  showView('main');
}

function populateSettingsUI(config) {
  groupsList.replaceChildren();
  config.groups.forEach((group) => {
    addGroupToUI(group.title, group.values);
  });
  maxRowsInput.value = config.maxRows;
  columnGapInput.value = config.columnGap;
}

function addGroupToUI(title = '', values = []) {
  const groupItem = document.createElement('div');
  groupItem.className = 'group-item';

  const fields = document.createElement('div');
  fields.className = 'group-fields';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'group-title-input';
  titleInput.placeholder = 'Column title';
  titleInput.value = title;

  const valuesInput = document.createElement('input');
  valuesInput.type = 'text';
  valuesInput.className = 'group-values-input';
  valuesInput.placeholder = 'Values (A B C or MEZ PRM HVC)';
  valuesInput.value = Array.isArray(values) ? values.join(', ') : String(values || '');

  fields.appendChild(titleInput);
  fields.appendChild(valuesInput);

  const moveControls = document.createElement('div');
  moveControls.className = 'group-move-controls';

  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'icon-btn move-group';
  moveUpBtn.title = 'Move up';
  moveUpBtn.appendChild(createChevronIcon('up'));
  moveUpBtn.addEventListener('click', () => {
    const prev = groupItem.previousElementSibling;
    if (prev) groupsList.insertBefore(groupItem, prev);
  });

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'icon-btn move-group';
  moveDownBtn.title = 'Move down';
  moveDownBtn.appendChild(createChevronIcon('down'));
  moveDownBtn.addEventListener('click', () => {
    const next = groupItem.nextElementSibling;
    if (next) groupsList.insertBefore(next, groupItem);
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'icon-btn remove-group';
  removeBtn.title = 'Remove column';
  removeBtn.appendChild(createXIcon());
  removeBtn.addEventListener('click', () => {
    groupItem.remove();
  });

  moveControls.appendChild(moveUpBtn);
  moveControls.appendChild(moveDownBtn);

  groupItem.appendChild(moveControls);
  groupItem.appendChild(fields);
  groupItem.appendChild(removeBtn);

  groupsList.appendChild(groupItem);
}

function createChevronIcon(direction) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('move-icon');

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'butt');
  path.setAttribute('stroke-linejoin', 'miter');
  path.setAttribute('stroke-width', '2.25');
  path.setAttribute(
    'd',
    direction === 'up' ? 'M4.5 15L12 7.5L19.5 15' : 'M4.5 9L12 16.5L19.5 9',
  );

  svg.appendChild(path);
  return svg;
}

function createXIcon(className = 'close-icon') {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(className);

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M18 6L6 18M6 6l12 12');

  svg.appendChild(path);
  return svg;
}

function createArrowLeftIcon() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('toolbar-icon');

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M19 12H5M12 19l-7-7 7-7');
  svg.appendChild(path);
  return svg;
}

function createGearIcon() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('toolbar-icon');

  const circle = document.createElementNS(svgNS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute(
    'd',
    'M12 2.75v2.5M12 18.75v2.5M2.75 12h2.5M18.75 12h2.5M5.45 5.45l1.8 1.8M16.75 16.75l1.8 1.8M18.55 5.45l-1.8 1.8M7.25 16.75l-1.8 1.8',
  );
  svg.appendChild(path);
  return svg;
}

function applyStaticIcons() {
  if (openSettingsBtn) {
    openSettingsBtn.replaceChildren(createGearIcon());
  }
  if (closeSettingsBtn) {
    closeSettingsBtn.replaceChildren(createXIcon('toolbar-icon'));
  }
  if (resultBackBtn) {
    resultBackBtn.replaceChildren(createArrowLeftIcon());
  }
}

function getSettingsFromUI() {
  const groupItems = groupsList.querySelectorAll('.group-item');
  const groups = [];

  groupItems.forEach((item) => {
    const title = item.querySelector('.group-title-input')?.value.trim();
    const values = parseGroupValues(item.querySelector('.group-values-input')?.value);

    if (title) {
      groups.push({ title, values });
    }
  });

  return {
    groups,
    maxRows: Number(maxRowsInput.value) || 20,
    columnGap: Number(columnGapInput.value) || 0,
  };
}

function saveSettingsFromUI() {
  const config = getSettingsFromUI();

  if (config.groups.length === 0) {
    alert('Add at least one column group.');
    return;
  }

  if (config.maxRows < 0) {
    alert('Max rows must be 0 or higher.');
    return;
  }

  saveSettings(config);
  showView('main');
}

function resetSettings() {
  populateSettingsUI(settingsState);
}

createBtn.addEventListener('click', createArrangement);
resetBtn.addEventListener('click', resetForm);
locationsInput.addEventListener('input', saveInputs);
prioritiesInput.addEventListener('input', saveInputs);
importLocationsBtn?.addEventListener('click', () => openImporterPage('locations'));
importPrioritiesBtn?.addEventListener('click', () => openImporterPage('priorities'));
openSettingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
settingsSaveBtn.addEventListener('click', saveSettingsFromUI);
settingsResetBtn.addEventListener('click', resetSettings);
addGroupBtn.addEventListener('click', () => addGroupToUI());
resultBackBtn.addEventListener('click', () => showView('main'));
copyTableImageBtn?.addEventListener('click', copyTableAsPng);
saveTableImageBtn?.addEventListener('click', saveTableAsPng);

holdViewToggle?.addEventListener('change', (event) => {
  setHoldViewEnabled(Boolean(event.target.checked));
});


function handlePopupQueryActions() {
  const params = new URLSearchParams(window.location.search);
  const shouldAutoCreate = params.get('autocreate') === '1';
  const requestedView = params.get('view');

  if (requestedView === 'result' || shouldAutoCreate) {
    createArrangement();
    return true;
  }

  return false;
}

async function init() {
  await loadInputs();

  if (handlePopupQueryActions()) {
    return;
  }

  holdViewEnabled = await loadHoldViewEnabled();
  if (holdViewToggle) {
    holdViewToggle.checked = holdViewEnabled;
  }
  if (holdViewEnabled) {
    const lastView = await loadLastViewKey();
    if (lastView === 'result') {
      createArrangement();
    } else if (lastView === 'settings') {
      openSettings();
    } else {
      showView(lastView);
    }
  }
}

init();
