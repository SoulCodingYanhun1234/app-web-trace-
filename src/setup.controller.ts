import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator.js';
import { PrismaService } from './prisma/prisma.service.js';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';

type SetupBody = {
  admin_username?: string;
  admin_password?: string;
  site_name?: string;
  company_name?: string;
  database_provider?: string;
  real_name?: string;
  force?: boolean;
};

@Controller('setup')
export class SetupController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('status')
  async status() {
    const adminCount = await this.prisma.admin.count().catch(() => 0);
    const settingCount = await this.prisma.systemSetting.count().catch(() => 0);
    return { initialized: adminCount > 0 && settingCount > 0, adminCount, settingCount };
  }

  private setupToken() {
    return String(process.env.SETUP_TOKEN || process.env.INITIALIZE_TOKEN || '').trim();
  }

  private safeEquals(left = '', right = '') {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private assertSetupAllowed(adminCount: number, body: SetupBody, headerToken?: string) {
    const token = this.setupToken();
    const provided = String(headerToken || '').trim();

    // 系统一旦存在管理员，公开初始化接口绝不能再被 force 重置；必须显式配置并提交 SETUP_TOKEN。
    if (adminCount > 0) {
      if (!body?.force) return { skip: true };
      if (!token || !provided || !this.safeEquals(provided, token)) {
        throw new ForbiddenException('系统已初始化，禁止通过公开接口强制重置；如确需重置，请设置 SETUP_TOKEN 并通过 X-Setup-Token 提交。');
      }
      return { skip: false };
    }

    // 首次初始化如果配置了 SETUP_TOKEN，也必须校验，避免公网部署时被抢先初始化。
    if (token && (!provided || !this.safeEquals(provided, token))) {
      throw new ForbiddenException('初始化令牌不正确');
    }
    return { skip: false };
  }

  private normalizeUsername(value: unknown) {
    const username = String(value || 'admin').trim().slice(0, 64);
    if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(username)) throw new BadRequestException('管理员账号格式不正确');
    return username;
  }

  private normalizePassword(value: unknown, username: string) {
    const password = String(value || 'Admin@123456');
    if (password.length < 8 || password.length > 128) throw new BadRequestException('管理员密码长度必须为 8-128 位');
    if (password.toLowerCase().includes(username.toLowerCase())) throw new BadRequestException('管理员密码不能包含账号');
    if (!/[a-z]/i.test(password) || !/\d/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      throw new BadRequestException('管理员密码必须包含字母、数字和特殊符号');
    }
    return password;
  }

  @Public()
  @Post('initialize')
  async initialize(@Body() body: SetupBody = {}, @Headers('x-setup-token') setupToken?: string) {
    const adminCount = await this.prisma.admin.count();
    const guard = this.assertSetupAllowed(adminCount, body, setupToken);
    if (guard.skip) return { initialized: true, skipped: true, message: '系统已初始化' };

    const username = this.normalizeUsername(body?.admin_username);
    const password = this.normalizePassword(body?.admin_password, username);
    const siteName = String(body?.site_name || '防伪溯源 SaaS 管理平台').trim().slice(0, 120);
    const companyName = String(body?.company_name || '').trim().slice(0, 120);
    const realName = String(body?.real_name || '超级管理员').trim().slice(0, 64);

    const admin = await this.prisma.admin.upsert({
      where: { username },
      create: {
        username,
        password_hash: await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12)),
        real_name: realName,
        role: 1,
        status: 1,
        permissions: ['*'],
      },
      update: { role: 1, status: 1, permissions: ['*'] },
    });

    const rows = [
      ['basic_system', 'site_name', siteName],
      ['basic_system', 'admin_title', siteName],
      ['enterprise_brand', 'company_name', companyName],
      ['deploy', 'docker_initialized_at', new Date().toISOString()],
      ['deploy', 'database_provider', body?.database_provider || process.env.DATABASE_URL?.split(':')[0] || 'mysql'],
    ] as const;
    await this.prisma.$transaction(rows.map(([group_key, setting_key, setting_value]) => this.prisma.systemSetting.upsert({
      where: { group_key_setting_key: { group_key, setting_key } },
      create: { group_key, setting_key, setting_value, value_type: typeof setting_value, updated_by: admin.id },
      update: { setting_value, value_type: typeof setting_value, updated_by: admin.id },
    })));
    return { initialized: true, admin_username: username, site_name: siteName };
  }
}
