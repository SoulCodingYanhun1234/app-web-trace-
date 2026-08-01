import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryCodeDto {
  @IsString()
  @MaxLength(128)
  code!: string;

  @ApiPropertyOptional({ description: '官方验码页预检签发的短时一次性挑战' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  challenge?: string;

  @ApiPropertyOptional({ default: 'web' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channel?: string = 'web';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  device_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_integrity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  jailbroken?: boolean;

  @ApiPropertyOptional({ description: '浏览器定位纬度' })
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ description: '浏览器定位经度' })
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ description: '浏览器定位精度，单位米' })
  @IsOptional()
  accuracy?: number;

  @ApiPropertyOptional({ description: '位置来源：uapi_network_myip/unknown' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  location_source?: string;

  @ApiPropertyOptional({ description: 'WebRTC ICE 候选中收集的本地/出口 IP，仅用于风控留证' })
  @IsOptional()
  webrtc_local_ips?: string[];


  @ApiPropertyOptional({ description: 'UAPI network/myip 返回的公网 IP' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  public_ip?: string;

  @ApiPropertyOptional({ description: 'UAPI network/myip 解析的位置文本' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  ip_location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip_province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip_city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip_district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ip_adcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip_isp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip_source?: string;

  @ApiPropertyOptional({ description: 'UAPI myip 归一化信息，仅用于风控留证' })
  @IsOptional()
  ip_info?: Record<string, any>;
}
