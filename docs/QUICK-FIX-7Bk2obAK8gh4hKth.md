# 快速修复指南 - 防伪码 7Bk2obAK8gh4hKth

## ⚡ 5分钟快速修复

### 步骤 1：检查数据（1分钟）

```bash
cd apps/api
npm run db:studio
```

在浏览器中打开 Prisma Studio，查找防伪码 `7Bk2obAK8gh4hKth`：

检查项：
- [ ] `product_id` 是否为空？
- [ ] `product_name` 是否为空？
- [ ] `manufacturer` 是否为空？
- [ ] `anti_channeling_enabled` 是否为 `false` 或 `0`？

### 步骤 2：修复方案选择

#### 方案 A：product_id 为空（未关联产品）

1. 在后台管理系统登录：https://qr.0office.top/admin
2. 进入「防伪码管理」
3. 搜索：`7Bk2obAK8gh4hKth`
4. 点击「编辑」→ 选择关联产品 → 保存
5. 执行步骤 3 同步数据

#### 方案 B：product_id 有值，但快照字段为空

直接执行步骤 3 同步数据

### 步骤 3：同步产品信息（1分钟）

```bash
cd apps/api
node scripts/fix-code-product-sync.mjs --code 7Bk2obAK8gh4hKth
```

### 步骤 4：验证修复（1分钟）

访问：https://qr.0office.top/verify/7Bk2obAK8gh4hKth

✅ 检查点：
- 是否显示正确的产品名称？
- 是否显示正确的制造商名称？
- 是否显示"正品认证"（不是"防窜货预警"）？

---

## 🔧 如果修复失败

### 问题 1：没有 .env 文件

```bash
cd apps/api
cp .env.example .env
# 编辑 .env 填入数据库连接信息
```

### 问题 2：修复后仍显示默认值

1. 清除浏览器缓存（Ctrl+F5）
2. 检查 API 返回数据：
   ```bash
   curl -X POST https://qr.0office.top/api/query \
     -H "Content-Type: application/json" \
     -d '{"code":"7Bk2obAK8gh4hKth"}' | jq .
   ```
3. 查看浏览器开发者工具 Console 是否有错误

### 问题 3：产品确实不存在

需要先创建产品：
1. 进入「产品管理」
2. 点击「新增产品」
3. 填写产品信息（必填：产品名称、制造商）
4. 保存后，返回步骤 2 关联产品

---

## 📊 批量修复（可选）

如果有多个防伪码有类似问题：

```bash
# 同步所有防伪码
cd apps/api
node scripts/fix-code-product-sync.mjs --all
```

这会需要 10-30 分钟，取决于防伪码数量。

---

## 🎯 核心原因

**问题**：关闭防窜预警后，验证页面不显示产品信息

**原因**：
1. 防伪码未关联产品（`product_id` 为空）
2. 或快照字段（`product_name`, `manufacturer` 等）未同步

**解决**：
1. 关联产品
2. 同步快照字段

**原理**：
- 后端返回 `product` 对象（来自 products 表）
- 如果产品不存在，降级使用 `code_owner` 对象（防伪码快照字段）
- 如果快照也为空，前端显示默认值

---

## 📞 需要帮助？

联系技术支持，提供：
1. 防伪码：`7Bk2obAK8gh4hKth`
2. Prisma Studio 中该记录的截图
3. 浏览器控制台的错误信息（F12）

---

**快速修复指南** | 版本 1.0 | 2026-07-29
