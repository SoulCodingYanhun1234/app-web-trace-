<template>
  <IosPage>
    <IosPageHero eyebrow="System" title="系统管理" description="集中维护管理员、角色权限、模块编辑器、系统参数、操作日志和防伪查询日志。" />

    <el-tabs v-model="activeTab" class="system-tabs" @tab-change="handleTabChange">
      <el-tab-pane name="admins" label="管理员">
        <el-card shadow="never" class="table-card glass-card">
          <div class="toolbar">
            <div class="toolbar-left">
              <el-input v-model="adminQuery.keyword" placeholder="搜索用户名/姓名" clearable style="width:220px" @keyup.enter="loadAdmins" />
              <el-button type="primary" @click="loadAdmins">查询</el-button>
              <el-button @click="resetAdmins">重置</el-button>
            </div>
            <div class="toolbar-right"><el-button type="primary" @click="openAdmin()">新增管理员</el-button></div>
          </div>
          <div class="responsive-table-wrap">
            <el-table v-loading="loading" :data="admins" row-key="id" stripe>
            <el-table-column label="用户名" prop="username" min-width="130" />
            <el-table-column label="姓名" prop="real_name" min-width="120" />
            <el-table-column label="角色类型" prop="role" width="110"><template #default="{ row }">{{ roleText[row.role] || row.role }}</template></el-table-column>
            <el-table-column label="绑定角色" min-width="180"><template #default="{ row }"><el-tag v-for="role in row.roles || []" :key="role.id" class="mr-tag" type="info">{{ role.role_name }}</el-tag><span v-if="!row.roles?.length">-</span></template></el-table-column>
            <el-table-column label="有效权限" prop="permission_count" width="110" />
            <el-table-column label="状态" prop="status" width="100"><template #default="{ row }"><StatusTag module="common" :value="row.status" /></template></el-table-column>
            <el-table-column label="最后登录" prop="last_login_at" min-width="180" />
            <el-table-column label="操作" width="220" fixed="right" class-name="ios27-operation-column" label-class-name="ios27-operation-column-head">
              <template #default="{ row }">
                <el-button text type="primary" @click="openAdmin(row)">编辑</el-button>
                <el-button text type="primary" @click="openAdminPermissions(row)">权限</el-button>
                <el-button text :type="row.status === 1 ? 'danger' : 'success'" @click="toggleAdmin(row)">{{ row.status === 1 ? '禁用' : '启用' }}</el-button>
              </template>
            </el-table-column>
            </el-table>
          </div>
          <div class="pagination-bar">
            <el-pagination :current-page="adminPage.page" :page-size="adminPage.pageSize" :total="adminPage.total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @current-change="(p:number)=>{adminQuery.page=p;loadAdmins()}" @size-change="(s:number)=>{adminQuery.pageSize=s;adminQuery.page=1;loadAdmins()}" />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane name="roles" label="角色权限">
        <el-card shadow="never" class="table-card glass-card">
          <div class="toolbar">
            <div class="toolbar-left">
              <el-input v-model="roleQuery.keyword" placeholder="搜索角色名称/编码" clearable style="width:220px" @keyup.enter="loadRoles" />
              <el-button type="primary" @click="loadRoles">查询</el-button>
              <el-button @click="resetRoles">重置</el-button>
            </div>
            <div class="toolbar-right"><el-button type="primary" @click="openRole()">新增角色</el-button></div>
          </div>
          <div class="responsive-table-wrap">
            <el-table v-loading="rolesLoading" :data="roles" row-key="id" stripe>
            <el-table-column label="角色编码" prop="role_code" min-width="150" />
            <el-table-column label="角色名称" prop="role_name" min-width="150" />
            <el-table-column label="说明" prop="description" min-width="220" show-overflow-tooltip />
            <el-table-column label="权限数" width="100"><template #default="{ row }">{{ row.permission_codes?.length || 0 }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag module="common" :value="row.status" /></template></el-table-column>
            <el-table-column label="操作" width="150" fixed="right" class-name="ios27-operation-column" label-class-name="ios27-operation-column-head"><template #default="{ row }"><el-button text type="primary" @click="openRole(row)">编辑</el-button><el-button text type="danger" @click="removeRole(row)">删除</el-button></template></el-table-column>
            </el-table>
          </div>
          <div class="pagination-bar">
            <el-pagination :current-page="rolePage.page" :page-size="rolePage.pageSize" :total="rolePage.total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @current-change="(p:number)=>{roleQuery.page=p;loadRoles()}" @size-change="(s:number)=>{roleQuery.pageSize=s;roleQuery.page=1;loadRoles()}" />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane name="modules" label="模块编辑器">
        <el-card shadow="never" class="table-card glass-card">
          <div class="toolbar">
            <div class="toolbar-left">
              <el-button type="primary" :loading="modulesLoading" @click="saveModules">保存模块配置</el-button>
              <el-button :loading="modulesLoading" @click="syncPermissions">自动检测模块权限</el-button>
            </div>
            <div class="toolbar-right"><span class="muted">模块来自后端权限字典，新增模块后会自动带出对应权限。</span></div>
          </div>
          <div class="responsive-table-wrap">
            <el-table v-loading="modulesLoading" :data="modules" row-key="module_key" stripe>
            <el-table-column label="启用" width="80"><template #default="{ row }"><el-switch v-model="row.enabled" /></template></el-table-column>
            <el-table-column label="排序" width="95"><template #default="{ row }"><el-input-number v-model="row.sort" :min="1" :max="9999" controls-position="right" style="width:78px" /></template></el-table-column>
            <el-table-column label="模块标识" prop="module_key" min-width="130" />
            <el-table-column label="模块名称" min-width="150"><template #default="{ row }"><el-input v-model="row.module_name" /></template></el-table-column>
            <el-table-column label="路由" min-width="150"><template #default="{ row }"><el-input v-model="row.route" placeholder="/dashboard" /></template></el-table-column>
            <el-table-column label="图标" width="120"><template #default="{ row }"><el-input v-model="row.icon" /></template></el-table-column>
            <el-table-column label="权限" min-width="260">
              <template #default="{ row }">
                <el-tag v-for="item in row.permissions || []" :key="item.permission_code" class="permission-tag" size="small">{{ item.permission_name }}</el-tag>
                <span v-if="!row.permissions?.length" class="muted">暂无权限</span>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="220"><template #default="{ row }"><el-input v-model="row.description" /></template></el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane name="permissions" label="权限字典">
        <el-card shadow="never" class="table-card glass-card">
          <div class="permission-groups">
            <div v-for="group in permissionGroups" :key="group.module" class="permission-group">
              <div class="permission-group-title">{{ moduleText(group.module) }}</div>
              <el-tag v-for="item in group.items" :key="item.permission_code" class="permission-tag">{{ item.permission_name }}｜{{ item.permission_code }}</el-tag>
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane name="params" label="系统参数">
        <el-card shadow="never" class="table-card glass-card">
          <div class="toolbar">
            <div class="toolbar-left"><el-input v-model="paramGroup" placeholder="参数分组，如 basic / business_workflow" style="width:280px" /><el-button type="primary" @click="loadParams">加载</el-button></div>
          </div>
          <div class="responsive-table-wrap">
            <el-table :data="params" row-key="param_key" stripe>
            <el-table-column label="参数键" prop="param_key" min-width="180" />
            <el-table-column label="参数值" prop="param_value" min-width="260" show-overflow-tooltip />
            <el-table-column label="说明" prop="remark" min-width="220" />
            <el-table-column label="操作" width="100" class-name="ios27-operation-column" label-class-name="ios27-operation-column-head"><template #default="{ row }"><el-button text type="primary" @click="editParam(row)">编辑</el-button></template></el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane name="logs" label="操作日志">
        <el-card shadow="never" class="table-card glass-card">
          <div class="toolbar">
            <div class="toolbar-left">
              <el-input v-model="logQuery.module" placeholder="模块" clearable style="width:180px" />
              <el-input v-model="logQuery.admin_id" placeholder="操作人ID" clearable style="width:160px" />
              <el-button type="primary" @click="loadLogs">查询</el-button>
              <el-button @click="resetLogs">重置</el-button>
            </div>
          </div>
          <div class="responsive-table-wrap">
            <el-table :data="logs" row-key="id" stripe>
            <el-table-column label="模块" prop="module" width="150" />
            <el-table-column label="操作" prop="action" width="100" />
            <el-table-column label="操作人" prop="username" width="130" />
            <el-table-column label="路径" prop="path" min-width="240" show-overflow-tooltip />
            <el-table-column label="状态" prop="status" width="90" />
            <el-table-column label="时间" prop="created_at" width="180" />
            </el-table>
          </div>
          <div class="pagination-bar">
            <el-pagination :current-page="logPage.page" :page-size="logPage.pageSize" :total="logPage.total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @current-change="(p:number)=>{logQuery.page=p;loadLogs()}" @size-change="(s:number)=>{logQuery.pageSize=s;logQuery.page=1;loadLogs()}" />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane name="queryLogs" label="查询日志">
        <el-card shadow="never" class="table-card glass-card">
          <div class="toolbar">
            <div class="toolbar-left">
              <el-input v-model="queryLogQuery.code" placeholder="防伪码" clearable style="width:220px" />
              <el-select v-model="queryLogQuery.result" placeholder="查询结果" clearable style="width:150px"><el-option :value="1" label="正品" /><el-option :value="0" label="异常" /></el-select>
              <el-button type="primary" @click="loadQueryLogs">查询</el-button>
              <el-button @click="resetQueryLogs">重置</el-button>
            </div>
            <div class="toolbar-right"><el-button @click="exportApi.queryLogs(queryLogQuery)">导出查询日志</el-button></div>
          </div>
          <div class="responsive-table-wrap">
            <el-table :data="queryLogs" row-key="id" stripe>
            <el-table-column label="防伪码" prop="code" />
            <el-table-column label="结果" prop="result" width="100"><template #default="{ row }"><el-tag :type="row.result === 1 ? 'success' : 'danger'">{{ row.result === 1 ? '正品' : '异常' }}</el-tag></template></el-table-column>
            <el-table-column label="渠道" prop="channel" width="120" />
            <el-table-column label="位置" prop="location" />
            <el-table-column label="时间" prop="created_at" width="180" />
            </el-table>
          </div>
          <div class="pagination-bar">
            <el-pagination :current-page="queryLogPage.page" :page-size="queryLogPage.pageSize" :total="queryLogPage.total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @current-change="(p:number)=>{queryLogQuery.page=p;loadQueryLogs()}" @size-change="(s:number)=>{queryLogQuery.pageSize=s;queryLogQuery.page=1;loadQueryLogs()}" />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="adminVisible" class="system-admin-dialog" :title="adminForm.id ? '编辑管理员' : '新增管理员'" destroy-on-close width="820px" append-to-body align-center :lock-scroll="true">
      <el-form :model="adminForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="用户名" required><el-input v-model="adminForm.username" :disabled="Boolean(adminForm.id)" /></el-form-item>
          <el-form-item :label="adminForm.id ? '重置密码（不填则不修改）' : '密码'" :required="!adminForm.id"><el-input v-model="adminForm.password" type="password" show-password /></el-form-item>
          <el-form-item label="姓名" required><el-input v-model="adminForm.real_name" /></el-form-item>
          <el-form-item label="邮箱"><el-input v-model="adminForm.email" /></el-form-item>
          <el-form-item label="电话"><el-input v-model="adminForm.phone" /></el-form-item>
          <el-form-item label="角色类型"><el-select v-model="adminForm.role" style="width:100%"><el-option :value="1" label="超级管理员" /><el-option :value="2" label="普通管理员" /></el-select></el-form-item>
        </div>
        <el-alert v-if="adminForm.role !== 1" class="module-auth-alert" type="info" :closable="false" show-icon>
          新增管理员会自动读取「模块编辑器」里的模块与权限：先绑定角色，特殊账号再补充直接权限。
        </el-alert>
        <el-form-item v-if="adminForm.role !== 1" label="绑定角色">
          <el-select v-model="adminForm.role_ids" multiple filterable clearable style="width:100%" placeholder="选择角色">
            <el-option v-for="role in roles" :key="role.id" :value="role.id" :label="role.role_name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="adminForm.role !== 1" label="直接权限（用于给单个账号补充例外权限）">
          <el-checkbox-group v-model="adminForm.permissions" class="permission-checks">
            <div v-for="group in permissionModuleGroups" :key="group.module" class="check-group">
              <div class="check-group-head">
                <div class="check-group-title">{{ moduleText(group.module) }}</div>
                <el-button size="small" text type="primary" @click="toggleModulePermissions(group, adminForm.permissions)">{{ isModuleSelected(group, adminForm.permissions) ? '取消本模块' : '选择本模块' }}</el-button>
              </div>
              <el-checkbox v-for="item in group.items" :key="item.permission_code" :label="item.permission_code">{{ item.permission_name }}</el-checkbox>
            </div>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adminVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAdmin">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roleVisible" class="system-admin-dialog" :title="roleForm.id ? '编辑角色' : '新增角色'" destroy-on-close width="820px" append-to-body align-center :lock-scroll="true">
      <el-form :model="roleForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="角色编码"><el-input v-model="roleForm.role_code" placeholder="如 warehouse_manager" /></el-form-item>
          <el-form-item label="角色名称" required><el-input v-model="roleForm.role_name" placeholder="如 仓库管理员" /></el-form-item>
          <el-form-item label="状态"><el-select v-model="roleForm.status" style="width:100%"><el-option :value="1" label="启用" /><el-option :value="0" label="禁用" /></el-select></el-form-item>
        </div>
        <el-form-item label="说明"><el-input v-model="roleForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="角色权限">
          <el-checkbox-group v-model="roleForm.permission_codes" class="permission-checks">
            <div v-for="group in permissionModuleGroups" :key="group.module" class="check-group">
              <div class="check-group-head">
                <div class="check-group-title">{{ moduleText(group.module) }}</div>
                <el-button size="small" text type="primary" @click="toggleModulePermissions(group, roleForm.permission_codes)">{{ isModuleSelected(group, roleForm.permission_codes) ? '取消本模块' : '选择本模块' }}</el-button>
              </div>
              <el-checkbox v-for="item in group.items" :key="item.permission_code" :label="item.permission_code">{{ item.permission_name }}</el-checkbox>
            </div>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="paramVisible" title="编辑参数" destroy-on-close width="680px" append-to-body align-center :lock-scroll="true">
      <el-alert v-if="paramIsConfig" type="info" show-icon :closable="false" class="module-auth-alert" title="对象或列表参数已切换为可视化配置，无需手动编写代码。" />
      <JsonEditor v-if="paramIsConfig" v-model="paramValue" />
      <el-input v-else v-model="paramValue" type="textarea" :rows="5" />
      <template #footer>
        <el-button @click="paramVisible = false">取消</el-button>
        <el-button type="primary" @click="updateParam">确定</el-button>
      </template>
    </el-dialog>
  </IosPage>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage as Message, ElMessageBox } from 'element-plus';
