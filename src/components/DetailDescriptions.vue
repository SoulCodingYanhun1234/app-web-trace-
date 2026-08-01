<template>
  <div class="detail-responsive-shell">
    <el-empty v-if="!visibleData.length" description="暂无详情" :image-size="58" />
    <el-descriptions v-else :column="column" border class="detail-descriptions">
      <el-descriptions-item v-for="item in visibleData" :key="String(item.label)" :label="String(item.label)">
        <div v-if="Array.isArray(item.value)" class="detail-array-value">
          <el-empty v-if="!item.value.length" description="暂无记录" :image-size="48" />
          <div v-else-if="isPrimitiveArray(item.value)" class="detail-tag-list">
            <el-tag v-for="(entry, index) in item.value" :key="index" size="small" effect="plain">{{ formatPrimitive(entry) }}</el-tag>
          </div>
          <div v-else class="detail-card-list">
            <div v-for="(entry, index) in item.value" :key="index" class="detail-json-card">
              <div class="detail-json-card-head">
                <span class="detail-json-index">{{ index + 1 }}</span>
                <span class="detail-json-title">{{ getObjectTitle(entry, index) }}</span>
                <el-tag v-if="getObjectType(entry)" size="small" effect="light">{{ getObjectType(entry) }}</el-tag>
                <span v-if="getObjectTime(entry)" class="detail-json-time">{{ getObjectTime(entry) }}</span>
              </div>
              <div v-if="getObjectMainText(entry)" class="detail-segment-list is-compact">
                <div v-for="(segment, segIndex) in splitSegments(getObjectMainText(entry))" :key="segIndex" class="detail-text-segment">
                  <span v-if="splitSegments(getObjectMainText(entry)).length > 1" class="detail-segment-index">{{ segIndex + 1 }}</span>
                  <p>{{ segment }}</p>
                </div>
              </div>
              <div v-if="objectFields(entry).length" class="detail-object-grid">
                <div v-for="field in objectFields(entry)" :key="field.path" class="detail-object-field" :class="{ 'is-wide': field.wide }">
                  <span class="detail-object-label">{{ field.label }}</span>
                  <span class="detail-object-value">{{ field.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="isPlainObject(item.value)" class="detail-object-panel">
          <div class="detail-object-grid">
            <div v-for="field in objectFields(item.value)" :key="field.path" class="detail-object-field" :class="{ 'is-wide': field.wide }">
              <span class="detail-object-label">{{ field.label }}</span>
              <span class="detail-object-value">{{ field.value }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="splitSegments(formatPrimitive(item.value)).length > 1" class="detail-segment-list">
          <div v-for="(segment, index) in splitSegments(formatPrimitive(item.value))" :key="index" class="detail-text-segment">
            <span class="detail-segment-index">{{ index + 1 }}</span>
            <p>{{ segment }}</p>
          </div>
        </div>
        <pre v-else-if="isLongText(formatPrimitive(item.value))" class="detail-pre">{{ formatPrimitive(item.value) }}</pre>
        <span v-else>{{ formatPrimitive(item.value) }}</span>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type DetailItem = { label: string | number; value: any };
type DetailField = { path: string; label: string; value: string; wide: boolean };

const props = withDefaults(defineProps<{
  data: DetailItem[];
  column?: number;
}>(), {
  column: 1,
});

const emptyValue = (value: any) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
const visibleData = computed(() => (props.data || []).filter((item) => !emptyValue(item.value)));

const labelMap: Record<string, string> = {
  id: 'ID',
  product_id: '关联产品',
  product_label: '关联产品',
  product_code: '产品编号',
  product_name: '产品名称',
  trace_no: '溯源编号',
  trace_key: '业务类型',
  anti_fake_code: '防伪码',
  code: '防伪码',
  batch_no: '生产批号',
  production_date: '生产日期',
  expiry_date: '过期日期',
  production_place: '生成地点',
  manufacturer: '公司',
  node_name: '节点名称',
  node_type: '节点类型',
  process_name: '流程名称',
  process_content: '流程内容',
  content: '内容',
  description: '说明',
  remark: '备注',
  timestamp: '记录时间',
  created_at: '创建时间',
  updated_at: '更新时间',
  operator: '操作人',
  location: '地点',
  ip: '扫码 IP',
  unit: '单位',
  brand: '品牌',
  status: '状态',
  image_url: '图片',
  box_id: '箱子ID',
  box_no: '箱号',
  box_code: '箱码',
  box_capacity: '箱容量',
  box_spec: '箱规',
  shipment_no: '发货单号',
  shipment_id: '发货单ID',
  logistics_company: '物流公司',
  logistics_no: '物流单号',
  receiver: '收件人',
  receiver_phone: '收件电话',
  receiver_address: '收件地址',
  province: '省份',
  city: '城市',
  agent_name: '代理商',
  agent_code: '代理商编号',
  detail: '业务明细',
  extra_fields: '扩展信息',
  material: '原料材质',
  standard: '执行标准',
  certificate: '合格资质',
  storage_condition: '仓储条件',
  shelf_life: '保质期限',
  origin: '产地',
  source: '来源',
  destination: '流向地区',
  来源: '来源',
  默认地区: '默认地区',
};

const titleKeys = ['node_name', 'process_name', 'trace_key', 'node_type', 'type'];
const typeKeys = ['node_type', 'trace_key', 'type'];
const timeKeys = ['timestamp', 'created_at', 'updated_at', 'time'];
const mainTextKeys = ['content', 'process_content', 'description', 'remark'];
const skipFieldKeys = new Set([...titleKeys, ...mainTextKeys]);
const wideFieldKeys = new Set(['description', 'remark', 'receiver_address', 'sender_address', 'address', 'content', 'process_content', 'extra_fields']);

function isPlainObject(value: any) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPrimitiveArray(value: any[]) {
  return value.every((item) => !Array.isArray(item) && !isPlainObject(item));
}

function isLongText(value: any) {
  const text = String(value ?? '');
  return text.includes('\n') || text.length > 80;
}

function tryFormatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) && !/^\d{4}-\d{2}-\d{2} \d{2}:/.test(value)) return value;
  return value.replace('T', ' ').replace(/\.\d{3}Z?$/, '').slice(0, 19);
}

