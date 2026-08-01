<template>
  <IosPage class="scanner-page">
    <IosPageHero eyebrow="Scanner Business Workbench" title="扫码业务台" description="兼容 USB 扫码枪键盘模式、PDA 手输、二维码 URL 和批量粘贴。扫码业务聚焦四件事：分类装箱、一箱一码绑定、扫码溯源、扫码发货。">
      <template #actions>
        <el-button @click="router.push('/scanner-guide')"><template #icon><AppIcon name="message" /></template>扫描枪教程</el-button>
        <el-button v-if="canOpenProductRegion" @click="router.push('/product-regions')"><template #icon><AppIcon name="region" /></template>地区分类</el-button>
        <el-button @click="loadWorkflows"><template #icon><AppIcon name="refresh" /></template>刷新动作</el-button>
      </template>
    </IosPageHero>

    <el-alert v-if="settings.scanner_enabled === false" class="scanner-alert" type="warning" show-icon :closable="false" title="扫码业务台已被系统参数关闭，请到“面板设置 / business_workflow”开启 scanner_enabled。" />

    <div class="scanner-layout">
      <el-card class="glass-card workflow-card" shadow="never">
        <template #header><div class="card-title">扫码业务：分类装箱 / 一箱一码绑定 / 溯源 / 发货</div></template>
        <el-form label-position="top">
          <el-form-item label="选择业务">
            <el-select v-model="workflow" filterable style="width: 100%" placeholder="选择扫码业务">
              <el-option v-for="item in visibleWorkflows" :key="item.value" :label="item.label" :value="item.value">
                <div class="workflow-option"><strong>{{ item.label }}</strong><small>{{ item.desc }}</small></div>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item v-if="activeWorkflow?.targetLabel" :label="activeWorkflow.targetLabel">
            <el-input v-model="targetId" :placeholder="targetPlaceholder" clearable />
          </el-form-item>
          <el-form-item v-if="workflow === 'shipment_shipping' && batchMode" label="被发货代理商">
            <el-select v-model="payload.agent_id" filterable clearable style="width: 100%" placeholder="选择 A 代理商；不选则需填写发货单ID/单号">
              <el-option v-for="agent in agentOptions" :key="agent.value" :label="agent.label" :value="agent.value" />
            </el-select>
            <div class="form-tip">批量扫箱码后点击执行，系统会自动创建一张发货单；该代理商仅用于收货与责任归属。</div>
          </el-form-item>
          <el-form-item v-if="workflow === 'shipment_shipping' && batchMode && !targetId" label="发货位置（防伪码授权位置）">
            <el-input v-model="payload.sender_address" placeholder="例如：广东省广州市天河区××路 88 号" clearable />
            <div class="form-tip">批量新建发货单时必填。所有关联防伪码均以该发货位置作为唯一授权位置，不能填写“公司仓库”等无省市简称。</div>
          </el-form-item>
          <el-form-item v-if="workflow === 'shipment_shipping' && batchMode" label="归属地区">
            <el-select v-model="payload.region_id" filterable clearable style="width: 100%" placeholder="选择地区分类；可和代理商一起归属">
              <el-option v-for="region in regionOptions" :key="region.value" :label="region.label" :value="region.value" />
            </el-select>
            <div class="form-tip">批量扫箱码后，可以同时选择代理商和地区，系统会把本批发货单备注为所选地区。</div>
          </el-form-item>
          <el-form-item label="执行模式">
            <el-radio-group v-model="batchMode">
              <el-radio-button :value="false">单扫即执行</el-radio-button>
              <el-radio-button :value="true">批量/连续扫描</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="workflow === 'classification_boxing'" label="自动建箱容量"><el-input-number v-model="payload.box_capacity" :min="0" :max="99999" style="width: 100%" placeholder="0 表示不限容量" /></el-form-item>
          <el-form-item v-if="workflow === 'classification_boxing'" label="箱规/备注"><el-input v-model="payload.box_spec" placeholder="可选，例如：20瓶/箱" /></el-form-item>
          <el-form-item v-if="workflow === 'box_code_binding'" label="每箱产品小码数">
            <el-input-number v-model="payload.expected_count" :min="0" style="width: 100%" />
            <div class="form-tip">填 0 表示无上限：先连续扫任意数量产品小码，完成后再扫已生成的装箱二维码，系统识别到箱码后会自动关联。</div>
          </el-form-item>
          <el-form-item v-if="workflow === 'box_code_binding'" label="箱规/备注"><el-input v-model="payload.box_spec" placeholder="可选，例如：10瓶/箱" /></el-form-item>
          <el-form-item v-if="workflow === 'shipment_shipping'" label="物流公司"><el-input v-model="payload.logistics_company" placeholder="可选，例如：顺丰快递" /></el-form-item>
          <el-form-item v-if="workflow === 'shipment_shipping'" label="物流单号"><el-input v-model="payload.logistics_no" placeholder="可选，扫描发货单后一起保存" /></el-form-item>
        </el-form>
        <el-alert type="info" :closable="false" show-icon>{{ activeWorkflow?.desc || '选择扫码业务后，扫码即可自动识别并执行。' }}</el-alert>
      </el-card>

      <div class="scanner-main">
        <ScannerInput
          v-model="batchCodes"
          title="扫码枪工作区"
          :description="scannerDescription"
          :placeholder="scannerPlaceholder"
          :active="settings.scanner_enabled !== false"
          :global="settings.scanner_global_listen !== false"
          :multiple="batchMode"
          :min-length="settings.scanner_min_length || 3"
          :max-interval="settings.scanner_interval_ms || 80"
          :submit-key="settings.scanner_submit_key || 'enter_tab'"
          @scan="handleScan"
        />

        <el-card v-if="batchMode" class="glass-card batch-card" shadow="never">
          <template #header>
            <div class="batch-head"><div class="card-title">批量执行</div><el-tag>{{ batchItems.length }} 条</el-tag></div>
          </template>
          <div v-if="workflow === 'box_code_binding'" class="box-bind-progress">
            <el-progress :percentage="boxBindProgress" :status="boxBindReady ? 'success' : undefined" />
            <div class="muted">{{ boxBindStatusText }}</div>
          </div>
          <div class="batch-actions">
            <el-button type="primary" :disabled="!batchItems.length || loading || (workflow === 'box_code_binding' && !boxBindReady && !targetId)" @click="runBatch">{{ runBatchText }}</el-button>
            <el-button :disabled="!batchItems.length" @click="batchCodes = ''">清空批次</el-button>
          </div>
          <el-alert type="success" :closable="false" show-icon>{{ batchHelpText }}</el-alert>
        </el-card>

        <el-card class="glass-card result-card" shadow="never" v-loading="loading">
          <template #header><div class="card-title">最近一次识别结果</div></template>
          <el-empty v-if="!lastResult" description="等待扫码" :image-size="92" />
          <template v-else>
            <div class="scan-result-head">
              <div><div class="scan-code">{{ lastResult.code }}</div><div class="muted">类型：{{ typeText(lastResult.type) }}</div></div>
              <el-tag :type="lastResult.found ? 'success' : 'warning'">{{ lastResult.found ? '已匹配业务数据' : '未匹配数据' }}</el-tag>
            </div>
            <DetailDescriptions :data="detailItems" :column="1" />
            <div v-if="flowChain.length" class="flow-chain">
              <div class="flow-title">业务链路：地区分类 → 溯源 → 装箱 → 发货</div>
              <el-steps direction="vertical" :active="flowChain.length" finish-status="success">
                <el-step v-for="step in flowChain" :key="step.key" :title="step.label" :description="flowDesc(step)" />
              </el-steps>
              <el-alert class="next-action" type="success" :closable="false" show-icon>下一步：{{ currentFlow?.next_action || '按业务动作继续扫码' }}</el-alert>
            </div>
            <div v-if="lastResult.suggestions?.length" class="suggestion-bar">
              <span class="muted">建议动作：</span>
              <el-tag v-for="item in lastResult.suggestions" :key="item.value" class="quick-option-tag" @click="workflow = item.value">{{ item.label }}</el-tag>
            </div>
          </template>
        </el-card>
      </div>

      <el-card class="glass-card history-card" shadow="never">
        <template #header><div class="history-head"><div class="card-title">扫码记录</div><el-button text type="primary" @click="history = []">清空</el-button></div></template>
        <el-timeline v-if="history.length">
          <el-timeline-item v-for="item in history" :key="item.id" :timestamp="item.time" :type="item.ok ? 'success' : 'danger'">
            <div class="history-title">{{ item.code }}</div>
            <div class="muted">{{ item.message }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无记录" :image-size="80" />
      </el-card>
    </div>
  </IosPage>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import DetailDescriptions from '@/components/DetailDescriptions.vue';
import ScannerInput from '@/components/ScannerInput.vue';
import { IosPage, IosPageHero } from '@/components/ios27';
import { agentsApi, productRegionsApi, scannerApi, systemApi } from '@/api/resources';
import { displayValue, fmtTime } from '@/utils/format';
import { splitScannedCodes } from '@/utils/scanner';
import { useAuthStore } from '@/stores/auth';

type Workflow = { value: string; label: string; desc: string; needTarget?: boolean; targetLabel?: string; targetPlaceholder?: string };

const router = useRouter();
const auth = useAuthStore();
const workflow = ref('traceability');
const targetId = ref('');
const loading = ref(false);
const batchMode = ref(false);
const batchCodes = ref('');
const lastResult = ref<any>(null);
const workflows = ref<Workflow[]>([]);
const settings = reactive<any>({ scanner_enabled: true, scanner_global_listen: true, scanner_min_length: 3, scanner_interval_ms: 80, scanner_submit_key: 'enter_tab', enabled_workflows: [] });
const payload = reactive<any>({ logistics_company: '', logistics_no: '', sender_address: '', box_capacity: 0, expected_count: 0, box_spec: '', agent_id: undefined, region_id: undefined });
const history = ref<any[]>([]);
const agentOptions = ref<Array<{ label: string; value: number; agent_name?: string; agent_code?: string }>>([]);
const regionOptions = ref<Array<{ label: string; value: number; region_group?: string; province_name?: string; city_name?: string; product_name?: string; product_code?: string }>>([]);
let autoBindingSubmitting = false;
let boxBindResolveSeq = 0;
const boxBindLastResolved = ref<{ code: string; type?: string; found?: boolean; message?: string; resolving?: boolean } | null>(null);

const canOpenProductRegion = computed(() => auth.canAccess({ permission: 'product-region:view', module: 'product-region' }));

const workflowAliases: Record<string, string> = { code_query: 'traceability', code_activate: 'traceability', code_lock: 'traceability', code_unlock: 'traceability', code_cancel: 'traceability', box_add_code: 'classification_boxing', box_code_binding: 'box_code_binding', box_bind_codes: 'box_code_binding', carton_bind: 'box_code_binding', box_seal: 'classification_boxing', shipment_add_box: 'shipment_shipping', shipment_ship: 'shipment_shipping', return_add_code: 'traceability' };
const visibleWorkflows = computed(() => {
  const raw = Array.isArray(settings.enabled_workflows) ? settings.enabled_workflows : [];
  const enabled = Array.from(new Set(raw.map((item: any) => workflowAliases[String(item)] || String(item))));
  if (enabled.length && workflows.value.some((item) => item.value === 'box_code_binding') && !enabled.includes('box_code_binding')) enabled.push('box_code_binding');
  const filtered = enabled.length ? workflows.value.filter((item) => enabled.includes(item.value)) : workflows.value;
  return filtered.length ? filtered : workflows.value;
});
const activeWorkflow = computed(() => visibleWorkflows.value.find((item) => item.value === workflow.value));
const targetPlaceholder = computed(() => activeWorkflow.value?.targetPlaceholder || (activeWorkflow.value?.targetLabel ? `请输入${activeWorkflow.value.targetLabel}` : '可为空，优先按扫码内容识别')); 
const batchItems = computed(() => splitScannedCodes(batchCodes.value));
const boxBindExpected = computed(() => {
  const count = Number(payload.expected_count ?? 0);
  return Number.isInteger(count) && count >= 0 ? count : 0;
});
const boxBindExpectedLabel = computed(() => boxBindExpected.value || '不限');
const boxBindCurrentLastCode = computed(() => workflow.value === 'box_code_binding' ? (batchItems.value[batchItems.value.length - 1] || '') : '');
const boxBindLastIsResolvedBox = computed(() => Boolean(boxBindCurrentLastCode.value && boxBindLastResolved.value?.code === boxBindCurrentLastCode.value && boxBindLastResolved.value?.type === 'box'));
const boxBindSmallScanned = computed(() => {
  if (workflow.value !== 'box_code_binding') return 0;
  if (targetId.value) return batchItems.value.length;
  const count = boxBindLastIsResolvedBox.value ? batchItems.value.length - 1 : batchItems.value.length;
  return Math.max(count, 0);
});
const boxBindBoxCode = computed(() => {
  if (workflow.value !== 'box_code_binding') return '';
  if (targetId.value) return targetId.value;
  return boxBindLastIsResolvedBox.value ? boxBindCurrentLastCode.value : '';
});
const boxBindReady = computed(() => {
  if (workflow.value !== 'box_code_binding' || !batchMode.value) return false;
  if (targetId.value) return batchItems.value.length > 0;
  if (!boxBindLastIsResolvedBox.value) return false;
  const expected = boxBindExpected.value;
  return expected > 0 ? boxBindSmallScanned.value === expected : boxBindSmallScanned.value >= 1;
});
const boxBindStatusText = computed(() => {
  if (workflow.value !== 'box_code_binding') return '';
  if (targetId.value) return `目标箱码/大码：${targetId.value}；已扫产品小码 ${boxBindSmallScanned.value} 个`;
  if (!batchItems.value.length) return '请先连续扫描产品小码，最后扫描已生成的装箱二维码。';
  const last = boxBindLastResolved.value;
  if (last?.resolving && last.code === boxBindCurrentLastCode.value) return `正在识别最后一扫：${last.code}`;
  if (boxBindLastIsResolvedBox.value) {
    const countTip = boxBindExpected.value > 0 ? `${boxBindSmallScanned.value} / ${boxBindExpected.value}` : `${boxBindSmallScanned.value} / 不限`;
    return `已识别箱码/大码：${boxBindBoxCode.value}；产品小码 ${countTip}，将自动关联。`;
  }
  if (last?.code === boxBindCurrentLastCode.value && last.type && last.type !== 'box') {
    return `最后一扫仍是${typeText(last.type)}：${last.code}；继续扫产品小码，完成后再扫已生成的装箱二维码。`;
  }
  return `已扫产品小码 ${boxBindSmallScanned.value} / ${boxBindExpectedLabel.value}；箱码/大码：等待最后一扫`;
});
const boxBindProgress = computed(() => {
  if (workflow.value !== 'box_code_binding') return 0;
  if (boxBindExpected.value <= 0) return boxBindReady.value ? 100 : 0;
  const expected = Math.max(boxBindExpected.value, 1);
  const scanned = Math.min(boxBindSmallScanned.value, expected);
  const withBox = boxBindReady.value ? 1 : 0;
  return Math.min(100, Math.round(((scanned + withBox) / (expected + 1)) * 100));
});
const scannerDescription = computed(() => workflow.value === 'box_code_binding'
  ? '一箱一码：先连续扫产品小码ID，完成后再扫箱码ID；识别到箱码后自动关联。'
  : '扫码枪通常会像键盘一样快速输入并以回车结束；业务字段只保存码值/ID，历史链接会自动提取码值。');
const scannerPlaceholder = computed(() => workflow.value === 'box_code_binding'
  ? (boxBindExpected.value > 0 ? `先扫 ${boxBindExpected.value} 个产品小码ID，最后扫箱码ID` : '连续扫产品小码ID无上限，完成后再扫箱码ID')
  : '分类装箱扫防伪码ID；溯源扫防伪码ID/溯源号；发货扫箱号/发货单号');
const runBatchText = computed(() => workflow.value === 'box_code_binding' ? '手动关联当前箱码' : '执行当前批次');
const batchHelpText = computed(() => workflow.value === 'box_code_binding'
  ? '一箱一码模式会自动去重并校验：先扫产品小码ID，最后扫箱码ID；产品小码必须存在且不能重复绑定到其他箱。'
  : '连续扫码时会自动去重；确认目标 ID 和业务动作无误后再批量提交。');
const currentFlow = computed(() => lastResult.value?.flow || lastResult.value);
const flowChain = computed(() => Array.isArray(currentFlow.value?.chain) ? currentFlow.value.chain : []);
const detailItems = computed(() => {
  const data = lastResult.value;
  if (!data) return [];
  return [
    { label: '扫码内容', value: data.input || data.code },
    { label: '识别码', value: data.code },
    { label: '识别类型', value: typeText(data.type) },
    { label: '产品', value: data.product ? `${data.product.product_name || '-'}（ID：${data.product.id}）` : '-' },
    { label: '地区分类', value: data.region?.region_group || currentFlow.value?.region?.region_group || data.region_scan?.region_group || '-' },
    { label: '码值地区', value: data.region_scan?.province_name ? `${data.region_scan.province_name}${data.region_scan.city_name ? ' / ' + data.region_scan.city_name : ''}` : '-' },
    { label: '防伪码状态', value: data.anti_fake_code ? statusText(data.anti_fake_code.status) : '-' },
    { label: '箱号', value: currentFlow.value?.box?.box_no || data.box?.box_no || '-' },
    { label: '发货单', value: currentFlow.value?.shipment?.shipment_no || data.shipment?.shipment_no || '-' },
    { label: '退货单', value: data.return_order?.return_no || '-' },
    { label: '溯源编号', value: data.trace?.trace_no || '-' },
    { label: '执行动作', value: data.action || '-' },
    { label: '执行消息', value: data.message || '-' },
  ].map((item) => ({ ...item, value: displayValue(item.value) }));
});

function typeText(type?: string) {
  const map: Record<string, string> = { anti_fake_code: '防伪码', product_region: '产品地区', box: '箱号/箱子', shipment: '发货单', return_order: '退货单', trace: '溯源记录', unknown: '未知码' };
  return map[String(type || '')] || '-';
}
function statusText(status: any) { const map: Record<number, string> = { 0: '未激活', 1: '已激活', 2: '已锁定', 3: '已注销', 4: '已查询' }; return map[Number(status)] || String(status ?? '-'); }
function flowDesc(step: any) {
  return [step.region_group, step.trace_no, step.box_no, step.shipment_no, step.logistics_no, step.code_count ? `数量 ${step.code_count}` : ''].filter(Boolean).join(' ｜ ') || '已关联';
}
function pushHistory(code: string, ok: boolean, message: string) { history.value.unshift({ id: `${Date.now()}-${Math.random()}`, time: fmtTime(new Date().toISOString()), code, ok, message }); history.value = history.value.slice(0, 60); }

async function loadWorkflows() {
  try {
    workflows.value = await scannerApi.workflows();
    if (!visibleWorkflows.value.some((item) => item.value === workflow.value)) workflow.value = visibleWorkflows.value[0]?.value || 'traceability';
  } catch {
    workflows.value = [
      { value: 'classification_boxing', label: '分类装箱', desc: '扫描单品防伪码，系统按产品、批次、地区自动归类装箱。' },
      { value: 'box_code_binding', label: '一箱一码绑定', desc: '先在装箱管理生成大码，再扫产品小码，完成后扫大码，自动完成大小码关联。' },
      { value: 'traceability', label: '扫码溯源', desc: '扫描防伪码或溯源编号，快速查看地区与溯源链路。' },
      { value: 'shipment_shipping', label: '扫码发货', desc: '扫描箱号加入发货单，扫描发货单号确认发货。' },
    ];
  }
}

async function loadAgents() {
  try {
    const rows = await agentsApi.select();
    agentOptions.value = Array.isArray(rows) ? rows : [];
  } catch {
    agentOptions.value = [];
  }
}

async function loadRegions() {
  try {
    const res = await productRegionsApi.list({ page: 1, pageSize: 1000 });
    const rows = Array.isArray(res?.list) ? res.list : Array.isArray(res) ? res : [];
    regionOptions.value = rows
      .filter((row: any) => Number(row.status ?? 1) === 1)
      .map((row: any) => {
        const regionText = row.region_group || [row.province_name, row.city_name].filter(Boolean).join(' / ') || '未命名地区';
        const productText = row.product_name || row.product_code ? `｜${row.product_name || '-'}${row.product_code ? `(${row.product_code})` : ''}` : '';
        return {
          label: `${regionText}${productText}`,
          value: Number(row.id),
          ...row,
        };
      })
      .filter((row: any) => Number.isInteger(row.value) && row.value > 0);
  } catch {
    regionOptions.value = [];
  }
}

async function loadSettings() {
  try {
    const rows = await systemApi.params('business_workflow');
    const list = Array.isArray(rows) ? rows : rows?.list || [];
    for (const row of list) settings[row.param_key || row.key] = row.param_value ?? row.value;
  } catch {
    // 使用默认扫码参数。
  }
}

function validateBeforeExecute() {
  if (settings.scanner_enabled === false) { Message.warning('扫码功能已关闭'); return false; }
  if (activeWorkflow.value?.needTarget && !targetId.value) { Message.warning(`请先填写${activeWorkflow.value.targetLabel}`); return false; }
  if (workflow.value === 'box_code_binding') {
    if (!batchMode.value) { Message.warning('一箱一码绑定请使用批量/连续扫描模式'); return false; }
    if (!boxBindReady.value) {
      const tip = boxBindExpected.value > 0
        ? `请先扫 ${boxBindExpected.value} 个产品小码ID，再扫箱码ID/大码ID`
        : '请先扫描产品小码ID，完成后再扫描箱码ID/大码ID，系统会自动关联';
      Message.warning(tip);
      return false;
    }
  }
  if (workflow.value === 'shipment_shipping' && batchMode.value && !targetId.value && !payload.agent_id && !payload.region_id) { Message.warning('批量发货请先选择被发货代理商/归属地区，或填写发货单ID/单号'); return false; }
  if (workflow.value === 'shipment_shipping' && batchMode.value && !targetId.value && !String(payload.sender_address || '').trim()) { Message.warning('批量新建发货单请填写完整发货位置；该位置是防伪码授权位置'); return false; }
  return true;
}

async function handleScan(code: string) {
  if (batchMode.value) {
    if (workflow.value === 'box_code_binding') await handleBoxBindingBatchScan(code);
    return;
  }
  if (!validateBeforeExecute()) return;
  loading.value = true;
  try {
    const data = await scannerApi.execute({ workflow: workflow.value, code, target_id: targetId.value || undefined, payload: { ...payload } });
    lastResult.value = data;
    const message = data?.message || `${activeWorkflow.value?.label || '扫码业务'}执行成功`;
    Message.success(message);
    pushHistory(code, true, message);
  } catch (error: any) { pushHistory(code, false, error?.message || '扫码业务执行失败'); }
  finally { loading.value = false; }
}

async function handleBoxBindingBatchScan(code: string) {
  await nextTick();
  const items = batchItems.value;
  const lastCode = items[items.length - 1];
  if (!lastCode || lastCode !== code || targetId.value) return;

  const seq = ++boxBindResolveSeq;
  boxBindLastResolved.value = { code, resolving: true };
  try {
    const data = await scannerApi.resolve(code);
    if (seq !== boxBindResolveSeq || boxBindCurrentLastCode.value !== code || workflow.value !== 'box_code_binding') return;
    boxBindLastResolved.value = { code, type: data?.type, found: data?.found, message: data?.message, resolving: false };

    if (data?.type === 'box') {
      if (boxBindReady.value) {
        await runBatch();
      } else if (boxBindExpected.value > 0) {
        Message.warning(`已扫到箱码，但产品小码数量为 ${boxBindSmallScanned.value}，应为 ${boxBindExpected.value}；请检查是否漏扫或多扫`);
      }
      return;
    }

    if (data?.type === 'anti_fake_code') {
      pushHistory(code, true, `已扫产品小码ID ${boxBindSmallScanned.value} 个，继续扫小码ID；完成后再扫箱码ID`);
    } else if (items.length > 1) {
      pushHistory(code, false, '最后一扫未识别为箱码ID，暂不关联');
    }
  } catch (error: any) {
    if (seq !== boxBindResolveSeq || boxBindCurrentLastCode.value !== code) return;
    boxBindLastResolved.value = { code, type: 'unknown', found: false, message: error?.message || '识别失败', resolving: false };
    pushHistory(code, false, error?.message || '扫码识别失败');
  }
}

async function runBatch() {
  if (!validateBeforeExecute()) return;
  if (!batchItems.value.length) { Message.warning('请先扫描或粘贴批量内容'); return; }
  loading.value = true;
  try {
    const requestPayload = workflow.value === 'box_code_binding' ? { ...payload, require_existing_box: true } : { ...payload };
    const res = await scannerApi.batchExecute({ workflow: workflow.value, codes: batchItems.value, target_id: targetId.value || undefined, payload: requestPayload });
    if (res?.action === 'box_code_binding') {
      lastResult.value = res;
      pushHistory(res.code || boxBindBoxCode.value, true, res.message || '一箱一码绑定完成');
      Message.success(res.message || '一箱一码绑定完成');
      batchCodes.value = '';
      boxBindLastResolved.value = null;
      return;
    }
    const targetText = res.target?.shipment
      ? `，发货单 ${res.target.shipment.shipment_no || res.target.shipment.id} 已归属 ${[res.target.agent?.agent_name || res.target.agent?.agent_code, res.target.region?.region_group || res.target.region?.province_name].filter(Boolean).join(' / ') || '所选对象'}`
      : '';
    for (const item of res.results || []) pushHistory(item.code, item.ok, item.ok ? `批量执行成功${targetText}` : item.message || '批量执行失败');
    Message.success(`批量完成：成功 ${res.success} 条，失败 ${res.failed} 条${targetText}`);
    if (res.results?.[0]?.data) lastResult.value = res.results[0].data;
  } finally { loading.value = false; }
}


watch(visibleWorkflows, (list) => { if (list.length && !list.some((item) => item.value === workflow.value)) workflow.value = list[0].value; });
watch(workflow, (value) => {
  boxBindLastResolved.value = null;
  if (value === 'box_code_binding') {
    batchMode.value = true;
    if (payload.expected_count === undefined || payload.expected_count === null || payload.expected_count === '') payload.expected_count = 0;
  }
});
watch(batchCodes, () => {
  if (workflow.value !== 'box_code_binding') return;
  const lastCode = boxBindCurrentLastCode.value;
  if (!lastCode || boxBindLastResolved.value?.code !== lastCode) boxBindLastResolved.value = null;
});
watch(boxBindReady, async (ready) => {
  if (!ready || workflow.value !== 'box_code_binding' || targetId.value || loading.value || autoBindingSubmitting) return;
  autoBindingSubmitting = true;
  try { await runBatch(); }
  finally { autoBindingSubmitting = false; }
});
onMounted(async () => { await Promise.all([loadSettings(), loadWorkflows(), loadAgents(), loadRegions()]); });
</script>

<style scoped>
.scanner-alert { margin-bottom: 14px; }
.scanner-layout { display: grid; grid-template-columns: 310px minmax(0, 1fr) 330px; gap: 18px; align-items: start; }
.workflow-card, .result-card, .history-card, .batch-card { border-radius: 22px; border: 1px solid rgba(207, 224, 255, .86); box-shadow: var(--shadow-soft); }
.card-title { font-weight: 850; color: var(--text-1); }
.workflow-option { display: flex; flex-direction: column; gap: 2px; }
.workflow-option small { color: var(--text-3); font-size: 12px; }
.form-tip { width: 100%; margin-top: 7px; color: var(--text-3); font-size: 12px; line-height: 1.5; }
.scanner-main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.scan-result-head, .batch-head, .history-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.scan-code { font-size: 22px; font-weight: 900; color: var(--primary); word-break: break-all; }
.suggestion-bar, .batch-actions { margin-top: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.box-bind-progress { margin: 4px 0 12px; display: flex; flex-direction: column; gap: 6px; }
.flow-chain { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-color); }
.flow-title { font-weight: 850; margin-bottom: 12px; color: var(--text-1); }
.next-action { margin-top: 10px; }
.history-title { font-weight: 800; color: var(--text-1); word-break: break-all; }
:deep(.scanner-card) { background: var(--card-bg); border-color: var(--border-color); }
:deep(.scanner-card .scanner-title) { color: var(--text-1); }
:deep(.scanner-card .scanner-desc) { color: var(--text-3); }
@media (max-width: 1280px) { .scanner-layout { grid-template-columns: 1fr; } }
</style>

<style scoped>
/* Mobile scanner workbench layout hotfix. Keep the business card and scan form in the visible viewport without the white bottom mask. */
@media (max-width: 760px) {
  .scanner-page {
    padding-bottom: 0 !important;
  }

  .scanner-page .page-hero {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 16px !important;
  }

  .scanner-page .page-hero :deep(.el-space) {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  .scanner-page .page-hero :deep(.el-space__item),
  .scanner-page .page-hero :deep(.el-button) {
    width: 100% !important;
    margin: 0 !important;
  }

  .scanner-layout {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 14px !important;
    width: 100% !important;
  }

  .workflow-card,
  .result-card,
  .history-card,
  .batch-card {
    width: 100% !important;
    min-width: 0 !important;
    border-radius: 22px !important;
    overflow: hidden !important;
  }

  .scanner-main {
    width: 100% !important;
    min-width: 0 !important;
    gap: 14px !important;
  }

  .card-title {
    font-size: 18px !important;
    line-height: 1.45 !important;
  }

  .workflow-card :deep(.el-form-item__label) {
    font-size: 14px !important;
    line-height: 1.3 !important;
    margin-bottom: 8px !important;
  }

  .workflow-card :deep(.el-radio-group) {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  .workflow-card :deep(.el-radio-button) {
    width: 100% !important;
  }

  .workflow-card :deep(.el-radio-button__inner) {
    width: 100% !important;
    border-radius: 14px !important;
    border-left: var(--el-border) !important;
    min-height: 42px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    white-space: normal !important;
    line-height: 1.25 !important;
  }

  .batch-actions,
  .suggestion-bar {
    display: grid !important;
    grid-template-columns: 1fr !important;
    align-items: stretch !important;
  }

  .batch-actions .el-button,
  .suggestion-bar .el-button {
    width: 100% !important;
    margin-left: 0 !important;
  }

  .scan-code {
    font-size: 18px !important;
  }
}

@media (max-width: 520px) {
  .scanner-page .page-hero {
    padding: 24px 26px !important;
    min-height: auto !important;
  }

  .scanner-page .page-title {
    font-size: 30px !important;
  }

  .scanner-page .page-desc {
    font-size: 17px !important;
    line-height: 1.75 !important;
  }

  .scanner-page .page-hero :deep(.el-space) {
    grid-template-columns: 1fr 1fr !important;
  }

  .scanner-page .page-hero :deep(.el-button) {
    min-height: 52px !important;
    border-radius: 15px !important;
    font-size: 16px !important;
    font-weight: 850 !important;
  }

  .workflow-card,
  .result-card,
  .history-card,
  .batch-card {
    border-radius: 22px !important;
  }
}

</style>
