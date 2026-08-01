<template><CrudPage :config="config" /></template>
<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import CrudPage from '@/components/CrudPage.vue';
import { processApi, productsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { makeBatchNo, nowDateTime } from '@/utils/lowcode';
const config = reactive({
  title: '流程管理', shortTitle: '流程记录', api: processApi, detailApi: true, scrollX: 1300,
  createPermission: 'process:manage', updatePermission: 'process:manage', deletePermission: 'process:manage',
  lowCode: {
    title: '流程低代码助手',
    description: '常见生产、质检、仓储流程可一键生成，减少重复填写流程类型和内容。',
    formTips: ['选择流程模板后，补充产品ID和批次号即可保存。', '流程数据可视化配置已预填常用字段，可直接按项维护。'],
    steps: [
      { title: '选择流程模板', description: '原料、生产、质检、入库模板会自动填充。' },
      { title: '补齐产品批次', description: '填写产品ID、批次号和操作人。' },
      { title: '保存流程记录', description: '流程会进入溯源链展示。' },
    ],
    presets: [
      { label: '原料入库流程', description: '原料到货、验收、入库。', values: () => ({ batch_no: makeBatchNo('BATCH'), process_type: '原料', process_name: '原料入库', process_time: nowDateTime(), status: 1, process_content: '原料到货验收并入库。', process_data: { 供应商: '', 原料批次: '', 验收结果: '合格' } }) },
      { label: '生产加工流程', description: '生产线加工记录。', values: () => ({ batch_no: makeBatchNo('BATCH'), process_type: '生产', process_name: '生产加工', process_time: nowDateTime(), status: 1, process_content: '产品按工艺流程完成生产加工。', process_data: { 车间: '', 生产线: '', 班次: '' } }) },
      { label: '质量检测流程', description: '质检通过记录。', values: () => ({ batch_no: makeBatchNo('BATCH'), process_type: '质检', process_name: '质量检测', process_time: nowDateTime(), status: 1, process_content: '质检结果合格，允许进入下一流程。', process_data: { 检测员: '', 报告编号: '', 结果: '合格' } }) },
    ],
  },
  filters: [
    { key: 'keyword', label: '关键词', type: 'input', placeholder: '流程名称/内容' },
    { key: 'product_id', label: '关联产品', type: 'select', options: [] as any[], placeholder: '请选择产品' },
    { key: 'batch_no', label: '批次号', type: 'input' },
  ],
  columns: [
    { title: '关联产品', dataIndex: 'product_label', width: 220, render: (row:any) => row.product_label || row.product_id || '-' },
    { title: '批次号', dataIndex: 'batch_no', width: 160 },
    { title: '流程类型', dataIndex: 'process_type', width: 130 },
    { title: '流程名称', dataIndex: 'process_name', width: 160 },
    { title: '操作人', dataIndex: 'operator', width: 100 },
    { title: '地点', dataIndex: 'location', width: 140 },
    { title: '流程时间', dataIndex: 'process_time', type: 'time', width: 170 },
    { title: '状态', dataIndex: 'status', statusModule: 'trace', width: 90 },
  ],
  formFields: [
    { key: 'product_id', label: '关联产品', type: 'select', required: true, options: [] as any[], placeholder: '请选择产品' },
    { key: 'batch_no', label: '批次号', required: true },
    { key: 'process_type', label: '流程类型', required: true, quickOptions: ['原料', '生产', '质检', '仓储', '物流'] },
    { key: 'process_name', label: '流程名称', required: true, quickOptions: ['原料入库', '生产加工', '质量检测', '成品入库', '物流发货'] },
    { key: 'operator', label: '操作人', quickOptions: ['系统管理员', '生产员', '质检员', '仓库员'] },
    { key: 'location', label: '地点', quickOptions: ['原料仓', '生产车间', '质检室', '成品仓'] },
    { key: 'process_time', label: '流程时间', type: 'datetime' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.trace) },
    { key: 'process_content', label: '流程内容', type: 'textarea', span: 24 },
    { key: 'process_data', label: '流程数据可视化配置', type: 'json', span: 24 },
  ],
});
async function loadProductOptions() {
  try {
    const rows = await productsApi.select();
    for (const group of [config.filters, config.formFields]) {
      const field = group.find((item: any) => item.key === 'product_id');
      if (field) field.options = rows;
    }
  } catch {
    // 产品下拉失败不影响主功能
  }
}
onMounted(loadProductOptions);
</script>
