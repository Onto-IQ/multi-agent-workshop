'use strict';

/**
 * Small CSV reader for the sales sandbox.
 * Supports quotes and commas inside quoted fields. No dependencies.
 */

function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const table = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      table.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    table.push(row);
  }

  const filtered = table.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
  if (filtered.length === 0) {
    return { header: [], records: [] };
  }

  const header = filtered[0].map((cell) => cell.trim());
  const records = filtered.slice(1).map((cells, index) => {
    const record = { __line: index + 2 };
    header.forEach((name, col) => {
      record[name] = cells[col] === undefined ? '' : cells[col];
    });
    return record;
  });
  return { header, records };
}

module.exports = { parseCsv };