import StatusTag from '@/components/StatusTag.vue';
import JsonEditor from '@/components/JsonEditor.vue';
import { IosPage, IosPageHero } from '@/components/ios27';
import { exportApi, systemApi } from '@/api/resources';
import { roleText } from '@/constants/status';
import { normalizePage } from '@/utils/format';

const activeTab = ref('admins');
const loading = ref(false);
const rolesLoading = ref(false);
const modulesLoading = ref(false);
const saving = ref(false);
const admins = ref<any[]>([]);
const roles = ref<any[]>([]);
const permissions = ref<any[]>([]);
const modules = ref<any[]>([]);
const params = ref<any[]>([]);
const logs = ref<any[]>([]);
const queryLogs = ref<any[]>([]);
const adminVisible = ref(false);
const roleVisible = ref(false);
const paramVisible = ref(false);
const paramGroup = ref('basic');
const paramKey = ref('');
const paramValue = ref<any>('');
const paramIsConfig = ref(false);
const adminForm = reactive<any>({});
const roleForm = reactive<any>({});
const adminQuery = reactive<any>({ page: 1, pageSize: 20, keyword: '' });
const roleQuery = reactive<any>({ page: 1, pageSize: 20, keyword: '' });
const logQuery = reactive<any>({ page: 1, pageSize: 20, module: '', admin_id: '' });
const queryLogQuery = reactive<any>({ page: 1, pageSize: 20, code: '', result: undefined });
const adminPage = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
const rolePage = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
const logPage = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
const queryLogPage = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

