<template>
  <IosPage class="product-region-page">
    <IosPageHero class="product-region-hero" eyebrow="Product Region Routing" title="产品地区管理" description="把“产品管理”的产品档案与省份、城市、仓库、代理商关联起来。扫码枪扫到 A 产品且地区码为 GD/SZ 时，会自动归入广东分类部分，并同步到产品地区表。">
      <template #actions>
        <el-button @click="router.push('/products')">
          <template #icon><AppIcon name="box" /></template>
          产品管理
        </el-button>
        <el-button v-if="canExport" @click="downloadTemplate">
          <template #icon><AppIcon name="copy" /></template>
          下载模板
        </el-button>
        <el-button v-if="canManageProductRegion" @click="triggerImport">
          <template #icon><AppIcon name="plus" /></template>
          导入 Excel/CSV
        </el-button>
        <el-button v-if="canExport" @click="exportCurrent">
          <template #icon><AppIcon name="print" /></template>
          导出当前表
        </el-button>
        <el-button v-if="canManageProductRegion" type="primary" @click="openCreate">
          <template #icon><AppIcon name="plus" /></template>
          新增地区产品
        </el-button>
        <input ref="fileRef" type="file" accept=".xlsx,.csv,.txt,.tsv" class="hidden-file" @change="handleFileChange" />
      </template>
    </IosPageHero>

    <el-alert class="region-alert" type="success" :closable="false" show-icon>
      业务链路：<strong>产品管理建档</strong> → <strong>产品地区管理分配省市/仓库/代理商</strong> → <strong>扫码枪扫防伪码自动归类</strong>。示例码 <strong>FW-GD-SZ-A001-B202605-000001</strong> 会识别为 A产品 / 广东省 / 深圳市。
    </el-alert>

    <div class="relation-flow">
      <el-card class="relation-card glass-card" shadow="never" @click="router.push('/products')">
        <div class="relation-icon"><AppIcon name="box" /></div>
        <div>
          <strong>① 产品管理</strong>
          <span>维护 A001、B001 等产品档案</span>
        </div>
      </el-card>
      <el-card class="relation-card glass-card active" shadow="never">
        <div class="relation-icon"><AppIcon name="region" /></div>
        <div>
          <strong>② 产品地区管理</strong>
          <span>配置产品所在省市、仓库、代理商</span>
        </div>
      </el-card>
      <el-card class="relation-card glass-card" shadow="never" @click="router.push('/scanner')">
        <div class="relation-icon"><AppIcon name="keyboard" /></div>
        <div>
          <strong>③ 扫码自动归类</strong>
          <span>HR32 / Youjie 扫码后自动更新本表</span>
        </div>
      </el-card>
      <el-card class="relation-card glass-card" shadow="never" @click="router.push('/query')">
        <div class="relation-icon"><AppIcon name="query" /></div>
        <div>
          <strong>④ 查询与发货联动</strong>
          <span>按地区查询、装箱、发货、企业主体管理</span>
        </div>
      </el-card>
    </div>

    <div class="region-overview">
      <el-card v-for="item in regionGroups" :key="item.key" class="glass-card region-mini-card" shadow="never" @click="quickProvince = item.province; page = 1">
        <small>{{ item.province || '未分配地区' }}</small>
        <strong>{{ item.count }}</strong>
        <span>{{ item.products }} 个产品 ｜ {{ item.scans }} 次扫码</span>
      </el-card>
    </div>

    <div class="region-layout">
      <el-card class="glass-card scanner-panel" shadow="never">
        <template #header><div class="card-title with-icon"><AppIcon name="keyboard" />扫码自动归类</div></template>
        <ScannerInput
          title="地区分类扫码区"
          :device-name="scannerSettings.deviceName"
          :min-length="scannerSettings.minLength"
          :max-interval="scannerSettings.maxInterval"
          :submit-key="scannerSettings.submitKey"
          description="支持 Newland HR32 / 优解 Youjie / 通用 USB 键盘扫码枪。扫完自动 Enter 或 Tab 后，会按码值地区归类到省市分类。"
          placeholder="扫描防伪码，例如 FW-GD-SZ-A001-B202605-000001"
          @scan="handleScan"
        />
        <div class="scan-help-row">
          <el-tag type="success" effect="light">A001 → A产品</el-tag>
          <el-tag type="primary" effect="light">GD/SZ → 广东省深圳市</el-tag>
          <el-tag type="info" effect="light">自动同步产品档案</el-tag>
        </div>
        <div v-if="lastScan" class="last-scan-box">
          <div class="scan-title">最近扫码归类</div>
          <div class="scan-code">{{ lastScan.code }}</div>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="产品">{{ lastScan.product_name }}（{{ lastScan.product_code }}）</el-descriptions-item>
            <el-descriptions-item label="地区">{{ lastScan.province_name }} / {{ lastScan.city_name }}</el-descriptions-item>
            <el-descriptions-item label="分类部分">{{ lastScan.region_group }}</el-descriptions-item>
            <el-descriptions-item label="处理结果">{{ lastScan.message }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-card>

      <el-card class="glass-card search-panel" shadow="never">
        <template #header><div class="card-title">查询筛选</div></template>
        <el-form :model="query" label-position="top" @submit.prevent>
          <el-row :gutter="12">
            <el-col :span="8"><el-form-item label="关键词"><el-input v-model="query.keyword" placeholder="产品/编码/品牌/仓库" clearable @keyup.enter="load" /></el-form-item></el-col>
            <el-col :span="5"><el-form-item label="省份"><SearchableSelect v-model="quickProvince" :options="provinceOptions" placeholder="搜索省份" style="width:100%" @change="onQuickProvinceChange" /></el-form-item></el-col>
            <el-col :span="5"><el-form-item label="城市"><SearchableSelect v-model="query.city_name" :options="cityOptionsForQuery" placeholder="搜索城市" style="width:100%" /></el-form-item></el-col>
            <el-col :span="6"><el-form-item label="授权状态"><SearchableSelect v-model="query.authorized_status" :options="authorizedStatusOptions" style="width:100%" placeholder="搜索授权状态" /></el-form-item></el-col>
          </el-row>
          <el-space wrap>
            <el-button type="primary" :loading="loading" @click="load"><template #icon><AppIcon name="search" /></template>查询</el-button>
            <el-button @click="resetQuery"><template #icon><AppIcon name="reset" /></template>重置</el-button>
            <el-button v-if="canManageProductRegion" @click="openCreateWithProvince"><template #icon><AppIcon name="plus" /></template>给当前地区新增产品</el-button>
          </el-space>
        </el-form>
      </el-card>
    </div>

    <el-card class="glass-card table-card" shadow="never">
      <template #header>
        <div class="table-head">
          <div>
            <div class="card-title">不同产品所在地区表</div>
            <div class="table-subtitle">按“产品编号 + 省份 + 城市”合并，解决 A产品扫后自动进入广东分类的问题。</div>
          </div>
          <span class="muted">当前 {{ filteredRows.length }} 条 / 全部 {{ rows.length }} 条</span>
        </div>
      </template>
      <div class="responsive-table-wrap">
        <el-table v-loading="loading" :data="pagedRows" row-key="id" stripe class="region-table unified-table" :fit="true" :scrollbar-always-on="true" empty-text="暂无产品地区数据，请新增或导入 Excel">
        <el-table-column label="产品信息" min-width="260">
          <template #default="{ row }">
            <div class="product-cell">
              <div class="product-title">{{ row.product_name || inferProductName(row.product_code) }}</div>
              <div class="product-meta">
                <el-tag size="small" effect="plain">{{ row.product_code || '未编号' }}</el-tag>
                <span>{{ row.brand || '未设品牌' }}</span>
                <span>{{ row.category || '未分类' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="地区分类" min-width="240">
          <template #default="{ row }">
            <div class="region-cell">
              <div class="region-line"><strong>{{ row.province_name || '未分配' }}</strong><span v-if="row.city_name"> / {{ row.city_name }}</span></div>
              <el-tag type="success" class="region-tag">{{ row.region_group || buildRegionGroup(row) }}</el-tag>
              <div class="code-rule">{{ row.code_rule || '未设置码规则' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="仓库 / 代理商" min-width="250">
          <template #default="{ row }">
            <div class="business-cell">
              <span><AppIcon name="box" />{{ row.warehouse || '未设置仓库' }}</span>
              <span><AppIcon name="agent" />{{ row.distributor || '未设置代理商' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="授权与扫码" min-width="210">
          <template #default="{ row }">
            <div class="scan-stat-cell">
              <el-tag :type="authTagType(row.authorized_status)">{{ row.authorized_status || '正常授权' }}</el-tag>
              <span>绑定 {{ Array.isArray(row.codes) ? row.codes.length : 0 }} 个码</span>
              <span>扫码 {{ Number(row.scan_count || 0) }} 次</span>
              <span class="muted last-code" :title="row.last_scan_code">{{ row.last_scan_code || '暂无最近扫码' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" prop="updated_at" min-width="170" show-overflow-tooltip />
        <el-table-column label="操作" width="340" class-name="table-action-column" label-class-name="ios27-operation-column-head">
          <template #default="{ row }">
            <div class="row-actions compact-actions">
              <el-button v-if="canManageProductRegion" type="primary" size="small" plain @click="openEdit(row)">编辑</el-button>
              <el-button v-if="canManageProductRegion" type="success" size="small" plain @click="syncProductFromRegion(row)">同步产品</el-button>
              <el-button size="small" plain @click="goProduct(row)">看产品</el-button>
              <el-popconfirm v-if="canManageProductRegion" title="确认删除该地区产品记录？" @confirm="remove(row)">
                <template #reference><el-button type="danger" size="small" plain>删除</el-button></template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
        </el-table>
      </div>
      <div class="pagination-bar">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50,100]" :total="filteredRows.length" layout="total, sizes, prev, pager, next, jumper" />
      </div>
    </el-card>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑地区产品' : '新增地区产品'" width="820" destroy-on-close append-to-body align-center :lock-scroll="true">
      <el-form :model="form" label-position="top">
        <el-alert class="form-link-alert" type="info" :closable="false" show-icon>
          先选择产品档案会自动带出产品编号、产品名称、品牌和分类；省市字段决定扫码后归入哪个地区分类部分。
        </el-alert>
        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="关联产品档案">
              <SearchableSelect v-model="form.product_id" :options="productArchiveOptions" placeholder="从产品管理中选择产品，也可手动填写产品编号" style="width:100%" @change="handleProductSelect" />
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="产品编号"><SearchableSelect v-model="form.product_code" :options="productCodeOptions" allow-create placeholder="搜索或输入产品编号" style="width:100%" @change="fillProductByCode" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="产品名称"><el-input v-model="form.product_name" placeholder="如 A产品" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="品牌"><el-input v-model="form.brand" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="产品分类"><el-input v-model="form.category" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="省份"><SearchableSelect v-model="form.province_name" :options="provinceOptions" allow-create placeholder="搜索或输入省份" style="width:100%" @change="handleProvinceSelect" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="城市"><SearchableSelect v-model="form.city_name" :options="cityOptionsForForm" allow-create placeholder="搜索或输入城市" style="width:100%" @change="handleCitySelect" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="仓库/工位"><el-input v-model="form.warehouse" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="关联主体"><SearchableSelect v-model="form.partner_ref" :options="partnerOptions" allow-create placeholder="选择代理商或公司，也可手动输入" style="width:100%" @change="handlePartnerSelect" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="授权状态"><SearchableSelect v-model="form.authorized_status" :options="authorizedStatusOptions" style="width:100%" placeholder="搜索授权状态" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="防伪码规则"><el-input v-model="form.code_rule" placeholder="如 FW-GD-SZ-A001-*" /></el-form-item></el-col>
          <el-col :span="24">
            <el-form-item label="绑定防伪码">
              <ScannerInput
                v-model="form.codes_text"
                multiple
                :active="formVisible"
                :global="false"
                title="地区防伪码绑定"
                description="扫描或粘贴产品防伪码，保存后这些码会自动写入该产品的省市、仓库、经销商等地区归属。"
                placeholder="每行一个防伪码，例如 FW-GD-SZ-A001-B202605-000001"
                default-mode="manual"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24"><el-form-item label="地区分类部分"><el-input v-model="form.region_group" placeholder="如 广东分类部分 / 深圳市" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入结果确认" width="780" append-to-body align-center :lock-scroll="true">
      <el-alert type="info" :closable="false" show-icon>已解析 {{ importRows.length }} 条。导入时会按“产品编号 + 省份 + 城市”合并，已存在则更新，不存在则新增；如果产品编号不存在，会自动补充产品档案。</el-alert>
      <div class="responsive-table-wrap" style="margin-top: 12px">
        <el-table :data="importRows.slice(0, 10)" max-height="360">
          <el-table-column label="产品编号" prop="product_code" width="120" />
          <el-table-column label="产品名称" prop="product_name" min-width="140" />
          <el-table-column label="省份" prop="province_name" width="100" />
          <el-table-column label="城市" prop="city_name" width="100" />
          <el-table-column label="授权状态" prop="authorized_status" width="110" />
          <el-table-column label="仓库" prop="warehouse" min-width="130" />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="confirmImport">确认导入</el-button>
      </template>
    </el-dialog>
  </IosPage>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import ScannerInput from '@/components/ScannerInput.vue';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { IosPage, IosPageHero } from '@/components/ios27';
import { partnersApi, productRegionsApi, productsApi } from '@/api/resources';
import { downloadCsv, parseImportFile, type ImportRow } from '@/utils/excelImport';
import { splitCodes } from '@/utils/format';
import { buildRegion, classifyHr32Code, loadHr32Region, loadHr32Settings, saveHr32LastScan, type Hr32Region } from '@/utils/hr32';
import { useAuthStore } from '@/stores/auth';
import { cityCode, cityOptions, provinceCode, provinceOptions } from '@/utils/regionOptions';

const route = useRoute();
const router = useRouter();
const fileRef = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const rows = ref<any[]>([]);
const products = ref<any[]>([]);
const partnerOptions = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(10);
const quickProvince = ref('');
const query = reactive({ keyword: '', city_name: '', authorized_status: '' });
const formVisible = ref(false);
const importVisible = ref(false);
const importRows = ref<any[]>([]);
const lastScan = ref<any>(null);
const scannerSettings = loadHr32Settings();
const workstationRegion = loadHr32Region();
const form = reactive<any>({});

const authorizedStatusOptions = [
  { label: '正常授权', value: '正常授权' },
  { label: '待审核', value: '待审核' },
  { label: '暂停销售', value: '暂停销售' },
  { label: '禁售', value: '禁售' },
];

const auth = useAuthStore();
const canManageProductRegion = computed(() => auth.hasPermission('product-region:manage'));
const canExport = computed(() => auth.hasPermission('export:download'));

const productArchiveOptions = computed(() => products.value.map((product: any) => ({
  label: `${product.product_name || product.product_code}（${product.product_code || '无编号'}）`,
  value: product.id,
  code: product.product_code,
})));
const productCodeOptions = computed(() => products.value.map((product: any) => ({
  label: `${product.product_code || product.id}（${product.product_name || '未命名'}）`,
  value: product.product_code || String(product.id),
}))); 
const cityOptionsForQuery = computed(() => cityOptions(quickProvince.value));
const cityOptionsForForm = computed(() => cityOptions(form.province_name));
async function loadPartnerOptions() {
  try { partnerOptions.value = await partnersApi.select(); } catch { partnerOptions.value = []; }
}
function findPartnerOption(value: any) {
  const target = clean(value);
  if (!target) return undefined;
  return partnerOptions.value.find((item: any) => String(item.value) === target || String(item.id) === target || String(item.party_name || item.label || '') === target);
}
function handlePartnerSelect(value: any) {
  const item = findPartnerOption(value);
  const text = clean(value);
  if (!item) {
    form.distributor = text;
    form.agent_id = undefined;
    return;
  }
  const partyName = clean(item.party_name || item.agent_name || item.company_name || item.manufacturer_name || item.label || text);
  form.distributor = partyName;
  form.agent_id = item.party_type === 'agent' ? Number(item.source_id || item.agent_id || 0) || undefined : undefined;
  if (!form.province_name && item.province) form.province_name = item.province;
  if (!form.city_name && item.city) form.city_name = item.city;
  autoRegionGroup();
}
function syncPartnerRefFromForm() {
  if (form.agent_id) form.partner_ref = `agent:${form.agent_id}`;
  else if (form.distributor) form.partner_ref = form.distributor;
}
function onQuickProvinceChange() {
  if (query.city_name && !cityOptions(quickProvince.value).some((item) => item.value === query.city_name)) query.city_name = '';
  page.value = 1;
}
function handleProvinceSelect(value: any) {
  form.province_code = provinceCode(value);
  if (form.city_name && !cityOptions(value).some((item) => item.value === form.city_name)) form.city_name = '';
  form.city_code = cityCode(form.city_name, value);
  form.region_group = '';
  autoRegionGroup();
}
function handleCitySelect(value: any) {
  form.city_code = cityCode(value, form.province_name);
  form.region_group = '';
  autoRegionGroup();
}

const headerMap: Record<string, string> = {
  产品ID: 'product_id', 产品编号: 'product_code', 产品编码: 'product_code', product_code: 'product_code',
  产品名称: 'product_name', 产品名: 'product_name', product_name: 'product_name',
  品牌: 'brand', brand: 'brand', 分类: 'category', 产品分类: 'category', category: 'category',
  省份: 'province_name', 省: 'province_name', province: 'province_name', province_name: 'province_name',
  城市: 'city_name', 市: 'city_name', city: 'city_name', city_name: 'city_name',
  省份代码: 'province_code', 城市代码: 'city_code',
  地区分类: 'region_group', 地区分类部分: 'region_group', 区域分组: 'region_group',
  仓库: 'warehouse', 工位: 'warehouse', warehouse: 'warehouse',
  经销商: 'distributor', 代理商: 'distributor', distributor: 'distributor',
  授权状态: 'authorized_status', 状态: 'authorized_status', authorized_status: 'authorized_status',
  防伪码规则: 'code_rule', 码规则: 'code_rule', code_rule: 'code_rule',
  防伪码: 'codes', 产品防伪码: 'codes', 绑定防伪码: 'codes', codes: 'codes',
  备注: 'remark', remark: 'remark',
};

function nowText() { return new Date().toLocaleString(); }
function clean(value: unknown) { return String(value ?? '').trim(); }
function buildRegionGroup(row: any) { return `${row.province_name || '未分配'}分类部分${row.city_name ? ` / ${row.city_name}` : ''}`; }
function inferProductName(productCode: string) {
  const code = clean(productCode).toUpperCase();
  if (!code) return '未命名产品';
  if (code === 'A' || code.startsWith('A')) return 'A产品';
  if (code === 'B' || code.startsWith('B')) return 'B产品';
  return `${productCode}产品`;
}
function normalizeRecord(input: ImportRow) {
  const mapped: any = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    const target = headerMap[clean(key)] || headerMap[clean(key).toLowerCase()];
    if (target) mapped[target] = clean(value);
  });
  const productCode = clean(mapped.product_code || mapped.product_id || '');
  const product = productByCode(productCode);
  const provinceName = clean(mapped.province_name) || '未分配地区';
  const cityName = clean(mapped.city_name);
  return {
    product_id: mapped.product_id ? Number(mapped.product_id) || product?.id : product?.id,
    product_code: product?.product_code || productCode,
    product_name: clean(mapped.product_name) || product?.product_name || inferProductName(productCode),
    brand: clean(mapped.brand) || product?.brand || 'Trace Demo',
    category: clean(mapped.category) || product?.category || '默认分类',
    province_code: clean(mapped.province_code) || provinceCode(provinceName),
    city_code: clean(mapped.city_code) || cityCode(cityName, provinceName),
    province_name: provinceName,
    city_name: cityName,
    region_group: clean(mapped.region_group),
    warehouse: clean(mapped.warehouse),
    distributor: clean(mapped.distributor),
    authorized_status: clean(mapped.authorized_status) || '正常授权',
    code_rule: clean(mapped.code_rule),
    codes: splitCodes(mapped.codes || (input as any).codes || ''),
    scan_count: Number((input as any).scan_count || 0),
    last_scan_code: clean((input as any).last_scan_code),
    last_scan_at: clean((input as any).last_scan_at),
    remark: clean(mapped.remark),
    status: 1,
  };
}
function productByCode(code: string) {
  const target = clean(code).toUpperCase();
  if (!target) return undefined;
  return products.value.find((item) => clean(item.product_code).toUpperCase() === target || clean(item.id) === target || clean(item.product_name).toUpperCase() === target);
}
function productById(id: number | string) { return products.value.find((item) => String(item.id) === String(id)); }
function authTagType(status?: string) {
  if (status === '禁售') return 'danger';
  if (status === '暂停销售') return 'warning';
  if (status === '待审核') return 'info';
  return 'success';
}
const filteredRows = computed(() => {
  const keyword = clean(query.keyword).toLowerCase();
  const province = clean(quickProvince.value);
  const city = clean(query.city_name);
  const auth = clean(query.authorized_status);
  return rows.value.filter((row) => {
    const text = Object.values(row).map((v) => typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')).join(' ').toLowerCase();
    return (!keyword || text.includes(keyword)) && (!province || clean(row.province_name).includes(province)) && (!city || clean(row.city_name).includes(city)) && (!auth || row.authorized_status === auth);
  });
});
const pagedRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const regionGroups = computed(() => {
  const map = new Map<string, any>();
  rows.value.forEach((row) => {
    const province = row.province_name || '未分配地区';
    const item = map.get(province) || { key: province, province, count: 0, productsSet: new Set<string>(), scans: 0 };
    item.count += 1;
    item.productsSet.add(row.product_code || row.product_name || row.id);
    item.scans += Number(row.scan_count || 0);
    map.set(province, item);
  });
  return Array.from(map.values()).map((item) => ({ ...item, products: item.productsSet.size })).sort((a, b) => b.count - a.count);
});
async function loadProducts() {
  const productRes = await productsApi.list({ page: 1, pageSize: 1000 });
  products.value = productRes?.list || [];
}
async function load() {
  loading.value = true;
  try {
    const [regionRes, productRes] = await Promise.all([
      productRegionsApi.list({ page: 1, pageSize: 1000 }),
      productsApi.list({ page: 1, pageSize: 1000 }),
    ]);
    products.value = productRes?.list || [];
    rows.value = (regionRes?.list || []).map((item: any) => {
      const product = productByCode(item.product_code) || productById(item.product_id);
      return {
        ...item,
        product_id: item.product_id || product?.id,
        product_code: item.product_code || product?.product_code,
        product_name: item.product_name || product?.product_name,
        brand: item.brand || product?.brand,
        category: item.category || product?.category,
        region_group: item.region_group || buildRegionGroup(item),
      };
    });
    if (page.value > Math.ceil(filteredRows.value.length / pageSize.value)) page.value = 1;
  } finally { loading.value = false; }
}
function hydrateFromRoute() {
  const productCode = route.query.product_code;
  const keyword = Array.isArray(productCode) ? productCode[0] : productCode;
  const province = route.query.province;
  const provinceText = Array.isArray(province) ? province[0] : province;
  if (keyword) query.keyword = String(keyword);
  if (provinceText) quickProvince.value = String(provinceText);
  page.value = 1;
}
function resetQuery() {
  query.keyword = '';
  query.city_name = '';
  query.authorized_status = '';
  quickProvince.value = '';
  page.value = 1;
  router.replace({ path: '/product-regions' });
  load();
}
function triggerImport() { fileRef.value?.click(); }
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const parsed = await parseImportFile(file);
    importRows.value = parsed.map(normalizeRecord).filter((item) => item.product_code || item.product_name);
    if (!importRows.value.length) return Message.warning('没有解析到有效数据，请检查表头。');
    importVisible.value = true;
  } catch (error: any) {
    Message.error(error?.message || '导入失败，请检查文件格式。');
  }
}
function findExisting(record: any) {
  return rows.value.find((item) => clean(item.product_code).toUpperCase() === clean(record.product_code).toUpperCase() && clean(item.province_name) === clean(record.province_name) && clean(item.city_name) === clean(record.city_name));
}
async function ensureProduct(record: any) {
  const productCode = clean(record.product_code);
  if (!productCode) return undefined;
  const existed = productByCode(productCode);
  if (existed) return existed;
  const payload = {
    product_code: productCode,
    product_name: clean(record.product_name) || inferProductName(productCode),
    brand: clean(record.brand) || 'Trace Demo',
    category: clean(record.category) || '默认分类',
    unit: '件',
    status: 1,
    description: '由产品地区管理自动补建的产品档案。',
    extra_fields: { 来源: '产品地区管理自动同步', 默认地区: `${clean(record.province_name)}${clean(record.city_name)}` },
  };
  await productsApi.create(payload);
  await loadProducts();
  return productByCode(productCode) || payload;
}
async function upsertRecord(record: any) {
  const product = await ensureProduct(record);
  const normalized = {
    ...record,
    product_id: record.product_id || product?.id,
    product_code: record.product_code || product?.product_code,
    product_name: record.product_name || product?.product_name,
    brand: record.brand || product?.brand || 'Trace Demo',
    category: record.category || product?.category || '默认分类',
    region_group: record.region_group || buildRegionGroup(record),
    updated_at: nowText(),
  };
  const old = findExisting(normalized);
  if (old?.id) return productRegionsApi.update(old.id, { ...old, ...normalized });
  return productRegionsApi.create({ ...normalized, created_at: nowText() });
}
async function confirmImport() {
  importing.value = true;
  try {
    let created = 0; let updated = 0;
    for (const item of importRows.value) {
      const old = findExisting(item);
      await upsertRecord(item);
      if (old) updated += 1; else created += 1;
    }
    Message.success(`导入完成：新增 ${created} 条，更新 ${updated} 条`);
    importVisible.value = false;
    await load();
  } finally { importing.value = false; }
}
function downloadTemplate() {
  downloadCsv('产品地区导入模板.csv', [
    { 产品编号: 'A001', 产品名称: 'A产品', 品牌: 'Trace Demo', 分类: '食品', 省份: '广东省', 城市: '深圳市', 地区分类部分: '广东分类部分 / 深圳市', 仓库: '深圳一号仓', 经销商: '华南一级代理', 授权状态: '正常授权', 防伪码规则: 'FW-GD-SZ-A001-*', 防伪码: 'FW-GD-SZ-A001-B202605-000001\nFW-GD-SZ-A001-B202605-000002', 备注: '扫码后自动归入广东分类' },
    { 产品编号: 'B001', 产品名称: 'B产品', 品牌: 'Trace Demo', 分类: '食品', 省份: '湖南省', 城市: '长沙市', 地区分类部分: '湖南分类部分 / 长沙市', 仓库: '长沙仓', 经销商: '华中代理', 授权状态: '正常授权', 防伪码规则: 'FW-HN-CS-B001-*', 防伪码: '', 备注: '' },
  ]);
}
function exportCurrent() {
  downloadCsv('产品地区表.csv', filteredRows.value.map((row) => ({ 产品编号: row.product_code, 产品名称: row.product_name, 品牌: row.brand, 分类: row.category, 省份: row.province_name, 城市: row.city_name, 地区分类部分: row.region_group || buildRegionGroup(row), 仓库: row.warehouse, 经销商: row.distributor, 授权状态: row.authorized_status, 防伪码数量: Array.isArray(row.codes) ? row.codes.length : 0, 防伪码: Array.isArray(row.codes) ? row.codes.join('\n') : '', 扫码次数: row.scan_count || 0, 最近扫码: row.last_scan_code || '', 备注: row.remark || '' })));
}
function openCreate() {
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, { authorized_status: '正常授权', status: 1, brand: 'Trace Demo', category: '默认分类', codes_text: '', partner_ref: '' });
  formVisible.value = true;
}
function openCreateWithProvince() { openCreate(); if (quickProvince.value) form.province_name = quickProvince.value; autoRegionGroup(); }
function openEdit(row: any) { Object.keys(form).forEach((k) => delete form[k]); Object.assign(form, JSON.parse(JSON.stringify(row))); form.codes_text = Array.isArray(row.codes) ? row.codes.join('\n') : ''; syncPartnerRefFromForm(); formVisible.value = true; }
function handleProductSelect(id: any) {
  const product = productById(id);
  if (!product) return;
  Object.assign(form, { product_id: product.id, product_code: product.product_code, product_name: product.product_name, brand: product.brand, category: product.category });
  autoCodeRule();
}
function fillProductByCode() {
  const product = productByCode(form.product_code);
  if (product) Object.assign(form, { product_id: product.id, product_code: product.product_code, product_name: product.product_name, brand: product.brand, category: product.category });
  autoCodeRule();
}
function autoRegionGroup() {
  if (form.province_name) form.province_code = form.province_code || provinceCode(form.province_name);
  if (form.city_name) form.city_code = form.city_code || cityCode(form.city_name, form.province_name);
  if (!form.region_group && form.province_name) form.region_group = buildRegionGroup(form);
  autoCodeRule();
}
function autoCodeRule() {
  if (form.code_rule || !form.product_code) return;
  const pCode = clean(form.province_code) || provinceCode(form.province_name);
  const cCode = clean(form.city_code) || cityCode(form.city_name, form.province_name);
  form.code_rule = pCode && cCode ? `FW-${pCode}-${cCode}-${form.product_code}-*` : `${form.product_code}-*`;
}
async function submitForm() {
  if (!clean(form.product_code) && !clean(form.product_name)) return Message.warning('请至少填写产品编号或产品名称');
  saving.value = true;
  try {
    autoRegionGroup();
    const product = await ensureProduct(form);
    const payload = { ...form, product_id: form.product_id || product?.id, region_group: form.region_group || buildRegionGroup(form), codes: splitCodes(form.codes_text || form.codes || ''), updated_at: nowText() };
    delete payload.codes_text;
    delete payload.partner_ref;
    if (form.id) await productRegionsApi.update(form.id, payload);
    else await productRegionsApi.create({ ...payload, created_at: nowText() });
    Message.success('保存成功，产品档案与地区关系已关联');
    formVisible.value = false;
    await load();
  } finally { saving.value = false; }
}
async function remove(row: any) { await productRegionsApi.remove(row.id); Message.success('删除成功'); await load(); }
async function syncProductFromRegion(row: any) {
  const product = await ensureProduct(row);
  await productRegionsApi.update(row.id, { ...row, product_id: product?.id, product_code: product?.product_code || row.product_code, product_name: product?.product_name || row.product_name, brand: product?.brand || row.brand, category: product?.category || row.category });
  Message.success('已同步到产品管理，并更新关联产品ID');
  await load();
}
function goProduct(row: any) { router.push({ path: '/products', query: { keyword: row.product_code || row.product_name || '' } }); }
function extractProductCode(scan: ReturnType<typeof classifyHr32Code>) {
  const code = clean(scan.productCode);
  if (code) return code;
  const parts = clean(scan.code).split(/[-_/.|]+/).filter(Boolean);
  const candidate = parts.find((item) => /^[A-Z]\d{0,8}$/i.test(item) || /^P\d+/i.test(item));
  return candidate || 'A001';
}
async function handleScan(code: string) {
  const fallbackRegion: Hr32Region = workstationRegion || buildRegion('GD', 'SZ', '默认工作站');
  const parsed = classifyHr32Code(code, fallbackRegion);
  const productCode = extractProductCode(parsed);
  const matchedProduct = productByCode(productCode) || await ensureProduct({ product_code: productCode, product_name: inferProductName(productCode), brand: 'Trace Demo', category: '默认分类', province_name: parsed.provinceName, city_name: parsed.cityName });
  const record = {
    product_id: matchedProduct?.id,
    product_code: matchedProduct?.product_code || productCode,
    product_name: matchedProduct?.product_name || inferProductName(productCode),
    brand: matchedProduct?.brand || 'Trace Demo',
    category: matchedProduct?.category || '默认分类',
    province_code: parsed.provinceCode,
    city_code: parsed.cityCode,
    province_name: parsed.provinceName || fallbackRegion.provinceName || '广东省',
    city_name: parsed.cityName || fallbackRegion.cityName || '深圳市',
    warehouse: fallbackRegion.warehouse || '',
    distributor: '',
    authorized_status: '正常授权',
    code_rule: parsed.provinceCode && parsed.cityCode ? `FW-${parsed.provinceCode}-${parsed.cityCode}-${productCode}-*` : `${productCode}-*`,
    codes: [parsed.code],
    scan_count: 1,
    last_scan_code: parsed.code,
    last_scan_at: nowText(),
    remark: '由扫码枪自动归类生成/更新',
    status: 1,
  };
  const old = findExisting(record);
  const oldCodes = Array.isArray(old?.codes) ? old.codes.map((item: any) => String(item).trim()).filter(Boolean) : [];
  const payload = old ? { ...old, ...record, codes: Array.from(new Set([...oldCodes, parsed.code])), scan_count: Number(old.scan_count || 0) + 1 } : record;
  await upsertRecord(payload);
  const regionGroup = buildRegionGroup(payload);
  lastScan.value = { ...payload, region_group: regionGroup, code: parsed.code, message: old ? '已更新原地区产品记录' : '已新增地区产品记录，并同步产品档案' };
  saveHr32LastScan({ ...lastScan.value, source: 'product-region-page' });
  quickProvince.value = payload.province_name;
  query.keyword = payload.product_code;
  page.value = 1;
  Message.success(`${payload.product_name} 已归入 ${regionGroup}`);
  await load();
}

onMounted(async () => { hydrateFromRoute(); await Promise.all([loadPartnerOptions(), load()]); });
watch(() => route.query, () => { hydrateFromRoute(); });
</script>

<style scoped>
.hidden-file { display: none; }
.product-region-hero { align-items: flex-start; }
.region-alert { margin-bottom: 18px; border-radius: 14px; }
.relation-flow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
.relation-card { cursor: pointer; border-radius: 18px; transition: transform .2s ease, border-color .2s ease, background .2s ease; }
.relation-card:hover { transform: translateY(-2px); border-color: rgba(37, 99, 235, .38); }
.relation-card :deep(.el-card__body) { display: flex; align-items: center; gap: 12px; padding: 16px; }
.relation-card.active { border-color: rgba(37, 99, 235, .45); background: linear-gradient(135deg, rgba(37, 99, 235, .14), rgba(37, 99, 235, .04)); }
.relation-icon { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: rgba(37, 99, 235, .12); color: var(--primary); flex: 0 0 auto; }
.relation-card strong { display: block; color: var(--text-1); font-weight: 900; }
.relation-card span { display: block; color: var(--text-2); font-size: 13px; line-height: 1.5; margin-top: 3px; }
.region-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
.region-mini-card { cursor: pointer; border-radius: 18px; transition: transform .2s ease, border-color .2s ease; }
.region-mini-card:hover { transform: translateY(-2px); border-color: rgba(37, 99, 235, .35); }
.region-mini-card small { display: block; color: var(--text-3); margin-bottom: 6px; }
.region-mini-card strong { display: block; color: var(--primary); font-size: 28px; line-height: 1; }
.region-mini-card span { display: block; color: var(--text-2); margin-top: 8px; font-size: 13px; }
.region-layout { display: grid; grid-template-columns: minmax(340px, 420px) minmax(0, 1fr); gap: 18px; margin-bottom: 18px; align-items: start; }
.card-title { font-weight: 850; color: var(--text-1); }
.card-title.with-icon { display: flex; align-items: center; gap: 8px; }
.scanner-panel, .search-panel, .table-card { border-radius: 22px; }
.scan-help-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.last-scan-box { margin-top: 14px; padding: 14px; border-radius: 16px; background: rgba(37, 99, 235, .06); border: 1px solid rgba(37, 99, 235, .13); }
.scan-title { color: var(--text-2); font-weight: 800; margin-bottom: 5px; }
.scan-code { color: var(--primary); font-weight: 900; font-size: 18px; word-break: break-all; margin-bottom: 10px; }
.table-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.table-subtitle { margin-top: 4px; color: var(--text-3); font-size: 13px; }
.region-table { width: 100%; }
.region-table :deep(.el-table__cell) { vertical-align: top; }
.region-table :deep(.cell) { min-width: 0; }
.product-cell, .region-cell, .business-cell, .scan-stat-cell { min-width: 0; max-width: 100%; }
.product-title { font-weight: 900; color: var(--text-1); margin-bottom: 8px; }
.product-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text-2); font-size: 13px; }
.region-line { color: var(--text-1); margin-bottom: 8px; }
.region-tag { max-width: 100%; white-space: normal; height: auto; line-height: 1.4; padding: 4px 8px; }
.code-rule { margin-top: 8px; color: var(--text-3); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; word-break: break-all; }
.business-cell, .scan-stat-cell { display: flex; flex-direction: column; gap: 8px; color: var(--text-2); }
.business-cell span { display: flex; align-items: center; gap: 6px; min-width: 0; word-break: break-word; }
.last-code { max-width: 190px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; min-width: 0; }
.compact-actions :deep(.el-button) { margin-left: 0 !important; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.form-link-alert { margin-bottom: 14px; border-radius: 12px; }
@media (max-width: 1360px) { .relation-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 1200px) { .region-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); } .region-layout { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .region-overview, .relation-flow { grid-template-columns: 1fr; } .table-head { align-items: flex-start; flex-direction: column; } }
</style>
