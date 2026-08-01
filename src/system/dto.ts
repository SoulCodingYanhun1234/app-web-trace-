import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  real_name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  role?: number = 2;

  @ApiPropertyOptional({ enum: [0, 1], default: 1 })
  @IsOptional()
  @IsIn([0, 1])
  status?: number = 1;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  role_ids?: number[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  permissions?: string[];
}

export class UpdateAdminDto {
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
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  role?: number;

  @ApiPropertyOptional({ enum: [0, 1] })
  @IsOptional()
  @IsIn([0, 1])
  status?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  role_ids?: number[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  permissions?: string[];
}

export class UpdateAdminStatusDto {
  @ApiProperty({ enum: [0, 1] })
  @IsIn([0, 1])
  status!: number;
}

export class UpsertRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role_code?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  role_name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ enum: [0, 1], default: 1 })
  @IsOptional()
  @IsIn([0, 1])
  status?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  permission_codes?: string[];
}

export class UpdateAdminPermissionsDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  role_ids?: number[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  permissions?: string[];
}


export class ModuleEditorItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  module_key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  module_name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 999 })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  // 前端模块编辑器回传时会带权限预览数组；后端保存模块配置时会忽略该字段，
  // 这里允许它通过白名单校验，避免 ValidationPipe 报 property permissions should not exist。
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  permissions?: any[];
}

export class UpdateModulesDto {
  @ApiProperty({ type: [ModuleEditorItemDto] })
  @IsArray()
  modules!: ModuleEditorItemDto[];
}