const permissionGroups = computed(() => {
  const map = new Map<string, any[]>();
  for (const item of permissions.value) {
    const module = item.module || 'other';
    map.set(module, [...(map.get(module) || []), item]);
  }
  return Array.from(map.entries()).map(([module, items]) => ({ module, items }));
});

const permissionModuleGroups = computed(() => {
  if (modules.value.length) {
    return modules.value
      .filter((item) => item.enabled !== false)
      .map((item) => ({ module: item.module_key, items: item.permissions || [] }))
      .filter((item) => item.items.length);
  }
  return permissionGroups.value;
});


function moduleText(module: string) {
  const config = modules.value.find((item) => item.module_key === module);
  if (config?.module_name) return config.module_name;
  const map: Record<string, string> = {
    dashboard: '仪表盘', query: '防伪查询', scanner: '扫码业务', product: '产品', code: '防伪码', trace: '溯源', box: '装箱', shipment: '发货', return: '退货', agent: '代理商', certificate: '证书', process: '流程', system: '系统', other: '其他',
  };
  return map[module] || module;
}

function resetObject(target: any, data: any) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, data);
}

async function loadAdmins(){ loading.value=true; try{ const page = normalizePage(await systemApi.admins({ ...adminQuery })); admins.value = page.list; Object.assign(adminPage, page.pagination); } finally{ loading.value=false; }}
async function loadRoles(){ rolesLoading.value=true; try{ const page = normalizePage(await systemApi.roles({ ...roleQuery })); roles.value = page.list; Object.assign(rolePage, page.pagination); } finally{ rolesLoading.value=false; }}
async function loadPermissions(){ const data = await systemApi.permissions(); permissions.value = Array.isArray(data) ? data : data?.list || []; }
async function loadModules(){ modulesLoading.value=true; try{ const data = await systemApi.modules(); modules.value = Array.isArray(data) ? data : data?.list || []; } finally{ modulesLoading.value=false; }}
async function loadParams(){ const data = await systemApi.params(paramGroup.value); params.value = Array.isArray(data) ? data : normalizePage(data).list; }
async function loadLogs(){ const page = normalizePage(await systemApi.logs({ ...logQuery })); logs.value = page.list; Object.assign(logPage, page.pagination); }
async function loadQueryLogs(){ const page = normalizePage(await systemApi.queryLogs({ ...queryLogQuery })); queryLogs.value = page.list; Object.assign(queryLogPage, page.pagination); }
function resetAdmins(){ Object.assign(adminQuery,{ page:1,pageSize:20,keyword:'' }); void loadAdmins(); }
function resetRoles(){ Object.assign(roleQuery,{ page:1,pageSize:20,keyword:'' }); void loadRoles(); }
function resetLogs(){ Object.assign(logQuery,{ page:1,pageSize:20,module:'',admin_id:'' }); void loadLogs(); }
function resetQueryLogs(){ Object.assign(queryLogQuery,{ page:1,pageSize:20,code:'',result:undefined }); void loadQueryLogs(); }

