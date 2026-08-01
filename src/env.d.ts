/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_FEATURE_ENABLED?: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_UAPI_API_KEY?: string;
  readonly VITE_UAPI_BASE_URL?: string;
  readonly VITE_ALLOW_DEVTOOLS?: string;
  readonly VITE_AMAP_KEY?: string;
  readonly VITE_AMAP_SECURITY_JS_CODE?: string;
  readonly VITE_AMAP_VERSION?: string;
  readonly VITE_ADMIN_DIRECT_LOGIN_HOSTS?: string;
  readonly VITE_ADMIN_ENTRY_REQUIRED_HOSTS?: string;
  readonly VITE_VERIFY_ALLOWED_HOSTS?: string;
  readonly VITE_VERIFY_SITE_ID?: string;
  readonly VITE_VERIFY_DOMAIN_LOCK_ENABLED?: string;
  readonly VITE_VERIFY_ALLOW_PRIVATE_DEV_HOSTS?: string;
  readonly VITE_VERIFY_REQUIRE_HTTPS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
