<template>
  <div class="login-page soybean-login">
    <div class="login-visual">
      <div class="visual-orbit orbit-one" />
      <div class="visual-orbit orbit-two" />
      <div class="visual-badge">
        <AppIcon name="shield" />
        可信溯源 · 运营工作台
      </div>
      <h1>让每一件商品<br />都有可信来路</h1>
      <p>覆盖产品建档、码级验证、渠道流转与风险预警，为品牌提供清晰、可控的全链路运营视野。</p>
      <div class="visual-grid">
        <span><AppIcon name="product" />产品建档</span>
        <span><AppIcon name="query" />防伪查询</span>
        <span><AppIcon name="trace" />溯源追踪</span>
        <span><AppIcon name="shipment" />物流闭环</span>
      </div>
      <div class="visual-panel">
        <div class="panel-header"><span /><span /><span /></div>
        <div class="panel-line wide" />
        <div class="panel-line" />
        <div class="panel-metrics">
          <div><strong>Trace</strong><em>源头建档</em></div>
          <div><strong>Code</strong><em>码级验证</em></div>
          <div><strong>Flow</strong><em>全链路流转</em></div>
        </div>
      </div>
    </div>

    <div class="login-card glass-card">
      <div class="login-logo">
        <img v-if="branding.login_logo" :src="branding.login_logo" alt="Logo" />
        <span v-else>溯</span>
      </div>
      <div class="login-title">欢迎登录</div>
      <div class="login-subtitle">企业防伪与溯源运营中心</div>
      <el-alert class="security-tip" type="info" show-icon :closable="false">{{ securityTip }}</el-alert>

      <el-tabs v-if="modeTabs.length > 1" v-model="activeMode" class="login-mode-tabs" stretch>
        <el-tab-pane v-for="tab in modeTabs" :key="tab.value" :name="tab.value" :label="tab.label" />
      </el-tabs>

      <el-form v-if="modeTabs.length" ref="formRef" :model="form" label-position="top" autocomplete="off" @submit.prevent="submit">
        <template v-if="activeMode === 'password'">
          <el-form-item prop="account" label="账号" :rules="[{ required: true, message: '请输入手机号、邮箱或用户名', trigger: 'blur' }]">
            <el-input v-model="form.account" :placeholder="passwordAccountPlaceholder" clearable size="large" :maxlength="128" autocomplete="username">
              <template #prefix><AppIcon name="profile" /></template>
            </el-input>
          </el-form-item>
          <el-form-item prop="password" label="密码" :rules="[{ required: true, message: '请输入密码', trigger: 'blur' }]">
            <el-input v-model="form.password" type="password" show-password placeholder="请输入登录密码" clearable size="large" :maxlength="128" autocomplete="current-password">
              <template #prefix><AppIcon name="lock" /></template>
            </el-input>
          </el-form-item>
        </template>

        <template v-else-if="activeMode === 'email_code' || activeMode === 'phone_code'">
          <el-form-item :prop="activeMode === 'email_code' ? 'email' : 'phone'" :label="activeMode === 'email_code' ? '邮箱' : '手机号'" :rules="targetRules">
            <el-input v-if="activeMode === 'email_code'" v-model="form.email" type="email" placeholder="请输入邮箱" clearable size="large" :maxlength="128" autocomplete="email">
              <template #prefix><AppIcon name="message" /></template>
            </el-input>
            <el-input v-else v-model="form.phone" type="tel" placeholder="请输入手机号" clearable size="large" :maxlength="32" autocomplete="tel">
              <template #prefix><AppIcon name="profile" /></template>
            </el-input>
          </el-form-item>
          <el-form-item prop="code" label="验证码" :rules="[{ required: true, message: '请输入验证码', trigger: 'blur' }]">
            <el-input v-model="form.code" inputmode="numeric" placeholder="请输入验证码" clearable size="large" :maxlength="8" autocomplete="one-time-code">
              <template #prefix><AppIcon name="security" /></template>
              <template #append>
                <el-button class="code-button" :disabled="codeCountdown > 0" :loading="codeLoading" @click="sendCode">
                  {{ codeCountdown > 0 ? codeCountdown + 's' : '获取验证码' }}
                </el-button>
              </template>
            </el-input>
          </el-form-item>
        </template>

        <div v-else-if="activeMode === 'wechat_qr'" class="wechat-login">
          <div v-if="wechatQr.qr_svg" class="wechat-qr" v-html="wechatQr.qr_svg" />
          <el-empty v-else description="二维码加载中" :image-size="72" />
          <div class="wechat-status">{{ wechatStatus }}</div>
          <el-button plain class="wechat-refresh" :loading="wechatLoading" @click="loadWechatQr">
            <template #icon><AppIcon name="refresh" /></template>
            刷新二维码
          </el-button>
        </div>

        <el-button v-if="activeMode !== 'wechat_qr'" type="primary" native-type="submit" class="login-submit" size="large" :loading="loading">
          <template #icon><AppIcon :name="activeMode === 'password' ? 'lock' : 'security'" /></template>
          {{ activeMode === 'password' ? '安全登录' : '验证码登录' }}
        </el-button>
      </el-form>
      <el-alert v-else type="warning" show-icon :closable="false">当前未启用任何登录渠道，请检查 API 的 .env 配置。</el-alert>
      <div class="login-footnote">企业级防伪溯源运营中心 · Vue 3</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import { authApi, type LoginOptions } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { hasValidLoginGate, isLoginEntryRequiredForCurrentHost, safeRedirectPath } from '@/utils/security';