function isModuleSelected(group: any, target: string[] = []) {
  const codes = (group.items || []).map((item: any) => item.permission_code);
  return codes.length > 0 && codes.every((code: string) => target.includes(code));
}
function toggleModulePermissions(group: any, target: string[] = []) {
  const codes = (group.items || []).map((item: any) => item.permission_code);
  const current = new Set(target || []);
  const selected = codes.every((code: string) => current.has(code));
  for (const code of codes) selected ? current.delete(code) : current.add(code);
  target.splice(0, target.length, ...Array.from(current));
}
async function saveModules() {
  modulesLoading.value = true;
  try {
    const payload = modules.value.map(({ permissions: _permissions, ...item }) => item);
    const data = await systemApi.updateModules({ modules: payload });
    modules.value = Array.isArray(data) ? data : data?.list || modules.value;
    Message.success('模块配置已保存');
    await loadPermissions();
  } finally { modulesLoading.value = false; }
}
async function syncPermissions() {
  modulesLoading.value = true;
  try {
    const data = await systemApi.syncPermissions();
    modules.value = data?.modules || modules.value;
    permissions.value = data?.permissions || permissions.value;
    Message.success(`已检测 ${data?.module_total || modules.value.length} 个模块、${data?.permission_total || permissions.value.length} 个权限`);
  } finally { modulesLoading.value = false; }
}

