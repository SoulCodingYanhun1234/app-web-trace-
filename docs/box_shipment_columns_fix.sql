-- 装箱 / 发货列表 500 缺列与旧字段类型兼容修复 SQL
-- 如果某个 ADD COLUMN 字段已存在，请跳过对应 ALTER 语句。

ALTER TABLE `boxes` ADD COLUMN `packing_address` VARCHAR(255) NULL;
ALTER TABLE `boxes` ADD COLUMN `authorization_address` VARCHAR(255) NULL;
ALTER TABLE `boxes` ADD COLUMN `authorization_level` VARCHAR(32) NULL;
ALTER TABLE `boxes` ADD COLUMN `authorization_source` VARCHAR(64) NULL;

ALTER TABLE `shipments` ADD COLUMN `authorization_address` VARCHAR(255) NULL;
ALTER TABLE `shipments` ADD COLUMN `authorization_level` VARCHAR(32) NULL;
ALTER TABLE `shipments` ADD COLUMN `authorization_source` VARCHAR(64) NULL;

-- 如果旧库曾把下列字段建成 INT / NOT NULL / 长度过短，可执行下面语句兼容 Prisma String? 字段。
ALTER TABLE `boxes` MODIFY COLUMN `packing_address` VARCHAR(255) NULL;
ALTER TABLE `boxes` MODIFY COLUMN `authorization_address` VARCHAR(255) NULL;
ALTER TABLE `boxes` MODIFY COLUMN `authorization_level` VARCHAR(32) NULL;
ALTER TABLE `boxes` MODIFY COLUMN `authorization_source` VARCHAR(64) NULL;
ALTER TABLE `shipments` MODIFY COLUMN `authorization_address` VARCHAR(255) NULL;
ALTER TABLE `shipments` MODIFY COLUMN `authorization_level` VARCHAR(32) NULL;
ALTER TABLE `shipments` MODIFY COLUMN `authorization_source` VARCHAR(64) NULL;
