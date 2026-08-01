// 兼容被部署脚本/旧构建产物放到 src/src 下的 main-simple.ts。
// 当 main-simple.ts 使用 import './app.module.js' 时，实际业务模块仍回指上级 src/app.module.ts。
export { AppModule } from '../app.module.js';
