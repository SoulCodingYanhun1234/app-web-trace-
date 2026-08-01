<template>
  <el-card class="scanner-card" shadow="never">
    <div class="scanner-head">
      <div>
        <div class="scanner-title">{{ title }}</div>
        <div class="scanner-desc">{{ description }}</div>
      </div>
      <el-space wrap>
        <el-radio-group v-model="inputMode" size="small">
          <el-radio-button v-if="mobileCameraActive" value="camera">手机扫码</el-radio-button>
          <el-radio-button v-else value="scanner">扫码枪</el-radio-button>
          <el-radio-button value="manual">手动</el-radio-button>
        </el-radio-group>
        <el-tag :type="modeTagType">{{ modeLabel }}</el-tag>
        <el-switch v-if="!mobileCameraActive" v-model="listening" active-text="监听" inactive-text="关闭" />
      </el-space>
    </div>

    <div v-if="mobileCameraActive && inputMode === 'camera'" class="camera-scanner">
      <div class="camera-stage" :class="{ 'is-running': cameraRunning }">
        <video ref="videoRef" autoplay muted playsinline aria-label="手机扫码摄像头画面"></video>
        <div v-if="!cameraRunning" class="camera-placeholder">
          <Camera :size="30" />
        </div>
        <div v-else class="camera-frame" aria-hidden="true"></div>
      </div>
      <el-alert v-if="cameraError" type="error" :closable="false" show-icon :title="cameraError" />
      <div class="camera-actions">
        <el-button v-if="!cameraRunning" type="primary" :loading="cameraStarting" @click="startCamera()">
          <Camera :size="17" />
          打开摄像头
        </el-button>
        <el-button v-else @click="stopCamera">
          <CameraOff :size="17" />
          关闭摄像头
        </el-button>
        <el-button
          v-if="cameraRunning && cameraDevices.length > 1"
          class="camera-icon-button"
          circle
          title="切换摄像头"
          aria-label="切换摄像头"
          @click="switchCamera"
        >
          <RefreshCw :size="17" />
        </el-button>
      </div>
    </div>

    <div v-if="inputMode !== 'camera'" class="scanner-input-row">
      <el-input
        ref="inputRef"
        v-model="manualCode"
        class="scanner-capture-input"
        clearable
        :placeholder="placeholder"
        @keyup.enter="submitManual"
        @keydown.tab.prevent="submitManualIfTab"
      >
        <template #prefix><AppIcon name="keyboard" /></template>
        <template #append><el-button @click="submitManual">确认扫码</el-button></template>
      </el-input>
      <el-button @click="focusInput">聚焦扫码</el-button>
    </div>

    <div v-if="multiple" class="scanner-list">
      <div class="scanner-list-head">
        <span>已扫描 {{ modelItems.length }} 条</span>
        <el-space>
          <el-button size="small" @click="emitClean">清理重复</el-button>
          <el-button size="small" type="danger" plain @click="emitClear">清空</el-button>
        </el-space>
      </div>
      <el-input
        :model-value="modelText"
        type="textarea"
        :autosize="{ minRows: 4, maxRows: 10 }"
        placeholder="扫码内容会自动追加到这里；请以防伪码ID/码值为准，历史链接会自动提取其中码值。"
        @update:model-value="handleTextUpdate"
        @keydown.enter="normalizeTextareaSoon"
        @keydown.tab.prevent="normalizeTextareaSoon"
        @blur="normalizeTextareaSoon"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage as Message } from 'element-plus';
import type { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Camera, CameraOff, RefreshCw } from 'lucide-vue-next';
import AppIcon from './AppIcon.vue';
import { splitCodes } from '@/utils/format';
import { appendUniqueLine, createScannerBuffer, normalizeScannedText, playScanBeep, splitScannedCodes } from '@/utils/scanner';

type InputMode = 'scanner' | 'camera' | 'manual';

const props = withDefaults(defineProps<{
  modelValue?: string;
  title?: string;
  description?: string;
  placeholder?: string;
  active?: boolean;
  multiple?: boolean;
  global?: boolean;
  autoFocus?: boolean;
  minLength?: number;
  maxInterval?: number;
  submitKey?: 'enter' | 'tab' | 'enter_tab';
  defaultMode?: 'scanner' | 'manual';
  mobileCamera?: boolean;
}>(), {
  modelValue: '',
  title: '扫码枪输入',
  description: '支持 USB 扫码枪键盘模式，也支持手动输入后回车。',
  placeholder: '请扫描或输入防伪码ID/码值',
  active: true,
  multiple: false,
  global: true,
  autoFocus: true,
  minLength: 3,
  maxInterval: 80,
  submitKey: 'enter_tab',
  defaultMode: 'scanner',
  mobileCamera: false,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'scan', code: string): void;
}>();

