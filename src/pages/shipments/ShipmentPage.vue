<template>
  <AiTraceAutomationPanel v-if="AI_FEATURE_ENABLED" module-key="shipment" compact @completed="crudRef?.load()" />
  <CrudPage ref="crudRef" :config="config">
    <template #row-actions="{ record }">
      <el-button v-if="canManageShipment" text type="primary" size="small" @click="openAction(record, 'ship')">发货</el-button>
      <el-button text type="primary" size="small" @click="openShipmentQr(record)">二维码</el-button>
      <el-button v-if="canManageShipment" text type="primary" size="small" @click="openAction(record, 'logistics')">改物流</el-button>
      <el-button v-if="canManageShipment" text type="primary" size="small" @click="receive(record)">签收</el-button>
      <el-button v-if="canManageShipment" text type="danger" size="small" @click="openAction(record, 'exception')">异常</el-button>
    </template>
  </CrudPage>
  <el-dialog v-model="actionVisible" :title="actionTitle" destroy-on-close append-to-body align-center :lock-scroll="true">
    <el-form :model="actionForm" label-position="top">
      <template v-if="actionType === 'ship' || actionType === 'logistics'">
        <el-form-item label="物流公司">
          <el-input v-model="actionForm.logistics_company" placeholder="如：顺丰快递" />
          <div class="field-quick-options"><span class="muted">常用物流：</span><el-tag v-for="item in logisticsOptions" :key="item" class="quick-option-tag" @click="actionForm.logistics_company=item">{{ item }}</el-tag></div>
        </el-form-item>
        <el-form-item label="物流单号"><el-input v-model="actionForm.logistics_no" placeholder="请输入物流单号" /></el-form-item>
      </template>
      <el-form-item v-if="actionType === 'exception'" label="异常备注"><el-input v-model="actionForm.remark" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="actionVisible = false">取消</el-button>
      <el-button type="primary" @click="submitAction">确定</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="qrVisible" title="发货单二维码" width="420px" append-to-body align-center :lock-scroll="true" @closed="revokeShipmentQr">
    <div class="shipment-qr-dialog" v-loading="qrLoading">
      <div class="shipment-qr-title">{{ qrRecord?.shipment_no || '-' }}</div>
      <img v-if="qrUrl" :src="qrUrl" alt="发货单二维码" class="shipment-qr-image" />
      <div class="shipment-qr-tip">扫码内容为发货单号，可用于退货登记和扫码业务台快速识别。</div>
    </div>
    <template #footer>
      <el-button @click="qrVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import CrudPage from '@/components/CrudPage.vue';
