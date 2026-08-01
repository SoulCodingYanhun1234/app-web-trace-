# 防伪码关闭防窜预警显示问题修复方案

## 问题描述

防伪码 `7Bk2obAK8gh4hKth` 关闭防窜预警（`anti_channeling_enabled = false`）后，访问验证页面 `https://qr.0office.top/verify/7Bk2obAK8gh4hKth` 时显示的不是防伪码产品信息。

## 根本原因

经过代码审查，确定了问题的三个可能原因：

### 1. **产品信息缺失**（最可能）
- 防伪码的 `product_id` 字段为空，未关联任何产品
- 或者关联的产品已被删除
- 导致 `query.service.ts` 第 631 行返回的 `product` 为 `null`

### 2. **防伪码快照字段未同步**（次要原因）
- 防伪码表的快照字段（`product_name`, `manufacturer`, `company_name` 等）为空
- 当产品信息缺失时，前端无法从快照字段降级显示
- 参见 `VerifyCodePage.vue` 第 329-338 行的降级逻辑

### 3. **前端显示逻辑问题**（潜在问题）
- 前端可能对 `anti_channeling_enabled = false` 的情况处理不当
- 即使有产品信息，也可能因为逻辑问题不显示

## 解决方案

### 方案一：立即修复（针对单个防伪码）

**步骤 1：检查防伪码是否关联产品**

在后台管理系统中：
1. 进入「防伪码管理」页面
2. 搜索防伪码 `7Bk2obAK8gh4hKth`
3. 检查「关联产品」列是否为空

**步骤 2：关联产品**

如果未关联产品：
1. 点击该防伪码的「编辑」按钮
2. 在「关联产品」下拉框中选择正确的产品
3. 保存

**步骤 3：同步产品信息**

使用修复脚本同步产品信息到防伪码快照字段：

```bash
cd apps/api
node scripts/fix-code-product-sync.mjs --code 7Bk2obAK8gh4hKth
```

**步骤 4：验证修复**

重新访问验证页面：
```
https://qr.0office.top/verify/7Bk2obAK8gh4hKth
```

检查是否正常显示产品信息。

---

### 方案二：批量修复（针对所有防伪码）

如果有多个防伪码存在类似问题，建议批量修复：

**步骤 1：批量同步产品信息**

```bash
cd apps/api
node scripts/fix-code-product-sync.mjs --all
```

这会将所有产品信息同步到对应防伪码的快照字段。

**步骤 2：处理未关联产品的防伪码**

运行诊断脚本查找未关联产品的防伪码：

```bash
cd apps/api
npx prisma studio
```

在 Prisma Studio 中：
1. 打开 `anti_fake_codes` 表
2. 筛选 `product_id IS NULL` 的记录
3. 手动关联产品或删除无效防伪码

---

### 方案三：优化前端显示逻辑（长期方案）

优化前端验证页面，改进对产品信息缺失情况的处理：

#### 修改 `apps/web/src/pages/public/VerifyCodePage.vue`

在第 293 行附近添加更完善的产品信息降级逻辑：

```typescript
// 原代码
const product = computed(() => normalizeObject(result.value?.product || result.value?.product_info || result.value?.goods));

// 优化后
const product = computed(() => {
  // 优先使用产品信息
  const productInfo = normalizeObject(
    result.value?.product || 
    result.value?.product_info || 
    result.value?.goods
  );
  
  // 如果产品信息缺失，从防伪码快照字段构建降级数据
  if (!productInfo.product_name && result.value?.code_owner) {
    const codeOwner = result.value.code_owner;
    return {
      product_name: codeOwner.product_name || '产品',
      product_code: codeOwner.product_code || '',
      manufacturer: codeOwner.manufacturer || codeOwner.company_name || '',
      category: codeOwner.category || '',
      brand: codeOwner.brand || '',
      ...productInfo,
    };
  }
  
  return productInfo;
});
```

在第 343 行附近添加产品名称的降级逻辑：

