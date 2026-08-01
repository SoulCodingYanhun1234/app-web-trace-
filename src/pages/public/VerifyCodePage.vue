<template>
  <div class="verify-page" :style="pageStyle">
    <div class="verify-bg" />

    <main class="verify-shell">
      <section v-if="!result && heroImage" class="product-banner">
        <img :src="heroImage" alt="产品图片" @error="heroImageFailed = true" />
      </section>

      <section v-else-if="!result" class="brand-banner">
        <img v-if="settings.page_logo" :src="settings.page_logo" alt="logo" />
        <div>
          <strong>{{ settings.brand_name || settings.company_name || '防伪验证中心' }}</strong>
          <span>{{ settings.brand_slogan || '一物一码 · 正品可查 · 全程可溯' }}</span>
        </div>
      </section>

      <section v-if="verifyPageState === 'ready'" class="verify-entry-state" role="status">
        <span class="verify-entry-state__icon">✓</span>
        <div>
          <strong>请输入防伪码进行验证</strong>
          <p>扫码链接会自动带入防伪码；也可手动输入包装上的完整编码。</p>
        </div>
      </section>

      <ConfigSections v-if="!result && !urlCodeMode" :sections="sectionsBeforeForm" />

      <section v-if="shouldShowInputCard && !result && !loading" class="query-panel">
        <div class="section-title">
          <i />
          <h1>{{ settings.form_title || '输入防伪码' }}</h1>
        </div>
        <p class="query-subtitle">{{ settings.form_subtitle || '支持扫码链接自动填充' }}</p>
        <el-form label-position="top" @submit.prevent="doVerify">
          <el-form-item :label="settings.code_label || '防伪码'">
            <el-input v-model="form.code" size="large" clearable :placeholder="settings.code_placeholder || '请输入包装上的防伪码'" @keyup.enter="doVerify" />
          </el-form-item>
          <el-button class="verify-button" type="primary" size="large" :loading="loading" @click="doVerify">
            {{ settings.query_button_text || '立即验证' }}
          </el-button>
        </el-form>
        <p v-if="settings.query_tips" class="tips">{{ settings.query_tips }}</p>
      </section>

      <section v-if="loading" class="state-panel state-panel--loading" aria-live="polite">
        <span class="loading-ring" />
        <strong>正在核验防伪码</strong>
        <p>{{ form.code }}</p>
      </section>

      <section v-else-if="errorMessage" class="state-panel error-panel state-panel--error" aria-live="assertive">
        <strong>{{ settings.network_error_title || '验证失败' }}</strong>
        <p>{{ errorMessage }}</p>
        <el-button type="primary" @click="doVerify">重新查询</el-button>
      </section>

      <template v-else-if="result">
        <section class="verify-result-card" :class="{ 'is-warning': !isVerifiedReal, 'is-risk': hasAntiChannelingAlert, 'is-invalid': !isCodeGenuine }">
          <div class="official-pill">
            <span />
            {{ verifyStatusText }}
          </div>

          <div class="cert-icon" aria-hidden="true">
            <span />
          </div>

          <h1 class="cert-title">{{ verifyTitle }}</h1>
          <p class="cert-subtitle">{{ verifySubtitle }}</p>

          <article v-if="hasAntiChannelingAlert" class="anti-channeling-risk-card">
            <h2>{{ antiChannelingRiskTitle }}</h2>
            <div v-if="antiChannelingAuthorizedRegion">
              <span>授权区域</span>
              <strong>{{ antiChannelingAuthorizedRegion }}</strong>
            </div>
            <div v-if="antiChannelingActualLocation">
              <span>扫码位置</span>
              <strong>{{ antiChannelingActualLocation }}</strong>
            </div>
            <p>{{ antiChannelingRiskHint }}</p>
          </article>

          <p v-if="isCodeGenuine && !canViewProductContent" class="content-access-note">当前位置尚未通过该码的防窜授权校验，产品详情暂不展示。</p>

          <article v-if="canViewProductContent" class="cert-product-card">
            <small>产品名称</small>
            <strong>{{ verifyProductName }}</strong>
            <em>{{ verifyCompanyName }}</em>
            <p v-if="verifyProductId">ID: {{ verifyProductId }}</p>
          </article>

          <article v-if="canViewProductContent" class="cert-detail-card">
            <h2>验证详情</h2>
            <div class="cert-detail-row">
              <span>所属公司（制造商）</span>
              <strong>{{ verifyCompanyName }}</strong>
            </div>
            <div v-if="shipmentAuthorizationPartyName" class="cert-detail-row">
              <span>{{ shipmentAuthorizationPartyLabel }}</span>
              <strong>{{ shipmentAuthorizationPartyName }}</strong>
            </div>
            <div v-if="shipmentAuthorizationRegion" class="cert-detail-row">
              <span>防窜授权区域</span>
              <strong>{{ shipmentAuthorizationRegion }}</strong>
            </div>
            <p v-if="shipmentAuthorizationRegion" class="authorization-explain">{{ authorizationExplain }}</p>
            <div v-if="settings.show_query_count" class="cert-detail-row">
              <span>查询次数</span>
              <b>{{ queryCount }}</b>
            </div>
          </article>
        </section>

        <section v-if="antiChannelingSummary" class="anti-channeling-note">
          {{ antiChannelingSummary }}
        </section>
      </template>

      <ConfigSections v-if="result && canViewProductContent" :sections="sectionsAfterResult" />

      <footer class="verify-footer">
        <span>{{ settings.footer_text || '本页面由企业官方防伪溯源系统提供技术支持' }}</span>
        <a v-if="settings.icp_no" :href="settings.icp_url || undefined" target="_blank" rel="noopener">{{ settings.icp_no }}</a>
      </footer>
    </main>

    <el-dialog v-model="popupVisible" :title="popupConfig.title || '官方提醒'" width="360px" class="verify-popup" append-to-body align-center :lock-scroll="true">
      <img v-if="popupConfig.image" :src="popupConfig.image" alt="弹窗广告" class="popup-image" />
      <p v-if="popupConfig.content">{{ popupConfig.content }}</p>
      <template #footer>
        <el-button @click="popupVisible = false">我知道了</el-button>
        <el-button v-if="popupConfig.url" type="primary" @click="openPopupLink">{{ popupConfig.buttonText || '立即查看' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import { publicQueryApi, publicSettingsApi } from '@/api/public';
import { getUapiMyIp, toUapiLocationMeta } from '@/api/uapi';
import { displayValue, fmtTime } from '@/utils/format';
import { isCurrentPublicVerifyHostAllowed } from '@/config/publicVerification';
import { useWatermark } from '@/composables/useWatermark';

type ConfigSection = {
  id?: string;
  type?: 'notice' | 'text' | 'banner' | 'image' | 'cards' | 'steps' | 'qa';
  position?: 'before_form' | 'after_result' | 'footer';
  title?: string;
  subtitle?: string;
  content?: string;
  image?: string;
  items?: Array<Record<string, any>>;
};

type ProductField = { key: string; label: string; aliases?: string[]; format?: 'date' | 'raw' };
type DisplayField = { key: string; label: string; value: string };
type TraceNode = { id?: string | number; title: string; desc?: string; time?: string; operator?: string; location?: string; extra?: string; sortTime?: number };

const defaultProductFields: ProductField[] = [
  { key: 'product_name', label: '产品名称', aliases: ['name'] },
  { key: 'production_date', label: '生产日期', format: 'date' },
  { key: 'shelf_life', label: '保质期', aliases: ['保质期'] },
  { key: 'target_audience', label: '适宜人群', aliases: ['适宜人群', '适用人群', '适用对象', 'target_audience', 'suitable_people', 'applicable_people'] },
  { key: 'usage_method', label: '食用量及食用方法', aliases: ['食用量及食用方法', '食用方法', '用法用量', '使用方法', 'usage_method', 'usage', 'dosage'] },
  { key: 'storage_condition', label: '贮藏方法', aliases: ['贮藏方法', '贮存条件', '储存条件', '仓储条件', 'storage_condition', 'storage'] },
  { key: 'notice', label: '注意事项', aliases: ['注意事项', '温馨提示', '特别提醒', 'notice', 'warning'] },
];

const defaultSettings = {
  consumer_page_enabled: true,
  primary_color: '#3177ff',
  page_logo: '',
  brand_name: '防伪验证中心',
  brand_slogan: '一物一码 · 正品可查 · 全程可溯',
  brand_promo_image: '',
  consumer_page_background: '',
  form_title: '输入防伪码',
  form_subtitle: '支持扫码链接自动填充',
  code_label: '防伪码',
  code_placeholder: '请输入包装上的防伪码',
  query_button_text: '立即验证',
  query_tips: '请认准产品外包装防伪标签，刮开涂层后输入完整防伪码。',
  enable_location_input: true,
  auto_query_from_url: true,
  network_error_title: '验证失败',
  show_query_count: true,
  trace_section_title: '溯源链路',
  verify_product_fields: defaultProductFields,
  custom_sections: [],
  cta_buttons: [],
  customer_service_phone: '',
  customer_service_url: '',
  customer_service_text: '',
  customer_service_title: '',
  popup_ad_enabled: false,
  popup_ad_config: {},
  footer_text: '本页面由企业官方防伪溯源系统提供技术支持',
  icp_no: '',
  icp_url: '',
  show_empty_fields: false,
};

const ConfigSections = defineComponent({
  name: 'ConfigSections',
  props: {
    sections: { type: Array as () => ConfigSection[], default: () => [] },
  },
  setup(props) {
    const renderItem = (item: Record<string, any>, index: number, type?: string) => {
      if (type === 'steps') {
        return h('div', { class: 'config-step' }, [
          h('b', String(index + 1).padStart(2, '0')),
          h('span', item.title || item.label || item.name || item.content || ''),
          item.desc ? h('small', item.desc) : null,
        ]);
      }
      if (type === 'qa') {
        return h('div', { class: 'config-qa' }, [
          h('strong', item.question || item.title || item.label || '问题'),
          h('p', item.answer || item.content || item.desc || ''),
        ]);
      }
      return h('div', { class: 'config-card-item' }, [
        item.image ? h('img', { src: item.image, alt: item.title || item.label || '图片' }) : null,
        h('strong', item.title || item.label || item.name || ''),
        item.desc || item.content ? h('p', item.desc || item.content) : null,
      ]);
    };

    return () => props.sections.length ? h('div', { class: 'config-sections' }, props.sections.map((section, sectionIndex) => h('section', {
      class: ['config-section', `config-section-${section.type || 'text'}`],
      key: section.id || section.title || sectionIndex,
    }, [
      section.image && section.type !== 'cards' ? h('img', { class: 'config-section-image', src: section.image, alt: section.title || '图片' }) : null,
      h('div', { class: 'config-section-body' }, [
        section.title ? h('h3', section.title) : null,
        section.subtitle ? h('small', section.subtitle) : null,
        section.content ? h('p', section.content) : null,
        Array.isArray(section.items) && section.items.length ? h('div', { class: `config-items config-items-${section.type || 'cards'}` }, section.items.map((item, index) => renderItem(item, index, section.type))) : null,
      ]),
    ]))) : null;
  },
});

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const popupVisible = ref(false);
const errorMessage = ref('');
const result = ref<any>(null);
const settings = ref<Record<string, any>>({ ...defaultSettings });
const form = reactive({ code: '', channel: 'scan' });
const initialCodeFromUrl = ref(extractCodeFromBrowserUrl());
const heroImageFailed = ref(false);
const qrLoadFailed = ref(false);
const verifyingCodeKey = ref('');

if (initialCodeFromUrl.value) form.code = initialCodeFromUrl.value;

// 掩码防伪码，只保留首尾各 3 位，避免水印本身把完整防伪码暴露给截图/偷拍。
function maskWatermarkCode(code: string) {
  const clean = code.trim();
  return clean.length <= 6 ? clean : `${clean.slice(0, 3)}****${clean.slice(-3)}`;
}

// 结果返回后水印带上掩码防伪码 + 查询时间，这样一旦页面被截图外传，
// 可以按水印中的时间和码尾反查具体是哪一次扫码泄露的，而不需要在水印里放明文防伪码。
const watermarkText = computed(() => {
  const brand = settings.value.brand_name || settings.value.company_name || '防伪验证中心';
  if (!result.value || !traceCode.value) return brand;
  const maskedCode = maskWatermarkCode(traceCode.value);
  const time = fmtTime(result.value.last_query_time) || fmtTime(new Date().toISOString());
  return `${brand} · ${maskedCode} · ${time}`;
});
useWatermark({
  text: watermarkText,
  fontSize: 20,
  opacity: 0.06,
  rotate: -22,
  gapX: 260,
  gapY: 210,
});

const urlCodeMode = computed(() => Boolean(initialCodeFromUrl.value || extractCodeFromBrowserUrl()));
const shouldShowInputCard = computed(() => !urlCodeMode.value && settings.value.hide_manual_query_form !== true);
const popupConfig = computed(() => normalizeObject(settings.value.popup_ad_config));
const customSections = computed(() => normalizeArray<ConfigSection>(settings.value.custom_sections));
const sectionsBeforeForm = computed(() => customSections.value.filter((section) => (section.position || 'after_result') === 'before_form'));
const sectionsAfterResult = computed(() => customSections.value.filter((section) => (section.position || 'after_result') === 'after_result'));
const product = computed(() => {
  const productInfo = normalizeObject(result.value?.product || result.value?.product_info || result.value?.goods);
  const codeOwner = normalizeObject(result.value?.code_owner);
  if (productInfo.product_name || !codeOwner.product_name) return productInfo;
  return {
    product_code: codeOwner.product_code || '',
    product_name: codeOwner.product_name || '',
    category: codeOwner.category || '',
    brand: codeOwner.brand || '',
    manufacturer: codeOwner.manufacturer || codeOwner.company_name || '',
    company_name: codeOwner.company_name || codeOwner.manufacturer || '',
    ...productInfo,
  };
});
const productExtra = computed(() => ({
  ...normalizeObject(product.value.extra_fields),
  ...normalizeObject(product.value.extra),
  ...normalizeObject(product.value.ext_json),
  ...normalizeObject(product.value.trace_auto_template),
}));
const traceCode = computed(() => String(result.value?.code || result.value?.anti_fake_code || result.value?.trace_code || form.code || '').trim());
const queryCount = computed(() => Number(result.value?.query_count ?? result.value?.queryCount ?? result.value?.scan_count ?? result.value?.scanCount ?? 0));
const queryCountText = computed(() => Number.isFinite(queryCount.value) && queryCount.value > 0 ? `${queryCount.value}次` : '0次');
const firstQueryTime = computed(() => formatResultTime(result.value?.first_query_time ?? result.value?.firstQueryTime));
const ctaButtons = computed(() => normalizeArray<Record<string, any>>(settings.value.cta_buttons).filter((button) => button.text && button.url));
const serviceInfo = computed(() => [
  settings.value.customer_service_text,
  settings.value.customer_service_phone ? `消费者热线：${settings.value.customer_service_phone}` : '',
  settings.value.customer_service_url ? `官网：${settings.value.customer_service_url}` : '',
].map((item) => String(item || '').trim()).filter(Boolean));

const isCodeGenuine = computed(() => result.value?.is_real === true || result.value?.success === true || result.value?.real === true);
const antiChannelingEnabled = computed(() => result.value?.anti_channeling_enabled !== false);
const antiChannelingInfo = computed(() => normalizeObject(result.value?.anti_channeling));
const antiChannelingAlerts = computed(() => normalizeArray<any>(antiChannelingInfo.value.alerts));
const antiChannelingAlertCount = computed(() => Number(antiChannelingInfo.value.alert_count || antiChannelingAlerts.value.length || (result.value?.is_channeling_risk ? 1 : 0)));
const locationAuthorizationRequired = computed(() => result.value?.location_authorization_required === true);
// 防窜预警必须建立在“码已验真且码级防窜开关开启”的前提上。
// 即使旧接口或缓存意外返回了残留预警，假码也只能显示“验证未通过”，
// 不能被误展示成“正品但销售区域异常”。
const hasAntiChannelingAlert = computed(() => isCodeGenuine.value
  && antiChannelingEnabled.value
  && (result.value?.is_channeling_risk === true || antiChannelingAlertCount.value > 0));
const canViewProductContent = computed(() => {
  if (!isCodeGenuine.value) return false;
  if (typeof result.value?.content_access_granted === 'boolean') return result.value.content_access_granted;
  if (!antiChannelingEnabled.value || !locationAuthorizationRequired.value) return true;
  return !hasAntiChannelingAlert.value;
});
const primaryAntiChannelingAlert = computed(() => antiChannelingAlerts.value.find(Boolean) || {});
const antiChannelingAuthorizedRegion = computed(() => String(primaryAntiChannelingAlert.value?.authorized_region || primaryAntiChannelingAlert.value?.authorizedRegion || '').trim());
const antiChannelingActualLocation = computed(() => String(primaryAntiChannelingAlert.value?.actual_location || primaryAntiChannelingAlert.value?.actualLocation || result.value?.scan_location?.location || '').trim());
const isVerifiedReal = computed(() => isCodeGenuine.value && !hasAntiChannelingAlert.value);
const verifyPageState = computed<'ready' | 'loading' | 'error' | 'genuine' | 'risk' | 'invalid'>(() => {
  if (loading.value) return 'loading';
  if (errorMessage.value) return 'error';
  if (!result.value) return 'ready';
  if (!isCodeGenuine.value) return 'invalid';
  return hasAntiChannelingAlert.value ? 'risk' : 'genuine';
});
// “所属公司”必须优先读取产品建档时选择的制造商。编码快照仅作为产品档案缺失时的兜底，
// 避免历史 company_name 或系统品牌名称覆盖真实制造商；发货代理商和授权区域另行展示。
const verifyCompanyName = computed(() => String(
  product.value.manufacturer
  || product.value.company_name
  || result.value?.code_owner?.manufacturer
  || result.value?.code_owner?.company_name
  || result.value?.manufacturer
  || result.value?.company_name
  || settings.value.company_name
  || settings.value.brand_name
  || '官方企业',
).trim());
const shipmentAuthorization = computed(() => normalizeObject(result.value?.shipment_authorization || result.value?.shipmentAuthorization));
const shipmentAuthorizationPartyLabel = computed(() => '收货代理商');
const shipmentAuthorizationPartyName = computed(() => locationAuthorizationRequired.value
  ? String(shipmentAuthorization.value?.agent_name || shipmentAuthorization.value?.distributor || '').trim()
  : '');
const shipmentAuthorizationRegion = computed(() => locationAuthorizationRequired.value
  ? String(shipmentAuthorization.value?.authorized_region || shipmentAuthorization.value?.region_group || [shipmentAuthorization.value?.province_name, shipmentAuthorization.value?.city_name].filter(Boolean).join(' / ')).trim()
  : '');
const authorizationExplain = computed(() => '该码已发货，授权区域以发货单填写的发货位置为准。');
const verifyProductName = computed(() => String(product.value.product_name || result.value?.product_name || result.value?.product_info?.product_name || result.value?.code_owner?.product_name || '产品').trim());
const verifyProductId = computed(() => String(product.value.product_code || result.value?.product_code || result.value?.trace_no || traceCode.value || '').trim());
const authorizationStatus = computed(() => String(result.value?.authorization_status || antiChannelingInfo.value.authorization_status || '').trim());
const isAuthorizationUnresolved = computed(() => authorizationStatus.value === 'authorization_unresolved');
const isLocationUnverified = computed(() => String(primaryAntiChannelingAlert.value?.alert_type || primaryAntiChannelingAlert.value?.alertType || '').trim() === 'location_unverified'
  || ['location_unverified', 'authorization_unresolved'].includes(authorizationStatus.value));
const antiChannelingRiskTitle = computed(() => isAuthorizationUnresolved.value
  ? '防窜授权位置待配置'
  : isLocationUnverified.value
    ? '本次扫码位置待核验'
    : '本次扫码不在授权销售区域');
const antiChannelingRiskHint = computed(() => isAuthorizationUnresolved.value
  ? '该码已发货，但发货位置尚未完成配置，请联系官方客服核验购买渠道。'
  : isLocationUnverified.value
    ? '位置核验通过前不会展示产品详情，请检查网络后重新扫码或联系官方客服。'
    : `系统已记录 ${antiChannelingAlertCount.value} 条防窜货预警，请核验购买渠道或联系官方客服。`);
const verifyStatusText = computed(() => !isCodeGenuine.value
  ? '官方验证未通过'
  : hasAntiChannelingAlert.value
    ? (isLocationUnverified.value ? '位置待核验' : '销售区域异常')
    : '官方验证通过');
const verifyTitle = computed(() => !isCodeGenuine.value
  ? '验证未通过'
  : hasAntiChannelingAlert.value
    ? (isLocationUnverified.value ? '位置待核验' : '防窜货预警')
    : '正品认证');
const verifySubtitle = computed(() => !isCodeGenuine.value
  ? (result.value?.message || '未查询到有效防伪码，请谨慎核验。')
  : hasAntiChannelingAlert.value
    ? antiChannelingSummary.value
    : '该产品已通过系统校验，确认为正品。');

const pageStyle = computed(() => ({
  '--verify-primary': settings.value.primary_color || defaultSettings.primary_color,
  '--verify-bg-image': settings.value.consumer_page_background ? `url(${settings.value.consumer_page_background})` : 'none',
}) as Record<string, string>);

const heroImage = computed(() => {
  const productImage = product.value.image_url || result.value?.image_url;
  if (productImage && !heroImageFailed.value) return productImage;
  return settings.value.brand_promo_image || settings.value.page_header_image || '';
});

const productRows = computed<DisplayField[]>(() => {
  const fields = normalizeProductFields(settings.value.verify_product_fields);
  const rows = fields.map((field) => {
    const rawValue = resolveProductValue(field.key, field.aliases || []);
    const value = field.format === 'date' ? formatDateOnly(rawValue) : displayValue(rawValue);
    return { key: field.key, label: field.label || field.key, value };
  });
  return rows.filter((item) => settings.value.show_empty_fields || !isEmptyDisplay(item.value));
});

const traceNodes = computed<TraceNode[]>(() => {
  const raw = result.value?.trace_chain ?? result.value?.traceChain ?? result.value?.trace?.nodes ?? result.value?.trace?.trace_chain ?? product.value.trace_chain;
  return normalizeArray<any>(raw).map(normalizeTraceNode).filter(Boolean) as TraceNode[];
});

const latestTraceNode = computed(() => {
  if (!traceNodes.value.length) return null;
  return [...traceNodes.value].sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))[0];
});