async function openAdmin(record?: any){
  await Promise.all([loadPermissions(), loadRoles(), loadModules()]);
  if (record?.id) {
    const detail = await systemApi.adminDetail(record.id);
    resetObject(adminForm, { ...detail, password: '', role_ids: detail.role_ids || [], permissions: detail.direct_permissions || detail.permissions || [] });
  } else {
    resetObject(adminForm, { username: '', real_name: '', email: '', phone: '', role: 2, status: 1, password: 'Admin@123456', role_ids: [], permissions: [] });
  }
  adminVisible.value = true;
}

async function openAdminPermissions(record: any) { await openAdmin(record); }

function trimOptional(value: unknown) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function normalizeRoleIds(value: unknown) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,，;；\s]+/);
  return Array.from(new Set(raw.map((item: any) => Number(item)).filter((item: number) => Number.isInteger(item) && item > 0)));
}

function normalizePermissionCodes(value: unknown) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,，;；\s]+/);
  return Array.from(new Set(raw.map((item: any) => String(item || '').trim()).filter(Boolean)));
}

async function saveAdmin(){
  const isEdit = Boolean(adminForm.id);
  const username = trimOptional(adminForm.username);
  const realName = trimOptional(adminForm.real_name);
  const password = trimOptional(adminForm.password);
  if (!isEdit && !username) { Message.warning('请输入用户名'); return; }
  if (!realName) { Message.warning('请输入姓名'); return; }
  if (!isEdit && !password) { Message.warning('请输入密码'); return; }

  saving.value = true;
  try {
    const role = Number(adminForm.role || 2);
    const payload: Record<string, any> = {
      real_name: realName,
      email: trimOptional(adminForm.email),
      phone: trimOptional(adminForm.phone),
      role,
      status: Number(adminForm.status ?? 1),
      role_ids: role === 1 ? [] : normalizeRoleIds(adminForm.role_ids),
      permissions: role === 1 ? ['*'] : normalizePermissionCodes(adminForm.permissions),
    };
    if (!isEdit) payload.username = username;
    if (password) payload.password = password;
    if (isEdit) await systemApi.updateAdmin(adminForm.id, payload);
    else await systemApi.createAdmin(payload);
    Message.success('管理员已保存');
    adminVisible.value = false;
    await loadAdmins();
  } finally { saving.value = false; }
}

