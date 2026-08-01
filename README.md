# Trace Enterprise Web

企业防伪溯源管理端与消费者验真页，基于 **Vue 3 + TypeScript + Vite + Element Plus**。管理端包含产品、防伪码、装箱、发货、退货、溯源、防窜货、扫码工作台和系统配置等模块。

## 本地开发

要求 Node.js 20～24、npm 10 及以上，并先启动 `apps/api` 后端。

```bash
cp .env.example .env
npm install
npm run dev
```

默认访问地址为 `http://localhost:5173`。开发环境推荐保持 `VITE_API_BASE_URL=/api`，由 Vite 将 `/api` 和 `/uploads` 代理到 `VITE_DEV_PROXY_TARGET`。

## 构建

```bash
npm run build
npm run preview
```

生产构建产物位于 `dist/`。需要代码混淆与安全清单时使用：

```bash
npm run build:secure
```

## 主要环境变量

| 变量 | 用途 |
| --- | --- |
| `VITE_API_BASE_URL` | API 基础地址，推荐同域部署时使用 `/api` |
| `VITE_DEV_PROXY_TARGET` | 本地 Vite 代理目标，例如 `http://localhost:3000` |
| `VITE_AI_FEATURE_ENABLED` | AI 页面与请求总开关，未配置时默认关闭 |
| `VITE_USE_LOCAL_DASHBOARD` | 仪表盘演示数据开关，生产镜像应保持 `false` |
| `VITE_UAPI_API_KEY` | UAPI 前端专用 APIKey，用于 commercial `network/myip` 的 Authorization 请求头 |
| `VITE_AMAP_KEY` | 高德地图 Web（JS API）Key |
| `VITE_AMAP_SECURITY_JS_CODE` | 高德地图安全密钥，较新的 Key 通常必须配置 |
| `VITE_ADMIN_DIRECT_LOGIN_HOSTS` | 可直接进入后台登录页的域名列表 |
| `VITE_ADMIN_ENTRY_REQUIRED_HOSTS` | 必须携带登录入口密钥的域名列表 |

完整示例见 `.env.example`。

消费者公网位置仅通过 `https://uapis.cn/api/v1/network/myip?source=commercial` 获取，不再使用 WebRTC、手填位置、URL 位置或其他接口兜底。由于该接口需要识别访问者出口 IP，请求由浏览器直连；`VITE_UAPI_API_KEY` 会进入前端构建产物，应配置限制来源域名的前端专用 Key。

## 防窜货地图

`src/components/ChannelingMap.vue` 使用高德地图 JS API 2.0 展示授权地区、异常扫码热点和跨区流向，并在坐标缺失时按省市进行地理编码。请在生产构建前配置地图 Key；2021-12-02 之后申请的 Key 通常还需要安全密钥：

```env
VITE_AMAP_KEY=你的Web端Key
VITE_AMAP_SECURITY_JS_CODE=你的安全密钥
VITE_AMAP_VERSION=2.0
```

未配置 Key 时页面会显示明确的配置提示，不会阻塞其他防窜货数据。

## 双域名登录入口

- `workpanel.0office.top`：直接显示后台登录页。
- `qr.0office.top`：后台登录页必须通过 `/login?entry=密钥` 打开；消费者页面 `/verify/{code}` 与 `/v/{code}` 保持公开。
- 登录会话连续 7 天无操作后退出，有有效操作时滑动续期。

前端入口限制只负责交互与路由隐藏，生产环境还必须同步配置后端的 `ADMIN_DIRECT_LOGIN_HOSTS`、`ADMIN_ENTRY_REQUIRED_HOSTS` 和登录入口密钥。

## AI 功能开关

WEB 项目根目录已提供 `.env`：

```env
VITE_AI_FEATURE_ENABLED=true
```

- `true`、`1`、`on`、`yes`、`enabled`：显示 AI 溯源研判菜单、AI 工作台、自动巡检/补链面板及相关按钮。
- `false`、`0`、`off`、`no`、`disabled`，或未配置：不注册 AI 路由，不显示任何 AI 菜单、面板、按钮和弹窗，也不会发起 AI 接口请求。

Vite 环境变量在构建时写入。修改 `.env` 后必须重新执行 `npm run build`，再部署新的 `dist`。该值应与后端 `AI_FEATURE_ENABLED` 保持一致。

Docker 构建默认也读取项目根目录 `.env`。如需临时覆盖，可使用 `docker build --build-arg VITE_AI_FEATURE_ENABLED=false ...`。

仓库根目录的 Compose 会将 `VITE_AI_FEATURE_ENABLED` 和
`VITE_USE_LOCAL_DASHBOARD` 作为构建参数传入 Web 镜像，并通过容器内 Nginx
把 `/api` 与 `/uploads` 转发到 API 服务。