const publicQrImageUrl = computed(() => {
  if (!traceCode.value || qrLoadFailed.value) return '';
  const base = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
  return `${base}/query/qrcode/${encodeURIComponent(traceCode.value)}`;
});

const antiChannelingSummary = computed(() => {
  if (!hasAntiChannelingAlert.value) return '';
  const remoteMessage = String(result.value?.risk_message || '').trim();
  if (remoteMessage) return remoteMessage;
  const authorized = antiChannelingAuthorizedRegion.value;
  const scanLocation = antiChannelingActualLocation.value || '当前扫码位置';
  const authText = authorized ? `授权区域为 ${authorized}，` : '';
  return `防窜货预警：${authText}本次扫码位置为 ${scanLocation}，与该码授权销售区域不一致，系统已记录 ${antiChannelingAlertCount.value} 条预警并通知后台处理。`;
});

watch(traceCode, () => { qrLoadFailed.value = false; });
watch(() => product.value.image_url, () => { heroImageFailed.value = false; });
watch(result, (value) => {
  if (value) document.title = `${verifyCompanyName.value} - ${verifyProductName.value}`;
});

function normalizeProductFields(value: any): ProductField[] {
  const list = normalizeArray<any>(value);
  if (!list.length) return defaultProductFields;
  return list.map((item) => {
    if (typeof item === 'string') {
      const preset = defaultProductFields.find((field) => field.key === item || field.aliases?.includes(item));
      return preset || { key: item, label: item };
    }
    return {
      key: String(item.key || item.field || item.name || '').trim(),
      label: String(item.label || item.title || item.key || item.field || '').trim(),
      aliases: normalizeArray<string>(item.aliases),
      format: item.format,
    } as ProductField;
  }).filter((item) => item.key);
}

