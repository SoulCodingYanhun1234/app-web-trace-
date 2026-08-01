import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { UapiService } from './uapi.service.js';

@ApiTags('UAPI 公共信息')
@Public()
@Controller('uapi')
export class UapiController {
  constructor(private readonly service: UapiService) {}

  @Get('network/myip')
  myIp() {
    return this.service.get('/network/myip', { source: 'commercial' }, 600);
  }

  @Get('misc/weather')
  weather(@Query() query: Record<string, any>) {
    const params = this.pick(query, ['city', 'adcode', 'extended', 'forecast', 'hourly', 'minutely', 'indices', 'lang']);
    return this.service.get('/misc/weather', { lang: 'zh', ...params }, 600);
  }

  @Get('misc/holiday-calendar')
  holidayCalendar(@Query() query: Record<string, any>) {
    const params = this.pick(query, ['date', 'month', 'year']);
    return this.service.get('/misc/holiday-calendar', params, 3600);
  }

  @Get('saying')
  saying() {
    return this.service.get('/saying', {}, 3600);
  }

  private pick(query: Record<string, any>, keys: string[]) {
    return Object.fromEntries(keys.map((key) => [key, query?.[key]]).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  }
}
