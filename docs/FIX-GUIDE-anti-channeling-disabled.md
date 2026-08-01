# 防伪码关闭防窜预警显示问题 - 完整解决方案

## 📋 问题总结

**防伪码**: `7Bk2obAK8gh4hKth`  
**URL**: https://qr.0office.top/verify/7Bk2obAK8gh4hKth  
**问题**: 关闭防窜预警后，验证页面显示的不是防伪码产品信息

---

## 🔍 根本原因

经过深入代码分析，确定了问题的**三个可能原因**（按可能性排序）：

### 原因 1：防伪码未关联产品或产品信息缺失 ⭐⭐⭐⭐⭐

**代码位置**: `apps/api/src/query/query.service.ts:629-632`

```typescript
let product: any = scannedProduct || null;
const productId = code?.product_id ?? box?.product_id ?? scannedProduct?.id;
if (productId) product = await this.safeProductFromCacheOrDb(Number(productId));
```

**问题说明**:
- 如果防伪码的 `product_id` 字段为 `NULL`，无法查询到产品
- 如果关联的产品已被删除，`product` 会是 `null`
- 后端返回的 `product` 字段为空，前端无法显示产品信息

### 原因 2：防伪码快照字段未同步 ⭐⭐⭐⭐

**代码位置**: `apps/api/src/query/query.service.ts:817-828`

```typescript
code_owner: updatedCode ? {
  company_name: updatedCode.company_name || updatedCode.manufacturer || null,
  manufacturer: updatedCode.manufacturer || null,
  province_name: updatedCode.province_name || null,
  // ...
} : null,
```

**问题说明**:
- 防伪码表有快照字段（`product_name`, `manufacturer`, `company_name` 等）
- 这些字段用于在产品信息缺失时提供降级显示
- 如果快照字段也为空，前端会显示默认值（"产品"、"官方企业"）

**前端降级逻辑**: `apps/web/src/pages/public/VerifyCodePage.vue:329-339`

```typescript
const verifyCompanyName = computed(() => String(
  product.value.manufacturer          // 优先：产品信息
  || product.value.company_name
  || result.value?.code_owner?.manufacturer  // 降级：防伪码快照
  || result.value?.code_owner?.company_name
  || settings.value.company_name      // 兜底：系统配置
  || '官方企业',                       // 默认值
).trim());
```

### 原因 3：前端对关闭防窜预警的处理逻辑问题 ⭐⭐

**代码位置**: `apps/web/src/pages/public/VerifyCodePage.vue:314-315`

```typescript
const antiChannelingAlertCount = computed(() => Number(antiChannelingInfo.value.alert_count || antiChannelingAlerts.value.length || (result.value?.is_channeling_risk ? 1 : 0)));
const hasAntiChannelingAlert = computed(() => result.value?.is_channeling_risk === true || antiChannelingAlertCount.value > 0);
```

**问题说明**:
- 前端根据 `hasAntiChannelingAlert` 决定显示样式
- 当 `anti_channeling_enabled = false` 时，后端返回 `is_channeling_risk = false`
- 这部分逻辑应该正确工作，但可能与产品信息显示有交互问题

---

## 🛠️ 立即修复步骤

### 步骤 1：手动检查防伪码数据

使用 Prisma Studio 检查数据：

```bash
cd apps/api
npm run db:studio
```

在 Prisma Studio 中：
1. 打开 `anti_fake_codes` 表
2. 搜索防伪码 `7Bk2obAK8gh4hKth`
3. 检查以下字段：
   - `product_id`：是否为空？
   - `product_name`：是否为空？
   - `manufacturer` / `company_name`：是否为空？
   - `anti_channeling_enabled`：确认是否为 `false` / `0`

### 步骤 2：关联产品（如果 product_id 为空）

**方法 A：通过后台管理界面**

