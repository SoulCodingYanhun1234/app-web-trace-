<template>
  <main class="domain-blocked-page">
    <section aria-labelledby="domain-blocked-title">
      <ShieldX :size="42" stroke-width="1.8" aria-hidden="true" />
      <p class="domain-eyebrow">OFFICIAL VERIFICATION</p>
      <h1 id="domain-blocked-title">当前地址不是官方验码入口</h1>
      <p class="message">请关闭此页面，重新扫描产品包装上的官方二维码，或从品牌官方渠道进入。</p>
      <div class="host-row">
        <span>当前域名</span>
        <strong>{{ currentHost }}</strong>
      </div>
      <p class="warning">请勿在当前网站输入防伪码、手机号或其他个人信息。</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ShieldX } from 'lucide-vue-next';
import { getPublicVerifyHostDecision } from '@/config/publicVerification';

const currentHost = getPublicVerifyHostDecision().hostname || '未知地址';
</script>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  min-height: 100%;
  margin: 0;
}

.domain-blocked-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  box-sizing: border-box;
  color: #1f2937;
  background: #f4f7f9;
}

.domain-blocked-page section {
  width: min(100%, 520px);
  max-width: calc(100vw - 40px);
  min-width: 0;
  padding: 34px 32px;
  box-sizing: border-box;
  border: 1px solid #d8dee5;
  border-top: 4px solid #b42318;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 44px rgb(15 23 42 / 8%);
}

.domain-blocked-page svg {
  color: #b42318;
}

.domain-eyebrow {
  margin: 18px 0 8px;
  color: #667085;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

h1 {
  margin: 0;
  font-size: clamp(24px, 7vw, 34px);
  line-height: 1.25;
  letter-spacing: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.message {
  margin: 16px 0 24px;
  color: #475467;
  font-size: 16px;
  line-height: 1.75;
  white-space: normal !important;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.host-row {
  display: grid;
  gap: 5px;
  padding: 14px 16px;
  border-left: 3px solid #98a2b3;
  background: #f8fafc;
}

.host-row span {
  color: #667085;
  font-size: 12px;
}

.host-row strong {
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 14px;
}

.warning {
  margin: 18px 0 0;
  color: #912018;
  font-size: 14px;
  line-height: 1.65;
  white-space: normal !important;
  overflow-wrap: anywhere;
  word-break: break-all;
}

@media (max-width: 560px) {
  .domain-blocked-page {
    place-items: start center;
    padding-top: 11vh;
  }

  .domain-blocked-page section {
    padding: 28px 22px;
  }

  h1 {
    font-size: 27px;
  }
}
</style>
