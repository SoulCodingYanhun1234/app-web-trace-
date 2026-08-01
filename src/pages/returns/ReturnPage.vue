<template>
  <CrudPage ref="crudRef" :config="config">
    <template #row-actions="{ record }">
      <el-button v-if="canManageReturn" text type="primary" size="small" @click="openRemark(record, 'accept')">受理</el-button>
      <el-button v-if="canCompleteReturn" text type="primary" size="small" @click="complete(record)">完成</el-button>
      <el-button v-if="canManageReturn" text type="danger" size="small" @click="openRemark(record, 'reject')">拒绝</el-button>
    </template>
  </CrudPage>
  <el-dialog v-model="remarkVisible" :title="remarkType === 'accept' ? '受理退货' : '拒绝退货'" append-to-body align-center :lock-scroll="true">
    <el-form :model="remarkForm" label-position="top">
      <el-form-item label="备注"><el-input v-model="remarkForm.remark" type="textarea" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="remarkVisible = false">取消</el-button>
      <el-button type="primary" @click="submitRemark">确定</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import CrudPage from '@/components/CrudPage.vue';
import { agentsApi, returnsApi, shipmentsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canManageReturn = computed(() => auth.hasPermission('return:manage'));
const canCompleteReturn = computed(() => auth.hasPermission('return:complete'));
const crudRef = ref(); const currentId = ref<number|string>(); const remarkType = ref<'accept'|'reject'>('accept'); const remarkVisible = ref(false); const remarkForm = reactive({ remark: '' });
const agentOptions = ref<any[]>([]);
const config = reactive({
  title: '退货管理', shortTitle: '退货单', api: returnsApi, detailApi: true, actionWidth: 260, scrollX: 1400,
  createPermission: 'return:manage', updatePermission: 'return:manage', deletePermission: 'return:manage',
  lowCode: {
    title: '退货低代码助手',
    description: '通过退货原因模板和批量粘贴防伪码，客服无需记忆退货类型和处理话术。',
    formTips: ['发货单号支持扫描发货二维码，系统会自动带出代理商和发货箱内全部防伪码。', '退货防伪码仍支持扫码枪继续补充或从 Excel 多行粘贴。', '选择模板后会自动填入退货类型和常用原因，可继续修改。'],
    steps: [
      { title: '扫描发货单', description: '扫码枪扫描发货单二维码或手动输入发货单号。' },
      { title: '自动取退货码', description: '系统从发货箱子里自动带出全部防伪码，可继续扫码补充。' },
      { title: '选择原因模板', description: '质量问题、物流破损、代理退库模板自动填充原因。' },
      { title: '受理/拒绝/完成', description: '列表中按实际处理结果点击操作按钮。' },
    ],
    presets: [
      { label: '质量问题退货', description: '产品质量/客户投诉。', values: { return_type: 1, return_reason: '客户反馈产品存在质量问题，申请退货处理。' } },
      { label: '物流破损退货', description: '运输破损、外箱异常。', values: { return_type: 2, return_reason: '物流运输导致外箱或商品破损，申请退货处理。' } },
      { label: '代理退库模板', description: '代理商库存调整。', values: { return_type: 3, return_reason: '代理商库存调整，申请退库处理。' } },
    ],
  },
  filters: [
    { key: 'agent_id', label: '代理商', type: 'select', options: [] as any[], placeholder: '请选择代理商' },
    { key: 'return_no', label: '退货单号', type: 'input' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.return) },
  ],
  columns: [
    { title: '退货单号', dataIndex: 'return_no', width: 170 },
    { title: '发货单号', dataIndex: 'shipment_no', width: 170 },
    { title: '代理商', dataIndex: 'agent_label', width: 220, render: (row:any) => row.agent_label || row.agent_name || row.agent_id || '-' },
    { title: '退货原因', dataIndex: 'return_reason', width: 190 },
    { title: '退货类型', dataIndex: 'return_type', width: 100 },
    { title: '状态', dataIndex: 'status', statusModule: 'return', width: 100 },
  ],
  formFields: [
    { key: 'shipment_no', label: '发货单号', type: 'scanner-input', required: true, span: 24, scannerTitle: '发货单号扫码录入', scannerDescription: '默认扫码枪模式。扫描发货单二维码或输入发货单号后，会自动带出发货单ID、代理商名称和该发货箱内全部防伪码。', scannerDefaultMode: 'scanner' as const, placeholder: '扫描发货单二维码，或手动输入发货单号后点击确认扫码', onScan: hydrateReturnFromShipmentScan },
    { key: 'shipment_id', label: '发货单ID（自动）', type: 'number', disabled: true, help: '扫描发货单号后自动填充，也可由后端按发货单号兜底匹配。' },
    { key: 'agent_id', label: '代理商', type: 'select', required: true, options: [] as any[], placeholder: '请选择代理商', onChange: fillAgentNameById },
    { key: 'agent_name', label: '代理商名称', disabled: true, help: '选择代理商后自动获得名称；扫描发货单时优先取发货单代理商。' },
    { key: 'return_type', label: '退货类型', type: 'number' },
    { key: 'return_codes', label: '退货防伪码', type: 'scanner-array', span: 24, scannerTitle: '退货防伪码', scannerDescription: '扫描发货单后会自动写入该发货箱子里的全部防伪码；仍可继续扫码补充或手动粘贴。', scannerDefaultMode: 'scanner' as const, placeholder: '自动带出发货箱内所有防伪码；也可继续扫码/粘贴', help: '默认自动从发货箱子取码；支持扫码枪、换行、逗号、空格自动拆分和去重。' },
    { key: 'return_reason', label: '退货原因', type: 'textarea', span: 24, quickOptions: ['客户反馈质量问题。', '物流运输破损。', '代理商库存调整退库。', '订单信息填写错误。'] },
  ],
});
async function loadAgentOptions() {
  try {
    const rows = await agentsApi.select();
    agentOptions.value = Array.isArray(rows) ? rows : [];
    for (const group of [config.filters, config.formFields]) {
      const field = group.find((item: any) => item.key === 'agent_id');
      if (field) field.options = agentOptions.value;
    }
  } catch {
    // 代理商下拉失败不影响主功能
  }
}