import { settingsApi } from '@/api/resources';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const loading = ref(false);
const codeLoading = ref(false);
const wechatLoading = ref(false);
const codeCountdown = ref(0);
const formRef = ref();
const form = reactive({ account: '', password: '', email: '', phone: '', code: '' });
const branding = reactive({ login_logo: '' });
const defaultOptions: LoginOptions = {
  password: { enabled: true, account_types: { username: true, email: false, phone: false } },
  verification_code: { email: false, phone: false, ttl_seconds: 300, resend_seconds: 60 },
  wechat: { enabled: false, qrcode: true, configured: false },
};
const loginOptions = ref<LoginOptions>(defaultOptions);
const activeMode = ref<'password' | 'email_code' | 'phone_code' | 'wechat_qr'>('password');
const wechatQr = reactive({ qr_svg: '', expires_at: '' });
let countdownTimer = 0;
const entryRequired = isLoginEntryRequiredForCurrentHost();
const securityTip = computed(() => entryRequired
  ? '当前域名启用了临时 entry 入口校验；登录后连续 7 天无操作才会退出，期间有操作会自动续期。'
  : '当前域名可直接登录；登录后连续 7 天无操作才会退出，期间有操作会自动续期。');
const modeTabs = computed(() => [
  loginOptions.value.password.enabled ? { value: 'password' as const, label: '密码' } : null,
  loginOptions.value.verification_code.email ? { value: 'email_code' as const, label: '邮箱' } : null,
  loginOptions.value.verification_code.phone ? { value: 'phone_code' as const, label: '手机' } : null,
  loginOptions.value.wechat.enabled ? { value: 'wechat_qr' as const, label: '微信' } : null,
].filter(Boolean) as Array<{ value: 'password' | 'email_code' | 'phone_code' | 'wechat_qr'; label: string }>);
const passwordAccountPlaceholder = computed(() => {
  const types = loginOptions.value.password.account_types;
  const labels = [types.phone ? '手机号' : '', types.email ? '邮箱' : '', types.username ? '用户名' : ''].filter(Boolean);
  return labels.join(' / ') || '登录账号';
});
const targetRules = computed(() => activeMode.value === 'email_code'
  ? [{ required: true, type: 'email', message: '请输入正确的邮箱', trigger: 'blur' }]
  : [{ required: true, pattern: /^\+?\d{6,20}$/, message: '请输入正确的手机号', trigger: 'blur' }]);
const wechatStatus = computed(() => wechatQr.expires_at
  ? '请使用微信扫描二维码，二维码将在 ' + Math.max(0, Math.ceil((new Date(wechatQr.expires_at).getTime() - Date.now()) / 1000)) + ' 秒后失效'
  : '请使用微信扫描二维码');

