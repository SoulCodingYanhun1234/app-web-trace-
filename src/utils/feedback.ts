import { ElMessage } from 'element-plus';

let installed = false;

function withClose(type: 'success' | 'warning' | 'info' | 'error', options: any) {
  if (typeof options === 'string') {
    return { type, message: options, showClose: true, duration: type === 'error' ? 6000 : 3500 };
  }
  return {
    ...(options || {}),
    type: options?.type || type,
    showClose: options?.showClose ?? true,
    duration: options?.duration ?? (type === 'error' ? 6000 : 3500),
  };
}

export function installClosableMessage() {
  if (installed) return;
  installed = true;
  const api = ElMessage as any;
  (['success', 'warning', 'info', 'error'] as const).forEach((type) => {
    const original = api[type]?.bind(api);
    if (!original) return;
    api[type] = (options: any) => original(withClose(type, options));
  });
}