1. 登录后台：https://qr.0office.top/admin
2. 进入「防伪码管理」
3. 搜索防伪码：`7Bk2obAK8gh4hKth`
4. 点击「编辑」按钮
5. 在「关联产品」下拉框选择正确的产品
6. 点击「保存」

**方法 B：通过 Prisma Studio**

1. 在 `anti_fake_codes` 表中找到该记录
2. 编辑 `product_id` 字段，填入正确的产品 ID
3. 保存

### 步骤 3：同步产品信息到防伪码快照字段

运行修复脚本：

```bash
cd apps/api
node scripts/fix-code-product-sync.mjs --code 7Bk2obAK8gh4hKth
```

**预期输出**：
```
🔄 同步防伪码产品信息: 7Bk2obAK8gh4hKth

✅ 已同步产品信息到防伪码: 7Bk2obAK8gh4hKth
   产品: [产品名称]
   制造商: [制造商名称]
```

### 步骤 4：验证修复结果

**方法 A：直接访问验证页面**

打开浏览器访问：
```
https://qr.0office.top/verify/7Bk2obAK8gh4hKth
```

检查：
- ✅ 是否显示正确的产品名称？
- ✅ 是否显示正确的制造商名称？
- ✅ 是否显示"正品认证"而不是"防窜货预警"？

**方法 B：检查 API 返回数据**

使用 curl 测试 API：

```bash
curl -X POST https://qr.0office.top/api/query \
  -H "Content-Type: application/json" \
  -d '{"code":"7Bk2obAK8gh4hKth"}' | jq .
```

检查返回的 JSON：
```json
{
  "code": 200,
  "data": {
    "is_real": true,
    "anti_channeling_enabled": false,  // ← 应该是 false
    "is_channeling_risk": false,       // ← 应该是 false
    "product": {                        // ← 产品信息应该完整
      "product_name": "...",
      "manufacturer": "...",
      // ...
    },
    "code_owner": {                     // ← 快照字段应该有值
      "company_name": "...",
      "manufacturer": "...",
      // ...
    }
  }
}
```

---

## 🔧 批量修复（如果有多个防伪码有类似问题）

### 方案 A：修复所有防伪码

同步所有防伪码的产品信息到快照字段：

```bash
cd apps/api
node scripts/fix-code-product-sync.mjs --all
```

这会：
- 扫描所有关联了产品的防伪码
- 将产品信息同步到防伪码快照字段
- 显示处理进度和统计结果

**预期输出**：
```
📊 共有 12345 个关联了产品的防伪码

📈 进度: 100/12345 (0.8%)
📈 进度: 200/12345 (1.6%)
...

✅ 批量同步完成
   总计: 12345
   已更新: 5678
   已是最新: 6667
   失败: 0
```

### 方案 B：修复指定产品的所有防伪码

如果只想修复某个产品的防伪码：

```bash
cd apps/api
node scripts/fix-code-product-sync.mjs --product-id 123
```

### 方案 C：查找并修复未关联产品的防伪码

**步骤 1：查找未关联产品的防伪码**

在 Prisma Studio 中：
1. 打开 `anti_fake_codes` 表
2. 添加过滤器：`product_id` `is` `null`
3. 查看有多少条记录

或者使用 SQL 查询：

```sql
SELECT COUNT(*) FROM anti_fake_codes WHERE product_id IS NULL;
```

**步骤 2：批量关联产品**

如果数量较少，可以在后台管理界面逐个编辑。

如果数量较多，可以通过批量更新功能：
1. 在后台「防伪码管理」页面
2. 筛选条件：关联产品 = "未关联"
3. 勾选需要修改的防伪码
4. 点击「批量修改」
5. 选择关联产品
6. 保存

---

## 🎨 前端优化（长期改进）

为了更好地处理产品信息缺失的情况，建议优化前端显示逻辑：

### 修改文件：`apps/web/src/pages/public/VerifyCodePage.vue`

**优化 1：增强产品信息降级逻辑**

在第 293 行附近：

