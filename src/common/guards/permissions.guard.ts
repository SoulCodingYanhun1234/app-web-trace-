import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../types/auth-user.js';

function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item: any) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item: any) => String(item).trim()).filter(Boolean);
    } catch {
      return value.split(/[\s,，;；]+/).map((item: any) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  private async freshPermissions(user: AuthUser) {
    const admin = await this.prisma.admin.findUnique({ where: { id: Number(user.id) } });
    if (!admin || Number(admin.status) !== 1) throw new ForbiddenException('账号不存在或已禁用');
    const direct = parsePermissions(admin.permissions);
    if (Number(admin.role) === 1 || direct.includes('*')) return ['*'];
    const userRoles = await this.prisma.userRole.findMany({ where: { user_id: admin.id }, select: { role_id: true } });
    const roleIds = userRoles.map((item: any) => item.role_id);
    if (!roleIds.length) return Array.from(new Set([...direct, ...(user.permissions || [])]));
    const activeRoles = await this.prisma.role.findMany({ where: { id: { in: roleIds }, status: 1 }, select: { id: true } });
    const activeRoleIds = activeRoles.map((item: any) => item.id);
    const rolePermissions = activeRoleIds.length
      ? await this.prisma.rolePermission.findMany({ where: { role_id: { in: activeRoleIds } }, select: { permission_id: true } })
      : [];
    const permissionIds = Array.from(new Set(rolePermissions.map((item: any) => item.permission_id)));
    const permissions = permissionIds.length
      ? await this.prisma.permission.findMany({ where: { id: { in: permissionIds } }, select: { permission_code: true } })
      : [];
    return Array.from(new Set([...direct, ...permissions.map((item: any) => item.permission_code), ...(user.permissions || [])]));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissions?.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('未登录');

    const userPermissions = await this.freshPermissions(user);
    req.user.permissions = userPermissions;
    if (userPermissions.includes('*')) return true;
    const allowed = permissions.every((item: any) => userPermissions.includes(item));
    if (!allowed) throw new ForbiddenException('没有操作权限');
    return true;
  }
}
