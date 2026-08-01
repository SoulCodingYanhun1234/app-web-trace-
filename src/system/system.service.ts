import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { pageParams, safeId, safeText } from '../common/utils.js';
import { SettingsService } from '../settings/settings.service.js';
import { PasswordService } from '../auth/password.service.js';
import { normalizePermissionCodes, permissionCatalog } from './permission-catalog.js';
import { buildEnterpriseModules, type EnterpriseModuleConfig } from './module-catalog.js';
import { moduleRelations } from './module-relations.js';
import { assertSettingGroup } from '../settings/settings.schema.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

function uniqueNumbers(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,，;；]+/);
  return Array.from(new Set(raw.map((item: any) => Number(item)).filter((item: any) => Number.isInteger(item) && item > 0)));
}

function roleCodeFromName(name: string) {
  const base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '');
  return base || `role_${Date.now()}`;
}

@Injectable()
export class SystemService {
  private readonly codeVault = new AntiCounterfeitCodeVault();
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly passwords: PasswordService,
  ) {}

  async params(group = 'basic_system') {
    const normalized = group === 'basic' ? 'basic_system' : group;
    try { assertSettingGroup(normalized); } catch (error: any) { throw new NotFoundException(error.message); }
    const rows = await this.prisma.systemSetting.findMany({
      where: { group_key: normalized },
      select: { setting_key: true, setting_value: true, remark: true },
      orderBy: { setting_key: 'asc' },
    });
    return rows.map((row: any) => {
      let value = row.setting_value;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { /* keep raw string */ }
      }
      return { param_key: row.setting_key, param_value: value, remark: row.remark || '' };
    });
  }

  moduleRelations() {
    return { list: moduleRelations };
  }

  updateParam(group: string, key: string, value: any, adminId?: number) {
    const normalized = group === 'basic' ? 'basic_system' : (group || 'basic_system');
    return this.settings.updateSetting(normalized, key, value, adminId);
  }

  private parsePermissions(value: unknown) {
    return normalizePermissionCodes(value).filter((item: any) => item === '*' || /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(item));
  }

  private async ensureCatalogPermissions() {
    await Promise.all(permissionCatalog.map((item: any) => this.prisma.permission.upsert({
      where: { permission_code: item.permission_code },
      create: item,
      update: { permission_name: item.permission_name, module: item.module, description: item.description ?? null },
    })));
  }

  private async syncRolePermissions(roleId: number, permissionCodes: unknown) {
    const codes = this.parsePermissions(permissionCodes).filter((item: any) => item !== '*');
    await this.ensureCatalogPermissions();
    const permissions = codes.length
      ? await this.prisma.permission.findMany({ where: { permission_code: { in: codes } }, select: { id: true, permission_code: true } })
      : [];
    const foundCodes = new Set(permissions.map((item: any) => item.permission_code));
    const missing = codes.filter((item: any) => !foundCodes.has(item));
    if (missing.length) throw new BadRequestException(`权限码不存在：${missing.join('、')}`);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role_id: roleId } }),
      ...permissions.map((item: any) => this.prisma.rolePermission.create({ data: { role_id: roleId, permission_id: item.id } })),
    ]);
  }

  private async syncUserRoles(adminId: number, roleIds: unknown) {
    const ids = uniqueNumbers(roleIds);
    if (!ids.length) {
      await this.prisma.userRole.deleteMany({ where: { user_id: adminId } });
      return [];
    }
    const roles = await this.prisma.role.findMany({ where: { id: { in: ids }, status: 1 }, select: { id: true } });
    const validIds = roles.map((item: any) => item.id);
    const missing = ids.filter((item: any) => !validIds.includes(item));
    if (missing.length) throw new BadRequestException(`角色不存在或已禁用：${missing.join('、')}`);
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { user_id: adminId } }),
      ...validIds.map((roleId: any) => this.prisma.userRole.create({ data: { user_id: adminId, role_id: roleId } })),
    ]);
    return validIds;
  }

  private async getRolePermissionCodes(roleIds: number[]) {
    if (!roleIds.length) return [];
    const rolePermissions = await this.prisma.rolePermission.findMany({ where: { role_id: { in: roleIds } }, select: { permission_id: true } });
    const permissionIds = Array.from(new Set(rolePermissions.map((item: any) => item.permission_id)));
    if (!permissionIds.length) return [];
    const permissions = await this.prisma.permission.findMany({ where: { id: { in: permissionIds } }, select: { permission_code: true } });
    return permissions.map((item: any) => item.permission_code);
  }

  private async getAdminRoleInfo(userIds: number[]) {
    if (!userIds.length) return { byUser: new Map<number, any[]>(), rolesById: new Map<number, any>() };
    const userRoles = await this.prisma.userRole.findMany({ where: { user_id: { in: userIds } } });
    const roleIds = Array.from(new Set(userRoles.map((item: any) => item.role_id)));
    const roles = roleIds.length ? await this.prisma.role.findMany({ where: { id: { in: roleIds } } }) : [];
    const rolesById = new Map(roles.map((role: any) => [role.id, role]));
    const byUser = new Map<number, any[]>();
    for (const item of userRoles) {
      const role = rolesById.get(item.role_id);
      if (!role) continue;
      const next = byUser.get(item.user_id) || [];
      next.push(role);
      byUser.set(item.user_id, next);
    }
    return { byUser, rolesById };
  }

  async effectivePermissions(admin: any) {
    if (!admin) return [];
    const direct = this.parsePermissions(admin.permissions || []);
    if (Number(admin.role) === 1 || direct.includes('*')) return ['*'];
    const userRoles = await this.prisma.userRole.findMany({ where: { user_id: Number(admin.id) }, select: { role_id: true } });
    const roleCodes = await this.getRolePermissionCodes(userRoles.map((item: any) => item.role_id));
    return Array.from(new Set([...direct, ...roleCodes]));
  }


  private async storedModuleCatalog() {
    const row = await this.prisma.systemSetting.findUnique({
      where: { group_key_setting_key: { group_key: 'account_role_permission', setting_key: 'module_catalog' } },
      select: { setting_value: true },
    }).catch(() => null);
    return row?.setting_value;
  }

  async modules() {
    await this.ensureCatalogPermissions();
    return { list: buildEnterpriseModules(await this.storedModuleCatalog()) };
  }

  async updateModules(data: Record<string, any>, adminId?: number) {
    const modules = Array.isArray(data?.modules) ? data.modules : [];
    const normalized = buildEnterpriseModules(modules).map((item: EnterpriseModuleConfig) => ({
      module_key: item.module_key,
      module_name: safeText(item.module_name, 80) || item.module_key,
      route: safeText(item.route, 120) || null,
      icon: safeText(item.icon, 64) || null,
      description: safeText(item.description, 255) || null,
      enabled: Boolean(item.enabled),
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : 999,
      category: safeText(item.category, 64) || 'custom',
    }));
    await this.prisma.systemSetting.upsert({
      where: { group_key_setting_key: { group_key: 'account_role_permission', setting_key: 'module_catalog' } },
      create: {
        group_key: 'account_role_permission',
        setting_key: 'module_catalog',
        setting_value: normalized,
        value_type: 'array',
        remark: '模块编辑器：控制企业后台模块名称、图标、排序、启停和路由说明',
        updated_by: adminId || null,
      },
      update: {
        setting_value: normalized,
        value_type: 'array',
        updated_by: adminId || null,
      },
    });
    return this.modules();
  }

  async syncDetectedPermissions() {
    await this.ensureCatalogPermissions();
    const permissions = await this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { permission_code: 'asc' }] });
    const modules = buildEnterpriseModules(await this.storedModuleCatalog());
    return { permissions, modules, permission_total: permissions.length, module_total: modules.length };
  }

  async permissions() {
    await this.ensureCatalogPermissions();
    const permissions = await this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { permission_code: 'asc' }] });
    const groups: Record<string, any[]> = {};
    for (const item of permissions) {
      const module = item.module || 'other';
      if (!groups[module]) groups[module] = [];
      groups[module].push(item);
    }
    return { list: permissions, groups };
  }

  async roles(query: Record<string, any> = {}) {
    const { page, pageSize, skip } = pageParams(query);
    const where = query.keyword
      ? { OR: [{ role_code: { contains: String(query.keyword) } }, { role_name: { contains: String(query.keyword) } }] }
      : {};
    const [total, list] = await Promise.all([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({ where, orderBy: { id: 'asc' }, skip, take: pageSize }),
    ]);
    const roleIds = list.map((item: any) => item.id);
    const rolePermissions = roleIds.length ? await this.prisma.rolePermission.findMany({ where: { role_id: { in: roleIds } } }) : [];
    const permissionIds = Array.from(new Set(rolePermissions.map((item: any) => item.permission_id)));
    const permissions = permissionIds.length ? await this.prisma.permission.findMany({ where: { id: { in: permissionIds } } }) : [];
    const permissionById = new Map(permissions.map((item: any) => [item.id, item]));
    const enriched = list.map((role: any) => {
      const ps = rolePermissions.filter((item: any) => item.role_id === role.id).map((item: any) => permissionById.get(item.permission_id)).filter(Boolean);
      return { ...role, permission_codes: ps.map((item: any) => item.permission_code), permissions: ps };
    });
    return { list: enriched, pagination: { page, pageSize, total } };
  }

  async createRole(data: Record<string, any>) {
    const role_name = safeText(data.role_name, 80);
    if (!role_name) throw new BadRequestException('角色名称不能为空');
    const role_code = safeText(data.role_code || roleCodeFromName(role_name), 64);
    if (!role_code) throw new BadRequestException('角色编码不能为空');
    const role = await this.prisma.role.create({
      data: {
        role_code,
        role_name,
        description: safeText(data.description, 255) || null,
        status: data.status === undefined ? 1 : Number(data.status),
      },
    });
    await this.syncRolePermissions(role.id, data.permission_codes || []);
    return this.roleDetail(role.id);
  }

  async updateRole(id: string | number, data: Record<string, any>) {
    const roleId = safeId(id);
    const existing = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) throw new NotFoundException('角色不存在');
    const updateData: Record<string, any> = {};
    if (data.role_code !== undefined) updateData.role_code = safeText(data.role_code, 64);
    if (data.role_name !== undefined) updateData.role_name = safeText(data.role_name, 80);
    if (data.description !== undefined) updateData.description = safeText(data.description, 255) || null;
    if (data.status !== undefined) updateData.status = Number(data.status);
    await this.prisma.role.update({ where: { id: roleId }, data: updateData });
    if (data.permission_codes !== undefined) await this.syncRolePermissions(roleId, data.permission_codes);
    return this.roleDetail(roleId);
  }

  async roleDetail(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    const rolePermissions = await this.prisma.rolePermission.findMany({ where: { role_id: id }, select: { permission_id: true } });
    const permissionIds = rolePermissions.map((item: any) => item.permission_id);
    const permissions = permissionIds.length ? await this.prisma.permission.findMany({ where: { id: { in: permissionIds } } }) : [];
    return { ...role, permission_codes: permissions.map((item: any) => item.permission_code), permissions };
  }

  async removeRole(id: string | number) {
    const roleId = safeId(id);
    const userCount = await this.prisma.userRole.count({ where: { role_id: roleId } });
    if (userCount) throw new BadRequestException('该角色仍绑定管理员，不能删除');
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role_id: roleId } }),
      this.prisma.role.delete({ where: { id: roleId } }),
    ]);
    return null;
  }

  async admins(query: Record<string, any>) {
    const { page, pageSize, skip } = pageParams(query);
    const where = query.keyword
      ? { OR: [{ username: { contains: String(query.keyword) } }, { real_name: { contains: String(query.keyword) } }] }
      : {};
    const [total, list] = await Promise.all([
      this.prisma.admin.count({ where }),
      this.prisma.admin.findMany({
        where,
        select: { id: true, username: true, real_name: true, email: true, phone: true, role: true, status: true, avatar: true, last_login_at: true, created_at: true, permissions: true },
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    const roleInfo = await this.getAdminRoleInfo(list.map((item: any) => item.id));
    const enriched = await Promise.all(list.map(async (item: any) => {
      const roles = roleInfo.byUser.get(item.id) || [];
      const effective_permissions = Number(item.role) === 1 ? ['*'] : await this.effectivePermissions(item);
      return {
        ...item,
        direct_permissions: this.parsePermissions(item.permissions || []),
        role_ids: roles.map((role: any) => role.id),
        roles,
        effective_permissions,
        permission_count: effective_permissions.includes('*') ? '全部' : effective_permissions.length,
      };
    }));
    return { list: enriched, pagination: { page, pageSize, total } };
  }

  async adminDetail(id: string | number) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: safeId(id) },
      select: { id: true, username: true, real_name: true, email: true, phone: true, role: true, status: true, avatar: true, last_login_at: true, created_at: true, permissions: true },
    });
    if (!admin) throw new NotFoundException('管理员不存在');
    const roleInfo = await this.getAdminRoleInfo([admin.id]);
    const roles = roleInfo.byUser.get(admin.id) || [];
    const effective_permissions = await this.effectivePermissions(admin);
    return {
      ...admin,
      direct_permissions: this.parsePermissions(admin.permissions || []),
      role_ids: roles.map((role: any) => role.id),
      roles,
      effective_permissions,
    };
  }

  async createAdmin(data: Record<string, any>) {
    const username = safeText(data.username, 64);
    const real_name = safeText(data.real_name, 64);
    if (!username) throw new BadRequestException('用户名不能为空');
    if (!real_name) throw new BadRequestException('姓名不能为空');
    if (!safeText(data.password, 128)) throw new BadRequestException('密码不能为空');
    const exists = await this.prisma.admin.findUnique({ where: { username } });
    if (exists) throw new BadRequestException('用户名已存在');
    const role = Number(data.role || 2);
    const directPermissions = role === 1 ? ['*'] : this.parsePermissions(data.permissions || []);
    const admin = await this.prisma.admin.create({
      data: {
        username,
        real_name,
        email: safeText(data.email, 128) || null,
        phone: safeText(data.phone, 32) || null,
        role,
        status: Number(data.status ?? 1),
        password_hash: await this.passwords.hash(String(data.password)),
        permissions: directPermissions,
      },
      select: { id: true },
    });
    if (role !== 1) await this.syncUserRoles(admin.id, data.role_ids || []);
    return this.adminDetail(admin.id);
  }

  async updateAdmin(id: string | number, data: Record<string, any>) {
    const adminId = safeId(id);
    const existing = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!existing) throw new NotFoundException('管理员不存在');
    const updateData: Record<string, any> = {};
    if (data.real_name !== undefined) updateData.real_name = safeText(data.real_name, 64) || existing.real_name;
    if (data.email !== undefined) updateData.email = safeText(data.email, 128) || null;
    if (data.phone !== undefined) updateData.phone = safeText(data.phone, 32) || null;
    if (data.role !== undefined) updateData.role = Number(data.role);
    if (data.status !== undefined) updateData.status = Number(data.status);
    if (data.password) updateData.password_hash = await this.passwords.hash(String(data.password));
    if (data.permissions !== undefined) updateData.permissions = Number(updateData.role ?? existing.role) === 1 ? ['*'] : this.parsePermissions(data.permissions);
    await this.prisma.admin.update({ where: { id: adminId }, data: updateData });
    const nextRole = Number(updateData.role ?? existing.role);
    if (nextRole === 1) await this.prisma.userRole.deleteMany({ where: { user_id: adminId } });
    else if (data.role_ids !== undefined) await this.syncUserRoles(adminId, data.role_ids);
    return this.adminDetail(adminId);
  }

  async updateAdminStatus(id: string | number, status: number) {
    await this.prisma.admin.update({ where: { id: safeId(id) }, data: { status: Number(status) } });
    return null;
  }

  async updateAdminPermissions(id: string | number, data: Record<string, any>) {
    const adminId = safeId(id);
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('管理员不存在');
    if (Number(admin.role) === 1) return this.adminDetail(adminId);
    if (data.permissions !== undefined) {
      await this.prisma.admin.update({ where: { id: adminId }, data: { permissions: this.parsePermissions(data.permissions) } });
    }
    if (data.role_ids !== undefined) await this.syncUserRoles(adminId, data.role_ids);
    return this.adminDetail(adminId);
  }

  async auditLogs(query: Record<string, any>) {
    const { page, pageSize, skip } = pageParams(query);
    const where: Record<string, any> = {};
    if (query.module) where.module = query.module;
    if (query.admin_id) where.admin_id = Number(query.admin_id);
    const [total, list] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip, take: pageSize }),
    ]);
    return { list, pagination: { page, pageSize, total } };
  }

  async queryLogs(query: Record<string, any>) {
    const { page, pageSize, skip } = pageParams(query);
    const where: Record<string, any> = {};
    if (query.code) where.OR = [{ code: this.codeVault.reference(String(query.code)) }, { code: { contains: String(query.code) } }];
    if (query.result !== undefined && query.result !== '') where.result = Number(query.result);
    const [total, list] = await Promise.all([
      this.prisma.queryLog.count({ where }),
      this.prisma.queryLog.findMany({ where, orderBy: { id: 'desc' }, skip, take: pageSize }),
    ]);
    const hashes = list.map((item: any) => this.codeVault.hashFromReference(item.code)).filter(Boolean) as string[];
    const storedCodes = hashes.length ? await this.prisma.antiFakeCode.findMany({
      where: { code_hash: { in: hashes } },
      select: { code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true },
    }) : [];
    const codeMap = new Map<string, string>();
    for (const stored of storedCodes) {
      const hydrated = this.codeVault.hydrate(stored as any);
      codeMap.set(this.codeVault.reference(hydrated.code), hydrated.code);
    }
    const hydratedList = list.map((item: any) => ({ ...item, code: codeMap.get(String(item.code || '')) || item.code }));
    return { list: hydratedList, pagination: { page, pageSize, total } };
  }
}
