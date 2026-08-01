<template>
  <IosPage>
    <IosPageHero eyebrow="Public Query" title="防伪查询" description="模拟消费者查询入口，提交防伪码后返回真伪、查询次数和产品信息。" />
    <el-row :gutter="18">
      <el-col :xs="24" :lg="10">
        <IosGlassCard class="form-card" title="查询条件">
          <el-form :model="form" label-position="top">
            <el-form-item label="防伪码" required><el-input v-model="form.code" placeholder="请输入防伪码" size="large" /></el-form-item>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="渠道">
                  <el-select v-model="form.channel" style="width: 100%">
                    <el-option value="web" label="web" />
                    <el-option value="wechat" label="wechat" />
                    <el-option value="scan" label="scan" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12"><el-form-item label="公网位置"><el-input :model-value="autoLocation" readonly placeholder="查询时通过 UAPI 自动获取" /></el-form-item></el-col>
            </el-row>
            <el-space><el-button type="primary" :loading="loading" @click="doQuery">立即查询</el-button><el-button @click="result=null">清空结果</el-button></el-space>
          </el-form>
        </IosGlassCard>
      </el-col>
      <el-col :xs="24" :lg="14">
        <IosGlassCard class="table-card" title="查询结果">
          <el-empty v-if="!result" description="输入防伪码后查看结果" />
          <el-result v-else :icon="result.is_real ? 'success' : 'error'" :title="result.message || (result.is_real ? '正品' : '异常')" :sub-title="`查询次数：${result.query_count ?? '-'}`">
            <template #extra>
              <DetailDescriptions :data="resultItems" :column="1" />
              <DetailDescriptions v-if="result.product" :data="productItems" :column="1" />
            </template>
          </el-result>
        </IosGlassCard>
      </el-col>
    </el-row>
  </IosPage>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage as Message } from 'element-plus';
import DetailDescriptions from '@/components/DetailDescriptions.vue';
import { IosGlassCard, IosPage, IosPageHero } from '@/components/ios27';
import { queryApi } from '@/api/resources';
import { getUapiMyIp, toUapiLocationMeta } from '@/api/uapi';
import { displayValue } from '@/utils/format';
const form = reactive({ code: '', channel: 'web' });
const autoLocation = ref('');
const loading = ref(false); const result = ref<any>(null);
const fmtDate = (value: any) => value ? String(value).slice(0, 10) : '长期有效';
const resultItems = computed(() => [
  { label: '验证结果', value: result.value?.is_expired ? '已过期' : (result.value?.is_real ? '验证通过' : '验证异常') },
  { label: '过期日期', value: fmtDate(result.value?.expires_at) },
  { label: '首次查询', value: displayValue(result.value?.first_query_time) },
  { label: '最近查询', value: displayValue(result.value?.last_query_time) },
]);
const productItems = computed(() => Object.entries(result.value?.product || {}).map(([label, value]) => ({ label, value: displayValue(value) }))); 
async function doQuery() {
  if (!form.code) return Message.warning('请输入防伪码');
  loading.value = true;
  try {
    const ipInfo = await getUapiMyIp({ timeoutMs: 2500 }).catch(() => null);
    const locationMeta = toUapiLocationMeta(ipInfo);
    autoLocation.value = locationMeta.location || '未获取到公网位置';
    result.value = await queryApi.post({ ...form, ...locationMeta });
  } finally {
    loading.value = false;
  }
}
</script>