```typescript
// 当前代码
const product = computed(() => normalizeObject(result.value?.product || result.value?.product_info || result.value?.goods));

// 优化后的代码
const product = computed(() => {
  // 优先使用完整的产品信息
  let productInfo = normalizeObject(
    result.value?.product || 
    result.value?.product_info || 
    result.value?.goods
  );
  
  // 如果产品信息缺失关键字段，尝试从防伪码快照字段补充
  if ((!productInfo.product_name || !productInfo.manufacturer) && result.value?.code_owner) {
    const codeOwner = result.value.code_owner;
    productInfo = {
      product_name: productInfo.product_name || codeOwner.product_name || '产品',
      product_code: productInfo.product_code || codeOwner.product_code || '',
      manufacturer: productInfo.manufacturer || codeOwner.manufacturer || codeOwner.company_name || '',
      company_name: productInfo.company_name || codeOwner.company_name || codeOwner.manufacturer || '',
      category: productInfo.category || codeOwner.category || '',
      brand: productInfo.brand || codeOwner.brand || '',
      ...productInfo,
    };
  }
  
  // 如果还是没有产品名称，尝试从箱码信息获取
  if (!productInfo.product_name && result.value?.box?.product_name) {
    productInfo.product_name = result.value.box.product_name;
  }
  
  return productInfo;
});
```

**优化 2：增强产品名称显示**

在第 343 行附近：

```typescript
// 当前代码
const verifyProductName = computed(() => String(product.value.product_name || result.value?.product_name || result.value?.product_info?.product_name || '产品').trim());

// 优化后的代码
const verifyProductName = computed(() => String(
  product.value.product_name 
  || result.value?.product_name 
  || result.value?.product_info?.product_name
  || result.value?.code_owner?.product_name  // 从快照读取
  || result.value?.box?.product_name         // 从箱码读取
  || result.value?.trace?.product_name       // 从溯源链读取
  || '产品'
).trim());
```

**优化 3：显示数据来源提示（可选）**

如果产品信息来自降级数据源，可以显示提示：

```vue
<template>
  <article class="cert-product-card">
    <small>产品名称</small>
    <strong>{{ verifyProductName }}</strong>
    <em>{{ verifyCompanyName }}</em>
    
    <!-- 新增：数据来源提示 -->
    <p v-if="!result?.product && result?.code_owner?.product_name" class="data-source-hint">
      <el-icon><InfoFilled /></el-icon>
      产品信息来自防伪码建档时的快照数据
    </p>
  </article>
</template>

<style scoped>
.data-source-hint {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 159, 10, 0.1);
  color: #b45309;
  font-size: 13px;
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
```

---

## 🔒 预防措施（避免再次发生）

### 1. 后端：强制防伪码关联产品

修改文件：`apps/api/src/resources/codes.service.ts`

在防伪码生成函数中添加校验：

```typescript
async generate(dto: GenerateCodesDto) {
  // 新增：必须关联产品
  if (!dto.product_id) {
    throw new BadRequestException('生成防伪码必须关联产品');
  }
  
  // 新增：验证产品是否存在
  const product = await this.prisma.product.findUnique({
    where: { id: dto.product_id },
  });
  
  if (!product) {
    throw new BadRequestException(`关联的产品 (ID: ${dto.product_id}) 不存在`);
  }
  
  if (!product.product_name) {
    throw new BadRequestException('关联的产品缺少必填字段：产品名称');
  }
  
  // 现有生成逻辑...
  
  // 新增：自动同步产品快照字段
  const codeData = {
    ...generatedCode,
    product_id: dto.product_id,
    product_code: product.product_code,
    product_name: product.product_name,
    category: product.category,
    brand: product.brand,
    manufacturer: product.manufacturer,
    company_name: product.manufacturer || product.company_name,
    // ... 其他快照字段
  };
  
  return await this.prisma.antiFakeCode.create({ data: codeData });
}
```

### 2. 数据库：添加约束（可选）

