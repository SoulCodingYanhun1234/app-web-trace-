# 迁移恢复：202605140001_product_trace_box_link

## 适用错误

执行 Prisma 迁移时出现：

```text
Error: P3018
Migration name: 202605140001_product_trace_box_link
Database error code: 1060
Duplicate column name 'production_date'
```

说明当前数据库的 `products.production_date` 已经存在，但 Prisma 的 `_prisma_migrations` 里没有把 `202605140001_product_trace_box_link` 记录成成功，导致迁移被阻塞。

## 推荐修复命令

在 `apps/api` 目录执行：

```bash
npm run db:repair:product-trace-migration
npm run db:migrate:deploy
```

修复脚本会做四件事：

1. 检查 `products` 表是否存在。
2. 只在缺失时补齐：
   - `production_date`
   - `production_place`
   - `manufacturer`
   - `products_manufacturer_idx`
3. 用 `prisma migrate resolve --applied 202605140001_product_trace_box_link` 解除失败迁移阻塞。
4. 不删除任何业务数据。

## 手动修复备选方案

如果不能运行 Node 脚本，可以先确认字段和索引：

```sql
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'products'
  AND COLUMN_NAME IN ('production_date', 'production_place', 'manufacturer');

SELECT INDEX_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'products'
  AND INDEX_NAME = 'products_manufacturer_idx';
```

缺什么补什么：

```sql
ALTER TABLE `products` ADD COLUMN `production_place` VARCHAR(128) NULL;
ALTER TABLE `products` ADD COLUMN `manufacturer` VARCHAR(128) NULL;
CREATE INDEX `products_manufacturer_idx` ON `products` (`manufacturer`);
```

确认数据库已经具备这些字段和索引后：

```bash
npx prisma migrate resolve --applied 202605140001_product_trace_box_link --schema prisma/schema.prisma
npm run db:migrate:deploy
```
