export function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function debounce<T extends (...args: any[]) => any>(fn: T, wait = 260) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function runIdle(task: () => void, timeout = 800) {
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === 'function') return ric(task, { timeout });
  return window.setTimeout(task, 16);
}
