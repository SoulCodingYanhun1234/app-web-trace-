import QRCode from 'qrcode';
import { deflateSync } from 'zlib';

export type LabeledQrOptions = {
  qrSize?: number;
  labelHeight?: number;
  marginModules?: number;
};

const FONT_5X7: Record<string, string[]> = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01111','10000','10000','10000','10000','10000','01111'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01111','10000','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00001','00001','00001','00001','10001','10001','01110'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','10101','01010'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '/': ['00001','00010','00100','01000','10000','00000','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};

function normalizedLabel(label: unknown) {
  return String(label ?? '').trim().toUpperCase().replace(/[^0-9A-Z._:\/\- ]/g, '_').slice(0, 80);
}

function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] || char));
}

function qrMatrix(payload: string) {
  const result: any = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const size = Number(result.modules.size);
  const data = result.modules.data as ArrayLike<number | boolean>;
  return { size, data };
}

export function createLabeledQrSvg(payload: string, label: string, options: LabeledQrOptions = {}) {
  const qrSize = Math.max(160, Number(options.qrSize || 400));
  const labelHeight = Math.max(42, Number(options.labelHeight || Math.round(qrSize * 0.16)));
  const marginModules = Math.max(1, Number(options.marginModules ?? 2));
  const matrix = qrMatrix(payload);
  const moduleSize = qrSize / (matrix.size + marginModules * 2);
  const rects: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.data[row * matrix.size + col]) continue;
      const x = (col + marginModules) * moduleSize;
      const y = (row + marginModules) * moduleSize;
      rects.push(`<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${moduleSize.toFixed(3)}" height="${moduleSize.toFixed(3)}"/>`);
    }
  }
  const safeLabel = escapeXml(normalizedLabel(label));
  const fontSize = Math.max(16, Math.min(28, Math.floor(qrSize / Math.max(16, safeLabel.length * 0.72))));
  const totalHeight = qrSize + labelHeight;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${qrSize}" height="${totalHeight}" viewBox="0 0 ${qrSize} ${totalHeight}" role="img" aria-label="${safeLabel}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join('')}</g><line x1="${Math.round(qrSize * 0.08)}" y1="${qrSize + 1}" x2="${Math.round(qrSize * 0.92)}" y2="${qrSize + 1}" stroke="#d1d5db"/><text x="${qrSize / 2}" y="${qrSize + Math.round(labelHeight * 0.62)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="0.6" fill="#111827">${safeLabel}</text></svg>`;
}

let crcTable: Uint32Array | undefined;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buffer: Buffer) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function setBlack(pixels: Uint8Array, width: number, height: number, x: number, y: number, rectWidth = 1, rectHeight = 1) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(width, Math.ceil(x + rectWidth));
  const bottom = Math.min(height, Math.ceil(y + rectHeight));
  for (let py = top; py < bottom; py += 1) {
    const rowOffset = py * width;
    for (let px = left; px < right; px += 1) pixels[rowOffset + px] = 0;
  }
}

function drawBitmapText(pixels: Uint8Array, width: number, height: number, label: string, labelTop: number, labelHeight: number) {
  const text = normalizedLabel(label);
  if (!text) return;
  const maxScaleByWidth = Math.floor((width - 24) / Math.max(1, text.length * 6));
  const maxScaleByHeight = Math.floor((labelHeight - 16) / 7);
  const scale = Math.max(1, Math.min(5, maxScaleByWidth, maxScaleByHeight));
  const charWidth = 5 * scale;
  const gap = scale;
  const textWidth = text.length * charWidth + Math.max(0, text.length - 1) * gap;
  let cursorX = Math.max(4, Math.floor((width - textWidth) / 2));
  const yStart = Math.floor(labelTop + (labelHeight - 7 * scale) / 2);
  for (const char of text) {
    const glyph = FONT_5X7[char] || FONT_5X7['_'];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === '1') setBlack(pixels, width, height, cursorX + col * scale, yStart + row * scale, scale, scale);
      }
    }
    cursorX += charWidth + gap;
  }
}

export function createLabeledQrPng(payload: string, label: string, options: LabeledQrOptions = {}) {
  const requestedQrSize = Math.max(160, Number(options.qrSize || 400));
  const labelHeight = Math.max(42, Number(options.labelHeight || Math.round(requestedQrSize * 0.16)));
  const marginModules = Math.max(1, Number(options.marginModules ?? 2));
  const matrix = qrMatrix(payload);
  const scale = Math.max(1, Math.floor(requestedQrSize / (matrix.size + marginModules * 2)));
  const qrPixelSize = (matrix.size + marginModules * 2) * scale;
  const width = Math.max(requestedQrSize, qrPixelSize);
  const height = qrPixelSize + labelHeight;
  const pixels = new Uint8Array(width * height);
  pixels.fill(255);
  const offsetX = Math.floor((width - qrPixelSize) / 2);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.data[row * matrix.size + col]) continue;
      setBlack(pixels, width, height, offsetX + (col + marginModules) * scale, (row + marginModules) * scale, scale, scale);
    }
  }
  const dividerY = qrPixelSize;
  for (let x = Math.floor(width * 0.08); x < Math.ceil(width * 0.92); x += 1) pixels[dividerY * width + x] = 210;
  drawBitmapText(pixels, width, height, label, qrPixelSize, labelHeight);

  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width, width).copy(raw, rowStart + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
