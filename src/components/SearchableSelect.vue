<template>
  <el-select
    :model-value="modelValue"
    clearable
    filterable
    :allow-create="allowCreate"
    :default-first-option="defaultFirstOption"
    :disabled="disabled"
    :placeholder="placeholder"
    :popper-class="mergedPopperClass"
    :teleported="true"
    append-to="body"
    fit-input-width
    placement="bottom-start"
    :fallback-placements="['top-start', 'bottom-end', 'top-end']"
    :offset="8"
    v-bind="$attrs"
    @update:model-value="handleUpdate"
    @change="handleChange"
    @visible-change="handleVisibleChange"
  >
    <template #header>
      <div class="select-search-header" @mousedown.stop @click.stop>
        <el-input
          ref="searchInputRef"
          v-model="keyword"
          size="small"
          clearable
          :placeholder="searchPlaceholder"
          @keydown.stop
          @keyup.stop
          @input="handleSearchInput"
        />
      </div>
    </template>
    <el-option
      v-if="createdOption"
      :key="String(createdOption.value)"
      :value="createdOption.value"
      :label="createdOption.label"
    />
    <el-option
      v-for="opt in filteredOptions"
      :key="String(opt.value)"
      :value="opt.value"
      :label="opt.label"
      :disabled="opt.disabled"
    />
    <template #empty>
      <div class="searchable-select-empty">无匹配结果</div>
    </template>
  </el-select>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

type OptionValue = string | number | boolean;
type SelectOption = {
  label?: string;
  value: OptionValue;
  disabled?: boolean;
  code?: string;
  province?: string;
  provinceCode?: string;
  [key: string]: any;
};

const props = withDefaults(defineProps<{
  modelValue?: OptionValue | OptionValue[] | null;
  options?: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allowCreate?: boolean;
  defaultFirstOption?: boolean;
  disabled?: boolean;
  popperClass?: string;
}>(), {
  options: () => [],
  placeholder: '',
  searchPlaceholder: '输入关键词搜索',
  allowCreate: false,
  defaultFirstOption: true,
  disabled: false,
  popperClass: '',
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: OptionValue | OptionValue[] | null): void;
  (event: 'change', value: OptionValue | OptionValue[] | null): void;
  (event: 'visible-change', value: boolean): void;
}>();

const keyword = ref('');
const searchInputRef = ref<any>();

const normalizedOptions = computed<SelectOption[]>(() => (props.options || [])
  .filter((item) => item?.value !== undefined && item?.value !== null && item?.value !== '')
  .map((item) => ({ ...item, label: String(item.label ?? item.value) })));

const filteredOptions = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return normalizedOptions.value;
  return normalizedOptions.value.filter((item) => {
    const haystack = [item.label, item.value, item.code, item.province, item.provinceCode]
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value).toLowerCase())
      .join(' ');
    return haystack.includes(kw);
  });
});

const createdOption = computed<SelectOption | null>(() => {
  if (!props.allowCreate) return null;
  const text = keyword.value.trim();
  if (!text) return null;
  const exists = normalizedOptions.value.some((item) => String(item.value) === text || String(item.label) === text);
  return exists ? null : { label: `使用“${text}”`, value: text };
});

const mergedPopperClass = computed(() => ['searchable-select-dropdown', props.popperClass].filter(Boolean).join(' '));

function handleUpdate(value: OptionValue | OptionValue[] | null) {
  emit('update:modelValue', value);
}

function handleChange(value: OptionValue | OptionValue[] | null) {
  emit('change', value);
}

function handleSearchInput() {
  // 独立搜索栏仅过滤下拉选项，不立即改写已选值。
}

function handleVisibleChange(visible: boolean) {
  emit('visible-change', visible);
  if (visible) {
    nextTick(() => searchInputRef.value?.focus?.());
  } else {
    keyword.value = '';
  }
}
</script>

<style scoped>
.select-search-header {
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.searchable-select-empty {
  padding: 12px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
</style>
