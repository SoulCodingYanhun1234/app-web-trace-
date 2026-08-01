export function installAdminAntiCrawler() {
  const meta = document.querySelector('meta[name="robots"]') || document.createElement('meta');
  meta.setAttribute('name', 'robots');
  meta.setAttribute('content', 'noindex,nofollow,noarchive,nosnippet');
  if (!meta.parentNode) document.head.appendChild(meta);

  const honeypot = document.createElement('input');
  honeypot.type = 'text';
  honeypot.name = '_honey';
  honeypot.autocomplete = 'off';
  honeypot.tabIndex = -1;
  honeypot.setAttribute('aria-hidden', 'true');
  honeypot.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(honeypot);

  window.addEventListener('dragstart', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('.el-table, .soy-sider, .soy-header')) event.preventDefault();
  }, { passive: false });
}
