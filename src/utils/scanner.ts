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
let scanAudio: HTMLAudioElement | null = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  beepContext ||= new Ctor();
  return beepContext;
}

function getScanAudio() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  scanAudio ||= new Audio(new URL('/sounds/scan-success.mp3', window.location.href).toString());
  scanAudio.preload = 'auto';
  return scanAudio;
}

/** Warm up audio from a user interaction, such as starting the camera. */
export function primeScanAudio() {
  try {
    getScanAudio()?.load();
    const context = getAudioContext();
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
  } catch {
    // Audio is optional feedback; scanning must continue when a browser blocks it.
  }
}

async function playSynthesizedBeep() {
  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 1600;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  } catch {
    // Audio is optional feedback; scanning must continue when a browser blocks it.
  }
}

export function playScanBeep() {
  try {
    const audio = getScanAudio();
    if (!audio) {
      void playSynthesizedBeep();
      return;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => playSynthesizedBeep());
  } catch {
    void playSynthesizedBeep();
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
