<template>
  <IosPage class="crud-page">
    <IosPageHero :eyebrow="t('common.traceabilityAdmin')" :title="config.title" :description="t('crud.desc')">
      <template #actions>
        <el-button :loading="loading" @click="load(true)">
          <template #icon><AppIcon name="refresh" /></template>
          {{ t('common.refresh') }}
        </el-button>
        <el-button v-if="config.createText !== false && canAction(config.createPermission)" type="primary" @click="openCreate">
          <template #icon><AppIcon name="plus" /></template>
          {{ t('common.create') }}{{ config.shortTitle || config.title }}
        </el-button>
      </template>
    </IosPageHero>

    <IosSearchPanel>
      <el-form :model="query" inline class="search-form" @submit.prevent>
        <el-form-item v-for="field in config.filters" :key="field.key" :label="field.label">
          <el-input v-if="field.type === 'input'" v-model="query[field.key]" :placeholder="field.placeholder || t('crud.input', undefined, { label: field.label })" clearable @keyup.enter="search" />
          <SearchableSelect v-else-if="field.type === 'select'" v-model="query[field.key]" :placeholder="field.placeholder || t('crud.select', undefined, { label: field.label })" :options="getFieldOptions(field, query)" style="width: 188px" @change="handleFilterChange(field, query[field.key])" />
          <el-date-picker v-else-if="field.type === 'date'" v-model="query[field.key]" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item>
          <el-space>
            <el-button type="primary" :loading="loading" @click="search">
              <template #icon><AppIcon name="search" /></template>
              {{ t('common.search') }}
            </el-button>
            <el-button @click="reset">
              <template #icon><AppIcon name="reset" /></template>
              {{ t('common.reset') }}
            </el-button>
          </el-space>
        </el-form-item>
      </el-form>
    </IosSearchPanel>

    <IosTablePanel :total-label="t('common.total', undefined, { count: pagination.total })" :hint="config.selection ? 'Ctrl+A 全选｜Del 删除｜Enter 批量修改' : undefined">
      <template #toolbar-left>
        <slot name="toolbar" :reload="load" :selected-rows="selectedRows" :selected-keys="selectedKeys" :clear-selection="clearSelection"></slot>
      </template>
      <template #toolbar-right>
        <span v-if="config.selection" class="table-shortcut-hint">Ctrl+A 全选｜Del 删除｜Enter 批量修改</span>
        <span>{{ t('common.total', undefined, { count: pagination.total }) }}</span>
      </template>
      <el-alert v-if="loadError" class="crud-load-error" type="error" show-icon :closable="false">
        <div class="crud-load-error-content">
          <span>{{ loadError }}</span>
          <el-button size="small" type="primary" plain @click="load(true)">重新加载</el-button>
        </div>
      </el-alert>
      <div v-if="isMobile" v-loading="loading" class="mobile-record-list">
        <el-empty v-if="!list.length && !loading" description="暂无数据" :image-size="72" />
        <article v-for="(row, index) in list" :key="getRowKey(row) || index" class="mobile-record-row">
          <header class="mobile-record-head">
            <el-checkbox
              v-if="config.selection"
              :model-value="selectedMap.has(getRowKey(row))"
              :aria-label="`选择第 ${index + 1} 条记录`"
              @change="setMobileRowSelected(row, $event)"
            />
            <span class="mobile-record-index">{{ (pagination.page - 1) * pagination.pageSize + index + 1 }}</span>
            <span v-if="getRowKey(row)" class="mobile-record-key">#{{ getRowKey(row) }}</span>
          </header>
          <dl class="mobile-record-fields">
            <div v-for="col in config.columns" :key="col.dataIndex" class="mobile-record-field">
              <dt>{{ col.title }}</dt>
              <dd>
                <StatusTag v-if="col.statusModule" :module="col.statusModule" :value="row[col.dataIndex]" />
                <el-image v-else-if="col.type === 'image' && row[col.dataIndex]" :src="row[col.dataIndex]" fit="cover" class="table-image" loading="lazy" />
                <span v-else-if="col.type === 'time'">{{ fmtTime(row[col.dataIndex]) }}</span>
                <span v-else-if="col.render">{{ col.render(row) }}</span>
                <span v-else>{{ row[col.dataIndex] ?? '-' }}</span>
              </dd>
            </div>
          </dl>
          <footer class="mobile-record-actions">
            <el-space wrap>
              <slot name="row-actions" :record="row" :reload="load"></slot>
              <el-button v-if="config.detailApi && canAction(detailPermission())" text type="primary" size="small" @click="viewDetail(row)">
                <template #icon><AppIcon name="detail" /></template>
                {{ t('common.detail') }}
              </el-button>
              <el-button v-if="config.updateText !== false && canAction(config.updatePermission)" text type="primary" size="small" @click="openEdit(row)">
                <template #icon><AppIcon name="edit" /></template>
                {{ t('common.edit') }}
              </el-button>
              <el-popconfirm v-if="config.deleteText !== false && canAction(config.deletePermission)" :title="t('crud.confirmDelete')" @confirm="remove(row)">
                <template #reference>
                  <el-button text type="danger" size="small">
                    <template #icon><AppIcon name="delete" /></template>
                    {{ t('common.delete') }}
                  </el-button>
                </template>
              </el-popconfirm>
            </el-space>
          </footer>
        </article>
      </div>
      <div v-else class="responsive-table-wrap">
        <el-table
          ref="tableRef"
          v-loading="loading"
          :row-key="rowKey"
          :data="list"
          stripe
          :style="tableStyle"
          @selection-change="handleSelectionChange"
        >
          <el-table-column v-if="config.selection" type="selection" width="48" reserve-selection />
          <el-table-column v-for="col in config.columns" :key="col.dataIndex" :label="col.title" :prop="col.dataIndex" :width="col.width" show-overflow-tooltip>
            <template #default="{ row }">
              <StatusTag v-if="col.statusModule" :module="col.statusModule" :value="row[col.dataIndex]" />
              <el-image v-else-if="col.type === 'image' && row[col.dataIndex]" :src="row[col.dataIndex]" fit="cover" class="table-image" loading="lazy" />
              <span v-else-if="col.type === 'time'">{{ fmtTime(row[col.dataIndex]) }}</span>
              <span v-else-if="col.render">{{ col.render(row) }}</span>
              <span v-else>{{ row[col.dataIndex] ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" :width="config.actionWidth || 190" :fixed="actionFixed" class-name="ios27-operation-column" label-class-name="ios27-operation-column-head">
            <template #default="{ row }">
              <el-space wrap>
                <slot name="row-actions" :record="row" :reload="load"></slot>
                <el-button v-if="config.detailApi && canAction(detailPermission())" text type="primary" size="small" @click="viewDetail(row)">
                  <template #icon><AppIcon name="detail" /></template>
                  {{ t('common.detail') }}
                </el-button>
                <el-button v-if="config.updateText !== false && canAction(config.updatePermission)" text type="primary" size="small" @click="openEdit(row)">
                  <template #icon><AppIcon name="edit" /></template>
                  {{ t('common.edit') }}
                </el-button>
                <el-popconfirm v-if="config.deleteText !== false && canAction(config.deletePermission)" :title="t('crud.confirmDelete')" @confirm="remove(row)">
                  <template #reference>
                    <el-button text type="danger" size="small">
                      <template #icon><AppIcon name="delete" /></template>
                      {{ t('common.delete') }}
                    </el-button>
                  </template>
                </el-popconfirm>
              </el-space>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <section
        v-if="config.summary"
        class="crud-query-summary"
        aria-label="查询结果汇总"
        aria-live="polite"
        :aria-busy="loading"
      >
        <div class="crud-summary-heading">
          <span class="crud-summary-icon"><AppIcon name="chart" :size="17" /></span>
          <div>
            <strong>{{ config.summary.title || '查询结果汇总' }}</strong>
            <span>当前筛选条件</span>
          </div>
        </div>
        <dl class="crud-summary-metrics">
          <div class="crud-summary-metric is-primary">
            <dt>{{ config.summary.totalLabel }}</dt>
            <dd>
              {{ formatSummaryCount(pagination.total) }}
              <small v-if="config.summary.totalUnit">{{ config.summary.totalUnit }}</small>
            </dd>
          </div>
          <div v-if="config.summary.showCurrentPage !== false" class="crud-summary-metric">
            <dt>{{ config.summary.currentPageLabel || '当前页记录' }}</dt>
            <dd>
              {{ formatSummaryCount(list.length) }}
              <small v-if="config.summary.currentPageUnit || config.summary.totalUnit">
                {{ config.summary.currentPageUnit || config.summary.totalUnit }}
              </small>
            </dd>
          </div>
        </dl>
      </section>
      <template #pagination>
        <el-pagination
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </template>
    </IosTablePanel>

    <el-dialog v-model="modalVisible" :title="modalTitle" :width="dialogWidth" class="crud-dialog" destroy-on-close :close-on-click-modal="false" append-to-body align-center :lock-scroll="true">
      <el-alert v-if="lowCodeFormTips.length" class="form-low-code-tips" type="info" show-icon :closable="false">
        <div v-for="tip in lowCodeFormTips" :key="tip">{{ tip }}</div>
      </el-alert>
      <div v-if="lowCodePresets.length" class="form-preset-bar">
        <span class="form-preset-label">{{ t('crud.tableTemplate') }}</span>
        <el-space wrap>
          <el-button v-for="preset in lowCodePresets" :key="preset.label" size="small" @click="usePresetInForm(preset)">{{ preset.label }}</el-button>
        </el-space>
      </div>
      <el-form ref="formRef" :model="form" label-position="top" class="crud-form">
        <div class="crud-form-grid">
          <div v-for="field in config.formFields" :key="field.key" class="crud-form-cell" :class="{ 'is-full': Number(field.span || 12) >= 24 }">
            <el-form-item :prop="field.key" :label="field.label" :rules="fieldRules(field)">
              <SearchableSelect v-if="fieldUsesQuickSelect(field)" v-model="form[field.key]" :disabled="isFieldDisabled(field)" allow-create :placeholder="field.placeholder || t('crud.select', undefined, { label: field.label })" :options="quickSelectOptions(field)" style="width: 100%" @change="handleFieldChange(field, form[field.key])" />
              <el-input v-else-if="!field.type || field.type === 'input'" v-model="form[field.key]" :disabled="isFieldDisabled(field)" :placeholder="field.placeholder || t('crud.input', undefined, { label: field.label })" clearable @change="handleFieldChange(field, form[field.key])" />
              <el-input-number v-else-if="field.type === 'number'" v-model="form[field.key]" :disabled="isFieldDisabled(field)" style="width: 100%" :placeholder="field.placeholder || t('crud.input', undefined, { label: field.label })" @change="handleFieldChange(field, form[field.key])" />
              <el-input v-else-if="field.type === 'textarea'" v-model="form[field.key]" :disabled="isFieldDisabled(field)" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" :placeholder="field.placeholder || t('crud.input', undefined, { label: field.label })" @change="handleFieldChange(field, form[field.key])" />
              <el-input v-else-if="field.type === 'array'" v-model="form[field.key]" :disabled="isFieldDisabled(field)" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" :placeholder="field.placeholder || t('crud.arrayPlaceholder')" @change="handleFieldChange(field, form[field.key])" />
              <ScannerInput
                v-else-if="field.type === 'scanner-array' || field.type === 'scanner-input'"
                v-model="form[field.key]"
                :title="field.scannerTitle || field.label"
                :description="field.scannerDescription || (field.type === 'scanner-array' ? '默认扫码枪模式，支持连续扫描码值/ID；也可以切换手动模式后粘贴多行。' : '默认扫码枪模式，扫码后只写入码值/ID；也可以切换手动模式输入。')"
                :placeholder="field.placeholder || t('crud.input', undefined, { label: field.label })"
                :multiple="field.type === 'scanner-array'"
                :active="modalVisible"
                :global="field.scannerGlobal !== false"
                :default-mode="field.scannerDefaultMode || 'scanner'"
                :submit-key="field.scannerSubmitKey || 'enter_tab'"
                :mobile-camera="Boolean(field.scannerMobileCamera)"
                @scan="handleFieldScan(field, $event)"
              />
              <SearchableSelect v-else-if="field.type === 'select'" v-model="form[field.key]" :disabled="isFieldDisabled(field)" :allow-create="Boolean(field.allowCreate)" :placeholder="field.placeholder || t('crud.select', undefined, { label: field.label })" :options="getFieldOptions(field, form)" style="width: 100%" @change="handleFieldChange(field, form[field.key])" />
              <el-cascader
                v-else-if="field.type === 'cascader'"
                v-model="form[field.key]"
                :disabled="isFieldDisabled(field)"
                :options="getFieldOptions(field, form)"
                :props="field.cascaderProps || { emitPath: true, checkStrictly: true }"
                :placeholder="field.placeholder || t('crud.select', undefined, { label: field.label })"
                clearable
                filterable
                style="width: 100%"
                @change="handleFieldChange(field, form[field.key])"
              />
              <el-date-picker v-else-if="field.type === 'date'" v-model="form[field.key]" :disabled="isFieldDisabled(field)" type="date" value-format="YYYY-MM-DD" style="width: 100%" @change="handleFieldChange(field, form[field.key])" />
              <el-date-picker v-else-if="field.type === 'datetime'" v-model="form[field.key]" :disabled="isFieldDisabled(field)" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" @change="handleFieldChange(field, form[field.key])" />
              <UploadField v-else-if="field.type === 'upload-image'" v-model="form[field.key]" type="image" />
              <UploadField v-else-if="field.type === 'upload-cert'" v-model="form[field.key]" type="cert" />
              <JsonEditor v-else-if="field.type === 'json'" v-model="form[field.key]" />
              <div v-if="field.quickOptions?.length && !fieldUsesQuickSelect(field)" class="field-quick-options">
                <span class="muted">{{ t('crud.quickFill') }}</span>
                <el-tag v-for="item in field.quickOptions" :key="item" size="small" class="quick-option-tag" @click="applyQuickOption(field, item)">{{ item }}</el-tag>
              </div>
              <div v-if="field.help" class="field-help">{{ field.help }}</div>
            </el-form-item>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="modalVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="loading" @click="submit">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchModalVisible" :title="batchModalTitle" :width="dialogWidth" class="crud-dialog" destroy-on-close :close-on-click-modal="false" append-to-body align-center :lock-scroll="true">
      <el-alert class="form-low-code-tips" type="warning" show-icon :closable="false">
        将批量修改已选中的 {{ selectedRows.length }} 条记录。只有已填写的字段会提交，留空字段不会覆盖原数据。
      </el-alert>
      <el-form ref="batchFormRef" :model="batchForm" label-position="top" class="crud-form" @submit.prevent>
        <div class="crud-form-grid">
          <div v-for="field in config.formFields" :key="field.key" class="crud-form-cell" :class="{ 'is-full': Number(field.span || 12) >= 24 }">
            <el-form-item :prop="field.key" :label="field.label">
              <SearchableSelect v-if="fieldUsesQuickSelect(field)" v-model="batchForm[field.key]" allow-create :placeholder="`不修改${field.label}`" :options="quickSelectOptions(field)" style="width: 100%" />
              <el-input v-else-if="!field.type || field.type === 'input'" v-model="batchForm[field.key]" :placeholder="`不修改${field.label}`" clearable />
              <el-input-number v-else-if="field.type === 'number'" v-model="batchForm[field.key]" style="width: 100%" :placeholder="`不修改${field.label}`" />
              <el-input v-else-if="field.type === 'textarea'" v-model="batchForm[field.key]" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" :placeholder="`不修改${field.label}`" />
              <el-input v-else-if="field.type === 'array'" v-model="batchForm[field.key]" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" placeholder="不修改；每行一个值" />
              <SearchableSelect v-else-if="field.type === 'select'" v-model="batchForm[field.key]" :allow-create="Boolean(field.allowCreate)" :placeholder="`不修改${field.label}`" :options="getFieldOptions(field, batchForm)" style="width: 100%" />
              <el-cascader v-else-if="field.type === 'cascader'" v-model="batchForm[field.key]" :options="getFieldOptions(field, batchForm)" :props="field.cascaderProps || { emitPath: true, checkStrictly: true }" :placeholder="`不修改${field.label}`" clearable filterable style="width: 100%" />
              <el-date-picker v-else-if="field.type === 'date'" v-model="batchForm[field.key]" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              <el-date-picker v-else-if="field.type === 'datetime'" v-model="batchForm[field.key]" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
              <UploadField v-else-if="field.type === 'upload-image'" v-model="batchForm[field.key]" type="image" />
              <UploadField v-else-if="field.type === 'upload-cert'" v-model="batchForm[field.key]" type="cert" />
              <JsonEditor v-else-if="field.type === 'json'" v-model="batchForm[field.key]" />
            </el-form-item>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="batchModalVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button @click="resetBatchForm">清空字段</el-button>
        <el-button type="primary" :loading="batchUpdating" @click="submitBatchUpdate">批量保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="t('crud.detailTitle')" :size="detailDrawerSize" append-to-body :lock-scroll="true">
      <DetailDescriptions :data="detailItems" :column="1" />
      <slot name="detail-extra" :detail="detail"></slot>
    </el-drawer>


  </IosPage>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { useWindowSize } from '@vueuse/core';
import { ElMessage as Message, ElMessageBox as MessageBox } from 'element-plus';
import AppIcon from './AppIcon.vue';
import StatusTag from './StatusTag.vue';
import UploadField from './UploadField.vue';
import JsonEditor from './JsonEditor.vue';
import ScannerInput from './ScannerInput.vue';
import SearchableSelect from './SearchableSelect.vue';
import DetailDescriptions from './DetailDescriptions.vue';
import { IosPage, IosPageHero, IosSearchPanel, IosTablePanel } from '@/components/ios27';
import { cleanObject, fmtDate, fmtDateTime, fmtTime, normalizePage, splitCodes } from '@/utils/format';
import type { LowCodePreset, LowCodeStep } from '@/utils/lowcode';
import { resolvePresetValues } from '@/utils/lowcode';
import { debounce } from '@/utils/performance';
import { clearRequestCache } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/i18n';

type Field = {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  options?: {label:string; value:any; [key:string]:any}[] | ((scope: Record<string, any>) => {label:string; value:any; [key:string]:any}[]);
  allowCreate?: boolean;
  span?: number;
  help?: string;
  quickOptions?: string[];
  disabled?: boolean | ((form: Record<string, any>) => boolean);
  valueGetter?: (record: Record<string, any>) => any;
  cascaderProps?: Record<string, any>;
  onChange?: (value: any, form: Record<string, any>) => void | Promise<void>;
  onScan?: (code: string, form: Record<string, any>) => void | Promise<void>;
  scannerTitle?: string;
  scannerDescription?: string;
  scannerDefaultMode?: 'scanner' | 'manual';
  scannerGlobal?: boolean;
  scannerSubmitKey?: 'enter' | 'tab' | 'enter_tab';
  scannerMobileCamera?: boolean;
};
type Column = { title: string; dataIndex: string; width?: number; type?: string; statusModule?: string; render?: (record:any)=>string };
const props = defineProps<{ config: {
  title: string;
  shortTitle?: string;
  filters: Field[];
  formFields: Field[];
  columns: Column[];
  api: any;
  detailApi?: boolean;
  selection?: boolean;
  rowKey?: string;
  createPermission?: string | string[];
  detailPermission?: string | string[];
  updatePermission?: string | string[];
  deletePermission?: string | string[];
  batchUpdatePermission?: string | string[];
  batchDeletePermission?: string | string[];
  enableTableHotkeys?: boolean;
  createText?: boolean;
  updateText?: boolean;
  deleteText?: boolean;
  modalWidth?: number;
  scrollX?: number;
  actionWidth?: number;
  labelMap?: Record<string, string>;
  beforeSave?: (payload: Record<string, any>, mode: 'create' | 'update') => Record<string, any> | Promise<Record<string, any>>;
  detailWidth?: number | string;
  detailOmitKeys?: string[];
  summary?: {
    title?: string;
    totalLabel: string;
    totalUnit?: string;
    currentPageLabel?: string;
    currentPageUnit?: string;
    showCurrentPage?: boolean;
  };
  lowCode?: { title?: string; description?: string; steps?: LowCodeStep[]; presets?: LowCodePreset[]; formTips?: string[] };
} }>();
const auth = useAuthStore();

const { t } = useI18n();
const { width: viewportWidth } = useWindowSize();

const query = reactive<any>({ page: 1, pageSize: 20 });
const form = reactive<any>({});
const formRef = ref();
const batchFormRef = ref();
const list = shallowRef<any[]>([]);
const tableRef = ref<any>();
const selectedMap = reactive(new Map<string, any>());
const pagination = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
const summaryNumberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const loading = ref(false);
const loadError = ref('');
const modalVisible = ref(false);
const batchModalVisible = ref(false);
const batchUpdating = ref(false);
const editingId = ref<number | string | null>(null);
const detailVisible = ref(false);
const detail = shallowRef<any>({});
const batchForm = reactive<any>({});
let loadSeq = 0;

const defaultLabelMap: Record<string, string> = {
  id: 'ID', product_id: '产品ID', product_label: '关联产品', product_code: '产品编号', product_name: '产品名称', category: '分类', brand: '品牌',
  specification: '规格', unit: '单位', shelf_life: '保质期', description: '产品描述', image_url: '产品图片', extra_fields: '扩展字段', status: '状态',
  code: '防伪码', batch_no: '生产批号', query_count: '查询次数', activated_at: '激活时间', first_query_at: '首次查询时间', last_query_at: '最后查询时间',
  trace_no: '溯源编号', anti_fake_code: '防伪码', production_date: '生产日期', expiry_date: '过期日期', production_place: '生成地点', manufacturer: '公司', trace_chain: '溯源链',
  box_no: '箱号', box_capacity: '箱容量', box_spec: '箱规', box_type: '箱型', codes: '箱内防伪码', code_count: '数量',
  shipment_no: '发货单号', agent_id: '代理商ID', agent_label: '代理商', shipment_label: '关联发货单', box_ids: '箱子ID', box_count: '箱数', logistics_company: '物流公司', logistics_no: '物流单号', sender: '发件人', sender_address: '发货位置（授权位置）', receiver: '收件人', receiver_phone: '收件电话', receiver_address: '收件地址', remark: '备注',
  agent_code: '代理商编号', agent_name: '代理商名称', contact_name: '联系人', contact_phone: '联系电话', contact_email: '联系邮箱', province: '省份', city: '城市', address: '详细地址', business_license: '营业执照号', level: '代理等级', parent_id: '上级代理ID',
  return_code_count: '退货码数量', created_at: '创建时间', updated_at: '更新时间',
};

const lowCodePresets = computed(() => props.config.lowCode?.presets || []);
const lowCodeFormTips = computed(() => props.config.lowCode?.formTips || []);
const isMobile = computed(() => viewportWidth.value <= 760);
const tableStyle = computed(() => ({ width: '100%' }));
const rowKey = computed(() => String(props.config.rowKey || 'id'));
const selectedRows = computed(() => Array.from(selectedMap.values()));
const selectedKeys = computed(() => Array.from(selectedMap.keys()));
const actionFixed = computed(() => isMobile.value ? false : 'right');
const dialogWidth = computed(() => `min(${isMobile.value ? '96vw' : '92vw'}, ${Number(props.config.modalWidth || 860)}px)`);
const detailDrawerSize = computed(() => {
  if (isMobile.value) return '100%';
  const width = props.config.detailWidth;
  if (!width) return '680px';
  return typeof width === 'number' ? `${width}px` : width;
});

const labelMap = computed(() => {
  const dynamic: Record<string, string> = {};
  props.config.columns.forEach((item) => { dynamic[item.dataIndex] = item.title; });
  props.config.formFields.forEach((item) => { dynamic[item.key] = item.label; });
  return { ...defaultLabelMap, ...dynamic, ...(props.config.labelMap || {}) };
});

function getDetailLabel(key: string) { return labelMap.value[key] || key; }
function canAction(permission?: string | string[]) { return auth.hasPermission(permission); }
function detailPermission() {
  if (props.config.detailPermission) return props.config.detailPermission;
  const candidate = props.config.updatePermission || props.config.createPermission || props.config.deletePermission || '';
  return candidate ? String(candidate).replace(/:(manage|create|update|delete|complete|activate|cancel)$/u, ':view') : undefined;
}
function getRowKey(row: any) { return String(row?.[rowKey.value] ?? ''); }
function canBatchUpdate() { return props.config.updateText !== false && canAction(props.config.batchUpdatePermission || props.config.updatePermission); }
function canBatchDelete() { return props.config.deleteText !== false && canAction(props.config.batchDeletePermission || props.config.deletePermission); }
function handleSelectionChange(rows: any[]) {
  if (!props.config.selection) return;
  const pageKeys = new Set((list.value || []).map(getRowKey).filter(Boolean));
  pageKeys.forEach((key) => selectedMap.delete(key));
  rows.forEach((row) => { const key = getRowKey(row); if (key) selectedMap.set(key, row); });
}
function setMobileRowSelected(row: any, selected: string | number | boolean) {
  const key = getRowKey(row);
  if (!key) return;
  if (Boolean(selected)) selectedMap.set(key, row);
  else selectedMap.delete(key);
}
function clearSelection() {
  selectedMap.clear();
  tableRef.value?.clearSelection?.();
}

function setFormValue(key: string, value: any) {
  const field = props.config.formFields.find((item) => item.key === key);
  if (!field) return;
  if (field.type === 'array' || field.type === 'scanner-array') form[key] = Array.isArray(value) ? value.join('\n') : String(value ?? '');
  else if (field.type === 'json') form[key] = value ?? {};
  else form[key] = value;
}

function applyPresetValues(values: Record<string, any>) {
  Object.entries(values || {}).forEach(([key, value]) => setFormValue(key, value));
}

function usePresetInForm(preset: LowCodePreset) {
  applyPresetValues(resolvePresetValues(preset));
  Message.success(t('crud.presetSuccess', undefined, { label: preset.label }));
}

function isFieldDisabled(field: Field) {
  return typeof field.disabled === 'function' ? field.disabled(form) : Boolean(field.disabled);
}

function fieldRules(field: Field) {
  if (!field.required) return undefined;
  const trigger = field.type === 'select' || field.type === 'cascader' ? 'change' : 'blur';
  return [{ required: true, message: t('crud.required', undefined, { label: field.label }), trigger }];
}

function normalizeFieldOption(item: any) {
  if (item && typeof item === 'object' && 'value' in item) return { label: String(item.label ?? item.value), ...item };
  return { label: String(item ?? ''), value: item };
}

function getFieldOptions(field: Field, scope: Record<string, any> = form) {
  const raw = typeof field.options === 'function' ? field.options(scope) : (field.options || []);
  return (raw || []).map(normalizeFieldOption).filter((item: any) => item.value !== undefined && item.value !== null && item.value !== '');
}

function quickSelectOptions(field: Field) {
  return (field.quickOptions || []).map((item) => ({ label: item, value: item }));
}

function fieldUsesQuickSelect(field: Field) {
  return (!field.type || field.type === 'input') && Array.isArray(field.quickOptions) && field.quickOptions.length > 0;
}

function handleFilterChange(field: Field, value: any) {
  void field.onChange?.(value, query);
}

function handleFieldChange(field: Field, value: any) {
  void field.onChange?.(value, form);
}

function handleFieldScan(field: Field, code: string) {
  if (field.type === 'scanner-input') form[field.key] = code;
  void field.onScan?.(code, form);
  handleFieldChange(field, form[field.key]);
}

function applyQuickOption(field: Field, text: string) {
  if (field.type === 'textarea' || field.type === 'array' || field.type === 'scanner-array') {
    const current = String(form[field.key] || '').trim();
    form[field.key] = current ? `${current}\n${text}` : text;
  } else if (field.type === 'number') {
    form[field.key] = Number(text);
  } else {
    form[field.key] = text;
  }
}


function normalizeDatePayload(value: any, type?: string) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  if (!text) return undefined;
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00.000Z`).toISOString();
  if (type === 'datetime' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return new Date(text.replace(' ', 'T')).toISOString();
  return text;
}

const modalTitle = computed(() => editingId.value ? t('crud.editTitle', undefined, { title: props.config.shortTitle || props.config.title }) : t('crud.createTitle', undefined, { title: props.config.shortTitle || props.config.title }));
const batchModalTitle = computed(() => `批量修改${props.config.shortTitle || props.config.title}`);
const detailOmitKeySet = computed(() => new Set(props.config.detailOmitKeys || []));
const detailItems = computed(() => Object.entries(detail.value || {})
  .filter(([key]) => !detailOmitKeySet.value.has(key))
  .map(([key, value]) => ({ label: getDetailLabel(key), value })));

function makePayload() {
  const payload: Record<string, any> = {};
  props.config.formFields.forEach((f) => {
    if (f.type === 'array' || f.type === 'scanner-array') payload[f.key] = splitCodes(form[f.key]);
    else if (f.type === 'date' || f.type === 'datetime') payload[f.key] = normalizeDatePayload(form[f.key], f.type);
    else payload[f.key] = form[f.key];
  });
  return cleanObject(payload);
}

function readableRequestError(error: any) {
  const message = error?.message || error?.response?.data?.message || error?.data?.message || error?.error || '';
  return String(message || '数据加载失败，请检查网络或稍后重试');
}

function formatSummaryCount(value: unknown) {
  const count = Number(value);
  return summaryNumberFormatter.format(Number.isFinite(count) ? count : 0);
}

async function load(force = false) {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    if (force) clearRequestCache();
    const result = normalizePage(await props.config.api.list(cleanObject({ ...query })));
    if (seq !== loadSeq) return;
    loadError.value = '';
    list.value = result.list;
    Object.assign(pagination, result.pagination);
  } catch (error: any) {
    if (seq !== loadSeq) return;
    loadError.value = readableRequestError(error);
    list.value = [];
    Object.assign(pagination, { page: query.page || 1, pageSize: query.pageSize || 20, total: 0, totalPages: 0 });
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}
const debouncedLoad = debounce(() => load(), 260);
function search() { query.page = 1; debouncedLoad(); }
function reset() {
  Object.keys(query).forEach((k) => delete query[k]);
  Object.assign(query, { page: 1, pageSize: 20 });
  clearSelection();
  load(true);
}
function assignForm(data: any = {}) {
  Object.keys(form).forEach((k) => delete form[k]);
  props.config.formFields.forEach((f) => {
    const value = f.valueGetter ? f.valueGetter(data || {}) : data[f.key];
    if (f.type === 'json') form[f.key] = value ?? {};
    else if (f.type === 'array' || f.type === 'scanner-array') form[f.key] = Array.isArray(value) ? value.join('\n') : (value ?? '');
    else if (f.type === 'date') form[f.key] = value ? fmtDate(value) : undefined;
    else if (f.type === 'datetime') form[f.key] = value ? fmtDateTime(value) : undefined;
    else form[f.key] = value ?? undefined;
  });
}
function resetBatchForm() { Object.keys(batchForm).forEach((k) => delete batchForm[k]); }
function makeBatchPayload() {
  const payload: Record<string, any> = {};
  props.config.formFields.forEach((f) => {
    const value = batchForm[f.key];
    if (value === undefined || value === null || value === '') return;
    if (f.type === 'array' || f.type === 'scanner-array') {
      const list = splitCodes(value);
      if (list.length) payload[f.key] = list;
    } else if (f.type === 'json') {
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return;
      payload[f.key] = value;
    } else if (f.type === 'date' || f.type === 'datetime') {
      payload[f.key] = normalizeDatePayload(value, f.type);
    } else {
      payload[f.key] = value;
    }
  });
  return cleanObject(payload);
}
function openBatchUpdate() {
  if (!props.config.selection) return;
  if (!selectedRows.value.length) return Message.warning('请先选择表格记录');
  if (!canBatchUpdate()) return Message.warning('没有批量修改权限');
  resetBatchForm();
  batchModalVisible.value = true;
}
function openCreate() { editingId.value = null; assignForm(); form.__mode = 'create'; modalVisible.value = true; }
async function openEdit(record: any) {
  editingId.value = record.id;
  const data = props.config.api.detail ? await props.config.api.detail(record.id) : record;
  assignForm(data || record);
  form.__mode = 'update';
  modalVisible.value = true;
}
async function submit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  let payload = makePayload();
  if (props.config.beforeSave) payload = await props.config.beforeSave(payload, editingId.value ? 'update' : 'create');
  if (editingId.value) await props.config.api.update(editingId.value, payload);
  else await props.config.api.create(payload);
  Message.success(t('crud.saveSuccess'));
  modalVisible.value = false;
  load(true);
}
async function submitBatchUpdate() {
  const rows = selectedRows.value;
  if (!rows.length) return Message.warning('请先选择表格记录');
  if (!canBatchUpdate()) return Message.warning('没有批量修改权限');
  const payload = makeBatchPayload();
  if (!Object.keys(payload).length) return Message.warning('请至少填写一个要修改的字段');
  try {
    await MessageBox.confirm(`确认批量修改 ${rows.length} 条记录？`, '批量修改确认', { type: 'warning' });
  } catch {
    return;
  }
  batchUpdating.value = true;
  try {
    await Promise.all(rows.map((row) => props.config.api.update(row.id, payload)));
    Message.success(`批量修改完成：${rows.length} 条`);
    batchModalVisible.value = false;
    resetBatchForm();
    clearSelection();
    await load(true);
  } finally {
    batchUpdating.value = false;
  }
}
async function remove(record: any) {
  await props.config.api.remove(record.id);
  Message.success(t('crud.deleteSuccess'));
  load(true);
}
async function removeSelected() {
  const rows = selectedRows.value;
  if (!props.config.selection) return;
  if (!rows.length) return Message.warning('请先选择表格记录');
  if (!canBatchDelete()) return Message.warning('没有删除权限');
  try {
    await MessageBox.confirm(`确认删除选中的 ${rows.length} 条记录？删除后不可恢复。`, '批量删除确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' });
  } catch {
    return;
  }
  loading.value = true;
  try {
    await Promise.all(rows.map((row) => props.config.api.remove(row.id)));
    Message.success(`已删除 ${rows.length} 条记录`);
    clearSelection();
    await load(true);
  } finally {
    loading.value = false;
  }
}
async function viewDetail(record: any) {
  detail.value = props.config.api.detail ? await props.config.api.detail(record.id) : record;
  detailVisible.value = true;
}
function onPageChange(page: number) { query.page = page; load(); }
function onPageSizeChange(pageSize: number) { query.pageSize = pageSize; query.page = 1; load(true); }

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return Boolean(el.isContentEditable || ['input', 'textarea', 'select'].includes(tag) || el.closest('.el-dialog, .el-drawer, .el-message-box'));
}

function handleTableHotkeys(event: KeyboardEvent) {
  if (props.config.enableTableHotkeys === false || !props.config.selection) return;
  if (isEditableTarget(event.target)) return;
  if (modalVisible.value || batchModalVisible.value || detailVisible.value) return;

  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'a') {
    event.preventDefault();
    tableRef.value?.toggleAllSelection?.();
    return;
  }
  if (key === 'delete' || key === 'backspace') {
    if (!selectedRows.value.length) return;
    event.preventDefault();
    void removeSelected();
    return;
  }
  if (key === 'enter') {
    if (!selectedRows.value.length) return;
    event.preventDefault();
    if (selectedRows.value.length === 1) void openEdit(selectedRows.value[0]);
    else openBatchUpdate();
  }
}

defineExpose({ load, selectedRows, selectedKeys, clearSelection, openBatchUpdate, removeSelected });
onMounted(() => { load(); window.addEventListener('keydown', handleTableHotkeys); });
onBeforeUnmount(() => window.removeEventListener('keydown', handleTableHotkeys));
</script>

<style scoped>
.table-shortcut-hint { margin-right: 12px; color: var(--text-3); font-size: 12px; }
.crud-load-error { margin-bottom: 12px; }
.crud-load-error-content { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; }
.crud-query-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 14px;
  padding: 14px 4px 2px;
  border-top: 1px solid var(--ui-line, var(--line));
}
.crud-summary-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.crud-summary-heading > div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crud-summary-heading strong { color: var(--ui-text, var(--text-1)); font-size: 13px; font-weight: 750; }
.crud-summary-heading span { color: var(--ui-text-muted, var(--text-3)); font-size: 11px; }
.crud-summary-icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: var(--ui-accent, var(--primary));
  background: var(--ui-accent-soft, var(--primary-soft));
}
.crud-summary-metrics { margin: 0; display: flex; align-items: stretch; }
.crud-summary-metric {
  min-width: 132px;
  margin: 0;
  padding: 0 20px;
  border-left: 1px solid var(--ui-line, var(--line));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
}
.crud-summary-metric dt { color: var(--ui-text-muted, var(--text-3)); font-size: 11px; font-weight: 650; }
.crud-summary-metric dd {
  margin: 0;
  color: var(--ui-text, var(--text-1));
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.crud-summary-metric.is-primary dd { color: var(--ui-accent, var(--primary)); }
.crud-summary-metric small { margin-left: 4px; font-size: 11px; font-weight: 650; color: var(--ui-text-muted, var(--text-3)); }
.mobile-record-list { min-height: 96px; border-top: 1px solid var(--ui-line, var(--line)); }
.mobile-record-row { padding: 14px 0; border-bottom: 1px solid var(--ui-line, var(--line)); }
.mobile-record-head { min-height: 24px; display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
.mobile-record-index {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: var(--ui-accent, var(--primary));
  background: var(--ui-accent-soft, var(--primary-soft));
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.mobile-record-key { min-width: 0; color: var(--ui-text-muted, var(--text-3)); font-size: 12px; overflow-wrap: anywhere; }
.mobile-record-fields { margin: 0; display: grid; }
.mobile-record-field { min-width: 0; display: grid; grid-template-columns: minmax(72px, 30%) minmax(0, 1fr); gap: 12px; padding: 7px 0; }
.mobile-record-field dt { color: var(--ui-text-muted, var(--text-3)); font-size: 12px; line-height: 1.55; }
.mobile-record-field dd { min-width: 0; margin: 0; color: var(--ui-text, var(--text-1)); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word; }
.mobile-record-actions { display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--ui-line, var(--line)); }
.mobile-record-actions :deep(.el-space) { justify-content: flex-end; }
.mobile-record-actions :deep(.el-button + .el-button) { margin-left: 0; }
@media (max-width: 760px) {
  .crud-load-error-content { align-items: flex-start; flex-direction: column; }
  .crud-query-summary { align-items: flex-start; flex-direction: column; gap: 12px; }
  .crud-summary-metrics { width: 100%; }
  .crud-summary-metric { min-width: 0; flex: 1; padding: 0 12px; align-items: flex-start; }
  .crud-summary-metric:first-child { padding-left: 0; border-left: 0; }
  .table-shortcut-hint { display: none; }
}
</style>