async function loadBranding() {
  try {
    const res = await settingsApi.branding();
    branding.login_logo = res?.login_logo || '';
  } catch {
    // Silent fail
  }
}

function selectDefaultMode() {
  const available = modeTabs.value.map((item) => item.value);
  if (!available.includes(activeMode.value)) activeMode.value = available[0] || 'password';
}

async function loadWechatQr() {
  if (!loginOptions.value.wechat.enabled) return;
  wechatLoading.value = true;
  try {
    const redirectUri = window.location.origin + window.location.pathname;
    const result = await authApi.wechatQrCode(redirectUri);
    wechatQr.qr_svg = result.qr_svg;
    wechatQr.expires_at = result.expires_at;
  } finally {
    wechatLoading.value = false;
  }
}

watch(activeMode, (mode) => {
  formRef.value?.clearValidate?.();
  if (mode === 'wechat_qr' && !wechatQr.qr_svg) void loadWechatQr();
});

async function handleWechatCallback() {
  const code = typeof route.query.code === 'string' ? route.query.code : '';
  const state = typeof route.query.state === 'string' ? route.query.state : '';
  if (!code || !state || !loginOptions.value.wechat.enabled) return;
  loading.value = true;
  try {
    await auth.loginWith({ channel: 'wechat_qr', wechatCode: code, state });
    Message.success('微信登录成功');
    router.replace(safeRedirectPath(route.query.redirect));
  } finally {
    loading.value = false;
  }
}

async function loadLoginOptions() {
  try {
    loginOptions.value = await authApi.loginOptions();
  } catch {
    loginOptions.value = defaultOptions;
  }
  selectDefaultMode();
  if (activeMode.value === 'wechat_qr') await loadWechatQr();
  await handleWechatCallback();
}

onMounted(async () => {
  if (!auth.isLogin && entryRequired && !hasValidLoginGate()) {
    router.replace('/error/404');
    return;
  }
  await Promise.all([loadBranding(), loadLoginOptions()]);
});
let lastSubmitAt = 0;

async function submit() {
  try { await formRef.value?.validate(); } catch { return; }
  const now = Date.now();
  if (now - lastSubmitAt < 900) return;
  lastSubmitAt = now;
  loading.value = true;
  try {
    if (activeMode.value === 'password') {
      await auth.loginWith({ channel: 'password', account: form.account, password: form.password });
    } else if (activeMode.value === 'email_code') {
      await auth.loginWith({ channel: 'email_code', email: form.email, code: form.code });
    } else {
      await auth.loginWith({ channel: 'phone_code', phone: form.phone, code: form.code });
    }
    Message.success('登录成功');
    router.replace(safeRedirectPath(route.query.redirect));
  } finally {
    loading.value = false;
  }
}

async function sendCode() {
  const channel = activeMode.value === 'email_code' ? 'email' : 'phone';
  const target = channel === 'email' ? form.email : form.phone;
  if (!target) {
    Message.warning(channel === 'email' ? '请输入邮箱' : '请输入手机号');
    return;
  }
  codeLoading.value = true;
  try {
    const result = await authApi.sendLoginCode({ channel, target });
    if (result.debug_code) {
      form.code = result.debug_code;
      Message.info('开发环境验证码：' + result.debug_code);
    } else Message.success('验证码已发送');
    codeCountdown.value = result.resend_seconds;
    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(() => {
      codeCountdown.value -= 1;
      if (codeCountdown.value <= 0) window.clearInterval(countdownTimer);
    }, 1000);
  } finally {
    codeLoading.value = false;
  }
}