如果希望从数据库层面强制约束：

```sql
-- 将 product_id 设为 NOT NULL（需要先清理现有的 NULL 数据）
-- 警告：执行前请备份数据库！

-- 步骤1：检查有多少条记录 product_id 为 NULL
SELECT COUNT(*) FROM anti_fake_codes WHERE product_id IS NULL;

-- 步骤2：如果数量不多，手动关联或删除这些记录

-- 步骤3：添加约束
ALTER TABLE anti_fake_codes 
  MODIFY COLUMN product_id INT NOT NULL,
  ADD CONSTRAINT fk_code_product 
    FOREIGN KEY (product_id) 
    REFERENCES products(id) 
    ON DELETE RESTRICT;
```

### 3. 定时任务：自动同步快照字段

在定时任务中添加自动同步逻辑：

```typescript
// apps/api/src/worker/scheduled-tasks.service.ts

@Injectable()
export class ScheduledTasksService {
  @Cron('0 3 * * *') // 每天凌晨3点执行
  async syncCodeSnapshots() {
    this.logger.log('开始同步防伪码快照字段');
    
    try {
      // 查找快照字段与产品信息不一致的防伪码
      const codes = await this.prisma.$queryRaw`
        SELECT c.id, c.product_name as code_product_name, p.product_name as product_product_name
        FROM anti_fake_codes c
        INNER JOIN products p ON c.product_id = p.id
        WHERE c.product_name != p.product_name
           OR c.manufacturer != p.manufacturer
        LIMIT 1000
      `;
      
      if (codes.length === 0) {
        this.logger.log('所有防伪码快照字段已是最新');
        return;
      }
      
      this.logger.log(`发现 ${codes.length} 个防伪码需要同步`);
      
      // 批量同步
      for (const code of codes) {
        await this.syncSingleCode(code.id);
      }
      
      this.logger.log(`同步完成：${codes.length} 个防伪码`);
      
    } catch (error) {
      this.logger.error('同步失败', error);
    }
  }
  
  private async syncSingleCode(codeId: number) {
    const code = await this.prisma.antiFakeCode.findUnique({
      where: { id: codeId },
      include: { product: true },
    });
    
    if (!code || !code.product) return;
    
    await this.prisma.antiFakeCode.update({
      where: { id: codeId },
      data: {
        product_name: code.product.product_name,
        product_code: code.product.product_code,
        manufacturer: code.product.manufacturer,
        category: code.product.category,
        brand: code.product.brand,
        // ... 其他字段
      },
    });
  }
}
```

### 4. 监控告警：数据质量检查

添加数据质量监控：