function formatPrimitive(value: any): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return tryFormatDate(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatPrimitive).join('、') || '-';
  if (isPlainObject(value)) return JSON.stringify(value, null, 2);
  return String(value);
}

function splitSegments(value: any) {
  const text = String(value ?? '').replace(/\r/g, '').trim();
  if (!text || text === '-') return [];
  const byLine = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  if (text.length <= 150) return [text];
  const parts = text.split(/([。；;])/).reduce<string[]>((acc, part, index, source) => {
    if (!part) return acc;
    if (/^[。；;]$/.test(part) && acc.length) {
      acc[acc.length - 1] += part;
      return acc;
    }
    const nextPunctuation = source[index + 1] && /^[。；;]$/.test(source[index + 1]) ? source[index + 1] : '';
    if (!nextPunctuation) acc.push(part.trim());
    else acc.push(part.trim());
    return acc;
  }, []).map((item) => item.trim()).filter(Boolean);
  if (parts.length <= 1) return [text];
  const segments: string[] = [];
  let current = '';
  for (const part of parts) {
    if ((current + part).length > 150 && current) {
      segments.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) segments.push(current);
  return segments.length > 1 ? segments : [text];
}

function lastKey(path: string) {
  const parts = String(path || '').split('.').filter(Boolean);
  return parts[parts.length - 1] || path;
}

function resolveLabel(path: string) {
  const key = lastKey(path);
  if (labelMap[key]) return labelMap[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function shouldSkip(path: string, value: any) {
  const key = lastKey(path);
  if (emptyValue(value)) return true;
  return skipFieldKeys.has(key);
}

function isWideField(path: string, value: any) {
  const key = lastKey(path);
  const text = formatPrimitive(value);
  return wideFieldKeys.has(key) || text.length > 56 || text.includes('\n');
}

function flattenObject(value: any, prefix = '', depth = 0): DetailField[] {
  if (depth > 5) return prefix ? [{ path: prefix, label: resolveLabel(prefix), value: formatPrimitive(value), wide: true }] : [];
  if (Array.isArray(value)) {
    if (!prefix || value.length === 0) return [];
    if (isPrimitiveArray(value)) return [{ path: prefix, label: resolveLabel(prefix), value: value.map(formatPrimitive).join('、'), wide: value.length > 3 }];
    return value.flatMap((item, index) => flattenObject(item, `${prefix}.${index + 1}`, depth + 1));
  }
  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (shouldSkip(path, item)) return [];
      if (Array.isArray(item) || isPlainObject(item)) return flattenObject(item, path, depth + 1);
      return [{ path, label: resolveLabel(path), value: formatPrimitive(item), wide: isWideField(path, item) }];
    });
  }
  if (!prefix || shouldSkip(prefix, value)) return [];
  return [{ path: prefix, label: resolveLabel(prefix), value: formatPrimitive(value), wide: isWideField(prefix, value) }];
}

function objectFields(value: any) {
  return flattenObject(value).filter((field) => field.value !== '-');
}

