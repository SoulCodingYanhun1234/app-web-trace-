import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

const BOT_UA_RE = /(bot|spider|crawler|scrapy|python-requests|curl|wget|go-http-client|java\/|httpclient|headlesschrome|phantomjs|selenium|playwright|puppeteer|masscan|zgrab|sqlmap|nikto|acunetix|nessus|dirbuster|httpx|fuzzer)/i;
const HONEYPOT_KEYS = ['email', 'website', 'homepage', 'url', '_honey', 'company_site', 'fax', 'contact_me'];
const SAFE_CHANNELS = new Set(['scan', 'web', 'wechat', 'miniapp', 'box', 'mobile', 'h5', 'browser', 'public']);

function normalizeGuardCode(value: unknown): string {
  let raw = String(value || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!raw) return '';
  try { raw = decodeURIComponent(raw).trim(); } catch {}
  const embedded = raw.match(/(?:^|\/)(?:verify|v)\/([^?#\s]+)/i)
    || raw.match(/[?&#](?:code|anti_fake_code|antiFakeCode|q|barcode|sn|c)=([^&#\s]+)/i);
  return embedded?.[1] ? normalizeGuardCode(embedded[1]) : raw;
}

@Injectable()
export class AntiCrawlerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (String(process.env.ANTI_CRAWLER_ENABLED ?? 'true') === 'false') return true;
    const req = context.switchToHttp().getRequest<any>();
    const headers = req.headers || {};
    const ua = String(headers['user-agent'] || '');
    const query = req.query || {};
    const body = req.body || {};
    const method = String(req.method || '').toUpperCase();

    // 隐藏蜜罐字段：真实扫码/查询不会提交这些字段，爬虫表单探测经常会填。
    if (HONEYPOT_KEYS.some((key) => query[key] || body[key])) {
      throw new ForbiddenException('访问被安全策略拦截');
    }

    // 公开扫码查询只允许围绕防伪码、扫码位置、网络证据与设备证据的白名单字段。
    // 消费者页只通过 UAPI commercial myip 补齐公网地区；这些字段必须放行，
    // 否则真实消费者扫码会被误判成“请求参数异常”。
    const keys = new Set([...Object.keys(query), ...Object.keys(body)]);
    const allowed = new Set([
      'code', 'channel', 'location', 'timestamp', 'nonce', 'signature', 'challenge',
      'province', 'city', 'district', 'latitude', 'longitude', 'accuracy', 'location_source',
      'webrtc_local_ips', 'device_id', 'device_integrity', 'jailbroken',
      'public_ip', 'ip_location', 'ip_province', 'ip_city', 'ip_district', 'ip_adcode', 'ip_isp', 'ip_source', 'ip_info',
    ]);
    const noisyKeys = [...keys].filter((key) => !allowed.has(key));
    if (noisyKeys.length || keys.size > 28) throw new ForbiddenException('请求参数异常');

    const latitude = Number(body.latitude ?? query.latitude);
    const longitude = Number(body.longitude ?? query.longitude);
    const accuracy = Number(body.accuracy ?? query.accuracy);
    if ((body.latitude ?? query.latitude) !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new ForbiddenException('定位参数异常');
    if ((body.longitude ?? query.longitude) !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new ForbiddenException('定位参数异常');
    if ((body.accuracy ?? query.accuracy) !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)) throw new ForbiddenException('定位参数异常');

    const code = normalizeGuardCode(body.code || query.code);
    if (code && (code.length > 128 || /[<>`{}\[\]\\]/.test(code))) {
      throw new ForbiddenException('防伪码格式异常');
    }
    const channel = String(body.channel || query.channel || '').trim().toLowerCase();
    if (channel && !SAFE_CHANNELS.has(channel)) throw new ForbiddenException('查询渠道异常');

    // 命令行、无头浏览器、常见采集器默认阻断；正常浏览器、微信扫码、App WebView 不受影响。
    if (BOT_UA_RE.test(ua)) throw new ForbiddenException('请使用浏览器或扫码客户端访问');

    // GET 直接访问 /api/query 必须是页面跳转或 JSON 客户端。缺少 Accept 的批量探测请求会被拦截。
    const accept = String(headers.accept || '').toLowerCase();
    if (method === 'GET' && !accept.includes('text/html') && !accept.includes('application/json') && !accept.includes('*/*')) {
      throw new ForbiddenException('请求头异常');
    }
    return true;
  }
}
