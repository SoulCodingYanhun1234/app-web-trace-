# 模块关联说明

## 总链路

产品管理 -> 产品地区管理 -> 防伪码管理 -> 扫码业务台 -> 溯源管理 -> 装箱管理 -> 发货管理 -> 查询/报表/日志

扫码枪不是单独功能，它是业务入口：

- 扫到产品/防伪码：识别产品、批次、地区。
- 分类装箱：把单品码放入正确箱子，并写入溯源节点。
- 扫码溯源：查看产品、地区、箱子、发货单和流转链路。
- 扫码发货：把箱子加入发货单，确认出库后推进箱状态并写入溯源节点。

## 模块关联表

| 模块 | 自己负责 | 上游模块 | 下游模块 | 核心关联字段 |
| --- | --- | --- | --- | --- |
| 产品管理 products | 产品编号、名称、品牌、分类、规格 | 无 | 产品地区、防伪码、溯源、装箱 | product.id, product_code |
| 产品地区 product-regions | 产品与省市、仓库、代理商、码规则的映射 | 产品、代理商 | 扫码、溯源、装箱、发货 | product_id, product_code, province_code, city_code |
| 防伪码 codes | 单品码、批次、状态、查询次数 | 产品 | 扫码、溯源、装箱、查询 | code, product_id, batch_no |
| 溯源 trace | 溯源号、防伪码、批次、链路节点 | 产品、防伪码、地区、装箱、发货 | 查询、扫码 | anti_fake_code, trace_no, trace_chain |
| 装箱 box | 箱号、箱内码、箱规、状态 | 产品、防伪码、地区 | 发货、溯源 | box.id, box_no, codes |
| 发货 shipments | 发货单、箱 ID、物流、收发货信息 | 箱、代理商、地区 | 溯源、退货 | shipment.id, shipment_no, box_ids |
| 代理商 agents | 渠道商、省市、联系人、等级 | 无 | 产品地区、发货、退货 | agent_id, province, city |
| 退货 returns | 退货单、退货码、退货原因、状态 | 发货、代理商、防伪码 | 溯源、查询 | return_no, shipment_id, return_codes |
| 防伪查询 query | 消费者/后台查码、查询日志、风险记录 | 防伪码、溯源、地区、发货 | 仪表盘、风控 | code, query_logs |
| 扫码业务台 scanner | 统一识别、业务动作、批量扫码 | 产品、地区、防伪码、溯源、箱、发货 | 地区、溯源、箱、发货 | /scanner/resolve, /scanner/execute, /scanner/flow |
| 系统管理 system | 权限、角色、模块开关、参数、审计 | 无 | 全模块 | permission_code, module_key, audit_logs |
| 监控 metrics | QPS、响应时间、错误率、CPU、内存、DB、队列 | 全接口 | 运维平台 | /metrics |

## 扫描枪地区分类规则

推荐码格式：

```text
FW-GD-SZ-A001-B202605-000001
```

含义：

- `FW`：防伪/溯源码前缀。
- `GD`：省份代码，广东省。
- `SZ`：城市代码，深圳市。
- `A001`：产品编号，对应 `products.product_code`。
- `B202605`：批次号，对应 `anti_fake_codes.batch_no` 和 `trace_records.batch_no`。
- `000001`：单品序列。

落库逻辑：

1. 扫码枪读取码值。
2. 后端 `ScannerService` 解析省市和产品编号。
3. 系统查找或更新 `product_regions`。
4. 分类装箱时校验产品和批次，禁止混装。
5. 装箱成功后追加“装箱”溯源节点。
6. 箱子加入发货单后追加“加入发货单”溯源节点。
7. 发货确认后箱状态变为已发货，并追加“发货出库”溯源节点。

## 权限关系

- `scanner:use`：进入扫码业务台和扫描枪教程。
- `scanner:execute`：执行分类装箱、扫码发货等写操作。
- `product-region:view`：查看产品地区映射。
- `product-region:manage`：维护产品地区映射。
- `trace:view/manage`：查看和维护溯源链路。
- `box:view/manage`：查看和维护箱子。
- `shipment:view/manage`：查看和维护发货单。
