(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.QALogic = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const IGNORED_PASTE_LINES = new Set([
    'LOCATION',
    'CONTAINERS',
    'CURRENT LOCATION',
    'CONTAINER ID',
    'CONTAINER TAG',
  ]);
  const CSV_LOCATION_COLUMN = 'Location';
  const XLSX_CONTAINER_TAG_COLUMN = 'Container Tag';
  const XLSX_CURRENT_LOCATION_COLUMN = 'Current Location';
  const QA_HOLD_PICKING_TAG = 'QA_HOLD_PICKING';

  function parseLines(raw) {
    return String(raw || '')
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !IGNORED_PASTE_LINES.has(item.toUpperCase()));
  }

  function tokenize(value) {
    return value
      .toUpperCase()
      .match(/[A-Z]+|\d+|[^A-Z\d]+/g)
      ?.map((chunk) => (/^\d+$/.test(chunk) ? Number(chunk) : chunk)) ?? [value];
  }

  function compareLocationCodes(a, b) {
    const partsA = tokenize(a);
    const partsB = tokenize(b);
    const max = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < max; i += 1) {
      const left = partsA[i];
      const right = partsB[i];
      if (left === undefined) return -1;
      if (right === undefined) return 1;

      if (typeof left === 'number' && typeof right === 'number') {
        if (left !== right) return left - right;
        continue;
      }

      const leftStr = String(left);
      const rightStr = String(right);
      const cmp = leftStr.localeCompare(rightStr);
      if (cmp !== 0) return cmp;
    }

    return 0;
  }

  function uniqueCaseInsensitive(values) {
    const seen = new Set();
    return values.filter((value) => {
      const key = value.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseGroupValues(raw) {
    if (Array.isArray(raw)) {
      return raw.map((value) => String(value).trim()).filter(Boolean);
    }

    return String(raw || '')
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function normalizeImportedLocations(values) {
    return uniqueCaseInsensitive(
      (values || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ).sort(compareLocationCodes);
  }

  function parseCSVRows(rawText) {
    const text = String(rawText || '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (next === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }

      if (char === ',') {
        row.push(field);
        field = '';
        continue;
      }

      if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        continue;
      }

      if (char === '\r') {
        continue;
      }

      field += char;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    if (rows.length && rows[0].length) {
      rows[0][0] = String(rows[0][0]).replace(/^\uFEFF/, '');
    }

    return rows;
  }

  function getColumnIndex(headers, columnName) {
    return (headers || []).findIndex((header) => String(header || '').trim() === columnName);
  }

  function extractLocationsFromCSVText(csvText) {
    const rows = parseCSVRows(csvText);
    if (!rows.length) {
      throw new Error('CSV file is empty.');
    }

    const headers = rows[0].map((cell) => String(cell || '').trim());
    const locationIdx = getColumnIndex(headers, CSV_LOCATION_COLUMN);
    if (locationIdx === -1) {
      throw new Error(`CSV column "${CSV_LOCATION_COLUMN}" not found.`);
    }

    const values = rows.slice(1).map((row) => row[locationIdx] ?? '');
    return {
      values: normalizeImportedLocations(values),
      rowCount: Math.max(0, rows.length - 1),
    };
  }

  function extractPrioritiesFromXlsxRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = rows[0].map((cell) => String(cell || '').trim());
    const tagIdx = getColumnIndex(headers, XLSX_CONTAINER_TAG_COLUMN);
    if (tagIdx === -1) {
      throw new Error(`Excel column "${XLSX_CONTAINER_TAG_COLUMN}" not found.`);
    }

    const locationIdx = getColumnIndex(headers, XLSX_CURRENT_LOCATION_COLUMN);
    if (locationIdx === -1) {
      throw new Error(`Excel column "${XLSX_CURRENT_LOCATION_COLUMN}" not found.`);
    }

    const priorityValues = [];
    rows.slice(1).forEach((row) => {
      const tag = String(row[tagIdx] ?? '').trim();
      if (tag !== QA_HOLD_PICKING_TAG) return;

      const location = String(row[locationIdx] ?? '').trim();
      if (location) {
        priorityValues.push(location);
      }
    });

    return {
      values: normalizeImportedLocations(priorityValues),
      rowCount: Math.max(0, rows.length - 1),
    };
  }

  function extractLetterPrefix(location) {
    const idx = location.indexOf(':');
    if (idx === -1) return '';
    const afterColon = location.slice(idx + 1);
    const match = afterColon.match(/^[A-Za-z]+/);
    return match ? match[0] : '';
  }

  function normalizeConfig(config) {
    const groups = (config?.groups || []).map((group) => ({
      title: String(group.title || '').trim(),
      values: parseGroupValues(group.values),
    })).filter((group) => group.title);

    return {
      groups,
      maxRows: Number.isFinite(config?.maxRows) ? Number(config.maxRows) : 20,
      columnGap: Number.isFinite(config?.columnGap) ? Number(config.columnGap) : 1,
    };
  }

  function groupLocations(locations, config) {
    const normalized = normalizeConfig(config);
    const validKeys = new Map();

    normalized.groups.forEach((group) => {
      group.values.forEach((value) => {
        const key = value.toLowerCase();
        validKeys.set(key, true);
      });
    });

    const grouped = {};
    validKeys.forEach((_, key) => {
      grouped[key] = [];
    });
    grouped.unassigned = [];

    const lettersOnly = /^[A-Za-z]+$/;

    locations.forEach((loc) => {
      const prefix = extractLetterPrefix(loc);
      if (!prefix) {
        grouped.unassigned.push(loc);
        return;
      }

      const prefixLower = prefix.toLowerCase();
      let assigned = false;

      if (prefix.length >= 3 && lettersOnly.test(prefix)) {
        if (validKeys.has(prefixLower)) {
          grouped[prefixLower].push(loc);
          assigned = true;
        }
      }

      if (!assigned && prefix.length >= 2) {
        const firstLetter = prefixLower[0];
        if (validKeys.has(firstLetter)) {
          grouped[firstLetter].push(loc);
          assigned = true;
        }
      }

      if (!assigned) {
        grouped.unassigned.push(loc);
      }
    });

    return grouped;
  }

  function groupByTitle(grouped, config) {
    const normalized = normalizeConfig(config);
    const result = {};

    normalized.groups.forEach((group) => {
      result[group.title] = [];
    });
    result.unassigned = [];

    normalized.groups.forEach((group) => {
      group.values.forEach((value) => {
        const key = value.toLowerCase();
        if (grouped[key]) {
          result[group.title].push(...grouped[key]);
        }
      });
    });

    if (grouped.unassigned?.length) {
      result.unassigned.push(...grouped.unassigned);
    }

    return result;
  }

  function columnsNeeded(itemCount, maxRows) {
    if (maxRows <= 0 || itemCount === 0) return 1;
    return Math.ceil(itemCount / maxRows);
  }

  function buildOutputMatrix(titleOrder, groupedByTitle, maxRows, columnGap) {
    const groupTitles = [];

    titleOrder.forEach((title) => {
      if (groupedByTitle[title]?.length) {
        groupTitles.push(title);
      }
    });

    if (groupedByTitle.unassigned?.length) {
      groupTitles.push('unassigned');
    }

    const groupColumns = groupTitles.map((title) =>
      columnsNeeded(groupedByTitle[title].length, maxRows),
    );

    let maxRowsOverall = 0;
    groupTitles.forEach((title) => {
      const count = groupedByTitle[title].length;
      let rowsForGroup = count;
      if (maxRows > 0 && rowsForGroup > maxRows) {
        rowsForGroup = maxRows;
      }
      if (rowsForGroup > maxRowsOverall) {
        maxRowsOverall = rowsForGroup;
      }
    });

    const headers = [];
    groupTitles.forEach((title, index) => {
      const cols = groupColumns[index];
      for (let c = 0; c < cols; c += 1) {
        headers.push(title);
      }
      if (index < groupTitles.length - 1) {
        for (let g = 0; g < columnGap; g += 1) {
          headers.push('');
        }
      }
    });

    const rows = [];
    for (let row = 0; row < maxRowsOverall; row += 1) {
      const record = [];
      groupTitles.forEach((title, index) => {
        const locs = groupedByTitle[title];
        const cols = groupColumns[index];

        for (let c = 0; c < cols; c += 1) {
          let idx = row;
          if (maxRows > 0) {
            idx = c * maxRows + row;
          }
          record.push(idx < locs.length ? locs[idx] : '');
        }

        if (index < groupTitles.length - 1) {
          for (let g = 0; g < columnGap; g += 1) {
            record.push('');
          }
        }
      });
      rows.push(record);
    }

    return {
      headers,
      rows,
      groupTitles,
      groupColumns,
      maxRowsOverall,
    };
  }

  function buildPrioritySet(locations, priorities) {
    const locationSet = new Set(locations.map((loc) => loc.toUpperCase()));
    const prioritySet = new Set();

    priorities.forEach((priority) => {
      const key = priority.toUpperCase();
      if (locationSet.has(key)) {
        prioritySet.add(key);
      }
    });

    return prioritySet;
  }

  return {
    parseLines,
    tokenize,
    compareLocationCodes,
    uniqueCaseInsensitive,
    parseGroupValues,
    normalizeImportedLocations,
    parseCSVRows,
    getColumnIndex,
    extractLocationsFromCSVText,
    extractPrioritiesFromXlsxRows,
    normalizeConfig,
    extractLetterPrefix,
    groupLocations,
    groupByTitle,
    columnsNeeded,
    buildOutputMatrix,
    buildPrioritySet,
  };
});
