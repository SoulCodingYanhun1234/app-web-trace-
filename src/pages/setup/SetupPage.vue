<template>
  <div class="setup-page">
    <IosGlassCard class="setup-card">
      <div class="setup-head">
        <div class="eyebrow">Docker Setup Wizard</div>
        <h1>部署初始化向导</h1>
        <p>首次容器部署时，在这里完成数据库连通状态确认、超级管理员和系统基础参数初始化。</p>
      </div>
      <el-steps :active="activeStep" finish-status="success" simple>
        <el-step title="环境检查" />
        <el-step title="基础配置" />
        <el-step title="完成" />
      </el-steps>

      <div v-if="activeStep === 0" class="setup-panel">
        <el-result :icon="status.initialized ? 'success' : 'info'" :title="status.initialized ? '系统已初始化' : '待初始化'" :sub-title="`管理员：${status.adminCount ?? 0}，参数：${status.settingCount ?? 0}`" />
        <el-button type="primary" @click="activeStep = 1">继续配置</el-button>
      </div>

      <el-form v-else-if="activeStep === 1" :model="form" label-position="top" class="setup-form">
        <div class="form-grid">
          <el-form-item label="系统名称" required><el-input v-model="form.site_name" /></el-form-item>
          <el-form-item label="企业名称"><el-input v-model="form.company_name" /></el-form-item>
          <el-form-item label="数据库类型"><el-select v-model="form.database_provider" style="width:100%"><el-option label="MySQL / MariaDB" value="mysql" /><el-option label="PostgreSQL" value="postgresql" /><el-option label="SQLite" value="sqlite" /></el-select></el-form-item>
          <el-form-item label="超级管理员账号" required><el-input v-model="form.admin_username" /></el-form-item>
          <el-form-item label="超级管理员密码" required><el-input v-model="form.admin_password" type="password" show-password /></el-form-item>
          <el-form-item label="管理员姓名"><el-input v-model="form.real_name" /></el-form-item>
        </div>
        <el-alert type="warning" :closable="false" show-icon title="数据库连接字符串仍由容器环境变量 DATABASE_URL 注入；本页面负责业务初始化和系统参数落库。" />
        <div class="setup-actions"><el-button @click="activeStep = 0">上一步</el-button><el-button type="primary" :loading="saving" @click="submit">初始化系统</el-button></div>
      </el-form>

      <div v-else class="setup-panel">
        <el-result icon="success" title="初始化完成" sub-title="现在可以进入后台登录使用。" />
        <el-button type="primary" @click="$router.replace('/login')">进入登录页</el-button>
      </div>
    </IosGlassCard>
  </div>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { setupApi } from '@/api/resources';
import { IosGlassCard } from '@/components/ios27';
const activeStep = ref(0); const saving = ref(false);
const status = reactive<any>({ initialized:false, adminCount:0, settingCount:0 });
const form = reactive({ site_name:'防伪溯源 SaaS 管理平台', company_name:'', database_provider:'mysql', admin_username:'admin', admin_password:'Admin@123456', real_name:'超级管理员' });
async function load(){ Object.assign(status, await setupApi.status()); }
async function submit(){ saving.value=true; try{ await setupApi.initialize(form); ElMessage.success('初始化完成'); activeStep.value=2; await load(); } finally { saving.value=false; } }
onMounted(load);
</script>
<style scoped>
.setup-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,var(--page-bg),var(--page-bg-soft));}
.setup-card{width:min(960px,100%);border-radius:26px;padding:10px;}
.setup-head{text-align:center;margin-bottom:20px}.setup-head h1{margin:6px 0;font-size:30px;color:var(--text-1)}.setup-head p{margin:0;color:var(--text-3)}
.setup-panel{padding:26px 0;text-align:center}.setup-form{padding:24px 0 0}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px}.setup-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
@media(max-width:760px){.form-grid{grid-template-columns:1fr}.setup-card{border-radius:18px}}


/* iOS 27 部署初始化 */
.setup-page {
  background:
    radial-gradient(circle at 10% 8%, rgba(10,132,255,.22), transparent 34%),
    radial-gradient(circle at 90% 16%, rgba(94,92,230,.18), transparent 30%),
    linear-gradient(135deg, #fbfdff, #eef6ff) !important;
}
.setup-card {
  border-radius: 34px !important;
  border: 1px solid rgba(255,255,255,.66) !important;
  background: linear-gradient(145deg, rgba(255,255,255,.78), rgba(255,255,255,.48)) !important;
  box-shadow: 0 28px 84px rgba(31,89,165,.16), inset 0 1px 0 rgba(255,255,255,.82) !important;
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
}
.setup-head h1 { font-size: clamp(28px, 4vw, 40px) !important; font-weight: 920 !important; letter-spacing: -.05em !important; }
.setup-head p { line-height: 1.8; }
.setup-panel { border-radius: 26px; }
.setup-actions .el-button { min-width: 116px; }
@media(max-width:760px){.setup-card{border-radius:28px !important;}}
</style>