```typescript
// 原代码
const verifyProductName = computed(() => String(product.value.product_name || result.value?.product_name || result.value?.product_info?.product_name || '产品').trim());

// 优化后
const verifyProductName = computed(() => String(
  product.value.product_name 
  || result.value?.product_name 
  || result.value?.product_info?.product_name
  || result.value?.code_owner?.product_name  // 从快照读取
  || result.value?.box?.product_name         // 从箱码读取
  || '产品'
).trim());
```

---

## 预防措施

为避免将来再次出现类似问题，建议实施以下措施：

### 1. **数据完整性约束**

修改防伪码生成逻辑，确保生成时必须关联产品：

在 `apps/api/src/resources/codes.service.ts` 中：

```typescript
async generate(dto: GenerateCodesDto) {
  // 添加产品ID必填校验
  if (!dto.product_id) {
    throw new BadRequestException('生成防伪码必须关联产品');
  }
  
  // 验证产品是否存在
  const product = await this.prisma.product.findUnique({
    where: { id: dto.product_id },
  });
  
  if (!product) {
    throw new BadRequestException('关联的产品不存在');
  }
  
  // ... 现有生成逻辑
}
```

### 2. **自动同步快照字段**

在防伪码创建和更新时自动同步产品信息：

```typescript
// 在防伪码 create/update 时添加钩子
async createCodeWithSnapshot(data: CreateCodeDto) {
  const product = await this.prisma.product.findUnique({
    where: { id: data.product_id },
  });
  
  return this.prisma.antiFakeCode.create({
    data: {
      ...data,
      // 自动同步快照字段
      product_name: product.product_name,
      product_code: product.product_code,
      manufacturer: product.manufacturer,
      category: product.category,
      brand: product.brand,
      // ... 其他快照字段
    },
  });
}
```

### 3. **定期数据健康检查**

添加定时任务，每天检查并修复数据不一致问题：

```typescript
// 在 cron job 中添加
@Cron('0 2 * * *') // 每天凌晨2点执行
async dailyDataHealthCheck() {
  // 检查未关联产品的防伪码
  const orphanCodes = await this.prisma.antiFakeCode.count({
    where: { product_id: null },
  });
  
  if (orphanCodes > 0) {
    this.logger.warn(`发现 ${orphanCodes} 个未关联产品的防伪码`);
  }
  
  // 检查产品信息不一致的防伪码
  const codes = await this.prisma.antiFakeCode.findMany({
    where: { product_id: { not: null } },
    include: { product: true },
    take: 100,
  });
  
  let needSync = 0;
  for (const code of codes) {
    if (code.product && code.product_name !== code.product.product_name) {
      needSync++;
    }
  }
  
  if (needSync > 0) {
    this.logger.warn(`发现 ${needSync} 个防伪码的快照字段需要同步`);
  }
}
```

---

## 执行清单

请按以下顺序执行修复：

- [ ] **立即修复**：使用脚本同步单个防伪码
  ```bash
  node scripts/fix-code-product-sync.mjs --code 7Bk2obAK8gh4hKth
  ```

- [ ] **验证修复**：访问验证页面确认显示正常

- [ ] **批量修复**（如需要）：同步所有防伪码
  ```bash
  node scripts/fix-code-product-sync.mjs --all
  ```

- [ ] **前端优化**：应用前端降级逻辑优化

- [ ] **后端优化**：添加数据完整性约束

- [ ] **定期维护**：设置定时任务进行数据健康检查

---

## 技术支持

如果执行过程中遇到问题，请提供以下信息：

1. 诊断脚本输出结果
2. 防伪码的完整记录（可通过 Prisma Studio 查看）
3. 浏览器控制台的错误信息
4. API 返回的完整 JSON 数据

可以使用以下命令获取详细诊断信息：

```bash
# 诊断单个防伪码
node scripts/debug-code-query.mjs 7Bk2obAK8gh4hKth

# 查看 API 返回数据
curl -X POST https://qr.0office.top/api/query \
  -H "Content-Type: application/json" \
  -d '{"code":"7Bk2obAK8gh4hKth"}' | jq .
```