onUnmounted(() => window.clearInterval(countdownTimer));
</script>
<style scoped>
.login-page {
  min-height: 100vh;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) 460px;
  align-items: center;
  gap: 56px;
  padding: 56px 8vw;
  overflow: hidden;
  background:
    radial-gradient(circle at 7% 10%, rgba(37, 99, 235, .18), transparent 34%),
    radial-gradient(circle at 92% 18%, rgba(96, 165, 250, .18), transparent 30%),
    linear-gradient(135deg, #f8fbff 0%, #eef5ff 54%, #ffffff 100%);
}
.login-visual { position: relative; color: var(--text-1); z-index: 1; }
.visual-orbit { position: absolute; border-radius: 999px; pointer-events: none; }
.orbit-one { width: 220px; height: 220px; left: -76px; top: -66px; background: radial-gradient(circle, rgba(37,99,235,.16), transparent 70%); }
.orbit-two { width: 300px; height: 300px; right: 4%; bottom: -150px; background: radial-gradient(circle, rgba(125,211,252,.24), transparent 72%); }
.visual-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 15px;
  border-radius: 999px;
  color: var(--primary);
  background: rgba(255,255,255,.86);
  border: 1px solid var(--primary-border);
  box-shadow: 0 12px 28px rgba(37, 99, 235, .10);
  font-weight: 900;
  margin-bottom: 20px;
}
.login-visual h1 { position: relative; max-width: 640px; font-size: clamp(38px, 5vw, 58px); line-height: 1.04; margin: 0 0 18px; letter-spacing: -.05em; }
.login-visual p { position: relative; max-width: 600px; color: var(--text-2); font-size: 16px; line-height: 1.85; }
.visual-grid { position: relative; display: grid; grid-template-columns: repeat(2, minmax(156px, 188px)); gap: 12px; margin-top: 28px; }
.visual-grid span {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 17px;
  background: rgba(255,255,255,.86);
  border: 1px solid rgba(207, 224, 255, .82);
  box-shadow: var(--shadow-soft);
  font-weight: 780;
}
.visual-panel {
  position: relative;
  max-width: 560px;
  margin-top: 28px;
  padding: 18px;
  border-radius: 24px;
  background: rgba(255,255,255,.72);
  border: 1px solid rgba(207, 224, 255, .78);
  box-shadow: 0 24px 60px rgba(37, 99, 235, .11);
  backdrop-filter: blur(14px);
}
.panel-header { display: flex; gap: 7px; margin-bottom: 16px; }
.panel-header span { width: 10px; height: 10px; border-radius: 999px; background: #bfd5fb; }
.panel-line { height: 12px; width: 58%; border-radius: 999px; background: linear-gradient(90deg, #dbeafe, rgba(219,234,254,.18)); margin-bottom: 10px; }
.panel-line.wide { width: 82%; }
.panel-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
.panel-metrics div { padding: 12px; border-radius: 16px; background: #f8fbff; border: 1px solid #e6f0ff; }
.panel-metrics strong { display: block; color: var(--primary); font-size: 18px; font-weight: 950; }
.panel-metrics em { display: block; color: var(--text-3); font-style: normal; font-size: 12px; margin-top: 4px; }
.login-card {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 42px;
  border-radius: 30px;
  background:
    radial-gradient(circle at 88% 0%, rgba(37, 99, 235, .10), transparent 34%),
    rgba(255,255,255,.97);
  box-shadow: 0 30px 84px rgba(37, 99, 235, .16);
  border: 1px solid rgba(207, 224, 255, .95);
}
.login-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(37,99,235,.36), rgba(255,255,255,0), rgba(125,211,252,.32));
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
.login-logo {
  width: 56px;
  height: 56px;
  border-radius: 20px;
  margin: 0 auto 17px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 950;
  font-size: 24px;
  background: linear-gradient(135deg, #1d4ed8, #2563eb 50%, #60a5fa);
  box-shadow: 0 16px 30px rgba(37, 99, 235, .28);
  overflow: hidden;
}
.login-logo img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 20px; }
.login-title { font-size: 29px; font-weight: 950; margin-bottom: 8px; text-align: center; color: var(--text-1); letter-spacing: -.03em; }
.login-subtitle { color: var(--text-3); text-align: center; margin-bottom: 18px; }
.security-tip { margin-bottom: 22px; border-radius: 14px; }
.login-mode-tabs { margin: -4px 0 22px; }
.login-mode-tabs :deep(.el-tabs__item) { font-weight: 750; }
.code-button { min-width: 92px; padding: 0 12px; }
.wechat-login { display: grid; justify-items: center; gap: 14px; padding: 2px 0 10px; }
.wechat-qr { width: 260px; height: 260px; display: grid; place-items: center; padding: 10px; box-sizing: border-box; background: #fff; border: 1px solid #dbeafe; border-radius: 16px; }
.wechat-qr :deep(svg) { display: block; width: 100%; height: 100%; }
.wechat-status { color: var(--text-3); font-size: 13px; text-align: center; line-height: 1.6; }
.wechat-refresh { min-width: 132px; }
.login-submit { width: 100%; min-height: 44px; font-weight: 850; }
.login-footnote { margin-top: 18px; color: var(--text-3); font-size: 12px; text-align: center; }
@media (max-width: 980px) { .login-page { grid-template-columns: 1fr; padding: 28px; } .login-visual { display: none; } }
@media (max-width: 520px) { .login-card { padding: 30px 22px; border-radius: 24px; } }


/* iOS 27 登录页 */
.login-page {
  background:
    radial-gradient(circle at 10% 8%, rgba(10, 132, 255, .22), transparent 34%),
    radial-gradient(circle at 88% 16%, rgba(94, 92, 230, .18), transparent 31%),
    radial-gradient(circle at 74% 86%, rgba(48, 209, 88, .10), transparent 28%),
    linear-gradient(135deg, #fbfdff 0%, #edf6ff 54%, #ffffff 100%) !important;
}
.visual-badge,
.visual-grid span,
.visual-panel,
.login-card {
  border: 1px solid rgba(255,255,255,.66) !important;
  background: linear-gradient(145deg, rgba(255,255,255,.76), rgba(255,255,255,.44)) !important;
  box-shadow: 0 24px 76px rgba(31, 89, 165, .14), inset 0 1px 0 rgba(255,255,255,.82) !important;
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
}
.login-card { border-radius: 34px !important; padding: 46px !important; }
.login-card::before {
  background: linear-gradient(135deg, rgba(10,132,255,.46), rgba(255,255,255,0), rgba(94,92,230,.34)) !important;
}
.login-logo {
  border-radius: 22px !important;
  background: linear-gradient(145deg, #0a84ff 0%, #5e5ce6 62%, #64d2ff 100%) !important;
  box-shadow: 0 18px 36px rgba(10,132,255,.30), inset 0 1px 0 rgba(255,255,255,.46) !important;
}
.login-title,
.login-visual h1 { letter-spacing: -.055em !important; }
.login-submit { min-height: 48px !important; }
.security-tip { background: rgba(10, 132, 255, .08) !important; border-color: rgba(10, 132, 255, .18) !important; }
.panel-metrics div { border-color: rgba(255,255,255,.66) !important; background: rgba(255,255,255,.52) !important; }
@media (max-width: 520px) {
  .login-page { padding: 18px !important; }
  .login-card { padding: 30px 22px !important; border-radius: 28px !important; }
}


@media (max-width: 760px) {
  .login-page {
    width: 100%;
    min-height: 100dvh;
    height: auto;
    overflow-x: hidden;
    overflow-y: auto;
    padding: max(18px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left)) !important;
  }

  .login-card {
    width: min(100%, 460px);
    max-width: 100%;
    padding: 30px 22px !important;
    border-radius: 26px !important;
  }

  .login-title { font-size: 27px; }
  .login-subtitle { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
  .security-tip { margin-bottom: 18px; }
  .security-tip :deep(.el-alert__content) { min-width: 0; }
  .security-tip :deep(.el-alert__description) { line-height: 1.55; overflow-wrap: anywhere; }
  .login-card :deep(.el-input__inner) { font-size: 16px; }
}

@media (max-width: 390px) {
  .login-card { padding: 24px 16px !important; border-radius: 22px !important; }
  .login-logo { width: 50px; height: 50px; margin-bottom: 14px; }
  .login-title { font-size: 24px; }
  .login-subtitle { margin-bottom: 14px; }
  .login-footnote { margin-top: 14px; }
}

@media (max-width: 760px) and (max-height: 680px) {
  .login-page { align-items: start; }
  .login-card { padding-top: 20px !important; padding-bottom: 20px !important; }
  .login-logo { width: 46px; height: 46px; margin-bottom: 10px; }
  .login-title { font-size: 23px; margin-bottom: 4px; }
  .login-subtitle { margin-bottom: 12px; }
  .security-tip { margin-bottom: 12px; }
  .login-footnote { display: none; }
}

</style>
