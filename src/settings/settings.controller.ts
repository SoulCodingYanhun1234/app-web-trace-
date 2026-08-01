import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { SettingsService } from './settings.service.js';

@ApiTags('系统设置')
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // Public endpoint - no permission required, only returns basic branding info
  @Public()
  @Get('branding')
  async branding() {
    try {
      const s = await this.service.getGroupSettings('basic_system');
      return {
        home_cover: s.home_cover || '',
        login_logo: s.login_logo || '',
        favicon: s.favicon || '',
        system_name: s.system_name || '',
        admin_title: s.admin_title || '',
        site_name: s.site_name || '',
      };
    } catch {
      return {
        home_cover: '',
        login_logo: '',
        favicon: '',
        system_name: '',
        admin_title: '',
        site_name: '',
      };
    }
  }


  @Public()
  @Get('public/query-panel')
  async publicQueryPanel() {
    return this.service.getPublicQueryPanelSettings();
  }

  @ApiBearerAuth()
  @RequirePermissions('system:setting')
  @Get('groups')
  groups() { return this.service.listGroups(); }

  @Get(':group')
  detail(@Param('group') group: string) { return this.service.getGroupSettings(group); }

  @Put(':group/batch')
  saveGroup(@Param('group') group: string, @Body('settings') settings: Record<string, any>, @CurrentUser() user: AuthUser) {
    return this.service.updateGroupSettings(group, settings, user.id);
  }

  @Put(':group/:key')
  updateOne(@Param('group') group: string, @Param('key') key: string, @Body('value') value: any, @CurrentUser() user: AuthUser) {
    return this.service.updateSetting(group, key, value, user.id);
  }
}
