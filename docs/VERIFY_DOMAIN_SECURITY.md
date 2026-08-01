# 公开验码页域名安全契约

## 前端已实现

- `/verify/:code` 与 `/v/:code` 仅在 `VITE_VERIFY_ALLOWED_HOSTS` 许可的域名加载。
- 生产域名锁默认开启；未配置许可列表时仅信任 `qr.0office.top`。
- 生产验码入口默认强制 HTTPS；本地 HTTP 调试仅在 Vite 开发模式自动兼容。
- `npm run dev` 可访问 localhost、回环及私网地址；生产构建不自动放行这些地址。
- 路由守卫与公开 API 客户端分别校验域名。非许可域名显示独立阻断页，客户端也不会发起设置、预检或验码请求。
- 每个公开 API 请求携带 `X-Verify-Site-Id`、`X-Verify-Page-Origin` 和随机的 `X-Verify-Request-Nonce`。

`VITE_*` 内容和浏览器自定义请求头均可被查看、修改或伪造。它们不是密钥，不能单独证明请求来自官方页面。混淆 JavaScript、禁用右键或隐藏接口也不能建立安全边界。

## 后端已实施

后端公开验码接口已经执行以下契约：

1. 对浏览器公开验码接口校验连接侧 `Host`、可信反向代理提供的转发 Host、标准 `Origin`，以及 GET 请求的 `Referer`。使用精确 Origin 白名单，不允许 `*`，不以 `X-Verify-Page-Origin` 代替标准头。
2. 将 `X-Verify-Site-Id` 映射到服务端站点策略，并要求 `X-Verify-Page-Origin` 与标准来源完全一致。`X-Verify-Request-Nonce` 仅用于审计，不当作密钥。
3. `GET /query/preflight/:code` 不查询也不返回码是否存在，只签发短时 HMAC 挑战。
4. 挑战绑定站点 ID、规范化 Origin、码摘要、服务端随机数、签发时间和不超过 120 秒的过期时间；默认有效期 60 秒，在 Redis 中一次消费，Redis 异常时使用进程内重放缓存兜底。
5. `POST /query` 必须在请求体提交匹配的 `challenge`。校验失败返回 `403`，重复使用返回 `409`，且不会返回码是否存在。
6. `/query/preflight/:code` 和 `/query/qrcode/:code` 使用同一站点策略；管理端二维码导出继续使用需要登录和权限的 `/codes/qrcode/*` 接口。
7. 按 IP、设备、单码及时间窗内不同码数量组合限流并记录风险事件。CORS 和 `Sec-Fetch-Site` 只能阻止普通浏览器跨域调用，不能阻止服务器反向代理。

推荐同源部署 Web 与 `/api`。当前公开客户端使用 `credentials: same-origin`，预检挑战只保存在当前请求流程的内存中；跨域部署必须配置精确 CORS 与相同的官方 Origin 白名单，且不能把长期密钥写入前端。

## 验证

```bash
npm run test:verify-domain
npm run typecheck
```
