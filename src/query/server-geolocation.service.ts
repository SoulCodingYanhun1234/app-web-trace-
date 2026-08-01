import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type TrustedGeoSource = 'amap_ip' | 'server_geoip' | 'trusted_edge_geo';

export type GeoRectangleBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type ServerGeoRequestContext = {
  headers?: Record<string, unknown>;
  remoteAddress?: string;
};

export type TrustedGeoEvidence = {
  source: TrustedGeoSource;
  verified: true;
  trust_level: 'trusted_server';
  ip: string;
  location: string;
  province: string;
  city: string;
  district?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  adcode?: string;
  rectangle?: string;
  bounds?: GeoRectangleBounds;
  provider?: string;
};

type ParsedIp = { family: 4 | 6; value: bigint; normalized: string };
type CacheEntry = { expiresAt: number; value: TrustedGeoEvidence | null };

const IPV4_BITS = 32;
const IPV6_BITS = 128;
const MAX_PROVIDER_RESPONSE_BYTES = 65_536;

@Injectable()
export class ServerGeolocationService {
  private readonly logger = new Logger(ServerGeolocationService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<TrustedGeoEvidence | null>>();

  constructor(private readonly config: ConfigService) {}

  async resolve(ipValue: unknown, context: ServerGeoRequestContext = {}): Promise<TrustedGeoEvidence | null> {
    const parsedIp = parseIp(ipValue);
    // Public verification must never send private, loopback, documentation, or otherwise reserved addresses to a provider.
    if (!parsedIp || isReservedAddress(parsedIp)) return null;

    const edgeEvidence = this.fromTrustedEdge(parsedIp, context);
    if (edgeEvidence) return edgeEvidence;

    const amapKey = this.getText('AMAP_WEB_SERVICE_KEY');
    const template = this.getText('SERVER_GEOIP_URL_TEMPLATE');
    if (!amapKey && !template) return null;

    const key = parsedIp.normalized;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(key);

    const existing = this.pending.get(key);
    if (existing) return existing;

    const request = (amapKey
      ? this.fetchFromAmap(parsedIp, amapKey)
      : this.fetchFromProvider(parsedIp, template))
      .then((value) => {
        this.setCache(key, value, value ? this.cacheTtlMs() : this.negativeCacheTtlMs());
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async fetchFromAmap(parsedIp: ParsedIp, key: string): Promise<TrustedGeoEvidence | null> {
    const endpoint = new URL('https://restapi.amap.com/v3/ip');
    endpoint.searchParams.set('ip', parsedIp.normalized);
    endpoint.searchParams.set('key', key);

    const payload = await this.fetchJson(endpoint, 'AMap IP location', { Accept: 'application/json' }, true);
    if (!payload || String(payload.status) !== '1' || String(payload.infocode) !== '10000') return null;

    const parsedRectangle = parseRectangle(payload.rectangle);
    if (!parsedRectangle) return null;
    return this.normalizeEvidence({
      source: 'amap_ip',
      ip: parsedIp.normalized,
      province: payload.province,
      city: payload.city,
      location: [payload.province, payload.city].map((value) => cleanText(value, 64)).filter(Boolean).join(''),
      latitude: (parsedRectangle.bounds.minLat + parsedRectangle.bounds.maxLat) / 2,
      longitude: (parsedRectangle.bounds.minLng + parsedRectangle.bounds.maxLng) / 2,
      adcode: payload.adcode,
      rectangle: parsedRectangle.rectangle,
      bounds: parsedRectangle.bounds,
      provider: endpoint.hostname,
    });
  }

  private fromTrustedEdge(parsedIp: ParsedIp, context: ServerGeoRequestContext): TrustedGeoEvidence | null {
    const trustedCidrs = this.getText('SERVER_GEO_TRUSTED_EDGE_CIDRS')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!trustedCidrs.length) return null;

    const peer = parseIp(context.remoteAddress);
    if (!peer || !trustedCidrs.some((cidr) => isIpInCidr(peer, cidr))) return null;

    const prefixValue = this.getText('SERVER_GEO_TRUSTED_EDGE_HEADER_PREFIX', 'x-verified-geo-').toLowerCase();
    const prefix = /^[a-z0-9-]{1,48}$/.test(prefixValue) ? prefixValue : 'x-verified-geo-';
    const reportedIp = parseIp(this.header(context.headers, `${prefix}client-ip`));
    // The edge must overwrite and bind its geo headers to the same client address Fastify resolved as request.ip.
    if (!reportedIp || !sameIp(parsedIp, reportedIp)) return null;

    return this.normalizeEvidence({
      source: 'trusted_edge_geo',
      ip: parsedIp.normalized,
      province: this.header(context.headers, `${prefix}province`),
      city: this.header(context.headers, `${prefix}city`),
      district: this.header(context.headers, `${prefix}district`),
      country: this.header(context.headers, `${prefix}country`),
      country_code: this.header(context.headers, `${prefix}country-code`),
      location: this.header(context.headers, `${prefix}location`),
      latitude: this.header(context.headers, `${prefix}latitude`),
      longitude: this.header(context.headers, `${prefix}longitude`),
      provider: 'trusted-edge',
    });
  }

  private async fetchFromProvider(parsedIp: ParsedIp, template: string): Promise<TrustedGeoEvidence | null> {
    if (!template.includes('{ip}')) {
      this.logger.warn('SERVER_GEOIP_URL_TEMPLATE is ignored because it does not contain {ip}');
      return null;
    }

    let endpoint: URL;
    try {
      endpoint = new URL(template.replaceAll('{ip}', encodeURIComponent(parsedIp.normalized)));
    } catch (error: any) {
      this.logger.warn(`Server GeoIP endpoint rejected: ${error?.message || 'invalid endpoint'}`);
      return null;
    }

    const payload = await this.fetchJson(endpoint, 'server GeoIP', this.providerHeaders());
    if (!payload) return null;
    try {
      const data = this.providerData(payload);
      const responseIp = parseIp(this.first(data.ip, data.query, data.client_ip, data.clientIp));
      if (responseIp && !sameIp(parsedIp, responseIp)) return null;

      return this.normalizeEvidence({
        source: 'server_geoip',
        ip: parsedIp.normalized,
        province: this.first(data.province, data.province_name, data.regionName, data.region_name, data.region),
        city: this.first(data.city, data.city_name),
        district: this.first(data.district, data.district_name, data.county),
        country: this.first(data.country, data.country_name),
        country_code: this.first(data.country_code, data.countryCode, data.countryCode2),
        location: typeof data.location === 'string' ? data.location : '',
        latitude: this.first(data.latitude, data.lat, data.location?.latitude, data.location?.lat),
        longitude: this.first(data.longitude, data.lon, data.lng, data.location?.longitude, data.location?.lon, data.location?.lng),
        provider: endpoint.hostname,
      });
    } catch {
      return null;
    }
  }

  private async fetchJson(
    endpoint: URL,
    providerLabel: string,
    headers: Record<string, string> = { Accept: 'application/json' },
    fixedOfficialEndpoint = false,
  ) {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        const error = new Error(`${providerLabel} deadline exceeded`);
        error.name = 'AbortError';
        reject(error);
      }, this.timeoutMs());
    });
    try {
      if (!fixedOfficialEndpoint) await Promise.race([this.assertProviderEndpoint(endpoint), deadline]);
      const response = await Promise.race([
        fetch(endpoint, {
          method: 'GET',
          headers,
          redirect: 'error',
          signal: controller.signal,
        }),
        deadline,
      ]);
      if (!response.ok) return null;
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const text = await Promise.race([response.text(), deadline]);
      if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) return null;
      const payload = JSON.parse(text);
      return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, any>
        : null;
    } catch (error: any) {
      if (error?.name !== 'AbortError') this.logger.warn(`${providerLabel} lookup failed for provider ${endpoint.hostname}`);
      return null;
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }

  private normalizeEvidence(input: Record<string, any>): TrustedGeoEvidence | null {
    const province = cleanText(input.province, 64);
    let city = cleanText(input.city, 64);
    if (!city && /^(北京市|上海市|天津市|重庆市)$/.test(province)) city = province;
    // Province and city are the minimum granularity allowed to drive an authorization mismatch.
    if (!province || !city) return null;

    const district = cleanText(input.district, 64);
    const explicitLocation = cleanText(input.location, 128);
    const latitude = boundedNumber(input.latitude, -90, 90);
    const longitude = boundedNumber(input.longitude, -180, 180);
    return {
      source: input.source,
      verified: true,
      trust_level: 'trusted_server',
      ip: cleanText(input.ip, 64),
      location: explicitLocation || [province, city, district].filter(Boolean).join(''),
      province,
      city,
      district: district || undefined,
      country: cleanText(input.country, 64) || undefined,
      country_code: cleanText(input.country_code, 8).toUpperCase() || undefined,
      latitude,
      longitude,
      adcode: cleanText(input.adcode, 32) || undefined,
      rectangle: cleanText(input.rectangle, 128) || undefined,
      bounds: normalizeBounds(input.bounds),
      provider: cleanText(input.provider, 128) || undefined,
    };
  }

  private async assertProviderEndpoint(endpoint: URL) {
    if (endpoint.username || endpoint.password) throw new Error('URL credentials are not allowed');
    const allowHttp = this.getText('SERVER_GEOIP_ALLOW_HTTP', 'false').toLowerCase() === 'true';
    if (endpoint.protocol !== 'https:' && !(allowHttp && endpoint.protocol === 'http:')) {
      throw new Error('HTTPS is required');
    }

    const literal = parseIp(endpoint.hostname);
    if (literal) {
      if (isReservedAddress(literal)) throw new Error('private or reserved provider address');
      return;
    }
    if (!endpoint.hostname || endpoint.hostname.toLowerCase() === 'localhost') throw new Error('invalid provider host');

    const addresses = await lookup(endpoint.hostname, { all: true, verbatim: true });
    if (!addresses.length) throw new Error('provider host did not resolve');
    for (const address of addresses) {
      const parsed = parseIp(address.address);
      if (!parsed || isReservedAddress(parsed)) throw new Error('provider DNS resolved to a private or reserved address');
    }
  }

  private providerData(payload: unknown): Record<string, any> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    const root = payload as Record<string, any>;
    for (const candidate of [root.data, root.result, root.location]) {
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return { ...root, ...candidate };
    }
    return root;
  }

  private providerHeaders(): Record<string, string> {
    const name = this.getText('SERVER_GEOIP_AUTH_HEADER_NAME');
    const value = this.getText('SERVER_GEOIP_AUTH_HEADER_VALUE');
    if (!name || !value || !/^[A-Za-z0-9-]{1,64}$/.test(name)) return { Accept: 'application/json' };
    if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(name.toLowerCase())) return { Accept: 'application/json' };
    return { Accept: 'application/json', [name]: cleanText(value, 2048) };
  }

  private header(headers: Record<string, unknown> | undefined, name: string) {
    if (!headers) return '';
    const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
    const value = key ? headers[key] : undefined;
    return cleanText(Array.isArray(value) ? value[0] : value, 255);
  }

  private first(...values: unknown[]) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
  }

  private getText(name: string, fallback = '') {
    return String(this.config.get(name) ?? process.env[name] ?? fallback).trim();
  }

  private timeoutMs() {
    return boundedInteger(this.getText('SERVER_GEOIP_TIMEOUT_MS', '800'), 100, 5_000, 800);
  }

  private cacheTtlMs() {
    return boundedInteger(this.getText('SERVER_GEOIP_CACHE_TTL_SECONDS', '900'), 30, 86_400, 900) * 1_000;
  }

  private negativeCacheTtlMs() {
    return boundedInteger(this.getText('SERVER_GEOIP_NEGATIVE_CACHE_TTL_SECONDS', '30'), 5, 300, 30) * 1_000;
  }

  private setCache(key: string, value: TrustedGeoEvidence | null, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.cache.size <= 10_000) return;
    const now = Date.now();
    for (const [cacheKey, item] of this.cache) {
      if (item.expiresAt <= now || this.cache.size > 9_000) this.cache.delete(cacheKey);
      if (this.cache.size <= 9_000) break;
    }
  }
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function boundedNumber(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeBounds(value: unknown): GeoRectangleBounds | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const minLng = boundedNumber(input.minLng, -180, 180);
  const minLat = boundedNumber(input.minLat, -90, 90);
  const maxLng = boundedNumber(input.maxLng, -180, 180);
  const maxLat = boundedNumber(input.maxLat, -90, 90);
  if ([minLng, minLat, maxLng, maxLat].some((item) => item === undefined)) return undefined;
  if (minLng! > maxLng! || minLat! > maxLat!) return undefined;
  return { minLng: minLng!, minLat: minLat!, maxLng: maxLng!, maxLat: maxLat! };
}

