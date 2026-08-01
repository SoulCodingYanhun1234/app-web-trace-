import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { CreateAdminDto, UpdateAdminDto, UpdateAdminPermissionsDto, UpdateAdminStatusDto, UpsertRoleDto, UpdateModulesDto } from './dto.js';
import { SystemService } from './system.service.js';

@ApiBearerAuth()
@ApiTags('系统管理')
@Controller('system')
export class SystemController {
  constructor(private readonly service: SystemService) {}

  @Get('params')
  params(@Query('group') group?: string) { return this.service.params(group || 'basic_system'); }

  @Get('module-relations')
  moduleRelations() { return this.service.moduleRelations(); }

  @Put('params/:key')
  @RequirePermissions('system:setting')
  updateParam(
    @Param('key') key: string,
    @Body('param_value') value: any,
    @Query('group') group: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateParam(group || 'basic_system', key, value, user.id);
  }

  @Get('modules')
  @RequirePermissions('admin:manage')
  @ApiOperation({ summary: '模块编辑器：读取企业后台模块与模块权限树' })
  modules() { return this.service.modules(); }

  @Put('modules')
  @RequirePermissions('admin:manage')
  @ApiOperation({ summary: '模块编辑器：保存模块名称、图标、路由、排序和启停' })
  updateModules(@Body() dto: UpdateModulesDto, @CurrentUser() user: AuthUser) { return this.service.updateModules(dto, user?.id); }

  @Post('permissions/sync')
  @RequirePermissions('admin:manage')
  @ApiOperation({ summary: '自动检测并同步当前系统模块权限' })
  syncPermissions() { return this.service.syncDetectedPermissions(); }

  @Get('permissions')
  @RequirePermissions('admin:manage')
  permissions() { return this.service.permissions(); }

  @Get('roles')
  @RequirePermissions('admin:manage')
  roles(@Query() query: Record<string, any>) { return this.service.roles(query); }

  @Post('roles')
  @RequirePermissions('admin:manage')
  createRole(@Body() dto: UpsertRoleDto) { return this.service.createRole(dto); }

  @Put('roles/:id')
  @RequirePermissions('admin:manage')
  updateRole(@Param('id') id: string, @Body() dto: UpsertRoleDto) { return this.service.updateRole(id, dto); }

  @Delete('roles/:id')
  @RequirePermissions('admin:manage')
  removeRole(@Param('id') id: string) { return this.service.removeRole(id); }

  @Get('admins')
  @RequirePermissions('admin:manage')
  admins(@Query() query: Record<string, any>) { return this.service.admins(query); }

  @Post('admins')
  @RequirePermissions('admin:manage')
  createAdmin(@Body() dto: CreateAdminDto) { return this.service.createAdmin({ ...dto }); }

  @Get('admins/:id')
  @RequirePermissions('admin:manage')
  adminDetail(@Param('id') id: string) { return this.service.adminDetail(id); }

  @Put('admins/:id')
  @RequirePermissions('admin:manage')
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) { return this.service.updateAdmin(id, dto); }

  @Put('admins/:id/status')
  @RequirePermissions('admin:manage')
  updateAdminStatus(@Param('id') id: string, @Body() dto: UpdateAdminStatusDto) {
    return this.service.updateAdminStatus(id, dto.status);
  }

  @Put('admins/:id/permissions')
  @RequirePermissions('admin:manage')
  updateAdminPermissions(@Param('id') id: string, @Body() dto: UpdateAdminPermissionsDto) {
    return this.service.updateAdminPermissions(id, dto);
  }

  @Get('logs')
  @RequirePermissions('log:view')
  logs(@Query() query: Record<string, any>) { return this.service.auditLogs(query); }

  @Get('query-logs')
  @RequirePermissions('log:view')
  queryLogs(@Query() query: Record<string, any>) { return this.service.queryLogs(query); }
}
