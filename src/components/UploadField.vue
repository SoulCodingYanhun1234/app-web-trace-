<template>
  <div class="upload-field">
    <el-input v-model="model" placeholder="上传后自动填入文件地址" readonly clearable>
      <template #append>
        <el-upload :show-file-list="false" :http-request="customRequest" :accept="acceptTypes">
          <el-button size="small" :loading="loading">
            <template #icon><AppIcon name="plus" /></template>
            上传
          </el-button>
        </el-upload>
      </template>
    </el-input>
    <div v-if="type === 'image' && model" class="upload-preview">
      <img :src="displayUrl" width="96" height="96" style="object-fit: cover; border-radius: 10px;" :alt="'avatar'" />
    </div>
    <div class="upload-hint">{{ hint }}</div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import type { UploadRequestOptions } from 'element-plus';
import AppIcon from './AppIcon.vue';
import { uploadApi } from '@/api/upload';

const model = defineModel<string>({ default: '' });
const props = withDefaults(defineProps<{ type?: 'image' | 'cert' }>(), { type: 'image' });
const loading = ref(false);

const displayUrl = computed(() => {
  if (!model.value) return '';
  if (model.value.startsWith('http://') || model.value.startsWith('https://')) return model.value;
  return model.value.startsWith('/') ? model.value : `/${model.value}`;
});

const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const certTypes = [...imageTypes, 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const acceptTypes = computed(() => props.type === 'cert' ? '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp' : '.jpg,.jpeg,.png,.gif,.webp');
const hint = computed(() => props.type === 'cert' ? '支持 PDF/Word/图片，最大 20MB' : '支持 JPG/PNG/GIF/WebP，最大 5MB');

function validateFile(file: File) {
  const allowed = props.type === 'cert' ? certTypes : imageTypes;
  const maxSize = props.type === 'cert' ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
  if (!allowed.includes(file.type)) {
    Message.error(props.type === 'cert' ? '仅支持 PDF、Word 或图片文件' : '仅支持 JPG、PNG、GIF、WebP 图片');
    return false;
  }
  if (file.size > maxSize) {
    Message.error(props.type === 'cert' ? '证书文件不能超过 20MB' : '图片不能超过 5MB');
    return false;
  }
  return true;
}

async function customRequest(option: UploadRequestOptions) {
  const file = option.file as File;
  if (!file || !validateFile(file)) {
    option.onError(new Error('文件校验失败') as any);
    return;
  }
  loading.value = true;
  try {
    const res = props.type === 'cert' ? await uploadApi.cert(file) : await uploadApi.image(file);
    model.value = res.url;
    option.onSuccess(res);
    Message.success('上传成功');
  } catch (err) {
    option.onError(err as any);
  } finally {
    loading.value = false;
  }
}
</script>
<style scoped>
.upload-field { width: 100%; }
.upload-preview { margin-top: 10px; width: 104px; height: 104px; padding: 4px; border-radius: 14px; background: #f7f8fa; border: 1px solid #edf1f7; }
.upload-hint { color: #86909c; font-size: 12px; margin-top: 6px; }
</style>