function parseRectangle(value: unknown): { rectangle: string; bounds: GeoRectangleBounds } | null {
  const rectangle = cleanText(value, 128);
  const match = rectangle.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const firstLng = boundedNumber(match[1], -180, 180);
  const firstLat = boundedNumber(match[2], -90, 90);
  const secondLng = boundedNumber(match[3], -180, 180);
  const secondLat = boundedNumber(match[4], -90, 90);
  if ([firstLng, firstLat, secondLng, secondLat].some((item) => item === undefined)) return null;
  const bounds = {
    minLng: Math.min(firstLng!, secondLng!),
    minLat: Math.min(firstLat!, secondLat!),
    maxLng: Math.max(firstLng!, secondLng!),
    maxLat: Math.max(firstLat!, secondLat!),
  };
  return { rectangle: `${bounds.minLng},${bounds.minLat};${bounds.maxLng},${bounds.maxLat}`, bounds };
}

function parseIp(value: unknown): ParsedIp | null {
  let text = String(value ?? '').trim().replace(/^\[|\]$/g, '');
  if (!text || text.includes(',') || text.includes('/')) return null;
  const zoneIndex = text.indexOf('%');
  if (zoneIndex >= 0) text = text.slice(0, zoneIndex);
  if (text.toLowerCase().startsWith('::ffff:') && isIP(text.slice(7)) === 4) text = text.slice(7);
  const family = isIP(text);
  if (family === 4) {
    const octets = text.split('.').map(Number);
    const valueNumber = octets.reduce((sum, octet) => (sum << 8n) | BigInt(octet), 0n);
    return { family: 4, value: valueNumber, normalized: octets.join('.') };
  }
  if (family !== 6) return null;
  const valueNumber = ipv6ToBigInt(text);
  if (valueNumber === null) return null;
  return { family: 6, value: valueNumber, normalized: text.toLowerCase() };
}

