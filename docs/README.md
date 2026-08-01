# API 文档

- [模块关系](./MODULE_RELATIONS.md)
- [扫码业务指南](./SCANNER_GUIDE.md)
- [迁移恢复说明](./MIGRATION_RECOVERY_202605140001.md)
- [数据库迁移基线与升级](./DATABASE_MIGRATION_BASELINE.md)
- [历史修改说明](./MODIFICATION-NOTES.md)
- [防伪验证安全基线](./ANTI_COUNTERFEIT_SECURITY.md)

`box_shipment_columns_fix.sql` 是历史数据库修复脚本。优先使用
`package.json` 中的 `db:repair:*` 命令执行当前修复流程。
