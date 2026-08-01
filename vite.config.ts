import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.35,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.08,
  // 不启用调试保护：debugProtection 会在打开浏览器控制台时插入 debugger 循环，
  // 导致登录页/查询页空白并反复断点，影响现场排查接口问题。
  debugProtection: false,
  debugProtectionInterval: 0,
  // 保留 console，方便生产现场排查登录、查询、防伪码等接口问题。
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.78,
  target: 'browser',
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

async function viteObfuscatorPlugin(enabled: boolean) {
  if (!enabled) return null;
  try {
    const mod: any = await import('vite-plugin-obfuscator');
    const factory = mod.default || mod.viteObfuscator || mod.obfuscator;
    if (typeof factory === 'function') return factory(obfuscatorOptions);
    console.warn('[secure-build] vite-plugin-obfuscator 未导出可调用插件，已交由 scripts/secure-build.mjs 做 dist 二次混淆。');
  } catch (error: any) {
    console.warn(`[secure-build] vite-plugin-obfuscator 不可用：${error?.message || error}。已交由 scripts/secure-build.mjs 做 dist 二次混淆。`);
  }
  return null;
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const secureBuild = env.VITE_SECURE_BUILD === 'true' || mode === 'secure' || process.env.VITE_SECURE_BUILD === 'true';
  const obfuscator = await viteObfuscatorPlugin(secureBuild);
  return {
    plugins: [vue(), ...(obfuscator ? [obfuscator] : [])],
    server: {
      port: 5173,
      proxy: env.VITE_DEV_PROXY_TARGET
        ? {
            '/api': {
              target: env.VITE_DEV_PROXY_TARGET,
              changeOrigin: true,
            },
            '/uploads': {
              target: env.VITE_DEV_PROXY_TARGET,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'axios', 'dayjs', 'element-plus'],
      exclude: ['echarts'],
    },
    build: {
      target: 'es2018',
      sourcemap: false,
      minify: 'esbuild',
      cssCodeSplit: true,
      assetsInlineLimit: secureBuild ? 0 : 4096,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          entryFileNames: secureBuild ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          chunkFileNames: secureBuild ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          assetFileNames: secureBuild ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]',
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('echarts')) return 'vendor-echarts';
            if (id.includes('element-plus')) return 'vendor-element-plus';
            if (id.includes('vue') || id.includes('pinia')) return 'vendor-vue';
            return 'vendor';
          },
        },
      },
    },
  };
});