async function toggleAdmin(record:any){ await systemApi.updateAdminStatus(record.id, record.status === 1 ? 0 : 1); Message.success('状态已更新'); void loadAdmins(); }

async function openRole(record?: any){
  await Promise.all([loadPermissions(), loadModules()]);
  if (record?.id) resetObject(roleForm, { ...record, permission_codes: record.permission_codes || [] });
  else resetObject(roleForm, { status: 1, role_code: '', role_name: '', description: '', permission_codes: [] });
  roleVisible.value = true;
}

async function saveRole(){
  const roleName = trimOptional(roleForm.role_name);
  if (!roleName) { Message.warning('请输入角色名称'); return; }
  saving.value = true;
  try {
    const payload: Record<string, any> = {
      role_code: trimOptional(roleForm.role_code),
      role_name: roleName,
      description: trimOptional(roleForm.description),
      status: Number(roleForm.status ?? 1),
      permission_codes: normalizePermissionCodes(roleForm.permission_codes),
    };
    if (roleForm.id) await systemApi.updateRole(roleForm.id, payload);
    else await systemApi.createRole(payload);
    Message.success('角色已保存');
    roleVisible.value = false;
    await Promise.all([loadRoles(), loadAdmins()]);
  } finally { saving.value = false; }
}

async function removeRole(record: any) {
  await ElMessageBox.confirm(`确认删除角色「${record.role_name}」？已绑定管理员的角色后端会阻止删除。`, '删除角色', { type: 'warning' });
  await systemApi.removeRole(record.id);
  Message.success('角色已删除');
  await loadRoles();
}