import AiTraceAutomationPanel from '@/components/AiTraceAutomationPanel.vue';
import { AI_FEATURE_ENABLED } from '@/config/features';
import { agentsApi, productsApi, shipmentsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { useAuthStore } from '@/stores/auth';
import { chinaRegionOptions } from '@/data/chinaRegionOptions';

const auth = useAuthStore();
const canManageShipment = computed(() => auth.hasPermission('shipment:manage'));
const crudRef = ref();
const currentId = ref<number|string>();
const actionType = ref<'ship'|'exception'|'logistics'>('ship');
const actionVisible = ref(false);
const actionForm = reactive<any>({});
const actionTitle = computed(() => ({ ship: '确认发货', logistics: '更新物流信息', exception: '标记异常' }[actionType.value]));
const logisticsOptions = ['顺丰快递', '京东物流', '中通快递', '圆通快递', '韵达快递', '德邦物流'];
const qrVisible = ref(false);
const qrLoading = ref(false);
const qrUrl = ref('');
const qrRecord = ref<any>(null);
const agentOptions = ref<any[]>([]);
const productOptions = ref<any[]>([]);
const productNameOptions = computed(() => {
  const map = new Map<string, any>();
  for (const item of productOptions.value) {
    const name = String(item.product_name || item.label || '').replace(/（.*?）$/u, '').trim();
    if (!name || map.has(name)) continue;
    map.set(name, { ...item, label: `${name}${item.batch_no ? `（${item.batch_no}）` : item.product_code ? `（${item.product_code}）` : ''}`, value: name });
  }
  return Array.from(map.values());
});

function agentAddress(agent: any) {
  const address = String(agent?.address || '').trim();
  const regionPrefix = Array.from(new Set([agent?.province, agent?.city, agent?.district]
    .map((item) => String(item || '').trim())
    .filter(Boolean)))
    .filter((item) => !address.includes(item))
    .join('');
  return `${regionPrefix}${address}`;
}
function findAgent(value: any) {
  return agentOptions.value.find((item) => String(item.value) === String(value) || String(item.id) === String(value));
}
function handleAgentChange(value: any, form: Record<string, any>) {
  const agent = findAgent(value);
  if (!agent) {
    form.receiver = undefined;
    form.receiver_phone = undefined;
    form.receiver_address = undefined;
    form.distributor = undefined;
    form.sender_region_path = [];
    form.sender_detail_address = undefined;
    return;
  }
  form.receiver = agent.agent_name || agent.agent_code;
  form.receiver_phone = agent.contact_phone || undefined;
  form.receiver_address = agentAddress(agent) || undefined;
  form.distributor = agent.agent_name || agent.agent_code;
  form.sender_region_path = [agent.province, agent.city, agent.district]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  form.sender_detail_address = String(agent.address || '').trim() || undefined;
}
function shipmentProductText(row: any) {
  return row.product_names || row.product_name || row.batch_no || '-';
}
function splitSenderAddress(value: unknown) {
  const address = String(value || '').trim();
  const province = chinaRegionOptions.find((item) => address.includes(item.value));
  const city = province?.children?.find((item) => address.includes(item.value));
  const district = city?.children?.find((item) => address.includes(item.value));
  const path = [province?.value, city?.value, district?.value].filter(Boolean) as string[];
  const regionText = Array.from(new Set(path)).join('');
  return { path, detail: regionText && address.startsWith(regionText) ? address.slice(regionText.length).trim() : address };
}
function senderRegionPath(record: Record<string, any>) {
  return splitSenderAddress(record.sender_address).path;
}
function senderDetailAddress(record: Record<string, any>) {
  return splitSenderAddress(record.sender_address).detail;
}
function autoFillAgentPayload(payload: Record<string, any>) {
  const senderRegionPath = Array.isArray(payload.sender_region_path)
    ? payload.sender_region_path.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const senderDetailAddress = String(payload.sender_detail_address || '').trim();
  const senderRegionText = Array.from(new Set(senderRegionPath)).join('');
  payload.sender_address = senderDetailAddress
    ? ((senderRegionText && senderDetailAddress.startsWith(senderRegionText)) ? senderDetailAddress : `${senderRegionText}${senderDetailAddress}`)
    : null;
  delete payload.sender_region_path;
  delete payload.sender_detail_address;
  return payload;
}

const config = reactive({
  title: '发货管理', shortTitle: '发货单', api: shipmentsApi, detailApi: true, actionWidth: 330, scrollX: 1700,
  summary: { totalLabel: '发货总数', totalUnit: '单', currentPageLabel: '本页发货' },
  createPermission: 'shipment:manage', updatePermission: 'shipment:manage', deletePermission: 'shipment:manage',
  beforeSave: autoFillAgentPayload,
  lowCode: {
    title: '发货低代码助手',
    description: '选择收件代理商后自动带出发货地区和详细位置，详细位置可以修改或留空；防伪码授权位置只取代理商所属地区。',
    formTips: ['发货地区自动取自代理商档案；发货详细位置会自动带出，也可以修改或清空。', '授权位置仅取代理商所属省、市、区县，不受发货详细位置是否填写影响。', '箱子ID必须是已经封箱的箱子，未封箱不能加入发货单。'],
    steps: [
      { title: '选择收件代理商', description: '从代理商下拉中选择收件人，系统自动带出联系电话并按代理商所属地区授权。' },
      { title: '确认发货位置', description: '系统自动带出所属地区和详细地址，详细位置可修改，也可以留空。' },
      { title: '确认箱子已封箱', description: '只有状态为已封箱的箱子才允许加入发货单。' },
      { title: '填写产品名称', description: '从产品下拉中选择本次发货产品，也可以手动输入产品名称。' },
      { title: '扫描/粘贴箱子ID', description: '默认扫码枪连续扫描箱码，也支持手动一行一个箱子ID。' },
      { title: '选择发货模板', description: '自动填充物流公司、发件人和常用备注。' },
      { title: '保存后发货', description: '列表中点击发货补物流单号，或点击二维码生成发货单扫码凭证。' },
    ],
    presets: [
      { label: '顺丰标准发货', description: '常用快递发货模板。', values: () => ({ logistics_company: '顺丰快递', sender: '仓库管理员', remark: '标准快递发货，请保持电话畅通。' }) },
      { label: '京东仓配发货', description: '仓配/大件模板。', values: () => ({ logistics_company: '京东物流', sender: '仓库管理员', remark: '仓配发货，签收前请核对箱数。' }) },
      { label: '同城配送模板', description: '适合同城门店补货。', values: () => ({ logistics_company: '同城配送', sender: '仓库管理员', remark: '同城配送，请确认收货时间。' }) },
    ],
  },
  filters: [
    { key: 'agent_id', label: '收件代理商', type: 'select', options: () => agentOptions.value, placeholder: '请选择收件代理商' },
    { key: 'shipment_no', label: '发货单号', type: 'input' },
    { key: 'batch_no', label: '产品名称', type: 'input', placeholder: '请输入产品名称' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.shipment) },
  ],
  columns: [
    { title: '发货单号', dataIndex: 'shipment_no', width: 170 },
    { title: '产品名称', dataIndex: 'product_names', width: 180, render: shipmentProductText },
    { title: '收件代理商', dataIndex: 'agent_label', width: 220, render: (row:any) => row.agent_label || row.distributor || row.receiver || row.agent_id || '-' },
    { title: '物流公司', dataIndex: 'logistics_company', width: 130 },
    { title: '物流单号', dataIndex: 'logistics_no', width: 150 },
    { title: '发件人', dataIndex: 'sender', width: 100 },
    { title: '发货位置', dataIndex: 'sender_address', width: 240 },
    { title: '授权位置（代理商所属地区）', dataIndex: 'authorization_address', width: 240, render: (row:any) => row.authorization_address || row.region_group || '-' },
    { title: '收件电话', dataIndex: 'receiver_phone', width: 135 },
    { title: '防伪码授权区域', dataIndex: 'region_group', width: 190, render: (row:any) => row.region_group || [row.province_name, row.city_name].filter(Boolean).join(' / ') || '代理商所属地区未配置' },
    { title: '状态', dataIndex: 'status', statusModule: 'shipment', width: 100 },
  ],
  formFields: [
    { key: 'agent_id', label: '收件人（代理商）', type: 'select', required: true, options: () => agentOptions.value, placeholder: '请选择收件代理商', onChange: handleAgentChange, help: '系统按所选代理商的所属地区生成授权位置，不使用代理商详细地址。' },
    { key: 'receiver_phone', label: '收件电话', disabled: true, placeholder: '选择代理商后自动带出' },
    { key: 'sender_region_path', label: '发货地区', type: 'cascader', required: true, disabled: true, options: chinaRegionOptions, valueGetter: senderRegionPath, cascaderProps: { emitPath: true, checkStrictly: true, expandTrigger: 'hover' }, placeholder: '选择代理商后自动带出', help: '自动取自代理商所属地区，仅用于发货记录。' },
    { key: 'sender_detail_address', label: '发货详细位置（可选）', valueGetter: senderDetailAddress, placeholder: '选择代理商后自动带出，也可修改或清空', help: '可留空发货；不会影响防伪码按代理商所属地区进行授权。' },
    { key: 'batch_no', label: '产品名称', type: 'select', required: true, options: () => productNameOptions.value, allowCreate: true, placeholder: '请选择或输入产品名称', help: '此处用于记录本次发货产品；兼容原字段，保存到原发货批次字段中。' },
    { key: 'box_ids', label: '箱子ID/箱号', type: 'scanner-array', required: true, span: 24, scannerTitle: '箱子ID扫码录入', scannerDescription: '手机端默认调用摄像头扫码，可连续扫描箱码/箱子ID；也可以切换为手动模式后从装箱列表复制多行粘贴。电脑端默认扫码枪模式。', scannerDefaultMode: 'scanner' as const, scannerMobileCamera: true, placeholder: '扫描箱码/箱子ID；手动模式支持多行，例如：\nQRB-1\nQRB-2', help: '只能添加已封箱的箱子；未封箱箱子会被后台拒绝。' },
    { key: 'logistics_company', label: '物流公司', quickOptions: ['顺丰快递', '京东物流', '中通快递', '同城配送'] },
    { key: 'logistics_no', label: '物流单号' },
    { key: 'sender', label: '发件人', quickOptions: ['仓库管理员', '客服部', '发货员'] },
    { key: 'remark', label: '备注', type: 'textarea', span: 24, quickOptions: ['请先验货再签收。', '如外箱破损请拒收并联系客服。', '标准发货，物流信息以系统为准。'] },
  ],
});