const inputRef = ref<any>();
const videoRef = ref<HTMLVideoElement>();
const manualCode = ref('');
const inputMode = ref<InputMode>(props.defaultMode);
const isMobileDevice = ref(false);
const cameraStarting = ref(false);
const cameraRunning = ref(false);
const cameraError = ref('');
const cameraDevices = ref<MediaDeviceInfo[]>([]);
const activeCameraId = ref('');
const mobileCameraActive = computed(() => props.mobileCamera && isMobileDevice.value);
const listening = computed({
  get: () => inputMode.value === 'scanner',
  set: (value: boolean) => { inputMode.value = value ? 'scanner' : 'manual'; },
});
const modeLabel = computed(() => {
  if (inputMode.value === 'camera') {
    if (cameraError.value) return '摄像头不可用';
    if (cameraStarting.value) return '正在启动';
    return cameraRunning.value ? '手机扫码中' : '手机扫码';
  }
  return inputMode.value === 'scanner' ? '扫码枪模式' : '手动模式';
});
const modeTagType = computed(() => cameraError.value && inputMode.value === 'camera'
  ? 'danger'
  : inputMode.value === 'manual' ? 'info' : 'success');
const modelText = computed(() => props.modelValue || '');
const modelItems = computed(() => splitCodes(modelText.value));
const suffixKeys = computed(() => props.submitKey === 'enter' ? ['Enter'] : props.submitKey === 'tab' ? ['Tab'] : ['Enter', 'Tab']);
let cameraReader: BrowserQRCodeReader | null = null;
let cameraControls: IScannerControls | null = null;
let cameraSession = 0;
let lastCameraScan = { code: '', at: 0 };
let scanner = createScannerBuffer({
  minLength: props.minLength,
  maxInterval: props.maxInterval,
  suffixKeys: suffixKeys.value,
  onScan: (code) => handleScan(code, 'scanner'),
});

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable || Boolean(el.closest?.('.el-input, .el-textarea'));
}

function handleScan(raw: string, source: 'manual' | 'scanner' | 'camera' = 'manual') {
  const code = normalizeScannedText(raw);
  if (!code) return;
  if (source === 'camera') {
    const now = Date.now();
    if (lastCameraScan.code === code && now - lastCameraScan.at < 2500) return;
    lastCameraScan = { code, at: now };
  }
  if (props.multiple) emit('update:modelValue', appendUniqueLine(modelText.value, code));
  emit('scan', code);
  if (source !== 'manual') {
    if (source === 'camera') navigator.vibrate?.(60);
    playScanBeep();
    Message.success(`已扫描：${code}`);
  }
}

function detectMobileDevice() {
  const userAgent = navigator.userAgent || '';
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(userAgent);
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return mobileAgent || (navigator.maxTouchPoints > 0 && coarsePointer && window.innerWidth <= 1024);
}

function syncMobileMode() {
  isMobileDevice.value = detectMobileDevice();
  if (mobileCameraActive.value && inputMode.value === 'scanner') inputMode.value = 'camera';
  if (!mobileCameraActive.value && inputMode.value === 'camera') inputMode.value = props.defaultMode;
}

function cameraErrorMessage(error: unknown) {
  const name = String((error as any)?.name || '');
  if (!window.isSecureContext) return '手机扫码需要通过 HTTPS 访问。';
  if (/NotAllowed|PermissionDenied|Security/i.test(name)) return '无法使用摄像头，请允许浏览器访问摄像头。';
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(name)) return '未检测到可用摄像头。';
  if (/NotReadable|TrackStart|Abort/i.test(name)) return '摄像头正被其他应用占用。';
  return '摄像头启动失败，请切换手动模式后重试。';
}

function stopCamera() {
  cameraSession += 1;
  cameraControls?.stop();
  cameraControls = null;
  const stream = videoRef.value?.srcObject as MediaStream | null;
  stream?.getTracks().forEach((track) => track.stop());
  if (videoRef.value) videoRef.value.srcObject = null;
  cameraStarting.value = false;
  cameraRunning.value = false;
}

async function startCamera(deviceId = '') {
  if (cameraStarting.value || cameraRunning.value || !props.active || inputMode.value !== 'camera') return;
  cameraError.value = '';
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = window.isSecureContext ? '当前浏览器不支持手机扫码。' : '手机扫码需要通过 HTTPS 访问。';
    return;
  }
  cameraStarting.value = true;
  const session = ++cameraSession;
  await nextTick();
  try {
    const { BrowserQRCodeReader } = await import('@zxing/browser');
    if (session !== cameraSession || !props.active || inputMode.value !== 'camera') return;
    cameraReader ||= new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 650,
    });
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    const controls = await cameraReader.decodeFromConstraints(constraints, videoRef.value, (result) => {
      if (result) handleScan(result.getText(), 'camera');
    });
    if (session !== cameraSession || !props.active || inputMode.value !== 'camera') {
      controls.stop();
      return;
    }
    cameraControls = controls;
    cameraRunning.value = true;
    cameraDevices.value = await BrowserQRCodeReader.listVideoInputDevices().catch(() => []);
    const stream = videoRef.value?.srcObject as MediaStream | null;
    activeCameraId.value = stream?.getVideoTracks()[0]?.getSettings().deviceId || deviceId;
  } catch (error) {
    if (session === cameraSession) cameraError.value = cameraErrorMessage(error);
    stopCamera();
  } finally {
    if (session === cameraSession) cameraStarting.value = false;
  }
}