function normalizeTraceNode(node: any, index: number): TraceNode | null {
  if (!node || typeof node !== 'object') return null;
  const timeValue = node.time || node.timestamp || node.created_at || node.process_time || node.date;
  return {
    id: node.id ?? node.trace_key ?? index,
    title: node.title || node.name || node.node_name || node.process_name || node.node_type || node.type || `节点 ${index + 1}`,
    desc: node.desc || node.description || node.content || node.process_content || node.remark || (typeof node.detail === 'string' ? node.detail : ''),
    time: formatResultTime(timeValue),
    operator: node.operator || node.operator_name || node.person || '',
    location: node.location || node.address || node.place || '',
    extra: [node.product_name || node.product_code ? `产品：${node.product_name || node.product_code}` : '', node.batch_no ? `批次：${node.batch_no}` : '', node.box_no ? `箱码：${node.box_no}` : '', node.shipment_no ? `发货：${node.shipment_no}` : ''].filter(Boolean).join(' · '),
    sortTime: toTimestamp(timeValue),
  };
}

function resolveProductValue(key: string, aliases: string[] = []) {
  const keys = [key, ...aliases];
  const sources = [result.value, product.value, productExtra.value, result.value?.trace, result.value?.code_owner];
  for (const source of sources) {
    for (const currentKey of keys) {
      const value = getByPath(source, currentKey);
      if (!isNil(value)) return value;
    }
  }
  return undefined;
}

