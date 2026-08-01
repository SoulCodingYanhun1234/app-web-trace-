<template>
  <div class="visual-config-editor" :class="{ compact }">
    <div v-if="!compact" class="visual-config-head">
      <div>
        <strong>可视化配置</strong>
        <p>通过表单维护对象、列表和字段值，保存时系统会自动转换为后端所需结构。</p>
      </div>
      <el-radio-group v-model="containerType" size="small" @change="resetRowsForType">
        <el-radio-button label="object">字段表</el-radio-button>
        <el-radio-button label="array">列表</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="!rows.length" class="visual-config-empty">
      <el-empty :image-size="60" description="暂无配置项">
        <el-button type="primary" size="small" @click="addRow">新增配置项</el-button>
      </el-empty>
    </div>

    <div v-else class="visual-config-list">
      <div v-for="(row, index) in rows" :key="row.uid" class="visual-config-row">
        <div class="visual-config-row-main">
          <el-input
            v-if="containerType === 'object'"
            v-model="row.key"
            class="config-key"
            placeholder="字段名称，如 product_name"
            clearable
          />
          <div v-else class="config-index">#{{ index + 1 }}</div>

          <el-select v-model="row.kind" class="config-kind" size="small" @change="onKindChange(row)">
            <el-option label="文本" value="text" />
            <el-option label="数字" value="number" />
            <el-option label="开关" value="boolean" />
            <el-option label="字段组" value="object" />
            <el-option label="列表" value="array" />
            <el-option label="空值" value="null" />
          </el-select>

          <el-input v-if="row.kind === 'text'" v-model="row.value" class="config-value" placeholder="请输入内容" clearable />
          <el-input-number v-else-if="row.kind === 'number'" v-model="row.value" class="config-value" />
          <el-switch v-else-if="row.kind === 'boolean'" v-model="row.value" class="config-switch" />
          <el-tag v-else-if="row.kind === 'null'" type="info" class="config-null">空值</el-tag>
          <div v-else class="config-nested-label">{{ row.kind === 'object' ? '字段组' : '列表' }}</div>

          <el-button text type="danger" size="small" @click="removeRow(index)">删除</el-button>
        </div>

        <JsonEditor v-if="row.kind === 'object' || row.kind === 'array'" v-model="row.value" compact class="visual-config-nested" />
      </div>
    </div>

    <div class="visual-config-actions">
      <el-button size="small" type="primary" plain @click="addRow">新增配置项</el-button>
      <el-button v-if="rows.length" size="small" @click="duplicateLast">复制最后一项</el-button>
      <el-button v-if="rows.length" size="small" text type="danger" @click="clearRows">清空</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

defineOptions({ name: 'JsonEditor' });
const props = defineProps<{ compact?: boolean }>();
const model = defineModel<any>({ default: () => ({}) });

type RowKind = 'text' | 'number' | 'boolean' | 'object' | 'array' | 'null';
type ConfigRow = { uid: string; key: string; kind: RowKind; value: any };

const compact = props.compact || false;
const containerType = ref<'object' | 'array'>(Array.isArray(model.value) ? 'array' : 'object');
const rows = ref<ConfigRow[]>([]);
let syncing = false;
let uidSeed = 0;

