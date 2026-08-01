<template>
  <div>
    <AiTraceAutomationPanel
      v-if="AI_FEATURE_ENABLED"
      module-key="product"
      title="产品档案 AI 自动巡检与补链"
      description="巡检产品必填资料、所属经销商、防伪码关联和产品溯源链；可推导的关联自动修复，缺失业务资料列入人工待办。"
      compact
      @completed="crudRef?.load?.()"
    />
    <CrudPage ref="crudRef" :config="config" />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import CrudPage from '@/components/CrudPage.vue';
import AiTraceAutomationPanel from '@/components/AiTraceAutomationPanel.vue';
import { AI_FEATURE_ENABLED } from '@/config/features';
import { agentsApi, productsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { makeNo, todayDate } from '@/utils/lowcode';
import { useI18n } from '@/i18n';

const { t } = useI18n();
const crudRef = ref<any>();
const statusOptions = toOptions(statusMaps.product);
const manufacturerOptions = ref<any[]>([]);
const dealerOptions = ref<any[]>([]);

async function loadManufacturerOptions() {
  try {
    const rows = await productsApi.manufacturers();
    manufacturerOptions.value = (Array.isArray(rows) ? rows : []).map((item: any) => {
      const value = String(item.company_name || item.manufacturer_name || item.value || '').trim();
      const code = String(item.manufacturer_code || '').trim();
      return {
        ...item,
        value,
        label: `${value || '未命名公司'}${code ? `（${code}）` : ''}`,
      };
    }).filter((item: any) => item.value);
  } catch {
    manufacturerOptions.value = [];
  }
}

async function loadDealerOptions() {
  try {
    const rows = await agentsApi.select();
    dealerOptions.value = (Array.isArray(rows) ? rows : []).map((item: any) => {
      const id = Number(item.id ?? item.value);
      const name = String(item.agent_name || item.label || item.agent_code || '').trim();
      const region = [item.province, item.city, item.district].filter(Boolean).join(' / ');
      return {
        ...item,
        value: `agent:${id}`,
        label: `${name || '未命名经销商'}${region ? `（${region}）` : '（未设置地区）'}`,
      };
    }).filter((item: any) => Number.isInteger(Number(item.id)) && Number(item.id) > 0);
  } catch {
    dealerOptions.value = [];
  }
}

function clearOwnerFields(extra: Record<string, any>) {
  for (const key of [
    'product_owner_partner_id', 'owner_partner_id', 'partner_id',
    'product_owner_party_type', 'owner_party_type',
    'product_owner_source_id', 'owner_source_id',
    'product_owner_name', 'owner_name',
    'product_owner_address', 'owner_address',
    'product_owner_mode', 'owner_mode',
    'product_owner_province', 'owner_province',
    'product_owner_province_code', 'owner_province_code',
    'product_owner_city', 'owner_city',
    'product_owner_city_code', 'owner_city_code',
    'product_owner_authorization_level',
  ]) delete extra[key];
}

function findDealer(value: any) {
  const text = String(value || '').trim();
  return dealerOptions.value.find((item) => String(item.value) === text || `agent:${item.id}` === text);
}

function applyDealerOwner(extra: Record<string, any>, dealer: any) {
  clearOwnerFields(extra);
  if (!dealer) return;
  const id = Number(dealer.id ?? dealer.source_id);
  const name = String(dealer.agent_name || dealer.label || dealer.agent_code || '').trim();
  extra.product_owner_mode = 'agent';
  extra.product_owner_partner_id = `agent:${id}`;
  extra.product_owner_party_type = 'agent';
  extra.product_owner_source_id = id;
  extra.product_owner_name = name;
  extra.product_owner_address = String(dealer.address || '').trim();
  extra.product_owner_province = String(dealer.province || '').trim();
  extra.product_owner_city = String(dealer.city || '').trim();
  extra.product_owner_authorization_level = 'third';
}

function handleOwnerDealerChange(value: any, form: Record<string, any>) {
  const dealer = findDealer(value);
  const extra = (form.extra_fields && typeof form.extra_fields === 'object' && !Array.isArray(form.extra_fields)) ? { ...form.extra_fields } : {};
  applyDealerOwner(extra, dealer);
  form.extra_fields = extra;
  if (dealer && !dealer.province) Message.warning('该经销商尚未设置所属地区，请先到经销商档案至少选择省级地区');
}
function beforeSave(payload: Record<string, any>) {
  const data = { ...payload };
  const dealer = findDealer(data.product_owner_partner_id);
  const extra = (data.extra_fields && typeof data.extra_fields === 'object' && !Array.isArray(data.extra_fields)) ? { ...data.extra_fields } : {};
  applyDealerOwner(extra, dealer);
  delete data.product_owner_name;
  delete data.product_owner_region;
  delete data.owner_partner_id;
  delete data.product_owner_partner_id;
  data.extra_fields = extra;
  return data;
}

const config = computed(() => ({
  i18nKey: 'products',
  title: '产品列表', shortTitle: t('products.shortTitle'), api: productsApi, detailApi: true, scrollX: 1380,
  createPermission: 'product:manage', updatePermission: 'product:manage', deletePermission: 'product:manage',
  beforeSave,
  lowCode: {
    title: t('products.lowTitle'),
    description: '产品建档关联制造商和所属经销商；生成防伪码无需设置地区，发货时再按实际发货位置确定授权地区。',
    formTips: ['所属公司（制造商）从“企业主体管理”中选择。', '所属经销商仅用于产品业务归属；生成防伪码时不会写入地区。'],
    steps: [
      { title: '填写产品基础信息', description: '录入名称、品类、批号、保质期并选择所属公司（制造商），产品编号可自动生成。' },
      { title: '选择所属经销商', description: '经销商至少选择省级地区，产品地区会自动跟随；也可继续选择到市或区县。' },
      { title: '生成防伪码', description: '选择产品后自动带出生产批号，并自动写入溯源链。' },
    ],
    presets: [
      { label: t('products.food'), description: t('products.foodDesc'), values: () => ({ product_code: makeNo('P'), category: '食品', unit: '件', production_date: todayDate(), batch_no: '', product_owner_partner_id: '', shelf_life: '12个月', storage_condition: '阴凉干燥处', status: 1, description: '用于防伪溯源的食品产品档案。', extra_fields: { 保质期: '12个月', storage_condition: '阴凉干燥处', 贮藏方法: '阴凉干燥处', 产地: '', 执行标准: '' } }) },
      { label: t('products.cosmetics'), description: t('products.cosmeticsDesc'), values: () => ({ product_code: makeNo('P'), category: '化妆品', unit: '瓶', production_date: todayDate(), batch_no: '', product_owner_partner_id: '', shelf_life: '36个月', storage_condition: '避光、密封、置阴凉干燥处。', status: 1, description: '用于防伪溯源的化妆品产品档案。', extra_fields: { 批准文号: '', 功效: '', 适用肤质: '', 保质期: '36个月', storage_condition: '避光、密封、置阴凉干燥处。', 贮藏方法: '避光、密封、置阴凉干燥处。' } }) },
      { label: t('products.electronics'), description: t('products.electronicsDesc'), values: () => ({ product_code: makeNo('P'), category: '电子产品', unit: '台', production_date: todayDate(), batch_no: '', product_owner_partner_id: '', shelf_life: '12个月', storage_condition: '常温干燥环境保存，避免高温、潮湿和强磁环境。', status: 1, description: '用于防伪溯源的电子产品档案。', extra_fields: { 型号: '', 质保期: '12个月', 序列号规则: '', 售后电话: '', storage_condition: '常温干燥环境保存，避免高温、潮湿和强磁环境。', 贮藏方法: '常温干燥环境保存，避免高温、潮湿和强磁环境。' } }) },
    ],
  },
  filters: [
    { key: 'keyword', label: t('products.keyword'), type: 'input', placeholder: t('products.keywordPlaceholder') },
    { key: 'category', label: t('products.category'), type: 'input', placeholder: t('products.categoryPlaceholder') },
    { key: 'brand', label: t('products.brand'), type: 'input', placeholder: t('products.brandPlaceholder') },
    { key: 'manufacturer', label: '所属公司（制造商）', type: 'select', options: () => manufacturerOptions.value, placeholder: '选择公司' },
    { key: 'status', label: t('products.status'), type: 'select', options: statusOptions },
  ],
  columns: [
    { title: t('products.code'), dataIndex: 'product_code', width: 160 },
    { title: t('products.name'), dataIndex: 'product_name', width: 180 },
    { title: t('products.category'), dataIndex: 'category', width: 120 },
    { title: t('products.brand'), dataIndex: 'brand', width: 120 },
    { title: '所属公司（制造商）', dataIndex: 'manufacturer', width: 210 },
    { title: t('products.spec'), dataIndex: 'specification', width: 120 },
    { title: t('products.unit'), dataIndex: 'unit', width: 80 },
    { title: '生产日期', dataIndex: 'production_date', width: 120 },
    { title: '生产批号', dataIndex: 'batch_no', width: 150 },
    { title: '所属经销商', dataIndex: 'product_owner_name', width: 180, render: (row: any) => row.product_owner_name || '-' },
    { title: '经销商所属地区', dataIndex: 'product_owner_region', width: 190, render: (row: any) => row.product_owner_region || '-' },
    { title: '保质期', dataIndex: 'shelf_life', width: 110 },
    { title: '贮藏方法', dataIndex: 'storage_condition', width: 180 },
    { title: t('products.image'), dataIndex: 'image_url', type: 'image', width: 90 },
    { title: t('products.status'), dataIndex: 'status', statusModule: 'product', width: 90 },
    { title: t('products.createdAt'), dataIndex: 'created_at', type: 'time', width: 170 },
  ],
  formFields: [
    { key: 'product_code', label: t('products.code'), placeholder: '可留空，系统自动生成', help: '新建产品时可留空，保存后系统会自动生成唯一产品编号。' },
    { key: 'product_name', label: t('products.name'), required: true, placeholder: '请输入产品名称' },
    { key: 'category', label: t('products.category'), required: true, quickOptions: ['食品', '化妆品', '电子产品', '农产品', '日用品'] },
    { key: 'batch_no', label: '生产批号', required: true, placeholder: '例如 BATCH20260709001', help: '后续生成溯源码时会自动带出该批号。' },
    { key: 'manufacturer', label: '所属公司（制造商）', type: 'select', required: true, options: () => manufacturerOptions.value, placeholder: '请选择已建档的公司', help: '选项来自“企业主体管理”中已启用的公司；生成防伪码后会自动写入并展示在消费者验证页面。' },
    { key: 'shelf_life', label: '保质期', required: true, quickOptions: ['6个月', '12个月', '18个月', '24个月', '36个月', '长期有效'], help: '保存后会自动写入产品溯源和消费者查询结果。' },
    { key: 'product_owner_partner_id', label: '所属经销商（可选）', type: 'select', options: () => dealerOptions.value, placeholder: '请选择已设置地区的经销商', onChange: handleOwnerDealerChange, help: '选择后自动采用经销商档案中的省 / 市 / 区县；产品不再单独维护地区。' },
    { key: 'brand', label: t('products.brand'), placeholder: '可选' },
    { key: 'specification', label: t('products.spec'), placeholder: '如 500ml/瓶、12件/箱' },
    { key: 'unit', label: t('products.unit'), quickOptions: ['件', '盒', '瓶', '箱', '台'] },
    { key: 'production_date', label: '生产日期', type: 'date', help: '可选；填写后会自动写入产品溯源节点。' },
    { key: 'description', label: t('products.description'), type: 'textarea', span: 24, quickOptions: ['正品防伪溯源产品，扫码可查询真伪和流通信息。', '本产品已接入防伪溯源系统。'] },
    { key: 'status', label: t('products.status'), type: 'select', options: statusOptions },
  ],
}));

onMounted(() => { void Promise.all([loadManufacturerOptions(), loadDealerOptions()]); });
</script>
