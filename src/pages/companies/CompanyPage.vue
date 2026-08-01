<template>
  <CrudPage ref="crudRef" :config="config">
    <template #row-actions="{ record }">
      <el-button v-if="Number(record.status) !== 1" text type="success" size="small" @click="setStatus(record, 1)">启用</el-button>
      <el-button v-else text type="warning" size="small" @click="setStatus(record, 0)">停用</el-button>
    </template>
  </CrudPage>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import CrudPage from '@/components/CrudPage.vue';
import { partnersApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { makeNo } from '@/utils/lowcode';
import { cityOptions, provinceOptions } from '@/utils/regionOptions';

const crudRef = ref<any>();

const companyApi = {
  list(params?: any) { return partnersApi.list({ ...(params || {}), party_type: 'company' }); },
  detail(id: number | string) { return partnersApi.detail(id); },
  create(data: any) { return partnersApi.create({ ...(data || {}), party_type: 'company' }); },
  update(id: number | string, data: any) { return partnersApi.update(id, { ...(data || {}), party_type: 'company' }); },
  remove(id: number | string) { return partnersApi.remove(id); },
};

function syncProvince(value: string, form: Record<string, any>) {
  if (form.city && !cityOptions(value).some((item) => item.value === form.city)) form.city = '';
}

function beforeSave(data: Record<string, any>) {
  const name = String(data.party_name || data.company_name || data.manufacturer_name || '').trim();
  return {
    ...data,
    party_type: 'company',
    party_name: name,
    company_name: name,
    manufacturer_name: name,
    manufacturer_code: data.party_code || data.manufacturer_code,
  };
}

const config = computed(() => ({
  title: '公司列表',
  shortTitle: '公司',
  api: companyApi,
  detailApi: true,
  createPermission: 'manufacturer:manage',
  updatePermission: 'manufacturer:manage',
  deletePermission: 'manufacturer:manage',
  actionWidth: 230,
  scrollX: 1380,
  beforeSave,
  lowCode: {
    title: '公司档案助手',
    description: '先维护公司/生产企业档案，后续新建产品时可直接选择该公司作为产品归属。',
    formTips: ['公司档案中的省份、城市用于企业资料和装箱地点展示，不形成防伪码授权位置。', '防伪码在发货前无需位置授权，确认发货后按收货代理商所属地区校验。'],
    presets: [
      { label: '新增公司', description: '公司主体档案，适合生产企业、品牌方或授权公司。', values: () => ({ party_code: makeNo('COM'), status: 1 }) },
    ],
  },
  filters: [
    { key: 'keyword', label: '关键词', type: 'input', placeholder: '编号/公司名称/联系人/电话/地区' },
    { key: 'province', label: '省份', type: 'select', options: provinceOptions, placeholder: '选择省份', onChange: syncProvince },
    { key: 'city', label: '城市', type: 'select', options: (scope: any) => cityOptions(scope.province), placeholder: '选择城市' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.common) },
  ],
  columns: [
    { title: '公司编号', dataIndex: 'party_code', width: 150, showOverflowTooltip: true },
    { title: '公司名称', dataIndex: 'party_name', width: 230, showOverflowTooltip: true },
    { title: '地区', dataIndex: 'region', width: 170, render: (row: any) => [row.province, row.city].filter(Boolean).join(' / ') || '-' },
    { title: '联系人', dataIndex: 'contact_name', width: 120, showOverflowTooltip: true },
    { title: '联系电话', dataIndex: 'contact_phone', width: 140, showOverflowTooltip: true },
    { title: '统一社会信用代码', dataIndex: 'social_credit_code', width: 190, showOverflowTooltip: true },
    { title: '营业执照/证照', dataIndex: 'business_license', width: 170, showOverflowTooltip: true },
    { title: '状态', dataIndex: 'status', statusModule: 'common', width: 100 },
    { title: '创建时间', dataIndex: 'created_at', width: 170 },
  ],
  formFields: [
    { key: 'party_code', label: '公司编号', placeholder: '不填写则自动生成', help: '建议用 COM 开头，系统也兼容旧公司编号。' },
    { key: 'party_name', label: '公司名称', required: true, placeholder: '请输入公司名称' },
    { key: 'contact_name', label: '联系人' },
    { key: 'contact_phone', label: '联系电话' },
    { key: 'contact_email', label: '联系邮箱' },
    { key: 'province', label: '省份', type: 'select', options: provinceOptions, allowCreate: true, onChange: syncProvince, required: true },
    { key: 'city', label: '城市', type: 'select', options: (scope: any) => cityOptions(scope.province), allowCreate: true },
    { key: 'address', label: '详细地址', span: 24 },
    { key: 'business_license', label: '营业执照/证照号' },
    { key: 'social_credit_code', label: '统一社会信用代码' },
    { key: 'legal_person', label: '法人代表' },
    { key: 'production_license', label: '生产许可证' },
    { key: 'status', label: '状态', type: 'select', required: true, options: toOptions(statusMaps.common) },
    { key: 'remark', label: '备注', type: 'textarea', span: 24 },
  ],
}));

async function setStatus(record: any, status: number) {
  await partnersApi.update(record.id, { status, party_type: 'company' });
  Message.success(status === 1 ? '公司已启用' : '公司已停用');
  crudRef.value?.load(true);
}
</script>
