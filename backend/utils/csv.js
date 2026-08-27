/**
 * Minimal RFC-4180-ish CSV parser.
 *
 * Written by hand rather than pulling a dependency: sheet imports are the only
 * consumer and they need just quoted fields, escaped quotes and CRLF handling.
 */

/**
 * Splits CSV text into rows of string cells.
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const source = String(text || '').replace(/^\uFEFF/, ''); // strip BOM

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1; // consume the escaped quote
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
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Treat \r\n as one break
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      // Skip completely blank lines
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  // Flush the trailing field/row
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);

  return rows;
}

/**
 * Parses CSV into objects keyed by a normalized header name.
 * Headers are lowercased with non-alphanumerics stripped, so "Problem URL",
 * "problemUrl" and "problem_url" all become "problemurl".
 *
 * @param {string} text
 * @returns {{headers:string[], rows:Object[]}}
 */
function parseCsvToObjects(text) {
  const raw = parseCsv(text);
  if (!raw.length) return { headers: [], rows: [] };

  const headers = raw[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows = raw.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, i) => {
      if (!header) return;
      obj[header] = (cells[i] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows };
}

module.exports = { parseCsv, parseCsvToObjects };
