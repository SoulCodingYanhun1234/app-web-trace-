<template>
  <AiTraceAutomationPanel v-if="AI_FEATURE_ENABLED" module-key="box" compact @completed="crudRef?.load()" />
  <CrudPage ref="crudRef" :config="config">
    <template #toolbar="{ selectedRows, selectedKeys, clearSelection }">
      <el-space wrap>
        <el-button v-if="canExport" type="primary" :disabled="!selectedKeys.length" @click="openBatchQrcode(selectedRows)">下载选中装箱码ZIP</el-button>
        <el-button v-if="canExport" @click="exportBoxesCsv(selectedRows)">{{ selectedKeys.length ? `导出选中箱码CSV（${selectedKeys.length}）` : '导出全部箱码CSV' }}</el-button>
        <el-button v-if="selectedKeys.length" text @click="clearSelection()">清空已选 {{ selectedKeys.length }} 个</el-button>
        <el-tag v-if="selectedKeys.length" type="success">已跨页选择 {{ selectedKeys.length }} 个装箱码</el-tag>
      </el-space>
    </template>
    <template #row-actions="{ record }">
      <el-button text type="primary" size="small" @click="openBoxQrcode(record)">二维码</el-button>
      <el-button v-if="canManageBox" text type="primary" size="small" @click="openAddCodes(record)">加码</el-button>
      <el-popconfirm v-if="canManageBox" title="确认封箱？" @confirm="seal(record)">
        <template #reference>
          <el-button text type="primary" size="small">封箱</el-button>
        </template>
      </el-popconfirm>
    </template>
    <template #detail-extra="{ detail }">
      <div class="box-code-detail">
        <div class="box-code-head">
          <strong>箱内防伪码明细</strong>
          <el-space wrap>
            <el-tag type="success">数量 {{ detail?.code_count || 0 }}</el-tag>
            <el-tag v-if="detail?.box_no">箱号 {{ detail.box_no }}</el-tag>
          </el-space>
        </div>
        <div v-if="detail?.code_details?.length" class="responsive-table-wrap">
          <el-table
            :data="detail.code_details"
            row-key="code"
            size="small"
            border
            max-height="420"
          >
            <el-table-column label="#" prop="index" width="64" />
            <el-table-column label="防伪码" prop="code" min-width="180" show-overflow-tooltip />
            <el-table-column label="批次" prop="batch_no" width="150" show-overflow-tooltip />
            <el-table-column label="生成时间" width="170">
              <template #default="{ row }">{{ fmtTime(row.code_generated_at) }}</template>
            </el-table-column>
            <el-table-column label="溯源编号" prop="trace_no" width="170" show-overflow-tooltip />
            <el-table-column label="生产日期" width="120">
              <template #default="{ row }">{{ fmtDate(row.production_date) }}</template>
            </el-table-column>
            <el-table-column label="生成地点" prop="production_place" width="150" show-overflow-tooltip />
            <el-table-column label="公司" prop="manufacturer" width="150" show-overflow-tooltip />
            <el-table-column label="查询次数" prop="query_count" width="100" />
          </el-table>
        </div>
        <el-empty v-else description="当前箱子暂无绑定防伪码" />
      </div>
    </template>
  </CrudPage>
  <el-dialog v-model="codesVisible" title="低代码扫码装箱" append-to-body align-center :lock-scroll="true">
    <el-alert type="info" :closable="false" show-icon>加码只需扫描防伪码ID/码值，无需选择或填写地区；兼容历史验证链接并自动提取其中码值，装箱时不会保存二维码链接。</el-alert>
    <ScannerInput
      v-model="codesText"
      multiple
      mobile-camera
      :active="codesVisible"
      title="扫码装箱输入区"
      description="每扫一个防伪码ID会自动追加到下方列表，重复码会自动清理；已在其他箱内的同码会自动迁移到当前箱，避免重复装箱。"
      placeholder="请扫描箱内产品防伪码"
      style="margin-top:12px"
    />
    <div class="low-code-mini-card" style="margin-top:12px">
      <div class="low-code-mini-title">智能解析预览</div>
      <el-space wrap>
        <el-tag>原始 {{ codePreview.raw.length }} 条</el-tag>
        <el-tag type="success">有效 {{ codePreview.items.length }} 条</el-tag>
        <el-tag v-if="codePreview.duplicated.length" type="warning">重复 {{ codePreview.duplicated.length }} 条</el-tag>
        <el-button size="small" @click="cleanCodesText">清理重复并按行整理</el-button>
      </el-space>
    </div>
    <template #footer>
      <el-button :disabled="submittingCodes" @click="codesVisible = false">取消</el-button>
      <el-button type="primary" :loading="submittingCodes" @click="submitCodes">确定装箱</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="qrcodeVisible" :title="qrcodeTitle" width="520px" destroy-on-close @closed="clearQrcode" append-to-body align-center :lock-scroll="true">
    <div v-if="activeBox" class="qrcode-box">
      <img v-if="qrcodeUrl" :src="qrcodeUrl" alt="箱码二维码" />
      <el-skeleton v-else animated :rows="4" style="width: 280px" />
      <el-alert type="success" :closable="false" show-icon>
        箱码 {{ activeBox.box_no || activeBox.id }} 的二维码已生成；扫码枪读取的是箱号/箱码本身，不会写入二维码链接。
      </el-alert>
    </div>
    <template #footer>
      <el-button @click="qrcodeVisible = false">关闭</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="batchQrVisible" title="选定装箱码批量下载" width="680px" destroy-on-close append-to-body align-center :lock-scroll="true">
    <el-alert type="info" show-icon :closable="false" class="form-low-code-tips">
      已跨页选择 {{ selectedBoxCodeRows.length }} 个装箱码；每张二维码下方会直接印出箱码编号，便于现场校对。
    </el-alert>
    <div class="responsive-table-wrap">
      <el-table :data="selectedBoxCodeRows" size="small" border max-height="220" class="box-code-preview-table">
        <el-table-column type="index" label="#" width="56" />
        <el-table-column label="装箱码/箱号" prop="code" min-width="210" show-overflow-tooltip />
        <el-table-column label="产品" prop="product" min-width="180" show-overflow-tooltip />
        <el-table-column label="批次号" prop="batch_no" width="150" show-overflow-tooltip />
        <el-table-column label="数量" prop="code_count" width="90" />
      </el-table>
    </div>
    <el-form label-position="top" style="margin-top: 12px">
      <el-form-item label="图片格式">
        <el-radio-group v-model="qrExportFormat">
          <el-radio-button label="svg">SVG 矢量图</el-radio-button>
          <el-radio-button label="png">PNG 位图</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="batchQrVisible = false">取消</el-button>
      <el-button type="primary" :loading="exportingQr" @click="confirmBatchQrcode">打包并下载ZIP</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import CrudPage from '@/components/CrudPage.vue';
