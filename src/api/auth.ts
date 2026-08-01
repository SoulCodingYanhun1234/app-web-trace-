import { request, type FastRequestConfig } from './http';
import { getLoginEntrySecret } from '@/utils/security';

export interface AdminUser {
  id: number;
  username: string;
  real_name: string;
  role: number;
  status?: number;
  email?: string;
  phone?: string;
  avatar?: string;
  permissions?: string[];
  role_ids?: number[];
  role_codes?: string[];
  modules?: Array<{ module_key: string; module_name: string; route?: string; icon?: string; sort?: number }>;
}

export interface LoginOptions {
  password: {
    enabled: boolean;
    account_types: { username: boolean; email: boolean; phone: boolean };
  };
  verification_code: {
    email: boolean;
    phone: boolean;
    ttl_seconds: number;
    resend_seconds: number;
  };
  wechat: {
    enabled: boolean;
    qrcode: true;
    configured: boolean;
  };
}

export type AuthLoginRequest =
  | { channel: 'password'; account: string; password: string }
  | { channel: 'email_code'; email: string; code: string }
  | { channel: 'phone_code'; phone: string; code: string }
  | { channel: 'wechat_qr'; wechatCode: string; state: string };

export interface WechatQrCode {
  state: string;
  authorize_url: string;
  qr_svg: string;
  expires_at: string;
}

export const authApi = {
  login(data: AuthLoginRequest | { username: string; password: string }) {
    const loginEntry = getLoginEntrySecret();
    return request.post<{ token: string; refreshToken: string; admin: AdminUser }>('/auth/login', data, {
      headers: loginEntry ? { 'X-Login-Entry': loginEntry } : undefined,
    });
  },
  loginOptions() {
    return request.get<LoginOptions>('/auth/login-options', undefined, {
      cacheTtl: 30_000,
      silent: true,
      skipAuthRefresh: true,
      skipAuthRedirect: true,
    });
  },
  sendLoginCode(data: { channel: 'email' | 'phone'; target: string }) {
    const loginEntry = getLoginEntrySecret();
    return request.post<{ sent: boolean; ttl_seconds: number; resend_seconds: number; debug_code?: string }>('/auth/login-code', data, {
      headers: loginEntry ? { 'X-Login-Entry': loginEntry } : undefined,
      skipAuthRefresh: true,
      skipAuthRedirect: true,
    });
  },
  wechatQrCode(redirectUri: string) {
    return request.post<WechatQrCode>('/auth/wechat/qrcode', { redirectUri }, {
      skipAuthRefresh: true,
      skipAuthRedirect: true,
    });
  },
  logout(refreshToken?: string) {
    return request.post('/auth/logout', refreshToken ? { refreshToken } : undefined, { silent: true });
  },
  refresh(refreshToken: string) {
    return request.post<{ token: string; refreshToken: string }>('/auth/refresh', { refreshToken }, {
      silent: true,
      skipAuthRefresh: true,
      skipAuthRedirect: true,
    });
  },
  profile(config: FastRequestConfig = {}) {
    return request.get<AdminUser>('/auth/profile', undefined, config);
  },
  updateProfile(data: Partial<AdminUser>) {
    return request.put('/auth/profile', data);
  },
  changePassword(data: { oldPassword: string; newPassword: string }) {
    return request.put('/auth/password', data);
  },
};
