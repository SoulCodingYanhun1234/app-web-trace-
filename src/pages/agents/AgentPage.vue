<template>
  <CrudPage ref="crudRef" :config="config">
    <template #row-actions="{ record }">
      <el-button v-if="Number(record.status) !== 1" text type="success" size="small" @click="setStatus(record, 1)">启用</el-button>
      <el-button v-else text type="warning" size="small" @click="setStatus(record, 0)">冻结</el-button>
    </template>
  </CrudPage>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import CrudPage from '@/components/CrudPage.vue';
import { agentsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { chinaRegionOptions } from '@/data/chinaRegionOptions';
import { makeNo } from '@/utils/lowcode';

const crudRef = ref();

function regionPath(record: Record<string, any>) {
  return [record.province, record.city, record.district].map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeRegionPayload(payload: Record<string, any>) {
  const path = Array.isArray(payload.region_path)
    ? payload.region_path.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const next = { ...payload };
  delete next.region_path;
  next.province = path[0] || null;
  next.city = path[1] || null;
  next.district = path[2] || null;
  return next;
}

const config = {
  title: '代理商列表', shortTitle: '代理商', api: agentsApi, detailApi: true, scrollX: 1500, actionWidth: 320,
  createPermission: 'agent:manage', updatePermission: 'agent:manage', deletePermission: 'agent:manage',
  beforeSave: normalizeRegionPayload,
  lowCode: {
    title: '代理商低代码配置助手',
    description: '按代理类型自动填充编号、等级、状态和备注，降低新增代理商时对字段含义的理解成本。',
    formTips: ['先选择代理商模板，再填写代理商名称、联系人和所属地区。', '所属地区使用省 / 市 / 区县三级联动，可选择省级、市级，或继续选择到区县。'],
    steps: [
      { title: '选模板', description: '总部代理、区域代理、门店代理模板会自动设置代理等级。' },
      { title: '补联系人', description: '填写联系人、电话、邮箱，便于后续发货和退货。' },
      { title: '选择所属地区', description: '在一个下拉框中按省、市、区县逐级选择。' },
      { title: '启用或冻结', description: '新代理默认启用，异常代理可在列表中一键冻结。' },
    ],
    presets: [
      { label: '总部代理模板', description: '一级代理，适合总经销/省代。', values: () => ({ agent_code: makeNo('AG'), level: 1, status: 1, remark: '总部/一级代理，拥有下级代理管理权限。' }) },
      { label: '区域代理模板', description: '二级代理，适合城市或区域代理。', values: () => ({ agent_code: makeNo('AG'), level: 2, status: 1, remark: '区域代理，请填写上级代理ID。' }) },
      { label: '门店代理模板', description: '三级代理，适合门店、经销网点。', values: () => ({ agent_code: makeNo('AG'), level: 3, status: 1, remark: '门店代理，仅用于发货签收和退货记录。' }) },
    ],
  },
  filters: [
    { key: 'keyword', label: '关键词', type: 'input', placeholder: '代理商名称/联系人/编号' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.common) },
  ],
  columns: [
    { title: '代理商编号', dataIndex: 'agent_code', width: 130 },
    { title: '代理商名称', dataIndex: 'agent_name', width: 180 },
    { title: '联系人', dataIndex: 'contact_name', width: 110 },
    { title: '电话', dataIndex: 'contact_phone', width: 140 },
    { title: '邮箱', dataIndex: 'contact_email', width: 180 },
    { title: '所属地区', dataIndex: 'province', width: 240, render: (row: any) => [row.province, row.city, row.district].filter(Boolean).join(' / ') || '-' },
    { title: '等级', dataIndex: 'level', width: 80 },
    { title: '上级ID', dataIndex: 'parent_id', width: 90 },
    { title: '状态', dataIndex: 'status', statusModule: 'common', width: 90 },
  ],
  formFields: [
    { key: 'agent_code', label: '代理商编号', placeholder: '不填写则自动生成' },
    { key: 'agent_name', label: '代理商名称', required: true },
    { key: 'contact_name', label: '联系人' },
    { key: 'contact_phone', label: '联系电话' },
    { key: 'contact_email', label: '联系邮箱' },
    {
      key: 'region_path',
      label: '经销商所属地区',
      type: 'cascader',
      required: true,
      options: chinaRegionOptions,
      valueGetter: regionPath,
      cascaderProps: { emitPath: true, checkStrictly: true, expandTrigger: 'hover' },
      placeholder: '请选择省 / 市 / 区县',
      help: '支持选择到省级、市级或区县级；所选地区用于自动判定该经销商名下产品的归属地区。',
      span: 24,
    },
    { key: 'address', label: '详细地址', span: 24 },
    { key: 'business_license', label: '营业执照号' },
    { key: 'level', label: '代理等级', type: 'number', help: '1=一级代理，2=区域代理，3=门店代理。可直接使用模板自动填充。' },
    { key: 'parent_id', label: '上级代理ID', type: 'number', placeholder: '可为空，支持多级代理', help: '只有二级/三级代理需要填写，上级代理ID可从代理商列表复制。' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.common) },
    { key: 'remark', label: '备注', type: 'textarea', span: 24 },
  ],
};
async function setStatus(record: any, status: number) {
  await agentsApi.update(record.id, { status });
  Message.success(status === 1 ? '代理商已启用' : '代理商已冻结');
  crudRef.value?.load(true);
}
</script>
