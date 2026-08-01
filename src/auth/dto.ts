import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({ example: 'password', enum: ['password', 'email_code', 'phone_code', 'wechat_qr'] })
  @IsOptional()
  @IsString()
  @IsIn(['password', 'email_code', 'phone_code', 'wechat_qr'])
  channel?: 'password' | 'email_code' | 'phone_code' | 'wechat_qr';

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  account?: string;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_.@-]+$/, { message: '账号只能包含字母、数字、下划线、点、@ 和短横线' })
  username?: string;

  @ApiPropertyOptional({ example: 'Admin@123456' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '13800138000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, { message: '验证码格式不正确' })
  code?: string;

  @ApiPropertyOptional({ example: 'wechat-oauth-code' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  wechatCode?: string;

  @ApiPropertyOptional({ example: 'wechat-state' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  state?: string;
}

export class LoginCodeDto {
  @ApiProperty({ example: 'email', enum: ['email', 'phone'] })
  @IsString()
  @IsIn(['email', 'phone'])
  channel!: 'email' | 'phone';

  @ApiProperty({ example: 'admin@example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  target!: string;
}

export class WechatQrCodeDto {
  @ApiPropertyOptional({ example: 'https://admin.example.com/login' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  redirectUri?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  real_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  oldPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
