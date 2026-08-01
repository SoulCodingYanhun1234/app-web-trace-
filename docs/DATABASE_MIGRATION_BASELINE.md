# 数据库迁移基线与升级

## 背景

早期环境使用 `prisma db push` 创建完整 schema，但仓库中的第一条迁移
`202605140001_product_trace_box_link` 已经是增量 `ALTER TABLE`，并不负责创建
`products` 等基础表。因此直接对空库或没有 `_prisma_migrations` 的旧库执行
`prisma migrate deploy` 都不安全：空库会报表不存在，旧库会报重复字段。

生产入口统一使用：

```bash
npm run db:migrate:deploy
```

Docker Compose 的 `db-init` 已调用同一个入口。不要在生产环境改回 `db push`，
也不要直接把未知迁移标记为 `--applied`。

## 自动判定

`scripts/migrate-safe.mjs` 在写入前读取 `INFORMATION_SCHEMA`，按以下规则处理：

1. 空数据库：执行冻结的 `prisma/bootstrap/202607280001_schema.sql`，记录截至
   `202607280001_code_anti_channeling_toggle` 的历史基线，再执行所有后续迁移。
2. 已有 `_prisma_migrations` 且基线完整：只执行标准 `prisma migrate deploy`。
3. 非空但没有完整迁移历史：用只读 `prisma migrate diff` 与冻结基线比较；只有
   完全一致时才补基线记录。签名安全、加密码库及未来迁移仍会真实执行。
4. schema 有任何差异、存在未解决的新迁移失败，或空 schema 与较新的迁移记录
   相矛盾：立即退出，不自动修改业务表或伪造迁移历史。

冻结基线不包含以下迁移，它们不能被跳过：

- `202607290001_signed_code_security`
- `202607290002_anti_fake_code_vault`
- 此后新增的全部迁移

## 新库部署

```bash
docker compose up -d --build
docker compose logs db-init
```

`db-init` 成功后 API 和 Worker 才会启动。基线 DDL 全部完成后发生的中断可以直接
重试；如果中断时 MySQL 只提交了部分 DDL，脚本会把它识别为 schema 差异并停止。
此时应从初始化前备份恢复空库，不能继续猜测或强行标记迁移。

## 旧库升级

升级前先停止写入并同时备份 MySQL 数据和 `_prisma_migrations`：

```bash
docker compose stop api worker
docker compose run --rm db-init
```

若日志显示 `unmanaged-schema-drift` 或 `unresolved-migration`，不要执行
`prisma db push --accept-data-loss`，也不要批量运行 `migrate resolve`。先进行只读
对比并保存输出：

```bash
cd apps/api
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/bootstrap/202607280001_schema.prisma \
  --script
npx prisma migrate status --schema prisma/schema.prisma
```

根据差异编写一次性、可审阅的修复 SQL，并在数据库副本验证后再处理生产库。
仓库已有的单项修复命令只用于其文档明确描述的故障，不能当作通用 baseline。

## 后续迁移约束

- 不修改冻结的 bootstrap schema、SQL 或 `LEGACY_BASELINE_THROUGH`。
- 每次 schema 变更都新增时间戳晚于基线的迁移，并将 schema 与迁移一起提交。
- 数据回填必须放在正常迁移或单独的幂等脚本中；不能假设 `db push` 会执行回填。
- 发布前在空 MySQL 和生产脱敏副本各验证一次 `db:migrate:deploy`。
- 迁移失败时保留现场与备份，先确定 DDL 是否部分提交，再使用
  `prisma migrate resolve`。

该流程解决迁移历史兼容问题，不替代数据库备份、回滚演练或变更审批。