import AiTraceAutomationPanel from '@/components/AiTraceAutomationPanel.vue';
import { AI_FEATURE_ENABLED } from '@/config/features';
import ScannerInput from '@/components/ScannerInput.vue';
import { agentsApi, boxApi, exportApi, partnersApi, productsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { fmtDate, fmtTime, splitCodes } from '@/utils/format';
import { formatLines, makeBatchNo, parseBatchText } from '@/utils/lowcode';
import { cityOptions, provinceOptions } from '@/utils/regionOptions';
import { useAuthStore } from '@/stores/auth';

const crudRef = ref<any>();
const auth = useAuthStore();
const canManageBox = computed(() => auth.hasPermission('box:manage'));
const canExport = computed(() => auth.hasPermission('export:download'));
const currentId = ref<number|string>();
const codesVisible = ref(false);
const codesText = ref('');
const submittingCodes = ref(false);
const qrcodeVisible = ref(false);
const batchQrVisible = ref(false);
const activeBox = ref<any>(null);
const batchBoxes = ref<any[]>([]);
const qrExportFormat = ref<'svg' | 'png'>('svg');
const exportingQr = ref(false);
const qrcodeUrl = ref('');
const qrcodeLoading = ref(false);
const qrcodeTitle = computed(() => activeBox.value ? `箱码二维码：${activeBox.value.box_no || activeBox.value.id}` : '箱码二维码');
const selectedBoxCodeRows = computed(() => batchBoxes.value.map((row: any) => ({
  id: row.id,
  code: String(row.box_no || row.id || '').trim(),
  product: row.product_label || row.product_name || row.product_id || '-',
  batch_no: row.batch_no || '-',
  code_count: row.code_count ?? (Array.isArray(row.codes) ? row.codes.length : 0),
})).filter((row) => row.code));
const codePreview = computed(() => parseBatchText(codesText.value));
const agentOptions = ref<any[]>([]);
const companyOptions = ref<any[]>([]);
const productOptions = ref<any[]>([]);
function findCompany(value: any) {
  return companyOptions.value.find((item: any) => String(item.value) === String(value)
    || String(item.party_name || item.company_name || item.manufacturer_name) === String(value));
}
function findAgent(value: any) {
  return agentOptions.value.find((item: any) => String(item.value) === String(value) || String(item.id) === String(value));
}
function applyCompanyLocation(company: any, form: Record<string, any>) {
  if (!company || form.agent_id) return;
  const companyName = company.party_name || company.company_name || company.manufacturer_name;
  form.company_name = companyName || form.company_name;
  form.manufacturer = companyName || form.manufacturer;
  form.agent_name = undefined;
  form.province_name = company.province || undefined;
  form.city_name = company.city || undefined;
  form.region_group = [company.province, company.city].filter(Boolean).join(' / ');
  form.distributor = companyName || undefined;
  form.warehouse = company.address || undefined;
}
function handleCompanyChange(value: any, form: Record<string, any>) {
  applyCompanyLocation(findCompany(value), form);
}
function handleAgentChange(value: any, form: Record<string, any>) {
  const agent = findAgent(value);
  if (!agent) {
    form.agent_name = undefined;
    applyCompanyLocation(findCompany(form.company_name || form.manufacturer), form);
    return;
  }
  form.agent_name = agent.agent_name || agent.agent_code || form.agent_name;
  form.province_name = agent.province || form.province_name;
  form.city_name = agent.city || form.city_name;
  form.region_group = [form.province_name, form.city_name, agent.district].filter(Boolean).join(' / ');
  form.distributor = agent.agent_name || agent.agent_code || form.distributor;
  form.warehouse = agent.address || form.warehouse;
}

function handleProductChange(value: any, form: Record<string, any>) {
  const product = productOptions.value.find((item: any) => String(item.value) === String(value) || String(item.id) === String(value));
  if (!product) return;
  if (product.batch_no && !form.batch_no) form.batch_no = product.batch_no;
  if (product.manufacturer) {
    form.company_name = product.manufacturer;
    form.manufacturer = product.manufacturer;
    applyCompanyLocation(findCompany(product.manufacturer), form);
  }
}
const config = reactive({
  title: '装箱管理', shortTitle: '装箱', api: boxApi, detailApi: true, selection: true, actionWidth: 360, scrollX: 1120,
  summary: { totalLabel: '装箱总数', totalUnit: '箱', currentPageLabel: '本页装箱' },
  detailOmitKeys: ['codes', 'code_details', 'authorization_address', 'authorization_level', 'authorization_source'],
  labelMap: { codes: '箱内防伪码', code_count: '数量' },
  createPermission: 'box:manage', updatePermission: 'box:manage', deletePermission: 'box:manage',
  lowCode: {
    title: '装箱低代码助手',
    description: '创建箱子并记录关联产品和装箱地点；装箱不会给防伪码设置授权位置。',
    formTips: ['选择产品后会自动带出所属公司和装箱地点。', '装箱公司或代理商仅用于业务流转记录，不参与防伪码位置授权。', '确认箱内码无误后点击封箱，只有封箱后的箱子才能加入发货单。'],
    steps: [
      { title: '创建装箱码', description: '填写装箱信息后，系统自动生成不含日期的全局箱码编号。' },
      { title: '粘贴扫码内容', description: '点击“加码”，直接粘贴扫码枪、Excel 或逗号分隔内容。' },
      { title: '系统自动去重', description: '提交前可看到有效数量和重复数量。' },
      { title: '封箱', description: '确认数量无误后点击封箱。' },
    ],
    presets: [
      { label: '标准箱模板', description: '常用 12 件/箱，箱号由系统生成。', values: () => ({ batch_no: makeBatchNo('BATCH'), box_capacity: 12, box_spec: '12件/箱', box_type: '标准箱' }) },
      { label: '大箱模板', description: '常用 24 件/箱，箱号由系统生成。', values: () => ({ batch_no: makeBatchNo('BATCH'), box_capacity: 24, box_spec: '24件/箱', box_type: '大箱' }) },
      { label: '样品箱模板', description: '小批量样品或测试箱。', values: () => ({ batch_no: makeBatchNo('BATCH'), box_capacity: 6, box_spec: '6件/箱', box_type: '样品箱' }) },
    ],
  },
  filters: [
    { key: 'product_id', label: '关联产品', type: 'select', options: [] as any[], placeholder: '请选择产品' },
    { key: 'batch_no', label: '批次号', type: 'input' },
    { key: 'box_no', label: '装箱编号', type: 'input' },
    { key: 'agent_id', label: '装箱代理商', type: 'select', options: () => agentOptions.value },
    { key: 'province_name', label: '装箱省份', type: 'select', options: provinceOptions },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.box) },
  ],
  columns: [
    { title: '箱号', dataIndex: 'box_no', width: 230 },
    { title: '关联产品', dataIndex: 'product_label', width: 220, render: (row:any) => row.product_label || row.product_id || '-' },
    { title: '批次号', dataIndex: 'batch_no', width: 160 },
    { title: '容量', dataIndex: 'box_capacity', width: 90 },
    { title: '箱规', dataIndex: 'box_spec', width: 160 },
    { title: '箱型', dataIndex: 'box_type', width: 120 },
    { title: '公司', dataIndex: 'company_name', width: 160, render: (row:any) => row.company_name || row.manufacturer || '-' },
    { title: '装箱地点', dataIndex: 'region_group', width: 190, render: (row:any) => row.region_group || [row.province_name, row.city_name].filter(Boolean).join(' / ') || '-' },
    { title: '装箱单位', dataIndex: 'agent_name', width: 180, render: (row:any) => row.agent_name || row.company_name || row.distributor || '-' },
    { title: '数量', dataIndex: 'code_count', width: 100, render: (row:any) => String(row.code_count ?? (Array.isArray(row.codes) ? row.codes.length : 0)) },
    { title: '状态', dataIndex: 'status', statusModule: 'box', width: 100 },
  ],
  formFields: [
    { key: 'product_id', label: '关联产品', type: 'select', options: [] as any[], placeholder: '请选择产品', onChange: handleProductChange, help: '选择产品后会自动带出批次号。' },
    { key: 'box_no', label: '箱码编号', disabled: true, placeholder: '保存后系统自动生成', help: '固定格式：QRB-全局编号，例如 QRB-1、QRB-2；编号中不含日期，创建后不可修改。' },
    { key: 'batch_no', label: '批次号', placeholder: '可选；选择产品或加码后可自动带出' },
    { key: 'box_capacity', label: '箱容量', type: 'number', required: true, quickOptions: ['6', '12', '24', '48'] },
    { key: 'box_spec', label: '箱规', quickOptions: ['6件/箱', '12件/箱', '24件/箱', '48件/箱'] },
    { key: 'box_type', label: '箱型', quickOptions: ['标准箱', '大箱', '样品箱', '周转箱'] },
    { key: 'company_name', label: '装箱公司', type: 'select', options: () => companyOptions.value, onChange: handleCompanyChange, help: '默认跟随产品所属公司，仅用于记录装箱单位和地点。' },
    { key: 'agent_id', label: '装箱代理商', type: 'select', options: () => agentOptions.value, onChange: handleAgentChange, help: '可选，仅用于记录装箱业务归属，不形成防伪码授权位置。' },
    { key: 'city_name', label: '装箱城市', type: 'select', options: (scope: any) => cityOptions(scope.province_name), allowCreate: true },
    { key: 'warehouse', label: '装箱仓库/地址', span: 24 },
    { key: 'distributor', label: '装箱单位/负责人' },
  ],
});
async function loadAgentOptions() {
  try { agentOptions.value = await agentsApi.select(); } catch { agentOptions.value = []; }
}
async function loadCompanyOptions() {
  try {
    const rows = await partnersApi.select({ party_type: 'company' });
    companyOptions.value = (Array.isArray(rows) ? rows : []).map((item: any) => {
      const value = String(item.party_name || item.company_name || item.manufacturer_name || '').trim();
      return { ...item, value, label: item.label || value };
    }).filter((item: any) => item.value);
  } catch {
    companyOptions.value = [];
  }
}
async function loadProductOptions() {
  try {
    const rows = await productsApi.select();
    productOptions.value = Array.isArray(rows) ? rows : [];
    for (const group of [config.filters, config.formFields]) {
      const field = group.find((item: any) => item.key === 'product_id');
      if (field) field.options = productOptions.value;
    }
  } catch {
    productOptions.value = [];
    // 产品下拉失败不影响主列表使用
  }
}
function clearQrcode() {
  if (qrcodeUrl.value) URL.revokeObjectURL(qrcodeUrl.value);
  qrcodeUrl.value = '';
  qrcodeLoading.value = false;
}
async function loadBoxQrcode(record: any) {
  clearQrcode();
  const boxIdOrCode = String(record?.id || record?.box_no || '').trim();
  if (!boxIdOrCode) return Message.warning('箱子缺少箱号/ID，无法生成二维码');
  qrcodeLoading.value = true;
  try {
    const blob = await boxApi.qrcodeBlob(boxIdOrCode) as Blob;
    qrcodeUrl.value = URL.createObjectURL(blob);
  } catch (error: any) {
    Message.error(error?.response?.status === 404
      ? '箱码二维码接口不存在，请同时更新并重启后端服务'
      : (error?.userMessage || error?.message || '箱码二维码生成失败，请确认登录状态和箱号'));
  } finally {
    qrcodeLoading.value = false;
  }
}
function openBoxQrcode(record: any) {
  activeBox.value = record;
  qrcodeVisible.value = true;
  loadBoxQrcode(record);
}
function openBatchQrcode(rows: any[]) {
  batchBoxes.value = Array.isArray(rows) ? [...rows] : [];
  if (!selectedBoxCodeRows.value.length) return Message.warning('请先勾选要下载的装箱码');
  batchQrVisible.value = true;
}
async function confirmBatchQrcode() {
  const codes = selectedBoxCodeRows.value.map((row) => row.code).filter(Boolean);
  if (!codes.length) return Message.warning('选中箱子缺少箱号/ID，无法生成二维码');
  exportingQr.value = true;
  try {
    await exportApi.boxQrcodeZip({ codes: codes.join(','), format: qrExportFormat.value });
    Message.success(`已打包下载 ${codes.length} 个装箱码二维码`);
    batchQrVisible.value = false;
  } catch (error: any) {
    Message.error(error?.response?.status === 404
      ? '箱码ZIP导出接口不存在，请同时更新并重启后端服务'
      : (error?.userMessage || error?.message || '箱码ZIP导出失败'));
  } finally {
    exportingQr.value = false;
  }
}

