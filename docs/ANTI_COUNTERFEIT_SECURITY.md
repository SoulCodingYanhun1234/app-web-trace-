# 防伪验证安全基线

## 1. 签名防伪码

防伪码使用 Ed25519 数字签名，不是“私钥加密”。签发服务持有私钥，公开验码服务只需要公钥环；没有私钥不能生成能通过验签的 `AF1.<kid>.<payload>.<signature>` 码。当前格式固定为 128 个字符，兼容 `anti_fake_codes.code VARCHAR(128)`。

生成密钥并把输出放入 API/Worker 的 secret manager：

```bash
npm --workspace apps/api run security:generate-code-keys
```

生产必须配置 `ANTI_FAKE_SIGNING_KEY_ID`、`ANTI_FAKE_SIGNING_PRIVATE_KEY_BASE64`、`ANTI_FAKE_VERIFY_PUBLIC_KEYS`，并设置 `ANTI_FAKE_REQUIRE_SIGNED_CODES=true`、`ANTI_FAKE_ALLOW_LEGACY_CODES=false`。轮换时保留旧 `kid` 的公钥，待对应批次全部过期或注销后再移除。

历史导入码只在显式开启 legacy 开关时接受；任何以 `AF1.` 开头但验签失败的输入都会在查库前拒绝并写入风险事件。

## 2. 官方站点挑战

公开预检接口不返回码是否存在，只返回绑定站点、码摘要、服务端随机数和 60 秒以内过期时间的 HMAC 挑战。挑战同时绑定官方 Origin、码摘要、前端本次验码流程的稳定随机数，以及服务端设置的 HttpOnly、`SameSite=Strict` 浏览器 Cookie。`POST /api/query` 必须从同一官方站点、同一浏览器流程携带全部绑定信息，挑战只能在 Redis 中消费一次。

服务端信任标准 `Origin`、`Referer` 和连接侧 `Host` 的白名单；`X-Verify-*` 头只用于站点标识和审计，不能替代标准来源头。生产配置 `PUBLIC_VERIFY_ALLOWED_HOSTS`、`PUBLIC_VERIFY_SITE_ID`、`PUBLIC_VERIFY_CHALLENGE_SECRET`。

前端域名锁只能阻止普通用户打开克隆页面，不能阻止攻击者修改 JavaScript 或做反向代理；真正的阻断发生在服务端来源校验和一次性挑战。

## 3. 批量扫描风控

- 按 IP、设备、单码分别限流；开发环境可使用进程内兜底，生产环境的挑战消费和批量枚举检测在 Redis 不可用时拒绝请求，避免多实例绕过。
- 按时间窗统计 IP/设备查询的不同码数量，超过阈值直接返回 `429` 并写入 `BULK_CODE_ENUMERATION` 风险事件。
- 失败签名、挑战不匹配、挑战重放和来源域名异常写入 `risk_events`。
- `trustProxy` 默认只信任 loopback、link-local 和私网代理，禁止直连请求伪造 `X-Forwarded-For`。
- 现有防窜规则继续负责同码多地、区域不一致、设备和频次异常预警。

浏览器 GPS、二维码参数和普通自定义请求头都属于不可信证据，会以 `unverified_client` 保留作审计辅助，但不能触发 `geo_mismatch`、同码多地区或轨迹跳跃等强地理预警。消费者验码页直接调用 UAPI `network/myip` 得到完整省、市时，可作为单码授权区域判定的网络位置；`query_logs.location_verified` 明确区分历史聚合所用的位置来源。

服务端强地理证据只允许以下来源：