async function switchCamera() {
  if (cameraDevices.value.length < 2) return;
  const currentIndex = cameraDevices.value.findIndex((device) => device.deviceId === activeCameraId.value);
  const nextDevice = cameraDevices.value[(currentIndex + 1) % cameraDevices.value.length];
  stopCamera();
  await startCamera(nextDevice.deviceId);
}

function submitManual() {
  const code = manualCode.value;
  manualCode.value = '';
  handleScan(code, 'manual');
  focusInput();
}

function submitManualIfTab() {
  if (!suffixKeys.value.includes('Tab')) return;
  submitManual();
}

function shouldNormalizeText(value: string) {
  return /https?:\/\/|[?&#;\s,，](?:code|anti_fake_code|antiFakeCode|q|barcode|sn|c)=|^(?:code|qr|sn|barcode|anti[-_]?fake[-_]?code|antiFakeCode|防伪码|二维码|箱码)[:：=]/i.test(value || '');
}

function handleTextUpdate(value: string) {
  if (shouldNormalizeText(value)) {
    const normalized = splitScannedCodes(value).join('\n');
    emit('update:modelValue', normalized || value);
    return;
  }
  emit('update:modelValue', value);
}

function normalizeTextareaSoon() {
  nextTick(() => {
    const normalized = splitScannedCodes(modelText.value).join('\n');
    if (normalized && normalized !== modelText.value) emit('update:modelValue', normalized);
  });
}

function emitClean() {
  emit('update:modelValue', Array.from(new Set(modelItems.value)).join('\n'));
}

function emitClear() {
  emit('update:modelValue', '');
}

function focusInput() {
  nextTick(() => inputRef.value?.focus?.());
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.active || !props.global || !listening.value) return;
  if (isEditableTarget(event.target)) return;
  scanner.push(event);
}

watch([() => props.minLength, () => props.maxInterval, () => props.submitKey], () => {
  scanner = createScannerBuffer({
    minLength: props.minLength,
    maxInterval: props.maxInterval,
    suffixKeys: suffixKeys.value,
    onScan: (code) => handleScan(code, 'scanner'),
  });
});

watch(() => props.active, (active) => {
  if (!active) {
    stopCamera();
    return;
  }
  if (inputMode.value === 'camera') startCamera();
  else if (props.autoFocus) focusInput();
});

watch(inputMode, (mode) => {
  if (mode === 'camera' && props.active) startCamera();
  else {
    stopCamera();
    if (mode !== 'camera' && props.active && props.autoFocus) focusInput();
  }
});

onMounted(() => {
  syncMobileMode();
  window.addEventListener('resize', syncMobileMode);
  document.addEventListener('keydown', handleKeydown, true);
  if (inputMode.value === 'camera' && props.active) startCamera();
  else if (props.autoFocus) focusInput();
});

onBeforeUnmount(() => {
  stopCamera();
  window.removeEventListener('resize', syncMobileMode);
  document.removeEventListener('keydown', handleKeydown, true);
});
</script>

<style scoped>
.scanner-card { border-radius: 18px; border: 1px solid var(--border-color); background: var(--card-bg); }
.scanner-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
.scanner-title { font-size: 15px; font-weight: 850; color: var(--text-1); }
.scanner-desc { color: var(--text-3); font-size: 13px; margin-top: 4px; line-height: 1.5; }
.scanner-input-row { display: flex; gap: 10px; align-items: center; }
.scanner-input-row .el-input { flex: 1; }
.camera-scanner { display: grid; gap: 10px; }
.camera-stage { position: relative; overflow: hidden; width: 100%; aspect-ratio: 4 / 3; max-height: 420px; border-radius: 8px; background: #111; }
.camera-stage video { display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; }
.camera-stage.is-running video { opacity: 1; }
.camera-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; }
.camera-frame { position: absolute; left: 50%; top: 50%; width: min(62%, 280px); aspect-ratio: 1; transform: translate(-50%, -50%); border: 2px solid rgba(255, 255, 255, .92); border-radius: 8px; box-shadow: 0 0 0 999px rgba(0, 0, 0, .22); }
.camera-actions { display: flex; align-items: center; gap: 8px; }
.camera-actions .el-button { margin-left: 0; }
.camera-icon-button { width: 32px; height: 32px; padding: 0; }
.scanner-list { margin-top: 12px; }
.scanner-list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; color: var(--text-2); font-size: 13px; font-weight: 700; }
@media (max-width: 700px) {
  .scanner-head, .scanner-input-row, .scanner-list-head { flex-direction: column; align-items: stretch; }
  .camera-stage { max-height: none; }
}
</style>
