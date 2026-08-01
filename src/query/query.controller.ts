import { BadRequestException, Body, Controller, Get, Header, Headers, Ip, Param, Post, Query as QueryParam, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator.js';
import { SkipWrap } from '../common/decorators/skip-wrap.decorator.js';
import { QueryService } from './query.service.js';
import { QueryCodeDto } from './dto.js';
import { AntiCrawlerGuard } from '../common/anti-crawler.guard.js';
import { PublicVerificationSecurityService } from './public-verification-security.service.js';

@ApiTags('公开扫码查询')
@Public()
@UseGuards(AntiCrawlerGuard)
@Controller('query')
export class QueryController {
  constructor(
    private readonly service: QueryService,
    private readonly verificationSecurity: PublicVerificationSecurityService,
  ) {}

  @Post()
  async post(@Body() dto: QueryCodeDto, @Ip() ip: string, @Req() req: FastifyRequest, @Headers('user-agent') userAgent?: string) {
    await this.verificationSecurity.verifyChallenge(req, dto.code, dto.challenge || firstHeaderValue(req.headers['x-verify-challenge']));
    return this.service.query(dto, this.requestMeta(req, ip, userAgent));
  }

  @Get('preflight/:code')
  preflight(@Param('code') code: string, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    this.applyPublicSecurityHeaders(reply);
    reply.header('Vary', 'Origin, Cookie');
    return this.verificationSecurity.issueChallenge(req, code, (cookie) => reply.header('Set-Cookie', cookie));
  }

  @SkipWrap()
  @Get('qrcode/:code')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  qrcode(@Param('code') code: string, @Req() req: FastifyRequest) {
    this.verificationSecurity.assertOfficialSite(req);
    return this.service.qrcodeSvg(code, this.getRequestHost(req));
  }


  private firstHeader(value: unknown) {
    return Array.isArray(value) ? value[0] : String(value || '').split(',')[0].trim();
  }

  private getRequestHost(req: FastifyRequest): string | undefined {
    const proto = String(req.protocol || '').toLowerCase();
    const safeProto = proto === 'http' || proto === 'https' ? proto : 'https';
    const host = this.firstHeader(req.host || req.headers.host).toLowerCase();
    if (!host || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) return undefined;
    return `${safeProto}://${host}`;
  }

  /**
   * 兼容旧二维码：历史版本生成的二维码指向 /api/query?code=xxx。
   * 浏览器扫码访问时应打开消费者验证页面，而不是直接展示 JSON。
   * API 客户端 / Axios 请求仍返回 JSON，避免破坏原有接口调用。
   */
  @Get()
  async get(
    @QueryParam() query: Record<string, any>,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('accept') accept = '',
    @Headers('sec-fetch-dest') fetchDest = '',
    @Headers('x-requested-with') requestedWith = '',
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    this.applyPublicSecurityHeaders(reply);
    const dto: QueryCodeDto = {
      code: String(query.code || '').trim(),
      channel: query.channel ? String(query.channel) : 'web',
      location: query.location ? String(query.location) : undefined,
      province: query.province ? String(query.province) : undefined,
      city: query.city ? String(query.city) : undefined,
      district: query.district ? String(query.district) : undefined,
      latitude: query.latitude ? Number(query.latitude) : undefined,
      longitude: query.longitude ? Number(query.longitude) : undefined,
      accuracy: query.accuracy ? Number(query.accuracy) : undefined,
      location_source: query.location_source ? String(query.location_source) : undefined,
      public_ip: query.public_ip ? String(query.public_ip) : undefined,
      ip_location: query.ip_location ? String(query.ip_location) : undefined,
      ip_province: query.ip_province ? String(query.ip_province) : undefined,
      ip_city: query.ip_city ? String(query.ip_city) : undefined,
      ip_district: query.ip_district ? String(query.ip_district) : undefined,
      ip_adcode: query.ip_adcode ? String(query.ip_adcode) : undefined,
      ip_isp: query.ip_isp ? String(query.ip_isp) : undefined,
      ip_source: query.ip_source ? String(query.ip_source) : undefined,
    };

    if (this.shouldRedirectToVerifyPage(accept, fetchDest, requestedWith, userAgent)) {
      return reply.status(302).header('Location', this.service.buildVerifyUrl(dto.code, dto)).send();
    }

    if (!dto.code) throw new BadRequestException('防伪码不能为空');
    await this.verificationSecurity.verifyChallenge(req, dto.code, String(query.challenge || firstHeaderValue(req.headers['x-verify-challenge']) || ''));
    const data = await this.service.query(dto, this.requestMeta(req, ip, userAgent));
    return reply.send({ success: true, data, timestamp: new Date().toISOString() });
  }

  private requestMeta(req: FastifyRequest, ip: string, userAgent?: string) {
    return {
      ip,
      userAgent,
      // socket.remoteAddress is the direct peer and cannot be replaced by X-Forwarded-For.
      remoteAddress: req.socket.remoteAddress,
      headers: req.headers as Record<string, unknown>,
    };
  }

  private applyPublicSecurityHeaders(reply: FastifyReply) {
    reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .header('Pragma', 'no-cache')
      .header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
      .header('X-Content-Type-Options', 'nosniff');
  }

  private shouldRedirectToVerifyPage(accept = '', fetchDest = '', requestedWith = '', userAgent = '') {
    const lowerAccept = accept.toLowerCase();
    const lowerRequestedWith = requestedWith.toLowerCase();
    const lowerFetchDest = fetchDest.toLowerCase();
    const lowerUa = userAgent.toLowerCase();

    if (lowerRequestedWith === 'xmlhttprequest') return false;
    if (lowerAccept.includes('application/json')) return false;
    if (lowerFetchDest && lowerFetchDest !== 'document') return false;
    if (lowerAccept.includes('text/html')) return true;

    // 微信 / 支付宝 / 浏览器扫码器有时不会带标准 Accept，这里兜底识别常见浏览器 UA。
    return /mozilla|micromessenger|alipayclient|safari|chrome|firefox|edg|quark|ucbrowser/.test(lowerUa);
  }
}

function firstHeaderValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}
