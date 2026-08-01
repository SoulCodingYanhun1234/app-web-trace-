export type ImportRow = Record<string, any>;

const textDecoder = new TextDecoder('utf-8');

function cleanHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim();
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\t' || ch === '，') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((item) => item.some(Boolean));
}

export function aoaToObjects(rows: string[][]): ImportRow[] {
  const [headers = [], ...body] = rows;
  const normalized = headers.map(cleanHeader);
  return body.map((line) => normalized.reduce((acc, key, index) => {
    if (key) acc[key] = String(line[index] ?? '').trim();
    return acc;
  }, {} as ImportRow)).filter((item) => Object.values(item).some((value) => String(value ?? '').trim()));
}

function findEocd(view: DataView) {
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65558); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

async function inflateRaw(data: Uint8Array): Promise<ArrayBuffer> {
  const Decompression = (globalThis as any).DecompressionStream;
  if (!Decompression) throw new Error('当前浏览器不支持直接解析 xlsx，请将 Excel 另存为 CSV 后导入。');

  // TypeScript 5.7 对 Uint8Array 的 buffer 类型收紧为 ArrayBufferLike，
  // 直接 new Blob([data]) 可能被判断为包含 SharedArrayBuffer 而导致构建失败。
  // 这里复制为明确的 ArrayBuffer，再交给 Blob / DecompressionStream。
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(new Decompression('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

async function unzipSelectedEntries(buffer: ArrayBuffer, names: string[]) {
  const wanted = new Set(names);
  const output: Record<string, string> = {};
  const view = new DataView(buffer);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('Excel 文件结构异常，请确认是 .xlsx 文件。');
  const entryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  let pos = cdOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const fileNameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = textDecoder.decode(new Uint8Array(buffer, pos + 46, fileNameLen));

    if (wanted.has(name)) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Excel 内部文件 ${name} 损坏。`);
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = new Uint8Array(buffer, dataStart, compressedSize);
      let plain: ArrayBuffer;
      if (method === 0) plain = compressed.slice().buffer;
      else if (method === 8) plain = await inflateRaw(compressed);
      else throw new Error('Excel 压缩格式暂不支持，请另存为标准 .xlsx 或 CSV。');
      output[name] = textDecoder.decode(plain);
    }
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  return output;
}

function xmlText(node: Element) {
  return Array.from(node.getElementsByTagName('t')).map((item) => item.textContent || '').join('');
}

function columnIndex(cellRef: string) {
  const letters = String(cellRef || '').replace(/\d+/g, '').toUpperCase();
  let index = 0;
  for (let i = 0; i < letters.length; i += 1) index = index * 26 + (letters.charCodeAt(i) - 64);
  return Math.max(0, index - 1);
}

export async function parseXlsxFile(file: File): Promise<ImportRow[]> {
  const buffer = await file.arrayBuffer();
  const entries = await unzipSelectedEntries(buffer, ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']);
  const parser = new DOMParser();
  const shared: string[] = [];

  if (entries['xl/sharedStrings.xml']) {
    const sharedDoc = parser.parseFromString(entries['xl/sharedStrings.xml'], 'application/xml');
    Array.from(sharedDoc.getElementsByTagName('si')).forEach((si) => shared.push(xmlText(si)));
  }

  const sheetXml = entries['xl/worksheets/sheet1.xml'];
  if (!sheetXml) throw new Error('Excel 中没有找到第一个工作表。');
  const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
  const aoa: string[][] = [];
  Array.from(sheetDoc.getElementsByTagName('row')).forEach((rowNode) => {
    const row: string[] = [];
    Array.from(rowNode.getElementsByTagName('c')).forEach((cell) => {
      const index = columnIndex(cell.getAttribute('r') || 'A1');
      const type = cell.getAttribute('t') || '';
      let value = '';
      if (type === 's') {
        const sharedIndex = Number(cell.getElementsByTagName('v')[0]?.textContent || 0);
        value = shared[sharedIndex] || '';
      } else if (type === 'inlineStr') {
        value = xmlText(cell);
      } else {
        value = cell.getElementsByTagName('v')[0]?.textContent || '';
      }
      row[index] = value.trim();
    });
    if (row.some(Boolean)) aoa.push(row);
  });
  return aoaToObjects(aoa);
}

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx')) return parseXlsxFile(file);
  const text = await file.text();
  return aoaToObjects(parseCsvText(text));
}

export function downloadCsv(filename: string, rows: ImportRow[]) {
  const headers = Object.keys(rows[0] || {});
  const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => escapeCell(row[key])).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
