import { normalizeCodeText, splitCodes } from './format';

export type ScannerResult = {
  input: string;
  code: string;
  found?: boolean;
  type?: string;
  [key: string]: any;
};

const MAX_SCAN_URL_LENGTH = 2048;

export function normalizeScannedText(input: unknown) {
  return normalizeCodeText(input);
}

export function splitScannedCodes(value: unknown) {
  return splitCodes(value as any);
}

export function appendUniqueLine(text: string, code: string) {
  const next = normalizeScannedText(code);
  if (!next) return text || '';
  const items = splitScannedCodes(text);
  if (!items.includes(next)) items.push(next);
  return items.join('\n');
}

let beepContext: AudioContext | null = null;

export function playScanBeep() {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    beepContext ||= new Ctor();
    if (beepContext.state === 'suspended') void beepContext.resume();
    const oscillator = beepContext.createOscillator();
    const gain = beepContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 1600;
    oscillator.connect(gain);
    gain.connect(beepContext.destination);
    const now = beepContext.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  } catch {
    // 部分浏览器/无用户交互场景下音频播放会被拒绝，静默忽略即可
  }
}

export function createScannerBuffer(options: { minLength?: number; maxInterval?: number; suffixKeys?: string[]; onScan: (code: string) => void }) {
  const minLength = options.minLength ?? 3;
  const maxInterval = options.maxInterval ?? 80;
  const suffixKeys = options.suffixKeys ?? ['Enter', 'Tab'];
  let buffer = '';
  let lastAt = 0;

  function reset() {
    buffer = '';
    lastAt = 0;
  }

  function flush() {
    const code = normalizeScannedText(buffer);
    if (code.length >= minLength) options.onScan(code);
    reset();
  }

  function push(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    const now = Date.now();
    if (lastAt && now - lastAt > maxInterval) buffer = '';
    lastAt = now;

    if (suffixKeys.includes(key)) {
      event.preventDefault();
      event.stopPropagation();
      flush();
      return;
    }
    if (key === 'Escape') {
      reset();
      return;
    }
    if (key === 'Backspace' || key === 'Delete') {
      buffer = buffer.slice(0, -1);
      return;
    }
    if (key.length === 1) {
      buffer += key;
      if (buffer.length > MAX_SCAN_URL_LENGTH) buffer = buffer.slice(-MAX_SCAN_URL_LENGTH);
    }
  }

  return { push, reset, flush };
}
