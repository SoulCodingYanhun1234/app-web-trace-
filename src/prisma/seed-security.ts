const insecureAdminPasswords = new Set([
  'admin@123456',
  'change_me_admin_password',
  'password',
  'password123',
]);

export function initialAdminPassword(env: Record<string, string | undefined> = process.env) {
  const configured = String(env.SUPER_ADMIN_PASSWORD || '');
  if (String(env.NODE_ENV || '').toLowerCase() !== 'production') {
    return configured || 'Admin@123456';
  }

  const characterClasses = [
    /[a-z]/.test(configured),
    /[A-Z]/.test(configured),
    /\d/.test(configured),
    /[^A-Za-z0-9]/.test(configured),
  ].filter(Boolean).length;
  if (
    configured.length < 12
    || characterClasses < 3
    || insecureAdminPasswords.has(configured.toLowerCase())
  ) {
    throw new Error('生产环境首次创建超级管理员前，必须配置至少 12 位且包含三类字符的 SUPER_ADMIN_PASSWORD');
  }
  return configured;
}