async function exportBoxesCsv(rows: any[]) {
  const codes = (Array.isArray(rows) ? rows : []).map((row: any) => String(row.box_no || row.id || '').trim()).filter(Boolean);
  await exportApi.boxesCsv(codes.length ? { codes: codes.join(',') } : undefined);
  Message.success(codes.length ? `已导出选中的 ${codes.length} 个箱码` : '已导出全部箱码');
}
function openAddCodes(record: any) { currentId.value = record.id; codesText.value = ''; submittingCodes.value = false; codesVisible.value = true; }
function cleanCodesText() { codesText.value = formatLines(codePreview.value.items); }
async function submitCodes() {
  if (submittingCodes.value) return;
  const preview = codePreview.value;
  const codes = preview.items.length ? preview.items : splitCodes(codesText.value);
  if (!codes.length) return Message.warning('请输入防伪码');
  codesText.value = formatLines(codes);
  submittingCodes.value = true;
  try {
    const res = await boxApi.addCodes(currentId.value!, codes);
    const parts = [`新增 ${res?.added ?? codes.length} 个`, `箱内共 ${res?.total ?? '-'} 个`];
    const duplicatedCount = Number(res?.duplicated?.length || preview.duplicated.length || 0);
    if (duplicatedCount) parts.push(`自动去重 ${duplicatedCount} 个`);
    if (res?.moved?.length) parts.push(`跨箱去重/迁移 ${res.moved.length} 个`);
    if (res?.missing?.length) parts.push(`无效 ${res.missing.length} 个`);
    if ((res?.added ?? 0) > 0) Message.success(parts.join('，'));
    else Message.warning(parts.join('，'));
    codesVisible.value = false;
    crudRef.value?.load();
  } finally {
    submittingCodes.value = false;
  }
}
async function seal(record: any) { await boxApi.seal(record.id); Message.success('封箱成功'); crudRef.value?.load(); }
onMounted(() => { void Promise.all([loadProductOptions(), loadAgentOptions(), loadCompanyOptions()]); });
</script>
<style scoped>
.qrcode-box { display: grid; place-items: center; gap: 14px; }
.qrcode-box img { width: 300px; height: auto; border: 1px solid #dbeafe; border-radius: 18px; padding: 12px; background: #fff; }
.box-code-detail { margin-top: 18px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 16px; background: #f8fafc; }
.box-code-preview-table { margin-top: 12px; }
.box-code-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.box-code-head strong { color: #102a43; font-size: 15px; }
</style>