function nextUid() { uidSeed += 1; return `${Date.now()}_${uidSeed}`; }
function cloneValue(value: any) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return Array.isArray(value) ? [] : {}; }
}
function detectKind(value: any): RowKind {
  if (Array.isArray(value)) return 'array';
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'text';
}
function defaultValue(kind: RowKind) {
  if (kind === 'array') return [];
  if (kind === 'object') return {};
  if (kind === 'number') return 0;
  if (kind === 'boolean') return false;
  if (kind === 'null') return null;
  return '';
}
function makeRow(key: string, value: any): ConfigRow {
  const kind = detectKind(value);
  return { uid: nextUid(), key, kind, value: cloneValue(value ?? defaultValue(kind)) };
}
function loadRows(value: any) {
  containerType.value = Array.isArray(value) ? 'array' : 'object';
  if (Array.isArray(value)) rows.value = value.map((item) => makeRow('', item));
  else if (value && typeof value === 'object') rows.value = Object.entries(value).map(([key, val]) => makeRow(key, val));
  else rows.value = [];
}
function valueFromRow(row: ConfigRow) {
  if (row.kind === 'number') return Number(row.value || 0);
  if (row.kind === 'boolean') return Boolean(row.value);
  if (row.kind === 'null') return null;
  if (row.kind === 'array') return Array.isArray(row.value) ? row.value : [];
  if (row.kind === 'object') return row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
  return String(row.value ?? '');
}
function buildValue() {
  if (containerType.value === 'array') return rows.value.map(valueFromRow);
  const next: Record<string, any> = {};
  rows.value.forEach((row) => {
    const key = String(row.key || '').trim();
    if (!key) return;
    next[key] = valueFromRow(row);
  });
  return next;
}
function syncToModel() {
  syncing = true;
  model.value = buildValue();
  nextTick(() => { syncing = false; });
}
function addRow() { rows.value.push(makeRow(containerType.value === 'object' ? `field_${rows.value.length + 1}` : '', '')); }
function removeRow(index: number) { rows.value.splice(index, 1); }
function clearRows() { rows.value = []; }
function duplicateLast() {
  const last = rows.value[rows.value.length - 1];
  if (!last) return addRow();
  rows.value.push({ uid: nextUid(), key: containerType.value === 'object' ? `${last.key || 'field'}_copy` : '', kind: last.kind, value: cloneValue(last.value) });
}
function onKindChange(row: ConfigRow) { row.value = defaultValue(row.kind); }
function resetRowsForType() { rows.value = []; addRow(); }

watch(() => model.value, (value) => {
  if (syncing) return;
  loadRows(value);
}, { immediate: true, deep: true });

watch([containerType, rows], syncToModel, { deep: true });
</script>

<style scoped>
.visual-config-editor { width: 100%; border: 1px solid rgba(207, 224, 255, .9); border-radius: 16px; background: rgba(248, 251, 255, .72); padding: 12px; }
.visual-config-editor.compact { margin-top: 10px; padding: 10px; background: rgba(255, 255, 255, .72); }
.visual-config-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.visual-config-head strong { color: var(--text-1); font-size: 14px; }
.visual-config-head p { margin: 4px 0 0; color: var(--text-2); font-size: 12px; line-height: 1.5; }
.visual-config-empty { padding: 8px 0; }
.visual-config-list { display: flex; flex-direction: column; gap: 10px; }
.visual-config-row { border: 1px solid rgba(226, 232, 240, .95); border-radius: 14px; background: rgba(255, 255, 255, .88); padding: 10px; }
.visual-config-row-main { display: flex; align-items: center; gap: 8px; }
.config-key { flex: 0 0 220px; }
.config-index { width: 52px; height: 32px; display: inline-grid; place-items: center; border-radius: 10px; background: #eef4ff; color: var(--primary); font-weight: 800; }
.config-kind { flex: 0 0 110px; }
.config-value { flex: 1 1 auto; min-width: 160px; }
.config-switch { margin: 0 20px; }
.config-null, .config-nested-label { min-width: 86px; text-align: center; }
.config-nested-label { color: var(--text-2); font-size: 13px; }
.visual-config-nested { margin-left: 24px; }
.visual-config-actions { margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
:global(html[data-theme="dark"]) .visual-config-editor { background: rgba(15, 23, 42, .72); border-color: rgba(96, 165, 250, .32); }
:global(html[data-theme="dark"]) .visual-config-row { background: rgba(15, 23, 42, .82); border-color: rgba(96, 165, 250, .25); }
:global(html[data-theme="dark"]) .config-index { background: rgba(59, 130, 246, .18); }
@media (max-width: 760px) {
  .visual-config-head, .visual-config-row-main { align-items: stretch; flex-direction: column; }
  .config-key, .config-kind, .config-value { width: 100%; flex-basis: auto; }
  .visual-config-nested { margin-left: 0; }
}
</style>
