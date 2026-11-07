export const importHeaders = [
  'item_code','category','specification','unit',
  'opening_stock_qty','minimum_stock_level','reorder_level',
  'reorder_quantity','maximum_stock_level',
] as const;
const legacyHeaders = ['item_code','source_category_label',...importHeaders.slice(1)];

export type ImportRow = Record<(typeof importHeaders)[number], string>;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value');
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

export function readMaterialCsv(text: string, categoryNames: string[], existingCodes: string[]) {
  const parsed = parseCsv(text);
  if (!parsed.length) throw new Error('CSV is empty');
  const headers = parsed[0].map(v => v.trim());
  const current = headers.length === importHeaders.length && importHeaders.every((h, i) => headers[i] === h);
  const legacy = headers.length === legacyHeaders.length && legacyHeaders.every((h, i) => headers[i] === h);
  if (!current && !legacy)
    throw new Error(`CSV columns must be: ${importHeaders.join(', ')}`);
  if (parsed.length === 1) throw new Error('CSV has no material rows');
  if (parsed.length > 501) throw new Error('Import is limited to 500 rows');
  const seen = new Set(existingCodes.map(v => v.toLowerCase()));
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const validQty = (v: string, positive = false) => /^\d+(\.\d{1,3})?$/.test(v) && (!positive || Number(v) > 0);
  parsed.slice(1).forEach((cells, index) => {
    const number = index + 2;
    if (cells.length !== headers.length) { errors.push(`Row ${number}: expected ${headers.length} columns`); return; }
    const item = Object.fromEntries(importHeaders.map(h => [h, cells[headers.indexOf(h)].trim()])) as ImportRow;
    if (!item.item_code || !item.specification || !item.unit) errors.push(`Row ${number}: item code, specification and unit are required`);
    if (!categoryNames.includes(item.category)) errors.push(`Row ${number}: category is not in the approved list`);
    if (!validQty(item.opening_stock_qty)) errors.push(`Row ${number}: verified opening stock is required (0 is allowed)`);
    for (const field of ['minimum_stock_level','reorder_level','maximum_stock_level'] as const)
      if (item[field] && !validQty(item[field])) errors.push(`Row ${number}: invalid ${field}`);
    if (item.reorder_quantity && !validQty(item.reorder_quantity,true)) errors.push(`Row ${number}: reorder quantity must be above zero`);
    if (item.minimum_stock_level && item.reorder_level && Number(item.minimum_stock_level) > Number(item.reorder_level)) errors.push(`Row ${number}: minimum exceeds reorder level`);
    if (item.maximum_stock_level && item.reorder_level && Number(item.maximum_stock_level) < Number(item.reorder_level)) errors.push(`Row ${number}: maximum is below reorder level`);
    const code = item.item_code.toLowerCase();
    if (seen.has(code)) errors.push(`Row ${number}: duplicate or existing item code ${item.item_code}`);
    seen.add(code);
    rows.push(item);
  });
  return { rows, errors };
}