async function loadAgentOptions() {
  try {
    agentOptions.value = await agentsApi.select();
  } catch {
    agentOptions.value = [];
  }
}
async function loadProductOptions() {
  try {
    productOptions.value = await productsApi.select();
  } catch {
    productOptions.value = [];
  }
}

function openAction(record: any, type: 'ship'|'exception'|'logistics') {
  currentId.value = record.id;
  actionType.value = type;
  Object.keys(actionForm).forEach((k) => delete actionForm[k]);
  actionForm.logistics_company = record.logistics_company;
  actionForm.logistics_no = record.logistics_no;
  actionVisible.value = true;
}
function shipmentActionPayload() {
  return {
    logistics_company: actionForm.logistics_company,
    logistics_no: actionForm.logistics_no,
  };
}
async function submitAction() {
  if (actionType.value === 'exception') await shipmentsApi.exception(currentId.value!, actionForm.remark);
  else if (actionType.value === 'logistics') await shipmentsApi.updateLogistics(currentId.value!, shipmentActionPayload());
  else await shipmentsApi.ship(currentId.value!, shipmentActionPayload());
  Message.success('操作成功');
  actionVisible.value = false;
  crudRef.value?.load();
}
async function receive(record: any) {
  await shipmentsApi.receive(record.id);
  Message.success('签收成功');
  crudRef.value?.load();
}

function revokeShipmentQr() {
  if (qrUrl.value) URL.revokeObjectURL(qrUrl.value);
  qrUrl.value = '';
}

async function openShipmentQr(record: any) {
  qrRecord.value = record;
  qrVisible.value = true;
  qrLoading.value = true;
  revokeShipmentQr();
  try {
    const blob = await shipmentsApi.qrcodeBlob(record.id);
    qrUrl.value = URL.createObjectURL(blob);
  } finally {
    qrLoading.value = false;
  }
}

onMounted(() => { void loadAgentOptions(); void loadProductOptions(); });
onBeforeUnmount(revokeShipmentQr);
</script>
<style scoped>
.shipment-qr-dialog { text-align: center; min-height: 270px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.shipment-qr-title { font-size: 18px; font-weight: 900; color: var(--text-1); word-break: break-all; }
.shipment-qr-image { width: 260px; height: 260px; max-width: 100%; border-radius: 18px; border: 1px solid var(--line); box-shadow: var(--shadow-soft); background: #fff; padding: 10px; }
.shipment-qr-tip { color: var(--text-3); font-size: 13px; line-height: 1.6; }
</style>