- `amap_ip`：配置 `AMAP_WEB_SERVICE_KEY` 后，API 使用连接解析出的 `request.ip` 调用高德 Web 服务 `/v3/ip`。只有 `status=1`、`infocode=10000` 且省、市、`rectangle` 均合法时才接受；矩形中心作为扫码坐标，原矩形和 `adcode` 一并进入预警证据。该 Key 只能放在服务端 secret 中，不能复用或写入 `VITE_AMAP_KEY`。
- `trusted_edge_geo`：仅当直接 TCP 对端 `socket.remoteAddress` 命中 `SERVER_GEO_TRUSTED_EDGE_CIDRS`，且 `${SERVER_GEO_TRUSTED_EDGE_HEADER_PREFIX}client-ip` 与 Fastify 解析的 `request.ip` 完全一致时接受。边缘代理必须删除客户端传入的同名前缀头，再覆盖 `province`、`city`、可选 `district/location/latitude/longitude/country/country-code`。不要把公网网段或可由用户直接访问的代理加入可信 CIDR。
- `server_geoip`：旧版兼容来源，仅在未配置 `AMAP_WEB_SERVICE_KEY` 时使用 `SERVER_GEOIP_URL_TEMPLATE`。模板必须包含 `{ip}`，默认只允许 HTTPS，超时上限为 5 秒、响应上限 64 KiB、禁止重定向，并拒绝私网/保留客户端 IP、私网/保留服务商地址及解析到私网的服务商域名。

上述来源都必须解析到完整省、市才会成为强证据，优先级为可信边缘、高德 IP 定位、旧版通用 GeoIP。只有服务端来源不可用时，消费者验码页的 UAPI `network/myip` 完整省市才作为兼容授权依据；浏览器到 UAPI 与业务 API 的出口 IP 是否一致只作为审计信息。未取得完整省市时，系统保持验真可用并产生“位置待核验”。

## 4. 数据库隔离

主码表采用“SHA-256 查找 + AES-256-GCM 密文恢复”：`anti_fake_codes.code_hash` 是唯一查找键，`code_ciphertext/code_iv/code_tag/code_key_id` 保存认证密文元数据，原 `code` 列对新数据只保存 `AV1.<sha256>` 不可逆定位符。GCM 的 AAD 同时绑定密钥 ID 和码哈希，任何密文、IV、Tag、哈希或定位符篡改都会使解密失败。

生产必须配置 `ANTI_FAKE_VAULT_REQUIRED=true`、`ANTI_FAKE_VAULT_ACTIVE_KEY_ID` 和 `ANTI_FAKE_VAULT_KEYS`。密钥环 JSON 的值是 32 字节密钥的 Base64URL；轮换时先加入新密钥并切换 active ID，旧密钥必须保留到所有对应行完成重加密。AES 密钥必须与数据库、备份、Ed25519 签名私钥分开托管。

结构迁移不会把 AES 密钥交给 MySQL，因此旧库升级必须分两步执行：先部署 `202607290002_anti_fake_code_vault`，再先运行 `npm run db:migrate:anti-fake-code-vault` 检查数量，确认备份和密钥托管后运行 `npm run db:migrate:anti-fake-code-vault -- --apply`。回填完成并抽样验证后设置 `ANTI_FAKE_VAULT_ALLOW_PLAINTEXT_READ=false`。未完成回填前只能称为兼容迁移状态，不能声称码库明文已清除。

新写入的 `query_logs.code`、`trace_records.anti_fake_code`、`boxes.codes`、`anti_channeling_alerts.code` 和 `risk_events.code` 使用 `AH1.<sha256>` 稳定引用；授权列表、装箱、扫码、导出路径需要完整码时再从主码表解密，不在这些常见副表复制原码。历史副表数据不会由主表回填脚本自动清除，需按保留期限另行脱敏。

当前残余风险必须明确：V1/V2 的 `market_scans.code`、`packaging_relations.parent_code/child_codes`、`warehouse_in_records.code`、`blockchain_proofs.code/proof_data`、`channel_violations.code/payload` 以及部分历史业务 JSON 仍可能含完整码。完成这些表的哈希引用迁移、历史清理以及加密磁盘/备份配置前，不得宣称“完整码库外泄绝对不可能”。

`code_hash` 使用精确 SHA-256 索引，迁移会把防伪码列改为 `utf8mb4_bin`，避免大小写变异绕过验签。Docker Compose 中 MySQL/Redis 不发布到宿主机，只加入内部 `data` 网络；Web 只能通过 API 访问业务数据。

生产还必须使用加密磁盘/卷和加密备份，并把签名私钥、挑战密钥与数据库凭据分开保存。任何数据库、日志或备份导出都不能包含私钥。

这些措施可以阻止伪造新码、直接库表枚举和普通克隆页面调用；复制一个已经发行的真码仍需依靠物理包装防拆/一次性激活和查询行为风控识别，软件无法仅凭同一个公开码证明包装没有被复制。
