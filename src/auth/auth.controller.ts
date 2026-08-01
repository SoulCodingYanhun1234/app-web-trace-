import { Body, Controller, Get, Headers, Ip, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginCodeDto, LoginDto, RefreshDto, UpdateProfileDto, WechatQrCodeDto } from './dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('login-options')
  loginOptions() {
    return this.auth.loginOptions();
  }

  @Public()
  @Post('login-code')
  sendLoginCode(
    @Body() dto: LoginCodeDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-login-entry') loginEntry?: string,
    @Headers('origin') origin?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ) {
    return this.auth.sendLoginCode(dto, { ip, userAgent, loginEntry, origin, forwardedHost, host });
  }

  @Public()
  @Post('wechat/qrcode')
  wechatQrCode(@Body() dto: WechatQrCodeDto) {
    return this.auth.wechatQrCode(dto.redirectUri);
  }

  @Public()
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-login-entry') loginEntry?: string,
    @Headers('origin') origin?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ) {
    return this.auth.login(dto, {
      ip,
      userAgent,
      loginEntry,
      origin,
      forwardedHost,
      host,
    });
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization?: string, @Body('refreshToken') refreshToken?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    return this.auth.logout(token, refreshToken);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }

  @ApiBearerAuth()
  @Put('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @Put('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.oldPassword, dto.newPassword);
  }
}