function ipv6ToBigInt(input: string): bigint | null {
  let text = input.toLowerCase();
  const ipv4Match = text.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (ipv4Match) {
    const parsedV4 = parseIp(ipv4Match[1]);
    if (!parsedV4) return null;
    const high = Number((parsedV4.value >> 16n) & 0xffffn).toString(16);
    const low = Number(parsedV4.value & 0xffffn).toString(16);
    text = text.slice(0, -ipv4Match[1].length) + `${high}:${low}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((sum, part) => (sum << 16n) | BigInt(`0x${part}`), 0n);
}

function sameIp(a: ParsedIp, b: ParsedIp) {
  return a.family === b.family && a.value === b.value;
}

function isReservedAddress(ip: ParsedIp) {
  if (ip.family === 4) {
    return [
      ['0.0.0.0/8'], ['10.0.0.0/8'], ['100.64.0.0/10'], ['127.0.0.0/8'], ['169.254.0.0/16'],
      ['172.16.0.0/12'], ['192.0.0.0/24'], ['192.0.2.0/24'], ['192.88.99.0/24'], ['192.168.0.0/16'],
      ['198.18.0.0/15'], ['198.51.100.0/24'], ['203.0.113.0/24'], ['224.0.0.0/4'], ['240.0.0.0/4'],
    ].some(([cidr]) => isIpInCidr(ip, cidr));
  }
  return ['::/128', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '2001:db8::/32']
    .some((cidr) => isIpInCidr(ip, cidr));
}

function isIpInCidr(ip: ParsedIp, cidrValue: string) {
  const [address, prefixText] = String(cidrValue).trim().split('/');
  const network = parseIp(address);
  if (!network || network.family !== ip.family) return false;
  const bits = ip.family === 4 ? IPV4_BITS : IPV6_BITS;
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return false;
  if (prefix === 0) return true;
  const shift = BigInt(bits - prefix);
  return (ip.value >> shift) === (network.value >> shift);
}