function pickFirst(value: any, keys: string[]) {
  if (!isPlainObject(value)) return '';
  for (const key of keys) {
    if (!emptyValue(value[key])) return value[key];
  }
  return '';
}

function getObjectTitle(value: any, index: number) {
  const title = pickFirst(value, titleKeys) || value?.detail?.node_name || value?.detail?.process_name;
  return title ? formatPrimitive(title) : `流转记录 ${index + 1}`;
}

function getObjectType(value: any) {
  const type = pickFirst(value, typeKeys);
  return type ? formatPrimitive(type) : '';
}

function getObjectTime(value: any) {
  const time = pickFirst(value, timeKeys);
  return time ? formatPrimitive(time) : '';
}

function getObjectMainText(value: any) {
  const text = pickFirst(value, mainTextKeys) || value?.detail?.description || value?.detail?.content || value?.detail?.process_content;
  return text ? formatPrimitive(text) : '';
}
</script>

<style scoped>
.detail-responsive-shell {
  min-width: 0;
}
.detail-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.65;
}
.detail-descriptions :deep(.el-descriptions__label) {
  width: clamp(108px, 18vw, 180px);
  color: var(--text-2);
  font-weight: 700;
  vertical-align: top;
}
.detail-descriptions :deep(.el-descriptions__content) {
  min-width: 0;
}
.detail-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.detail-card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
  gap: 12px;
  align-items: stretch;
}
.detail-json-card {
  min-width: 0;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  padding: 12px 14px;
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.06);
}
.detail-json-card-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.detail-json-index {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  background: #2563eb;
}
.detail-json-title {
  min-width: 0;
  color: #102a43;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-json-time {
  margin-left: auto;
  color: #64748b;
  font-size: 12px;
}
.detail-segment-list {
  display: grid;
  gap: 8px;
}
.detail-segment-list.is-compact {
  margin: 6px 0 10px;
}
.detail-text-segment {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: start;
  min-width: 0;
  color: #334155;
  line-height: 1.65;
}
.detail-text-segment p {
  min-width: 0;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.detail-segment-index {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  color: #2563eb;
  background: #edf4ff;
  border: 1px solid #cfe0ff;
  font-size: 12px;
  font-weight: 800;
}
.detail-object-panel {
  min-width: 0;
}
.detail-object-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
  gap: 8px;
}
.detail-object-field {
  min-width: 0;
  border: 1px solid #e6eefb;
  border-radius: 12px;
  background: #f8fbff;
  padding: 8px 10px;
}
.detail-object-field.is-wide {
  grid-column: 1 / -1;
}
.detail-object-label {
  display: block;
  margin-bottom: 4px;
  color: #64748b;
  font-size: 12px;
}
.detail-object-value {
  display: block;
  color: #102a43;
  font-weight: 600;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 760px) {
  .detail-descriptions :deep(.el-descriptions__table) {
    display: block;
  }
  .detail-descriptions :deep(.el-descriptions__body),
  .detail-descriptions :deep(.el-descriptions__body tbody),
  .detail-descriptions :deep(.el-descriptions__body tr),
  .detail-descriptions :deep(.el-descriptions__body th),
  .detail-descriptions :deep(.el-descriptions__body td) {
    display: block;
    width: 100% !important;
  }
  .detail-descriptions :deep(.el-descriptions__label) {
    border-right: 0 !important;
    border-bottom: 0 !important;
    width: 100% !important;
    padding-bottom: 4px !important;
  }
  .detail-descriptions :deep(.el-descriptions__content) {
    padding-top: 4px !important;
  }
  .detail-card-list,
  .detail-object-grid {
    grid-template-columns: 1fr;
  }
  .detail-json-time {
    width: 100%;
    margin-left: 32px;
  }
}
:global(html[data-theme="dark"]) .detail-json-card,
:global(html[data-theme="dark"]) .detail-object-field {
  background: rgba(11, 23, 40, .72);
  border-color: rgba(148, 163, 184, .22);
}
:global(html[data-theme="dark"]) .detail-json-title,
:global(html[data-theme="dark"]) .detail-object-value {
  color: var(--text-1);
}
:global(html[data-theme="dark"]) .detail-text-segment,
:global(html[data-theme="dark"]) .detail-object-label,
:global(html[data-theme="dark"]) .detail-json-time {
  color: var(--text-3);
}
</style>


<style scoped>
.detail-responsive-shell :deep(.el-descriptions__table) {
  width: 100% !important;
  table-layout: fixed;
}
.detail-responsive-shell :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
  word-break: break-word;
}
@media (max-width: 640px) {
  .detail-descriptions :deep(.el-descriptions__label) { width: 96px; }
}
</style>