function editParam(record:any){
  paramKey.value = record.param_key || record.key;
  const raw = record.param_value ?? record.value ?? '';
  let value: any = raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') value = parsed;
    } catch { value = raw; }
  }
  paramIsConfig.value = Boolean(value && typeof value === 'object');
  paramValue.value = value;
  paramVisible.value = true;
}
async function updateParam(){ await systemApi.updateParam(paramKey.value, paramValue.value, paramGroup.value); Message.success('参数已更新'); paramVisible.value=false; void loadParams(); }
function handleTabChange(key: string | number) { if (key === 'admins') void loadAdmins(); if (key === 'roles') void loadRoles(); if (key === 'modules') void loadModules(); if (key === 'permissions') void loadPermissions(); if (key === 'params') void loadParams(); if (key === 'logs') void loadLogs(); if (key === 'queryLogs') void loadQueryLogs(); }
onMounted(() => { void Promise.all([loadPermissions(), loadModules(), loadRoles(), loadAdmins(), loadParams()]); });
</script>

<style scoped>
.mr-tag { margin: 2px 4px 2px 0; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.permission-groups, .permission-checks { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.permission-group, .check-group { padding: 12px; border: 1px solid rgba(207, 224, 255, .9); border-radius: 14px; background: rgba(248, 251, 255, .72); }
.permission-group-title, .check-group-title { font-weight: 850; color: var(--text-1); margin-bottom: 10px; }
.check-group-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.check-group-head .check-group-title { margin-bottom: 0; }
.module-auth-alert { margin: 4px 0 14px; }
.permission-tag { margin: 4px 6px 4px 0; }
.check-group :deep(.el-checkbox) { margin-right: 18px; margin-bottom: 8px; }
@media (max-width: 760px) { .form-grid { grid-template-columns: 1fr; } }
</style>

<style scoped>
:global(html[data-theme="dark"]) .permission-group,
:global(html[data-theme="dark"]) .check-group,
:global(html[data-theme="dark"]) .qr-export-tip {
  background: linear-gradient(180deg, rgba(17, 30, 49, .96), rgba(11, 23, 40, .92)) !important;
  border-color: rgba(148, 163, 184, .26) !important;
  color: var(--text-2) !important;
}

:global(html[data-theme="dark"]) .permission-group-title,
:global(html[data-theme="dark"]) .check-group-title {
  color: var(--text-1) !important;
}

:global(html[data-theme="dark"]) .permission-checks :deep(.el-checkbox__label),
:global(html[data-theme="dark"]) .check-group :deep(.el-checkbox__label) {
  color: var(--text-2) !important;
}

:global(html[data-theme="dark"]) .permission-checks :deep(.el-checkbox__input.is-checked + .el-checkbox__label),
:global(html[data-theme="dark"]) .check-group :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: var(--primary-deep) !important;
}
</style>
