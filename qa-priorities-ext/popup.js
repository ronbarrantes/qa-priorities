const logic = window.QAPrioritiesLogic;

if (!logic) {
  throw new Error('QAPrioritiesLogic not loaded');
}

const { extractPrioritiesRows } = logic;

const STORAGE_KEY = 'qa-priorities-todos-v1';

const importBtn = document.getElementById('import-btn');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const tbody = document.getElementById('todo-body');

let tasksState = [];

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
    };
  }

  return {
    async get(key) {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    },
    async set(key, value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
  };
}

const storage = getStorage();

function setStatus(message, tone = '') {
  statusEl.textContent = message || '';
  statusEl.classList.remove('success', 'error');
  if (tone) statusEl.classList.add(tone);
}

async function readXlsxRows(file) {
  if (!window.XLSX?.read || !window.XLSX?.utils?.sheet_to_json) {
    throw new Error('XLSX parser not available.');
  }

  const data = await file.arrayBuffer();
  const workbook = window.XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error('No worksheet found in Excel file.');
  }

  return window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
}

function renderTable() {
  tbody.replaceChildren();

  if (!tasksState.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="placeholder">No to-do rows loaded.</td>';
    tbody.appendChild(row);
    return;
  }

  tasksState.forEach((task) => {
    const row = document.createElement('tr');
    if (task.completed) row.classList.add('completed');

    const checkboxCell = document.createElement('td');
    checkboxCell.className = 'cell-center';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.addEventListener('change', async () => {
      task.completed = checkbox.checked;
      await persistAndRender('Updated completion state.', 'success');
    });
    checkboxCell.appendChild(checkbox);

    const cutTimeCell = document.createElement('td');
    cutTimeCell.textContent = task.cutTimeDisplay || '';

    const upcCell = document.createElement('td');
    upcCell.textContent = task.upc || '';
    if (task.upc) {
      const gtinLinkIcon = document.createElement('a');
      gtinLinkIcon.href = `https://atom.walmart.com/item-management/all-about-an-item?gtin=${encodeURIComponent(task.upc)}`;
      gtinLinkIcon.target = '_blank';
      gtinLinkIcon.rel = 'noopener noreferrer';
      gtinLinkIcon.className = 'gtin-link-icon';
      gtinLinkIcon.textContent = '🔗';
      gtinLinkIcon.setAttribute('aria-label', `Open ${task.upc} in Item Management`);
      gtinLinkIcon.title = 'Open in Item Management';
      upcCell.append(' ', gtinLinkIcon);
    }

    const qtyCell = document.createElement('td');
    qtyCell.textContent = task.quantity || '';

    const locCell = document.createElement('td');
    locCell.textContent = task.currentLocation || '';

    const deleteCell = document.createElement('td');
    deleteCell.className = 'cell-center';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove to-do';
    deleteBtn.addEventListener('click', async () => {
      tasksState = tasksState.filter((candidate) => candidate.id !== task.id);
      await persistAndRender('Removed to-do row.', 'success');
    });
    deleteCell.appendChild(deleteBtn);

    row.append(checkboxCell, locCell, upcCell, qtyCell, cutTimeCell, deleteCell);
    tbody.appendChild(row);
  });
}

async function persistAndRender(statusMessage, tone) {
  await storage.set(STORAGE_KEY, tasksState);
  renderTable();
  if (statusMessage) setStatus(statusMessage, tone);
}

async function importFile(file) {
  if (!file) return;
  setStatus(`Reading ${file.name}...`);
  const rows = await readXlsxRows(file);
  const result = extractPrioritiesRows(rows);
  tasksState = result.tasks;
  await persistAndRender(
    `Imported ${result.tasks.length} to-dos from ${result.totalRows} rows.`,
    'success',
  );
}

async function init() {
  const saved = await storage.get(STORAGE_KEY);
  if (Array.isArray(saved)) {
    tasksState = saved;
    renderTable();
  }
}

importBtn?.addEventListener('click', () => fileInput?.click());

fileInput?.addEventListener('change', async (event) => {
  try {
    await importFile(event.target.files?.[0]);
  } catch (err) {
    console.error(err);
    setStatus(err instanceof Error ? err.message : 'Import failed.', 'error');
  } finally {
    event.target.value = '';
  }
});

init();