function getByPath(source: any, path: string) {
  if (!source || !path) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return path.split('.').reduce((current, segment) => current && current[segment], source);
}

function isNil(value: any) {
  return value === null || typeof value === 'undefined';
}

function isEmptyDisplay(value: string) {
  return !value || value === '-' || value === '[]' || value === '{}';
}

function normalizeObject(value: any) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeArray<T = any>(value: any): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean) as T[];
    }
  }
  if (typeof value === 'object') return Object.values(value) as T[];
  return [];
}

function formatResultTime(value: any) {
  if (!value) return '';
  try { return fmtTime(value); } catch { return String(value); }
}

function formatDateOnly(value: any) {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  } catch {}
  return displayValue(value);
}

function toTimestamp(value: any) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeUrlCode(value: unknown) {
  let raw = String(Array.isArray(value) ? value[0] : value || '')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!raw) return '';

  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(raw).trim();
      if (decoded === raw) break;
      raw = decoded;
    } catch {
      break;
    }
  }

  // 兼容把完整验证链接粘进输入框或扫码器回填整段 URL 的情况。
  const embedded = raw.match(/(?:^|\/)(?:verify|v)\/([^?#\s]+)/i)
    || raw.match(/[?&#](?:code|c|q)=([^&#\s]+)/i);
  if (embedded?.[1]) return normalizeUrlCode(embedded[1]);

  return raw.replace(/^['"“”‘’]+|['"“”‘’]+$/g, '').trim();
}

function extractCodeFromBrowserUrl() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const queryCode = url.searchParams.get('code') || url.searchParams.get('c') || url.searchParams.get('q');
  if (queryCode) return normalizeUrlCode(queryCode);

  const candidates = [url.pathname, url.hash.replace(/^#/, '')].filter(Boolean);
  const routeKeys = ['verify', 'v'];
  for (const candidate of candidates) {
    const clean = candidate.split('?')[0].replace(/^#/, '');
    const parts = clean.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i += 1) {
      if (routeKeys.includes(parts[i].toLowerCase()) && parts[i + 1]) return normalizeUrlCode(parts.slice(i + 1).join('/'));
    }
  }
  return '';
}

function getInitialCode() {
  const browserCode = extractCodeFromBrowserUrl();
  if (browserCode) return browserCode;
  const routeCode = route.params.code;
  const queryCode = route.query.code || route.query.c || route.query.q;
  return normalizeUrlCode(routeCode || queryCode);
}

function getQueryStringValue(value: unknown) {
  return String(Array.isArray(value) ? value[0] : value || '').trim();
}

function fillInitialQueryMeta() {
  const channel = getQueryStringValue(route.query.channel);
  if (['scan', 'web', 'wechat'].includes(channel)) form.channel = channel;
}

async function loadSettings() {
  const remote = await publicSettingsApi.queryPanel();
  if (remote) settings.value = { ...defaultSettings, ...remote };
  document.title = `${settings.value.brand_name || '防伪验证中心'} - 防伪验证`;
  if (settings.value.popup_ad_enabled && Object.keys(popupConfig.value).length) popupVisible.value = true;
}

function getVerifyDeviceId() {
  const key = 'trace_verify_device_id';
  try {
    const existed = localStorage.getItem(key);
    if (existed) return existed;
    const value = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, value);
    return value;
  } catch {
    return `web-${Date.now().toString(36)}`;
  }
}

function detectDeviceIntegrity() {
  const tokens: string[] = ['browser'];
  const nav = navigator as Navigator & { webdriver?: boolean };
  if (nav.webdriver) tokens.push('webdriver');
  if (/HeadlessChrome|PhantomJS|Selenium|spider|bot/i.test(nav.userAgent || '')) tokens.push('headless');
  return tokens.join(',');
}

async function detectScanLocationMeta() {
  const ipInfo = await getUapiMyIp({ timeoutMs: 2500 }).catch(() => null);
  return toUapiLocationMeta(ipInfo);
}

async function doVerify() {
  if (!isCurrentPublicVerifyHostAllowed()) {
    await router.replace({ name: 'VerifyDomainBlocked' });
    return;
  }

  const code = normalizeUrlCode(form.code);
  if (code && code !== form.code) form.code = code;
  if (!code) {
    Message.warning(settings.value.code_required_message || '请输入防伪码');
    return;
  }
  if (loading.value && verifyingCodeKey.value === code) return;
  verifyingCodeKey.value = code;
  loading.value = true;
  errorMessage.value = '';
  result.value = null;
  qrLoadFailed.value = false;
  try {
    const preflight = await publicQueryApi.preflight(code);
    // /network/myip must be requested directly from the visitor browser so UAPI sees
    // the visitor's public IP instead of the API server's egress IP.
    const locationMeta = await detectScanLocationMeta();
    result.value = await publicQueryApi.verify({
      code,
      challenge: preflight.challenge,
      channel: form.channel,
      ...locationMeta,
      location: locationMeta.location,
      device_id: getVerifyDeviceId(),
      device_integrity: detectDeviceIntegrity(),
      jailbroken: false,
    }, preflight.request_nonce);
  } catch (error: any) {
    errorMessage.value = error?.message || '网络异常，请稍后重试';
  } finally {
    loading.value = false;
    verifyingCodeKey.value = '';
  }
}

function openPopupLink() {
  if (popupConfig.value.url) window.open(popupConfig.value.url, '_blank', 'noopener');
  popupVisible.value = false;
}

onMounted(async () => {
  if (!isCurrentPublicVerifyHostAllowed()) {
    await router.replace({ name: 'VerifyDomainBlocked' });
    return;
  }

  const initialCode = getInitialCode();
  initialCodeFromUrl.value = initialCode;
  if (initialCode) form.code = initialCode;
  fillInitialQueryMeta();
  await loadSettings();
  if (form.code && settings.value.auto_query_from_url) await doVerify();
});
</script>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  min-height: 100% !important;
  height: auto !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  overscroll-behavior-y: auto;
}
:global(body) {
  position: static !important;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}
.verify-page {
  min-height: 100vh;
  min-height: 100dvh;
  height: auto;
  position: relative;
  isolation: isolate;
  overflow-x: hidden;
  overflow-y: visible;
  background: #f4fbf7;
  color: #162033;
}
.verify-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 78% 30%, rgba(197, 246, 218, .58), transparent 34%),
    linear-gradient(180deg, rgba(250, 253, 255, .96), rgba(239, 248, 244, .98)),
    var(--verify-bg-image);
  background-size: cover;
  background-position: center;
}
.verify-shell {
  width: min(640px, 100%);
  margin: 0 auto;
  padding: 8px 0 max(18px, env(safe-area-inset-bottom));
}
.product-banner {
  margin: 0 6px;
  overflow: hidden;
  border: 8px solid #ff4b59;
  background: #fff;
}
.product-banner img {
  display: block;
  width: 100%;
  max-height: 290px;
  object-fit: cover;
}
.brand-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, .78);
  border: 1px solid rgba(74, 144, 255, .18);
}
.brand-banner img {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  object-fit: cover;
}
.brand-banner strong,
.brand-banner span {
  display: block;
}
.brand-banner strong {
  font-size: 18px;
  color: #243b53;
}
.brand-banner span {
  margin-top: 4px;
  color: #6b7c93;
}
.verify-entry-state {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 22px 16px;
  padding: 14px 16px;
  border-radius: 16px;
  color: #35506f;
  background: rgba(255,255,255,.72);
  border: 1px solid rgba(91, 137, 191, .18);
  box-sizing: border-box;
}
.verify-entry-state__icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: var(--verify-primary);
  font-weight: 900;
}
.verify-entry-state strong { display: block; color: #22364d; font-size: 15px; }
.verify-entry-state p { margin: 4px 0 0; color: #6b7c93; font-size: 13px; line-height: 1.55; }
.query-panel,
.info-panel,
.state-panel,
.consumer-footer-card {
  margin: 0 22px 16px;
  background: rgba(235, 243, 255, .86);
  border-radius: 12px;
}
.query-panel {
  padding: 20px;
  box-shadow: 0 12px 30px rgba(37, 99, 235, .08);
}
.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 20px;
}
.section-title i {
  width: 5px;
  height: 26px;
  border-radius: 99px;
  background: var(--verify-primary);
  box-shadow: 0 6px 12px color-mix(in srgb, var(--verify-primary) 28%, transparent);
}
.section-title h1,
.section-title h2 {
  margin: 0;
  color: #1f2937;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 500;
}
.query-subtitle,
.tips {
  margin: -10px 0 16px;
  color: #6b7c93;
  line-height: 1.7;
}
.verify-button {
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
}
.state-panel {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 32px 20px;
  text-align: center;
  color: #516173;
}
.state-panel strong {
  color: #1f2937;
  font-size: 20px;
}
.state-panel p {
  margin: 0;
  word-break: break-all;
}
.loading-ring {
  width: 42px;
  height: 42px;
  border: 4px solid #cfe0ff;
  border-top-color: var(--verify-primary);
  border-radius: 50%;
  animation: verify-spin .8s linear infinite;
}
.error-panel {
  background: #fff7f7;
  color: #b42318;
}
.info-panel {
  padding: 16px 8px 6px;
  background: transparent;
}
.detail-lines {
  display: grid;
  gap: 7px;
  padding-left: 22px;
}
.detail-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  color: #5f6c7b;
  font-size: 20px;
  line-height: 1.45;
}
.detail-line span {
  flex: 0 0 auto;
  color: #374151;
  font-weight: 500;
  white-space: nowrap;
}
.detail-line strong {
  min-width: 0;
  color: #5f6c7b;
  font-weight: 400;
  word-break: break-word;
}
.product-lines {
  gap: 6px;
}
.trace-latest-card {
  position: relative;
  display: flex;
  gap: 12px;
  margin: 0 0 4px 22px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid #cfe0ff;
  background: rgba(255,255,255,.7);
}
.trace-dot {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--verify-primary);
  font-weight: 800;
}
.trace-latest-card strong {
  color: #1f2937;
  font-size: 17px;
}
.trace-latest-card p {
  margin: 7px 0 0;
  color: #5f6c7b;
  line-height: 1.6;
}
.trace-latest-card small {
  display: block;
  margin-top: 8px;
  color: #7b8794;
  line-height: 1.5;
}
.consumer-footer-card {
  display: grid;
  grid-template-columns: minmax(130px, 180px) 1fr;
  gap: 14px;
  align-items: start;
  padding: 0;
  background: transparent;
}
.qr-card {
  display: grid;
  gap: 6px;
  justify-items: center;
  color: #5f6c7b;
  font-size: 14px;
}
.qr-card img {
  width: 176px;
  height: 176px;
  padding: 6px;
  object-fit: contain;
  background: #fff;
  border: 8px solid #ff4b59;
  box-sizing: border-box;
}
.store-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.store-card {
  min-height: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: #fff;
  border: 7px solid #ff4b59;
  color: #243b53;
  text-decoration: none;
  text-align: center;
  box-sizing: border-box;
}
.store-card img {
  max-width: 74px;
  max-height: 46px;
  object-fit: contain;
}
.store-card strong {
  font-size: 17px;
  line-height: 1.2;
}
.store-card small {
  color: #6b7c93;
  line-height: 1.3;
}
.service-info {
  grid-column: 2;
  margin-top: -4px;
  color: #6b7c93;
  text-align: center;
  font-size: 14px;
  line-height: 1.55;
}
.service-info p {
  margin: 2px 0;
}
.anti-channeling-note {
  margin: 0 22px 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}