```typescript
@Cron('0 */6 * * *') // 每6小时检查一次
async checkDataQuality() {
  const issues = [];
  
  // 检查1：未关联产品的防伪码
  const orphanCodes = await this.prisma.antiFakeCode.count({
    where: { product_id: null },
  });
  
  if (orphanCodes > 0) {
    issues.push(`发现 ${orphanCodes} 个未关联产品的防伪码`);
  }
  
  // 检查2：关联的产品已删除
  const deletedProductCodes = await this.prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM anti_fake_codes c
    LEFT JOIN products p ON c.product_id = p.id
    WHERE c.product_id IS NOT NULL AND p.id IS NULL
  `;
  
  if (deletedProductCodes[0].count > 0) {
    issues.push(`发现 ${deletedProductCodes[0].count} 个防伪码关联的产品已被删除`);
  }
  
  // 检查3：快照字段为空
  const emptySnapshot = await this.prisma.antiFakeCode.count({
    where: {
      product_id: { not: null },
      product_name: null,
    },
  });
  
  if (emptySnapshot > 0) {
    issues.push(`发现 ${emptySnapshot} 个防伪码的快照字段为空`);
  }
  
  // 如果有问题，发送告警
  if (issues.length > 0) {
    this.logger.warn('数据质量检查发现问题：\n' + issues.join('\n'));
    // 可以发送邮件或钉钉通知
    await this.sendAlert('防伪码数据质量告警', issues.join('\n'));
  }
}
```

---

## 📝 执行清单

请按顺序完成以下任务：

### 立即执行（紧急修复）

- [ ] **步骤 1**：使用 Prisma Studio 检查防伪码 `7Bk2obAK8gh4hKth` 的数据
  - 记录 `product_id`、`product_name`、`manufacturer` 的值
  
- [ ] **步骤 2**：如果 `product_id` 为空，在后台管理界面关联产品

- [ ] **步骤 3**：运行同步脚本
  ```bash
  node scripts/fix-code-product-sync.mjs --code 7Bk2obAK8gh4hKth
  ```

- [ ] **步骤 4**：验证修复
  - 访问 https://qr.0office.top/verify/7Bk2obAK8gh4hKth
  - 确认产品信息显示正常

### 短期执行（1-3天内）

- [ ] **批量修复**：同步所有防伪码的快照字段
  ```bash
  node scripts/fix-code-product-sync.mjs --all
  ```

- [ ] **前端优化**：应用产品信息降级逻辑优化

- [ ] **数据清理**：处理未关联产品的防伪码

### 长期执行（1-2周内）

- [ ] **后端改进**：添加产品关联必填校验

- [ ] **定时任务**：设置自动同步快照字段的定时任务

- [ ] **监控告警**：添加数据质量检查和告警

- [ ] **文档更新**：更新防伪码管理文档

---

## 🆘 故障排查

### 问题：运行脚本时提示 "Environment variable not found: DATABASE_URL"

**原因**：缺少 `.env` 文件或环境变量未配置

**解决方案**：

```bash
cd apps/api
cp .env.example .env
# 编辑 .env 文件，填入正确的数据库连接信息
vim .env
```

### 问题：修复后仍然显示默认值

**排查步骤**：

1. **检查 API 返回数据**：
   ```bash
   curl -X POST https://qr.0office.top/api/query \
     -H "Content-Type: application/json" \
     -d '{"code":"7Bk2obAK8gh4hKth"}' | jq .data.product
   ```
   
2. **检查浏览器控制台**：
   - 打开开发者工具（F12）
   - 查看 Console 标签是否有错误
   - 查看 Network 标签，检查 API 请求是否成功

3. **清除缓存**：
   - 前端可能有缓存，强制刷新页面（Ctrl+F5）
   - 后端 Redis 缓存可能过期，等待 5 分钟后重试

### 问题：批量同步脚本执行很慢

**原因**：数据量大，逐条更新耗时

**优化方案**：

修改脚本使用批量更新：

```typescript
// 将逐条更新改为批量更新
const updatePromises = codes.map(code => 
  this.prisma.antiFakeCode.update({
    where: { id: code.id },
    data: { /* ... */ },
  })
);

await Promise.all(updatePromises);
```

---

## 📞 技术支持

如果遇到问题，请提供以下信息：

1. **诊断脚本输出**：
   ```bash
   node scripts/debug-code-query.mjs 7Bk2obAK8gh4hKth > debug.log 2>&1
   ```

2. **API 返回数据**：
   ```bash
   curl -X POST https://qr.0office.top/api/query \
     -H "Content-Type: application/json" \
     -d '{"code":"7Bk2obAK8gh4hKth"}' > api-response.json
   ```

3. **浏览器控制台截图**

4. **Prisma Studio 中防伪码记录的截图**

将以上信息发送给技术支持团队进行分析。

---

## 📚 相关文档

- [防伪码管理文档](./防伪码管理.md)
- [数据库 Schema 文档](../prisma/schema.prisma)
- [API 接口文档](http://localhost:3000/api/docs)
- [前端开发指南](../../web/README.md)

---

**文档更新时间**: 2026-07-29  
**版本**: v1.0  
**维护者**: Claude Code Assistant
