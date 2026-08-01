<template>
  <IosPage class="scanner-guide-page">
    <IosPageHero eyebrow="Scanner Setup Guide" title="扫描枪配置与使用教程" description="配置 USB 键盘模式扫码枪，把“哪个产品 → 哪个地区分类 → 溯源 → 装箱 → 发货”串成一条可追踪链路。">
      <template #actions>
        <el-button @click="router.push('/product-regions')"><template #icon><AppIcon name="region" /></template>产品地区管理</el-button>
        <el-button type="primary" @click="router.push('/scanner')"><template #icon><AppIcon name="keyboard" /></template>进入扫码业务台</el-button>
      </template>
    </IosPageHero>

    <div class="guide-layout">
      <el-card class="glass-card config-card" shadow="never">
        <template #header><div class="card-title">① 扫描枪参数</div></template>
        <el-form label-position="top">
          <el-form-item label="设备型号">
            <el-select v-model="settings.deviceType" style="width:100%" @change="applyProfile">
              <el-option v-for="item in scannerDeviceProfiles" :key="item.type" :label="item.label" :value="item.type" />
            </el-select>
          </el-form-item>
          <el-form-item label="连接模式"><el-input v-model="settings.connectionMode" disabled /></el-form-item>
          <el-form-item label="结束符">
            <el-radio-group v-model="settings.submitKey">
              <el-radio-button value="enter">Enter</el-radio-button>
              <el-radio-button value="tab">Tab</el-radio-button>
              <el-radio-button value="enter_tab">Enter / Tab</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="最短长度"><el-input-number v-model="settings.minLength" :min="1" :max="64" style="width:100%" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="最大按键间隔 ms"><el-input-number v-model="settings.maxInterval" :min="20" :max="500" style="width:100%" /></el-form-item></el-col>
          </el-row>
          <el-form-item label="地区来源">
            <el-select v-model="settings.regionMode" style="width:100%">
              <el-option label="优先码值地区，缺失时用工作站地区" value="mixed" />
              <el-option label="只按码值地区" value="code" />
              <el-option label="只按工作站地区" value="workstation" />
            </el-select>
          </el-form-item>
          <el-button type="primary" @click="saveSettings">保存扫码枪参数</el-button>
        </el-form>
      </el-card>

      <el-card class="glass-card config-card" shadow="never">
        <template #header><div class="card-title">② 当前工位地区</div></template>
        <el-form label-position="top">
          <el-form-item label="省份">
            <el-select v-model="region.provinceCode" style="width:100%" filterable @change="handleProvinceChange">
              <el-option v-for="item in regionOptions" :key="item.code" :label="`${item.name}（${item.code}）`" :value="item.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="城市">
            <el-select v-model="region.cityCode" style="width:100%" filterable @change="handleCityChange">
              <el-option v-for="item in currentCities" :key="item.code" :label="`${item.name}（${item.code}）`" :value="item.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="仓库/工位"><el-input v-model="region.warehouse" placeholder="例如：深圳一号仓 / 华南包装线" /></el-form-item>
          <el-button type="primary" @click="saveRegion">保存工位地区</el-button>
        </el-form>
        <el-alert class="guide-tip" type="success" :closable="false" show-icon>
          码值没有地区前缀时，系统用当前工位地区兜底：{{ region.provinceName }} / {{ region.cityName }}。
        </el-alert>
      </el-card>

      <el-card class="glass-card test-card" shadow="never">
        <template #header><div class="card-title">③ 扫码测试</div></template>
        <ScannerInput
          v-model="scanBuffer"
          title="测试扫码区"
          description="把扫码枪切到 USB-HID 键盘模式后扫描；也可手动输入示例码回车。"
          placeholder="FW-GD-SZ-A001-B202605-000001"
          :min-length="settings.minLength"
          :max-interval="settings.maxInterval"
          :submit-key="settings.submitKey"
          @scan="handleScan"
        />
        <el-descriptions v-if="scanPreview" class="preview" :column="1" border>
          <el-descriptions-item label="码值">{{ scanPreview.code }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ scanPreview.productCode || '未识别，进入产品地区页可手动绑定' }}</el-descriptions-item>
          <el-descriptions-item label="地区">{{ scanPreview.provinceName || '-' }} / {{ scanPreview.cityName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="批次">{{ scanPreview.batchNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ scanPreview.format }}</el-descriptions-item>
        </el-descriptions>
      </el-card>
    </div>

    <el-card class="glass-card" shadow="never">
      <template #header><div class="card-title">模块关联规则</div></template>
      <div class="flow-grid">
        <div v-for="item in relationSteps" :key="item.title" class="flow-item">
          <div class="flow-index">{{ item.index }}</div>
          <strong>{{ item.title }}</strong>
          <span>{{ item.desc }}</span>
        </div>
      </div>
    </el-card>

    <el-card class="glass-card" shadow="never">
      <template #header><div class="card-title">模块与模块关联明细</div></template>
      <div class="responsive-table-wrap">
        <el-table :data="moduleRelations" stripe class="relation-table">
        <el-table-column prop="name" label="模块" min-width="110" />
        <el-table-column label="上游依赖" min-width="180">
          <template #default="{ row }"><span>{{ row.upstream.join('、') || '无' }}</span></template>
        </el-table-column>
        <el-table-column label="下游联动" min-width="220">
          <template #default="{ row }"><span>{{ row.downstream.join('、') || '无' }}</span></template>
        </el-table-column>
        <el-table-column prop="scannerRole" label="扫码枪作用" min-width="360" />
        </el-table>
      </div>
    </el-card>

    <el-card class="glass-card" shadow="never">
      <template #header><div class="card-title">推荐码规则</div></template>
      <div class="responsive-table-wrap">
        <el-table :data="codeRules" stripe>
        <el-table-column prop="part" label="片段" min-width="140" />
        <el-table-column prop="example" label="示例" min-width="160" />
        <el-table-column prop="meaning" label="含义" min-width="260" />
        </el-table>
      </div>
      <el-alert class="guide-tip" type="info" :closable="false" show-icon>
        完整示例：FW-GD-SZ-A001-B202605-000001，表示 A001 产品、广东省深圳市、2026 年 05 月批次、序列号 000001。
      </el-alert>
    </el-card>
  </IosPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import ScannerInput from '@/components/ScannerInput.vue';
import { IosPage, IosPageHero } from '@/components/ios27';
import {
  buildRegion,
  classifyHr32Code,
  getScannerDeviceProfile,
  loadHr32Region,
  loadHr32Settings,
  regionOptions,
  saveHr32Region,
  saveHr32Settings,
  scannerDeviceProfiles,
} from '@/utils/hr32';

const router = useRouter();
const settings = reactive(loadHr32Settings());
const region = reactive(loadHr32Region());
const scanBuffer = ref('');
const scanPreview = ref<ReturnType<typeof classifyHr32Code> | null>(null);

const currentProvince = computed(() => regionOptions.find((item) => item.code === region.provinceCode) || regionOptions[0]);
const currentCities = computed(() => currentProvince.value.cities);
const relationSteps = [
  { index: '1', title: '产品地区', desc: '扫码枪先解析产品编号和省市，确认 A 产品归属广东/深圳等分类。' },
  { index: '2', title: '溯源', desc: '防伪码绑定产品、批次、地区后，装箱/发货会自动追加溯源节点。' },
  { index: '3', title: '装箱', desc: '先生成箱码/大码，再扫产品小码，最后扫大码完成一箱一码关联。' },
  { index: '4', title: '发货', desc: '扫描箱号加入发货单，扫描发货单号确认出库，箱状态和链路同步推进。' },
];
const moduleRelations = [
  { name: '产品管理', upstream: [], downstream: ['产品地区', '防伪码', '溯源', '装箱'], scannerRole: '产品编号是地区分类、装箱校验和溯源建档的主键。' },
  { name: '产品地区', upstream: ['产品管理', '代理商'], downstream: ['扫码业务台', '溯源', '装箱', '发货'], scannerRole: '识别 GD/SZ/A001 等片段，把产品归入省市、仓库、代理商分类。' },
  { name: '防伪码', upstream: ['产品管理'], downstream: ['扫码业务台', '溯源', '装箱'], scannerRole: '单品扫码最小单元，绑定产品、批次、状态。' },
  { name: '溯源', upstream: ['产品', '地区', '防伪码', '装箱', '发货'], downstream: ['防伪查询', '扫码业务台'], scannerRole: '装箱、发货、签收、异常自动追加溯源节点。' },
  { name: '装箱', upstream: ['产品', '地区', '防伪码'], downstream: ['发货', '溯源'], scannerRole: '先生成装箱二维码，连续扫产品小码，最后扫箱码/大码自动关联，并按产品、批次做一致性校验。' },
  { name: '发货', upstream: ['装箱', '地区', '代理商'], downstream: ['溯源', '退货'], scannerRole: '扫箱号加入发货单，扫发货单号确认出库并同步箱状态。' },
  { name: '扫码业务台', upstream: ['产品', '地区', '防伪码', '溯源', '装箱', '发货'], downstream: ['地区', '溯源', '装箱', '发货'], scannerRole: '统一识别码值并返回完整链路：地区分类 → 溯源 → 装箱 → 发货。' },
  { name: '系统管理', upstream: [], downstream: ['全部模块'], scannerRole: '配置权限、扫码参数、业务动作、日志和审计。' },
];

const codeRules = [
  { part: 'FW', example: 'FW', meaning: '防伪/溯源码前缀，可按企业规则替换为 AF、TRACE、CODE。' },
  { part: '省份代码', example: 'GD', meaning: '地区一级分类，GD=广东省，HN=湖南省，SD=山东省。' },
  { part: '城市代码', example: 'SZ', meaning: '地区二级分类，SZ=深圳市，GZ=广州市，CS=长沙市。' },
  { part: '产品编号', example: 'A001', meaning: '对应产品管理里的 product_code。' },
  { part: '批次号', example: 'B202605', meaning: '对应防伪码批次和溯源批次。' },
  { part: '序列号', example: '000001', meaning: '单品唯一序列。' },
];

function applyProfile() {
  const profile = getScannerDeviceProfile(settings.deviceType);
  settings.deviceName = profile.deviceName;
  settings.connectionMode = profile.connectionMode;
  settings.submitKey = profile.submitKey;
  settings.enterSuffix = profile.enterSuffix;
  settings.minLength = profile.minLength;
  settings.maxInterval = profile.maxInterval;
}

function handleProvinceChange() {
  const next = buildRegion(region.provinceCode, currentCities.value[0]?.code || '');
  Object.assign(region, next, { warehouse: region.warehouse });
}

function handleCityChange() {
  const next = buildRegion(region.provinceCode, region.cityCode, region.warehouse);
  Object.assign(region, next);
}

function saveSettings() {
  saveHr32Settings(settings);
  Message.success('扫描枪参数已保存到本机浏览器');
}

function saveRegion() {
  handleCityChange();
  saveHr32Region(region);
  Message.success('工位地区已保存');
}

function handleScan(code: string) {
  scanPreview.value = classifyHr32Code(code, region);
  Message.success('扫码解析完成');
}
</script>

<style scoped>
.scanner-guide-page { display: flex; flex-direction: column; gap: 18px; }
.guide-layout { display: grid; grid-template-columns: minmax(260px, 360px) minmax(260px, 360px) minmax(0, 1fr); gap: 18px; align-items: start; }
.config-card, .test-card { border-radius: 22px; }
.card-title { font-weight: 900; color: var(--text-1); }
.guide-tip { margin-top: 14px; border-radius: 14px; }
.preview { margin-top: 14px; }
.relation-table { width: 100%; }
.flow-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.flow-item { padding: 16px; border: 1px solid var(--border-color); border-radius: 18px; background: rgba(255,255,255,.68); }
.flow-index { width: 32px; height: 32px; border-radius: 12px; display: grid; place-items: center; background: rgba(37, 99, 235, .12); color: var(--primary); font-weight: 900; margin-bottom: 10px; }
.flow-item strong { display: block; margin-bottom: 6px; color: var(--text-1); }
.flow-item span { color: var(--text-2); line-height: 1.6; }
@media (max-width: 1280px) { .guide-layout, .flow-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 720px) { .guide-layout, .flow-grid { grid-template-columns: 1fr; } }
</style>
