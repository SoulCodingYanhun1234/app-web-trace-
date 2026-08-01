<template>
  <IosPage>
    <IosPageHero eyebrow="Account" title="个人中心" description="维护管理员个人资料、头像和登录密码。" />
    <el-row :gutter="18">
      <el-col :xs="24" :lg="12">
        <IosGlassCard title="个人信息" class="form-card">
          <el-form :model="profile" label-position="top">
            <el-form-item label="姓名"><el-input v-model="profile.real_name" /></el-form-item>
            <el-form-item label="邮箱"><el-input v-model="profile.email" /></el-form-item>
            <el-form-item label="手机"><el-input v-model="profile.phone" /></el-form-item>
            <el-form-item label="头像"><UploadField v-model="profile.avatar" /></el-form-item>
            <el-button type="primary" @click="saveProfile">保存资料</el-button>
          </el-form>
        </IosGlassCard>
      </el-col>
      <el-col :xs="24" :lg="12">
        <IosGlassCard title="修改密码" class="form-card">
          <el-form :model="password" label-position="top">
            <el-form-item label="旧密码"><el-input v-model="password.oldPassword" type="password" show-password /></el-form-item>
            <el-form-item label="新密码"><el-input v-model="password.newPassword" type="password" show-password /></el-form-item>
            <el-button type="warning" @click="changePassword">修改密码</el-button>
          </el-form>
        </IosGlassCard>
      </el-col>
    </el-row>
  </IosPage>
</template>
<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import { ElMessage as Message } from 'element-plus';
import UploadField from '@/components/UploadField.vue';
import { IosGlassCard, IosPage, IosPageHero } from '@/components/ios27';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const profile = reactive<any>({});
const password = reactive({ oldPassword: '', newPassword: '' });
onMounted(async () => Object.assign(profile, await auth.loadProfile()));
async function saveProfile(){
  const payload = {
    real_name: profile.real_name,
    email: profile.email,
    phone: profile.phone,
    avatar: profile.avatar,
  };
  await authApi.updateProfile(payload);
  Message.success('保存成功');
  await auth.loadProfile();
}
async function changePassword(){ if(!password.oldPassword || !password.newPassword) return Message.warning('请填写旧密码和新密码'); await authApi.changePassword({ ...password }); Message.success('密码已修改'); password.oldPassword=''; password.newPassword=''; }
</script>
