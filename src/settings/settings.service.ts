import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertSettingGroup, settingGroups } from './settings.schema.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  listGroups() {
    return settingGroups;
  }

  async getGroupSettings(group: string) {
    try { assertSettingGroup(group); } catch (error: any) { throw new NotFoundException(error.message); }
    const rows = await this.prisma.systemSetting.findMany({
      where: { group_key: group },
      select: { setting_key: true, setting_value: true },
    });
    const result: Record<string, any> = {};
    for (const row of rows) {
      if (typeof row.setting_value === 'string') {
        try { result[row.setting_key] = JSON.parse(row.setting_value); }
        catch { result[row.setting_key] = row.setting_value; }
      } else result[row.setting_key] = row.setting_value;
    }
    return result;
  }

  async getPublicQueryPanelSettings() {
    const safeGroup = async (group: string) => {
      try { return await this.getGroupSettings(group); }
      catch { return {}; }
    };
    const [panel, basic, brand] = await Promise.all([
      safeGroup('query_panel_appearance'),
      safeGroup('basic_system'),
      safeGroup('enterprise_brand'),
    ]);

    return {
      ...panel,
      brand_name: panel.brand_name || brand.company_name || basic.site_name || basic.admin_title || '',
      company_name: brand.company_name || '',
      page_logo: panel.page_logo || basic.login_logo || '',
      favicon: basic.favicon || '',
      footer_text: panel.footer_text || basic.footer_text || '本页面由企业官方防伪溯源系统提供技术支持',
    };
  }

  async updateSetting(group: string, key: string, value: any, adminId?: number) {
    try { assertSettingGroup(group); } catch (error: any) { throw new NotFoundException(error.message); }
    await this.prisma.systemSetting.upsert({
      where: { group_key_setting_key: { group_key: group, setting_key: key } },
      create: {
        group_key: group,
        setting_key: key,
        setting_value: value ?? null,
        value_type: Array.isArray(value) ? 'array' : typeof value,
        updated_by: adminId || null,
      },
      update: {
        setting_value: value ?? null,
        value_type: Array.isArray(value) ? 'array' : typeof value,
        updated_by: adminId || null,
      },
    });
    return { key, value };
  }

  async updateGroupSettings(group: string, settings: Record<string, any>, adminId?: number) {
    try { assertSettingGroup(group); } catch (error: any) { throw new NotFoundException(error.message); }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new BadRequestException('settings 必须为对象');
    await this.prisma.$transaction(Object.entries(settings).map(([key, value]) => this.prisma.systemSetting.upsert({
      where: { group_key_setting_key: { group_key: group, setting_key: key } },
      create: {
        group_key: group,
        setting_key: key,
        setting_value: value ?? null,
        value_type: Array.isArray(value) ? 'array' : typeof value,
        updated_by: adminId || null,
      },
      update: {
        setting_value: value ?? null,
        value_type: Array.isArray(value) ? 'array' : typeof value,
        updated_by: adminId || null,
      },
    })));
    return this.getGroupSettings(group);
  }
}