function fillAgentNameById(value: any, form: Record<string, any>) {
  const option = agentOptions.value.find((item: any) => String(item.value) === String(value) || String(item.id) === String(value));
  if (option) form.agent_name = option.agent_name || option.label || '';
}

async function hydrateReturnFromShipmentScan(code: string, form: Record<string, any>) {
  const data = await shipmentsApi.resolveScan(code);
  const shipment = data?.shipment || data;
  if (!shipment?.id) {
    Message.warning('没有找到发货单，请确认二维码或发货单号是否正确');
    return;
  }
  form.shipment_id = shipment.id;
  form.shipment_no = shipment.shipment_no;
  form.agent_id = shipment.agent_id || data?.agent?.id || form.agent_id;
  form.agent_name = data?.agent?.agent_name || data?.agent_name || form.agent_name;
  const codes = Array.isArray(data?.codes) ? data.codes : [];
  if (codes.length) form.return_codes = codes.join('\n');
  Message.success(`已获取发货单 ${shipment.shipment_no || shipment.id}，自动填入 ${codes.length} 个退货防伪码`);
}
function openRemark(record: any, type: 'accept'|'reject') { currentId.value = record.id; remarkType.value = type; remarkForm.remark = ''; remarkVisible.value = true; }
async function submitRemark() { if (remarkType.value === 'accept') await returnsApi.accept(currentId.value!, remarkForm.remark); else await returnsApi.reject(currentId.value!, remarkForm.remark); Message.success('操作成功'); remarkVisible.value=false; crudRef.value?.load(); }
async function complete(record: any) { await returnsApi.complete(record.id); Message.success('退货已完成'); crudRef.value?.load(); }
onMounted(loadAgentOptions);
</script>
