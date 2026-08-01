<template><CrudPage :config="config" /></template>
<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import CrudPage from '@/components/CrudPage.vue';
import { certificatesApi, productsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { futureDate, todayDate } from '@/utils/lowcode';
const config = reactive({
  title: '证书管理', shortTitle: '证书', api: certificatesApi, detailApi: true, scrollX: 1300,
  createPermission: 'certificate:manage', updatePermission: 'certificate:manage', deletePermission: 'certificate:manage',
  lowCode: {
    title: '证书低代码助手',
    description: '证书类型和有效期可用模板自动填充，上传图片/文件后即可保存。',
    formTips: ['选择证书模板后，系统会自动带出证书类型、签发日期、有效期和状态。'],
    steps: [
      { title: '选模板', description: '质检报告、授权证书、合格证会自动填充字段。' },
      { title: '上传文件', description: '上传证书图片或 PDF 文件。' },
      { title: '保存关联产品', description: '填写产品ID后保存。' },
    ],
    presets: [
      { label: '质检报告模板', description: '一年有效期。', values: () => ({ cert_type: '质检报告', issuing_authority: '质量检测中心', issue_date: todayDate(), expiry_date: futureDate(365), status: 1, remark: '产品质量检测报告。' }) },
      { label: '授权证书模板', description: '三年有效期。', values: () => ({ cert_type: '授权证书', issuing_authority: '品牌方', issue_date: todayDate(), expiry_date: futureDate(1095), status: 1, remark: '品牌授权经营证书。' }) },
      { label: '产品合格证模板', description: '常规合格证明。', values: () => ({ cert_type: '产品合格证', issuing_authority: '生产企业', issue_date: todayDate(), expiry_date: futureDate(365), status: 1, remark: '产品出厂合格证明。' }) },
    ],
  },
  filters: [
    { key: 'keyword', label: '关键词', type: 'input', placeholder: '证书名称/类型' },
    { key: 'product_id', label: '关联产品', type: 'select', options: [] as any[], placeholder: '请选择产品' },
  ],
  columns: [
    { title: '证书名称', dataIndex: 'cert_name', width: 180 },
    { title: '证书类型', dataIndex: 'cert_type', width: 130 },
    { title: '关联产品', dataIndex: 'product_label', width: 220, render: (row:any) => row.product_label || row.product_id || '-' },
    { title: '签发机构', dataIndex: 'issuing_authority', width: 160 },
    { title: '签发日期', dataIndex: 'issue_date', width: 120 },
    { title: '有效期至', dataIndex: 'expiry_date', width: 120 },
    { title: '证书图', dataIndex: 'cert_image', type: 'image', width: 90 },
    { title: '状态', dataIndex: 'status', statusModule: 'cert', width: 90 },
  ],
  formFields: [
    { key: 'cert_name', label: '证书名称', required: true },
    { key: 'cert_type', label: '证书类型', required: true, quickOptions: ['质检报告', '授权证书', '产品合格证', '营业执照'] },
    { key: 'product_id', label: '关联产品', type: 'select', required: true, options: [] as any[], placeholder: '请选择产品' },
    { key: 'issuing_authority', label: '签发机构', quickOptions: ['质量检测中心', '品牌方', '生产企业', '市场监管部门'] },
    { key: 'issue_date', label: '签发日期', type: 'date' },
    { key: 'expiry_date', label: '有效期至', type: 'date' },
    { key: 'cert_image', label: '证书图片', type: 'upload-image' },
    { key: 'cert_file', label: '证书文件', type: 'upload-cert' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.cert) },
    { key: 'remark', label: '备注', type: 'textarea', span: 24 },
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
