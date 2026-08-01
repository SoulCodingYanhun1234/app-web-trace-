<template>
  <main class="http-status-page" :class="`http-status-page--${status.code}`">
    <section class="http-status-card" role="alert" :aria-labelledby="`status-${status.code}-title`">
      <div class="status-orbit status-orbit--one" aria-hidden="true" />
      <div class="status-orbit status-orbit--two" aria-hidden="true" />
      <p class="status-kicker">SYSTEM STATUS</p>
      <div class="status-code" aria-hidden="true">{{ status.code }}</div>
      <h1 :id="`status-${status.code}-title`">{{ status.title }}</h1>
      <p class="status-message">{{ status.message }}</p>
      <div class="status-actions">
        <button type="button" class="status-button status-button--primary" @click="reload">重新加载</button>
        <button type="button" class="status-button" @click="goBack">返回上一页</button>
      </div>
      <p class="status-hint">错误代码：{{ status.code }} · {{ status.hint }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

type StatusItem = { code: string; title: string; message: string; hint: string };

const statuses: Record<string, StatusItem> = {
  '400': { code: '400', title: '请求无法处理', message: '请求内容不完整或格式不正确，请检查后重新提交。', hint: 'Bad Request' },
  '401': { code: '401', title: '需要身份验证', message: '当前会话已失效或尚未登录，请完成身份验证后再继续。', hint: 'Unauthorized' },
  '403': { code: '403', title: '没有访问权限', message: '此资源不允许当前账户或当前来源访问。', hint: 'Forbidden' },
  '404': { code: '404', title: '页面不存在', message: '该地址不存在，或防伪验证链接未包含有效防伪码。请使用产品二维码中的完整链接访问。', hint: 'Not Found' },
  '405': { code: '405', title: '请求方式不被允许', message: '当前地址不支持所使用的请求方式。', hint: 'Method Not Allowed' },
  '408': { code: '408', title: '请求超时', message: '请求等待时间过长，请检查网络后重试。', hint: 'Request Timeout' },
  '413': { code: '413', title: '提交内容过大', message: '上传或提交的数据超过服务器允许的大小限制。', hint: 'Payload Too Large' },
  '429': { code: '429', title: '请求过于频繁', message: '系统已暂时限制重复请求，请稍候片刻后再试。', hint: 'Too Many Requests' },
  '500': { code: '500', title: '服务发生内部错误', message: '服务暂时无法完成请求，系统正在记录并处理该问题。', hint: 'Internal Server Error' },
  '501': { code: '501', title: '服务暂未实现', message: '当前服务暂不支持此请求，请使用其他入口或稍后再试。', hint: 'Not Implemented' },
  '502': { code: '502', title: '服务暂时不可用', message: '网关暂时无法连接到后端服务，请稍后重新尝试。', hint: 'Bad Gateway' },
  '503': { code: '503', title: '服务维护中', message: '系统正在维护或服务繁忙，请稍后再访问。', hint: 'Service Unavailable' },
  '504': { code: '504', title: '服务响应超时', message: '后端服务响应时间过长，请稍后重试。', hint: 'Gateway Timeout' },
};

const route = useRoute();
const router = useRouter();
const status = computed(() => statuses[String(route.params.status || '')] || statuses['404']);

function goBack() {
  if (window.history.length > 1) window.history.back();
  else router.replace('/error/404');
}

function reload() {
  window.location.reload();
}
</script>

<style scoped>
.http-status-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 28px;
  color: #162033;
  background:
    radial-gradient(circle at 14% 18%, rgba(75, 151, 255, .20), transparent 30%),
    radial-gradient(circle at 86% 84%, rgba(90, 224, 181, .18), transparent 32%),
    linear-gradient(145deg, #f9fcff, #eef5ff 52%, #f6fbf9);
}
.http-status-card {
  position: relative;
  width: min(580px, 100%);
  overflow: hidden;
  padding: clamp(32px, 7vw, 64px);
  text-align: center;
  border: 1px solid rgba(91, 130, 183, .18);
  border-radius: 30px;
  background: rgba(255, 255, 255, .82);
  box-shadow: 0 28px 70px rgba(26, 74, 137, .16), inset 0 1px rgba(255,255,255,.82);
  backdrop-filter: blur(16px);
}
.status-orbit { position: absolute; border-radius: 50%; pointer-events: none; }
.status-orbit--one { width: 156px; height: 156px; top: -84px; right: -52px; background: rgba(47, 119, 255, .10); }
.status-orbit--two { width: 96px; height: 96px; bottom: -42px; left: -32px; background: rgba(43, 203, 143, .11); }
.status-kicker { position: relative; margin: 0; color: #5d7ca8; font-size: 12px; font-weight: 800; letter-spacing: .15em; }
.status-code { position: relative; margin: 12px 0 4px; color: #2f77ff; font-size: clamp(78px, 17vw, 144px); font-weight: 850; line-height: .95; letter-spacing: -.075em; text-shadow: 0 12px 28px rgba(47,119,255,.16); }
h1 { position: relative; margin: 22px 0 12px; font-size: clamp(24px, 4vw, 32px); line-height: 1.25; }
.status-message { position: relative; max-width: 420px; margin: 0 auto; color: #62718a; font-size: 15px; line-height: 1.8; }
.status-actions { position: relative; display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.status-button { min-width: 132px; min-height: 42px; padding: 0 18px; border: 1px solid #d7e2f1; border-radius: 12px; color: #35516f; background: #fff; cursor: pointer; font: inherit; font-weight: 700; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
.status-button:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(45, 91, 150, .14); }
.status-button--primary { border-color: #2f77ff; color: #fff; background: linear-gradient(135deg, #2f77ff, #5aa5ff); }
.status-hint { position: relative; margin: 24px 0 0; color: #8a99af; font-size: 12px; }
.http-status-page--5 .status-code { color: #ec7e2d; text-shadow: 0 12px 28px rgba(236,126,45,.14); }
.http-status-page--5 .status-button--primary { border-color: #e58035; background: linear-gradient(135deg, #ec7e2d, #f4aa61); }
@media (max-width: 480px) { .http-status-page { padding: 16px; } .http-status-card { border-radius: 24px; } .status-actions { display: grid; grid-template-columns: 1fr; } .status-button { width: 100%; } }
</style>