.anti-channeling-risk-card {
  width: 100%;
  margin: 18px 0 6px;
  padding: 16px;
  border-radius: 18px;
  background: #fff7ed;
  border: 1px solid #fb923c;
  color: #9a3412;
  text-align: left;
  box-sizing: border-box;
}
.anti-channeling-risk-card h2 {
  margin: 0 0 10px;
  font-size: 18px;
  color: #c2410c;
}
.anti-channeling-risk-card div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid rgba(251, 146, 60, .35);
}
.anti-channeling-risk-card span {
  color: #b45309;
  white-space: nowrap;
}
.anti-channeling-risk-card strong {
  text-align: right;
  color: #7c2d12;
}
.anti-channeling-risk-card p {
  margin: 10px 0 0;
  line-height: 1.65;
}
.content-access-note {
  margin: 14px 0 2px;
  color: #9a3412;
  font-size: 14px;
  line-height: 1.65;
  text-align: center;
}
.config-sections {
  display: grid;
  gap: 12px;
  margin: 0 22px 16px;
}
.config-section {
  display: flex;
  gap: 14px;
  align-items: center;
  border-radius: 16px;
  padding: 14px;
  background: rgba(255,255,255,.78);
  border: 1px solid rgba(74,144,255,.18);
}
.config-section-image {
  width: 148px;
  max-height: 110px;
  object-fit: cover;
  border-radius: 12px;
}
.config-section h3,
.config-section p {
  margin: 0;
}
.config-section h3 {
  color: #1f2937;
}
.config-section small {
  display: block;
  color: var(--verify-primary);
  margin: 6px 0;
}
.config-section p {
  color: #5f6c7b;
  line-height: 1.7;
}
.config-items {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.config-items-cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.config-card-item,
.config-step,
.config-qa {
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #d9e8ff;
  background: #f8fbff;
}
.config-card-item img {
  width: 100%;
  height: 82px;
  object-fit: cover;
  border-radius: 10px;
  margin-bottom: 8px;
}
.config-card-item strong,
.config-qa strong {
  display: block;
  color: #1f2937;
  margin-bottom: 5px;
}
.config-step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  align-items: start;
}
.config-step b {
  grid-row: span 2;
  color: var(--verify-primary);
}
.verify-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px 0;
  color: #8a96a8;
  font-size: 12px;
  text-align: center;
}
.verify-footer a {
  color: #8a96a8;
  text-decoration: none;
}
.popup-image {
  width: 100%;
  border-radius: 14px;
  margin-bottom: 10px;
}
@keyframes verify-spin { to { transform: rotate(360deg); } }
@media (max-width: 560px) {
  .verify-shell { width: 100%; }
  .product-banner { margin: 0; border-width: 7px; }
  .product-banner img { max-height: 260px; }
  .query-panel,
  .info-panel,
  .state-panel,
  .consumer-footer-card,
  .anti-channeling-note,
  .anti-channeling-risk-card,
  .config-sections { margin-left: 18px; margin-right: 18px; }
  .detail-lines { padding-left: 14px; }
  .detail-line { font-size: 18px; }
  .section-title h1,
  .section-title h2 { font-size: 22px; }
  .consumer-footer-card { grid-template-columns: 150px 1fr; gap: 10px; }
  .qr-card img { width: 150px; height: 150px; border-width: 7px; }
  .store-cards { gap: 8px; }
  .store-card { min-height: 82px; border-width: 6px; padding: 8px; }
  .store-card strong { font-size: 15px; }
}
@media (max-width: 420px) {
  .consumer-footer-card { grid-template-columns: 1fr; }
  .service-info { grid-column: 1; }
  .store-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.verify-result-card {
  position: relative;
  margin: 116px 22px 28px;
  padding: 34px 28px 36px;
  border-radius: 26px;
  border: 1px solid #c9eadb;
  background: linear-gradient(180deg, rgba(248, 255, 252, .94), rgba(247, 253, 250, .88));
  box-shadow: 0 22px 52px rgba(20, 132, 69, .08);
  text-align: center;
}
.official-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 30px;
  border-radius: 999px;
  color: #176c39;
  background: #e2f7ea;
  border: 1px solid #c5eed4;
  font-size: 20px;
  font-weight: 800;
}
.official-pill span {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #1b8f49;
}
.cert-icon {
  width: 118px;
  height: 118px;
  margin: 38px auto 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #dff8e8;
}
.cert-icon span {
  width: 74px;
  height: 48px;
  border-left: 12px solid #24c05a;
  border-bottom: 12px solid #24c05a;
  transform: rotate(-45deg) translate(4px, -4px);
  border-radius: 6px;
}
.cert-title {
  margin: 0;
  color: #168040;
  font-size: 42px;
  line-height: 1.15;
  font-weight: 900;
  letter-spacing: .03em;
}
.cert-subtitle {
  margin: 24px auto 36px;
  max-width: 360px;
  color: #5e6978;
  font-size: 20px;
  line-height: 1.7;
}
.cert-product-card,
.cert-detail-card {
  background: rgba(255, 255, 255, .96);
  border-radius: 20px;
  box-shadow: 0 14px 32px rgba(31, 93, 64, .06);
  text-align: left;
}
.cert-product-card {
  padding: 24px 24px 28px;
}
.cert-product-card small {
  display: block;
  color: #99a2ad;
  font-size: 18px;
  margin-bottom: 16px;
}
.cert-product-card strong {
  display: block;
  color: #111827;
  font-size: 30px;
  line-height: 1.2;
  font-weight: 900;
}
.cert-product-card em {
  display: block;
  margin-top: 16px;
  color: #4a8fd9;
  font-size: 22px;
  font-style: normal;
  font-weight: 700;
}
.cert-product-card p {
  margin: 26px 0 0;
  color: #667085;
  font-size: 22px;
  line-height: 1.5;
  word-break: break-all;
}
.cert-detail-card {
  margin-top: 26px;
  padding: 24px 24px 22px;
}
.cert-detail-card h2 {
  margin: 0 0 24px;
  color: #101828;
  font-size: 26px;
  line-height: 1.25;
}
.authorization-explain { margin: -2px 0 4px; color: var(--verify-muted, #7d8ca7); font-size: 13px; line-height: 1.6; }
.cert-detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 0;
  border-top: 1px solid #eef1f4;
  color: #667085;
  font-size: 21px;
}
.cert-detail-row strong {
  color: #101828;
  font-size: 22px;
}
.cert-detail-row b {
  min-width: 56px;
  height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #5f43b2;
  background: #f0eaff;
  font-size: 23px;
}
.verify-result-card.is-warning .official-pill {
  color: #9a3412;
  background: #fff7ed;
  border-color: #fed7aa;
}
.verify-result-card.is-warning .official-pill span { background: #f97316; }
.verify-result-card.is-warning .cert-icon { background: #fff1e6; }
.verify-result-card.is-warning .cert-icon span {
  width: 58px;
  height: 58px;
  border: 0;
  transform: none;
  position: relative;
}
.verify-result-card.is-warning .cert-icon span::before,
.verify-result-card.is-warning .cert-icon span::after {
  content: '';
  position: absolute;
  left: 25px;
  top: 2px;
  width: 9px;
  height: 54px;
  border-radius: 999px;
  background: #f97316;
}
.verify-result-card.is-warning .cert-icon span::before { transform: rotate(45deg); }
.verify-result-card.is-warning .cert-icon span::after { transform: rotate(-45deg); }
.verify-result-card.is-warning .cert-title { color: #9a3412; }
@media (max-width: 560px) {
  .verify-result-card { margin: 92px 14px 24px; padding: 32px 20px 30px; }
  .official-pill { min-height: 40px; padding: 0 24px; font-size: 18px; }
  .cert-icon { width: 104px; height: 104px; margin-top: 34px; }
  .cert-title { font-size: 38px; }
  .cert-subtitle { font-size: 18px; margin-bottom: 32px; }
  .cert-product-card strong { font-size: 27px; }
  .cert-product-card em,
  .cert-product-card p,
  .cert-detail-row strong { font-size: 20px; }
  .cert-detail-card h2 { font-size: 24px; }
  .cert-detail-row { font-size: 19px; }
}



/* iOS 27 消费端验证页 */
.verify-page {
  background:
    radial-gradient(circle at 12% 5%, rgba(10,132,255,.18), transparent 34%),
    radial-gradient(circle at 88% 16%, rgba(94,92,230,.14), transparent 30%),
    linear-gradient(180deg, #fbfdff 0%, #eef6ff 100%) !important;
  color: #0b1220 !important;
}
.verify-bg {
  background:
    radial-gradient(circle at 78% 30%, rgba(10,132,255,.12), transparent 34%),
    radial-gradient(circle at 14% 18%, rgba(94,92,230,.10), transparent 32%),
    linear-gradient(180deg, rgba(251,253,255,.94), rgba(238,246,255,.96)),
    var(--verify-bg-image) !important;
}
.brand-banner,
.query-panel,
.info-panel,
.state-panel,
.consumer-footer-card,
.config-section,
.verify-result-card,
.cert-product-card,
.cert-detail-card,
.trace-latest-card,
.store-card,
.qr-card img,
.anti-channeling-risk-card,
.anti-channeling-note {
  border-radius: 26px !important;
  border: 1px solid rgba(255,255,255,.66) !important;
  background: linear-gradient(145deg, rgba(255,255,255,.78), rgba(255,255,255,.48)) !important;
  box-shadow: 0 22px 58px rgba(31,89,165,.12), inset 0 1px 0 rgba(255,255,255,.82) !important;
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
}
.product-banner {
  margin: 12px 14px 18px !important;
  border: 1px solid rgba(255,255,255,.66) !important;
  border-radius: 30px !important;
  box-shadow: 0 22px 58px rgba(31,89,165,.13), inset 0 1px 0 rgba(255,255,255,.82) !important;
  background: rgba(255,255,255,.62) !important;
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
}
.product-banner img { border-radius: 28px !important; }
.section-title i {
  width: 8px !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, var(--verify-primary), #64d2ff) !important;
}
.section-title h1,
.section-title h2,
.cert-title {
  font-weight: 920 !important;
  letter-spacing: -.045em !important;
}
.verify-button,
.official-pill {
  border-radius: 999px !important;
  border: 1px solid rgba(255,255,255,.48) !important;
  background: linear-gradient(135deg, var(--verify-primary), #4aa3ff 58%, #64d2ff) !important;
  color: #fff !important;
  box-shadow: 0 16px 34px color-mix(in srgb, var(--verify-primary) 26%, transparent), inset 0 1px 0 rgba(255,255,255,.42) !important;
}
.official-pill span { background: rgba(255,255,255,.9) !important; }
.cert-icon {
  background: linear-gradient(145deg, rgba(48,209,88,.18), rgba(255,255,255,.68)) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.82), 0 18px 42px rgba(48,209,88,.12) !important;
}
.cert-icon span { border-color: #30d158 !important; }
.cert-title { color: #12863d !important; }
.cert-product-card strong,
.cert-detail-card h2,
.cert-detail-row strong { color: #0b1220 !important; }
.cert-product-card em,
.trace-dot,
.config-step b { color: var(--verify-primary) !important; }
.trace-dot { background: rgba(10,132,255,.12) !important; }
.qr-card img,
.store-card { border-width: 1px !important; }
.verify-result-card.is-warning,
.anti-channeling-risk-card,
.anti-channeling-note {
  background: linear-gradient(145deg, rgba(255, 247, 237, .82), rgba(255,255,255,.52)) !important;
  border-color: rgba(255, 159, 10, .24) !important;
}
.verify-result-card.is-warning .official-pill {
  background: linear-gradient(135deg, #ff9f0a, #ffb340) !important;
  color: #fff !important;
}
.verify-result-card.is-warning .cert-title { color: #b45309 !important; }
.verify-result-card.is-warning .cert-icon { background: rgba(255,159,10,.14) !important; }
/* Keep anti-channeling evidence visibly distinct from white product cards. */
.anti-channeling-risk-card,
.anti-channeling-note {
  background: linear-gradient(145deg, #fff1df 0%, #fff8ef 100%) !important;
  border-color: #fdba74 !important;
  color: #9a3412 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.anti-channeling-risk-card h2 { color: #c2410c !important; }
.anti-channeling-risk-card span { color: #b45309 !important; }
.anti-channeling-risk-card strong { color: #7c2d12 !important; }
.anti-channeling-risk-card p { color: #9a3412 !important; }

@media (max-width: 560px) {
  .product-banner { margin: 10px 10px 14px !important; border-radius: 26px !important; }
  .query-panel,
  .info-panel,
  .state-panel,
  .consumer-footer-card,
  .anti-channeling-note,
  .anti-channeling-risk-card,
  .config-sections { margin-left: 14px !important; margin-right: 14px !important; }
  .anti-channeling-risk-card {
    padding: 18px 16px !important;
    border-radius: 22px !important;
    background: linear-gradient(160deg, #fff0df 0%, #fff9f1 100%) !important;
  }
  .anti-channeling-risk-card div {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .anti-channeling-risk-card strong { text-align: left; word-break: break-word; }
  .verify-result-card { margin-left: 14px !important; margin-right: 14px !important; border-radius: 28px !important; }
}
</style>
