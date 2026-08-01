<template>
  <IosPage>
    <IosPageHero eyebrow="Anti-counterfeiting Codes" title="防伪码管理" description="批量生成、激活、锁定、解锁、注销防伪码，并支持二维码查看和 CSV 导出。">
      <template #actions>
        <el-button v-if="canGenerate" @click="lowCodeVisible=true">低代码生成向导</el-button>
        <el-button :loading="loading" @click="load(true)">刷新</el-button>
        <el-button v-if="canGenerate" type="primary" @click="openGenerate">批量生成</el-button>
      </template>
    </IosPageHero>

    <AiTraceAutomationPanel v-if="AI_FEATURE_ENABLED" module-key="codes" compact @completed="load(true)" />

    <IosGlassCard v-if="canGenerate" class="low-code-brief">
      <div class="low-code-brief-title">低代码批量生成</div>
      <div class="low-code-brief-desc">不需要理解批次规则：选择产品后自动关联产品批号，也可从该产品历史批号中选择，再设置数量即可创建防伪码。二维码仍在列表中一键查看。</div>
      <el-space wrap>
        <el-button size="small" @click="quickGenerate(100)">生成100个</el-button>
        <el-button size="small" @click="quickGenerate(500)">生成500个</el-button>
        <el-button size="small" @click="quickGenerate(1000)">生成1000个</el-button>
        <el-button size="small" type="primary" plain @click="lowCodeVisible=true">查看步骤</el-button>
      </el-space>
    </IosGlassCard>

    <IosStatGrid mini>
      <IosStatCard v-for="item in codeStats" :key="item.label" :label="item.label" :value="item.value" mini />
    </IosStatGrid>

    <IosSearchPanel>
      <el-form :model="query" inline class="search-form" @submit.prevent>
        <el-form-item label="关联产品"><SearchableSelect v-model="query.product_id" :options="productOptions" style="width: 220px" placeholder="请选择产品" /></el-form-item>
        <el-form-item label="生产批号"><el-input v-model="query.batch_no" clearable placeholder="生产批号" @keyup.enter="search" /></el-form-item>
        <el-form-item label="状态">
          <SearchableSelect v-model="query.status" :options="statusOptions" style="width: 150px" placeholder="请选择状态" />
        </el-form-item>
        <el-form-item label="有效期">
          <SearchableSelect v-model="query.expiry_state" :options="expiryStateOptions" style="width: 150px" placeholder="全部" />
        </el-form-item>
        <el-form-item label="防窜校验">
          <SearchableSelect v-model="query.anti_channeling_enabled" :options="antiChannelingOptions" style="width: 150px" placeholder="全部" />
        </el-form-item>
        <el-form-item label="防伪码"><el-input v-model="query.code" clearable placeholder="完整或部分防伪码" @keyup.enter="search" /></el-form-item>
        <el-form-item label="所属箱码"><SearchableSelect v-model="query.box_no" :options="boxOptions" style="width: 190px" placeholder="搜索箱号/装箱码" /></el-form-item>
        <el-form-item label="公司"><SearchableSelect v-model="query.company_name" :options="companyOptions" style="width: 190px" placeholder="搜索公司" /></el-form-item>
        <el-form-item label="省份"><SearchableSelect v-model="query.province_name" :options="provinceOptions" style="width: 160px" placeholder="搜索省份" @change="onQueryProvinceChange" /></el-form-item>
        <el-form-item label="城市"><SearchableSelect v-model="query.city_name" :options="cityOptionsForQuery" style="width: 160px" placeholder="搜索城市" /></el-form-item>
        <el-form-item>
          <el-space>
            <el-button type="primary" :loading="loading" @click="search">查询</el-button>
            <el-button @click="reset">重置</el-button>
          </el-space>
        </el-form-item>
      </el-form>
    </IosSearchPanel>

    <IosTablePanel class="code-table-card">
      <div class="code-action-bar">
        <div class="action-group primary-actions" aria-label="批量状态操作">
          <el-tooltip content="激活已选防伪码" placement="top"><el-button v-if="canActivate" circle :loading="batchActivating" :disabled="batchBusy || !selectedKeys.length" @click="batchActivate"><AppIcon name="shield" /></el-button></el-tooltip>
          <el-tooltip content="锁定已选防伪码" placement="top"><el-button v-if="canActivate" circle :loading="batchLocking" :disabled="batchBusy || !selectedKeys.length" @click="batchLock(true)"><AppIcon name="lock" /></el-button></el-tooltip>
          <el-tooltip content="解锁已选防伪码" placement="top"><el-button v-if="canActivate" circle :loading="batchUnlocking" :disabled="batchBusy || !selectedKeys.length" @click="batchLock(false)"><AppIcon name="refresh" /></el-button></el-tooltip>
          <el-tooltip v-if="canCancel" content="注销已选防伪码" placement="top"><el-button circle type="danger" :loading="batchCanceling" :disabled="batchBusy || !selectedKeys.length" @click="batchCancel"><AppIcon name="risk" /></el-button></el-tooltip>
          <el-tooltip v-if="canDelete" content="删除已选防伪码" placement="top"><el-button circle type="danger" plain :loading="batchDeleting" :disabled="batchBusy || !selectedKeys.length" @click="batchDelete"><AppIcon name="delete" /></el-button></el-tooltip>
          <el-tooltip content="修改已选防伪码资料" placement="top"><el-button v-if="canActivate" circle type="primary" plain :disabled="batchBusy || !selectedKeys.length" @click="openBatchEdit('selected')"><AppIcon name="edit" /></el-button></el-tooltip>
        </div>
        <div class="action-hint muted">已选 {{ selectedKeys.length }} 个｜Ctrl+A 全选｜Del 删除｜Enter 批改</div>
        <div class="action-group secondary-actions" aria-label="导入导出和筛选操作">
          <input ref="codeImportRef" type="file" accept=".xlsx,.csv,.txt,.tsv" class="hidden-file" @change="handleImportFileChange" />
          <el-tooltip content="按当前筛选批量修改" placement="top"><el-button v-if="canActivate" circle @click="openBatchEdit('filter')"><AppIcon name="setting" /></el-button></el-tooltip>
          <el-tooltip content="Excel 导入批改" placement="top"><el-button v-if="canActivate" circle @click="openImportPicker"><AppIcon name="copy" /></el-button></el-tooltip>
          <el-tooltip content="导出 CSV" placement="top"><el-button v-if="canExport" circle @click="exportCodes"><AppIcon name="print" /></el-button></el-tooltip>
          <el-tooltip content="导出选中二维码" placement="top"><el-button v-if="canExport" circle type="primary" @click="openQrExportDialog" :loading="exportingZip" :disabled="!selectedKeys.length"><AppIcon name="code" /></el-button></el-tooltip>
        </div>
      </div>
      <div class="responsive-table-wrap">
      <el-table
        ref="tableRef"
        v-loading="loading"
        row-key="code"
        :data="list"
        stripe
        style="width: 100%"
        :select-on-indeterminate="true"
        @selection-change="handleSelectionChange"
        @header-click="handleHeaderClick"
      >
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column label="ID" prop="id" :width="104">
          <template #default="{ row }">
            <div class="code-id-cell">
              <span>{{ row.id }}</span>
              <el-tooltip content="复制防伪码ID" placement="top">
                <el-button class="copy-code-id-button" text circle size="small" aria-label="复制防伪码ID" @click.stop="copyCodeId(row)">
                  <AppIcon name="copy" :size="14" />
                </el-button>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="防伪码" prop="code" :width="250">
          <template #default="{ row }">
            <div class="code-value-cell">
              <span :title="row.code">{{ row.code }}</span>
              <el-tooltip content="复制防伪码" placement="top">
                <el-button class="copy-code-button" text circle size="small" aria-label="复制防伪码" @click.stop="copyCode(row)">
                  <AppIcon name="copy" :size="14" />
                </el-button>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="关联产品" prop="product_label" :width="220"><template #default="{ row }">{{ row.product_label || row.product_name || row.product_id || '-' }}</template></el-table-column>
        <el-table-column label="所属箱码" prop="box_no" :width="160"><template #default="{ row }">{{ row.box_no || '-' }}</template></el-table-column>
        <el-table-column label="生产批号" prop="batch_no" :width="170" />
        <el-table-column label="状态" prop="status" :width="100">
          <template #default="{ row }"><StatusTag module="code" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="防窜校验" prop="anti_channeling_enabled" :width="110">
          <template #default="{ row }">
            <el-tag :type="row.anti_channeling_enabled === false ? 'info' : 'success'" effect="light">{{ row.anti_channeling_enabled === false ? '已关闭' : '已开启' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="过期日期" prop="expires_at" :width="140">
          <template #default="{ row }">
            <el-tag v-if="isCodeExpired(row.expires_at)" type="danger" effect="light">{{ fmtDate(row.expires_at) }}</el-tag>
            <span v-else>{{ fmtDate(row.expires_at) || '长期有效' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="公司" prop="company_name" :width="180"><template #default="{ row }">{{ row.company_name || row.manufacturer || '-' }}</template></el-table-column>
        <el-table-column label="所属经销商" prop="agent_name" :width="180"><template #default="{ row }">{{ row.agent_name || row.distributor || '-' }}</template></el-table-column>
        <el-table-column label="防伪码授权位置" :width="190"><template #default="{ row }">{{ codeAuthorizationRegionText(row) }}</template></el-table-column>
        <el-table-column label="查询次数" prop="query_count" :width="100" />
        <el-table-column label="激活时间" prop="activated_at" :width="170">
          <template #default="{ row }">{{ fmtTime(row.activated_at) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" prop="created_at" :width="170">
          <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" :width="132" fixed="right" class-name="table-action-column" label-class-name="ios27-operation-column-head">
          <template #default="{ row }">
            <div class="row-actions icon-row-actions">
              <el-tooltip content="预览二维码" placement="top"><el-button circle size="small" @click="openQrcode(row)"><AppIcon name="code" :size="15" /></el-button></el-tooltip>
              <el-tooltip content="编辑当前码" placement="top"><el-button circle size="small" :disabled="!canActivate" @click="openSingleEdit(row)"><AppIcon name="edit" :size="15" /></el-button></el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>
      <div class="pagination-bar">
        <el-pagination
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="changePage"
          @size-change="changePageSize"
        />
      </div>
    </IosTablePanel>

    <el-dialog v-model="generateVisible" title="批量生成防伪码" width="720px" align-center destroy-on-close append-to-body :lock-scroll="true">
      <el-alert class="form-low-code-tips" type="info" :closable="false" show-icon>选择产品后会自动带出生产批号；生成防伪码不需要设置地区，发货时再按实际发货位置确定授权地区。</el-alert>
      <el-form :model="generateForm" label-position="top">
        <el-form-item label="关联产品" required><SearchableSelect v-model="generateForm.product_id" :options="productOptions" style="width:100%" placeholder="请选择产品" @change="onGenerateProductChange" /></el-form-item>
        <el-alert
          v-if="generateOwnerSummary"
          class="form-low-code-tips"
          type="success"
          :closable="false"
          show-icon
          :title="generateOwnerSummary"
        />
        <el-form-item label="生成数量" required>
          <el-input-number v-model="generateForm.count" style="width:100%" :min="1" />
          <div class="field-quick-options"><span class="muted">常用数量：</span><el-tag v-for="n in [100, 500, 1000, 5000]" :key="n" class="quick-option-tag" @click="generateForm.count=n">{{ n }}</el-tag></div>
        </el-form-item>
        <el-form-item label="生产批号" required>
          <SearchableSelect
            v-model="generateForm.batch_no"
            :options="generateBatchOptions"
            :loading="loadingGenerateBatches"
            allow-create
            style="width:100%"
            placeholder="选择产品后自动带出，也可下拉选择或手动输入"
          />
          <div class="field-help">优先关联产品资料中的批号；下拉列表同时显示该产品已使用过的历史批号，也可手动录入新批号。</div>
        </el-form-item>
        <el-form-item label="前缀">
          <el-input v-model="generateForm.prefix" placeholder="如：ABC" />
          <div class="field-quick-options"><span class="muted">常用前缀：</span><el-tag v-for="p in ['TR', 'QR', 'AF', 'VIP']" :key="p" class="quick-option-tag" @click="generateForm.prefix=p">{{ p }}</el-tag></div>
        </el-form-item>
        <el-form-item label="防伪码过期日期（可选）">
          <el-date-picker v-model="generateForm.expires_at" type="date" value-format="YYYY-MM-DD" clearable style="width:100%" placeholder="不填则长期有效" />
          <div class="field-quick-options"><span class="muted">快捷：</span><el-tag class="quick-option-tag" @click="setGenerateExpiryMonths(6)">6个月</el-tag><el-tag class="quick-option-tag" @click="setGenerateExpiryMonths(12)">1年</el-tag><el-tag class="quick-option-tag" @click="setGenerateExpiryMonths(24)">2年</el-tag><el-tag class="quick-option-tag" @click="setGenerateExpiryMonths(36)">3年</el-tag><el-tag class="quick-option-tag" @click="setGenerateExpiryMonths(42)">3.5年</el-tag><el-tag class="quick-option-tag" @click="generateForm.expires_at=''">长期有效</el-tag></div>
        </el-form-item>
        <el-form-item label="防窜校验">
          <div class="anti-channeling-toggle-field">
            <el-switch v-model="generateForm.anti_channeling_enabled" active-text="开启" inactive-text="关闭" />
          </div>
          <div class="field-help">关闭后，消费者扫码不采集位置、不核验授权区域，防伪码有效时直接显示正品内容。</div>
        </el-form-item>
        <div class="generate-preview-card">
          <div>
            <span class="muted">生成策略</span>
            <strong>生成后自动启用</strong>
            <small>新码直接进入“已激活”状态；如填写过期日期，扫码查询会自动识别有效/过期。</small>
          </div>
          <el-tag type="success" effect="light">默认已激活</el-tag>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="generate">生成并启用</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="lowCodeVisible" title="防伪码低代码生成向导" :size="460" append-to-body :lock-scroll="true">
      <el-alert type="success" show-icon :closable="false" class="low-code-drawer-alert">按这 4 步操作即可完成批量生成，新手无需理解后端字段。</el-alert>
      <el-steps direction="vertical" :active="4" finish-status="success">
        <el-step title="选择关联产品" description="从下拉框选择产品，无需记忆产品ID。" />
        <el-step title="选择生成数量" description="点击 100 / 500 / 1000 等常用数量，避免手输错误。" />
        <el-step title="确认生产批号" description="选择产品后自动带出默认批号；如有多个历史批号，可从列表中切换或录入新批号。" />
        <el-step title="生成后查看二维码" description="列表中点击二维码即可直接显示图片。" />
      </el-steps>
      <div class="low-code-section">
        <div class="low-code-section-title">快捷入口</div>
        <el-space wrap>
          <el-button type="primary" @click="quickGenerate(100)">生成100个</el-button>
          <el-button @click="quickGenerate(500)">生成500个</el-button>
          <el-button @click="quickGenerate(1000)">生成1000个</el-button>
        </el-space>
      </div>
    </el-drawer>

    <el-dialog v-model="qrcodeVisible" title="防伪码二维码预览" width="520px" align-center destroy-on-close @closed="clearQrcode" append-to-body :lock-scroll="true">
      <div class="code-qr-preview">
        <div class="qr-preview-frame">
          <el-skeleton v-if="qrcodeLoading" animated :rows="5" />
          <img v-else-if="qrcodeUrl" :src="qrcodeUrl" alt="防伪码二维码预览" />
          <el-empty v-else-if="!qrcodeItems.length" description="二维码生成失败或暂无数据" />
          <DetailDescriptions v-else :data="qrcodeItems" :column="1" />
        </div>
        <div class="qr-preview-code">扫码打开防伪验证链接</div>
        <el-alert v-if="qrcodeUrl" type="success" :closable="false" show-icon>二维码已生成，内容为验证链接（/verify/防伪码），消费者扫码可直接打开验证页；后台扫码枪会自动提取码值。</el-alert>
      </div>
    </el-dialog>

    <el-dialog v-model="qrExportVisible" title="导出选中二维码" width="520px" align-center destroy-on-close append-to-body :lock-scroll="true">
      <el-alert type="info" show-icon :closable="false" class="form-low-code-tips">
        已选择 {{ selectedKeys.length }} 个防伪码。系统只会导出表格中勾选的码，不再按当前筛选条件批量导出全部数据。
      </el-alert>
      <el-form label-position="top" class="qr-export-form">
        <el-form-item label="图片格式">
          <el-radio-group v-model="qrExportFormat">
            <el-radio-button label="svg">SVG 矢量图</el-radio-button>
            <el-radio-button label="png">PNG 位图</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <div class="qr-export-tip">
          <strong>建议：</strong>印刷、高清缩放优先选 SVG；普通办公、图片预览优先选 PNG。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="qrExportVisible = false">取消</el-button>
        <el-button type="primary" :loading="exportingZip" @click="confirmQrExport">生成并下载</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchEditVisible" title="防伪码批量修改 / 归属级联" width="760px" align-center destroy-on-close append-to-body :lock-scroll="true">
      <el-alert type="warning" show-icon :closable="false" class="form-low-code-tips">
        本操作使用后端事务执行。选择“所属箱码”时，会同步维护箱内 codes 清单，并把产品、企业主体、地区和渠道字段级联写入命中的防伪码。
      </el-alert>
      <el-form label-position="top" class="batch-edit-form">
        <el-form-item label="修改范围">
          <el-radio-group v-model="batchEditMode">
            <el-radio-button label="selected" :disabled="!selectedKeys.length">选中 {{ selectedKeys.length }} 个</el-radio-button>
            <el-radio-button label="filter">当前筛选条件</el-radio-button>
            <el-radio-button label="import" :disabled="!importedCodes.length">导入 {{ importedCodes.length }} 个</el-radio-button>
          </el-radio-group>
          <div class="batch-edit-tip">{{ batchEditScopeText }}</div>
        </el-form-item>
        <div class="batch-edit-grid">
          <el-form-item label="关联产品">
            <SearchableSelect v-model="batchPatch.product_id" :options="productOptions" placeholder="不修改" style="width:100%" />
          </el-form-item>
          <el-form-item label="所属箱码">
            <SearchableSelect v-model="batchPatch.box_no" :options="boxOptions" allow-create placeholder="搜索或输入已存在箱号，可自动级联" style="width:100%" />
          </el-form-item>
          <el-form-item label="生产批号">
            <el-input v-model="batchPatch.batch_no" clearable placeholder="不修改" />
          </el-form-item>
          <el-form-item label="状态">
            <SearchableSelect v-model="batchPatch.status" :options="statusOptions" placeholder="不修改" style="width:100%" />
          </el-form-item>
          <el-form-item label="防窜校验">
            <div class="anti-channeling-toggle-field">
              <el-switch v-model="batchAntiChannelingEnabled" :disabled="!batchAntiChannelingApply" active-text="开启" inactive-text="关闭" />
              <el-checkbox v-model="batchAntiChannelingApply">应用到本次修改</el-checkbox>
            </div>
            <div class="field-help">勾选“应用”后才会改动该开关。关闭后无需位置授权，验真通过即显示正品内容。</div>
          </el-form-item>
          <el-form-item label="关联主体">
            <SearchableSelect v-model="batchPatch.partner_ref" :options="partnerOptions" allow-create placeholder="选择公司或代理商，也可手动输入主体名称" style="width:100%" @change="onBatchPartnerChange" />
          </el-form-item>
          <el-form-item label="省份">
            <SearchableSelect v-model="batchPatch.province_name" :options="provinceOptions" :disabled="Boolean(batchPatch.agent_id)" allow-create placeholder="选择经销商后自动带出" style="width:100%" @change="onBatchProvinceChange" />
          </el-form-item>
          <el-form-item label="城市">
            <SearchableSelect v-model="batchPatch.city_name" :options="cityOptionsForBatch" :disabled="Boolean(batchPatch.agent_id)" allow-create placeholder="选择经销商后自动带出" style="width:100%" @change="onBatchCityChange" />
          </el-form-item>
          <el-form-item label="区域分组">
            <el-input v-model="batchPatch.region_group" :disabled="Boolean(batchPatch.agent_id)" clearable placeholder="选择经销商后自动生成" />
          </el-form-item>
          <el-form-item label="仓库">
            <el-input v-model="batchPatch.warehouse" clearable placeholder="不修改" />
          </el-form-item>
          <el-form-item label="渠道备注">
            <el-input v-model="batchPatch.distributor" clearable placeholder="可由代理商主体自动带出，也可手动填写" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="batchEditVisible = false">取消</el-button>
        <el-button @click="resetBatchPatch">清空修改字段</el-button>
        <el-button type="primary" :loading="batchUpdating" @click="submitBatchEdit">事务提交</el-button>
      </template>
    </el-dialog>
  </IosPage>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElMessage as Message, ElMessageBox as MessageBox } from 'element-plus';
import StatusTag from '@/components/StatusTag.vue';
import AppIcon from '@/components/AppIcon.vue';
import AiTraceAutomationPanel from '@/components/AiTraceAutomationPanel.vue';
import { AI_FEATURE_ENABLED } from '@/config/features';
import DetailDescriptions from '@/components/DetailDescriptions.vue';
import { IosGlassCard, IosPage, IosPageHero, IosSearchPanel, IosStatCard, IosStatGrid, IosTablePanel } from '@/components/ios27';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { boxApi, codesApi, exportApi, manufacturersApi, partnersApi, productsApi } from '@/api/resources';
import { clearRequestCache } from '@/api/http';
import { statusMaps, toOptions } from '@/constants/status';
import { cleanObject, displayValue, fmtTime, normalizePage } from '@/utils/format';
import { debounce } from '@/utils/performance';
import { parseImportFile } from '@/utils/excelImport';
import { useAuthStore } from '@/stores/auth';
import { cityOptions, provinceOptions } from '@/utils/regionOptions';

const statusOptions = toOptions(statusMaps.code);
const antiChannelingOptions = [
  { label: '已开启', value: 'true' },
  { label: '已关闭', value: 'false' },
];
const expiryStateOptions = [
  { label: '长期有效', value: 'permanent' },
  { label: '有效中', value: 'valid' },
  { label: '已过期', value: 'expired' },
];
const productOptions = ref<any[]>([]);
const generateBatchOptions = ref<any[]>([]);
const loadingGenerateBatches = ref(false);
const partnerOptions = ref<any[]>([]);
const boxOptions = ref<any[]>([]);
const manufacturerOptions = ref<any[]>([]);
const query = reactive<any>({ page: 1, pageSize: 20 });
const list = shallowRef<any[]>([]);
const loading = ref(false);
const selectedKeys = ref<string[]>([]);
const pagination = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
const generateVisible = ref(false);
const qrcodeVisible = ref(false);
const lowCodeVisible = ref(false);
const qrcodeData = shallowRef<any>({});
const qrcodeUrl = ref('');
const qrcodeLoading = ref(false);
const statsData = shallowRef<any>({});
const generating = ref(false);
const exportingZip = ref(false);
const qrExportVisible = ref(false);
const qrExportFormat = ref<'svg' | 'png'>('svg');
const codeImportRef = ref<HTMLInputElement>();
const tableRef = ref<any>();
const batchEditVisible = ref(false);
const batchEditMode = ref<'selected' | 'filter' | 'import'>('selected');
const importedCodes = ref<string[]>([]);
const batchUpdating = ref(false);
const batchActivating = ref(false);
const batchLocking = ref(false);
const batchUnlocking = ref(false);
const batchCanceling = ref(false);
const batchDeleting = ref(false);
const batchPatch = reactive<any>({});
const clearExpiry = ref(false);
const batchAntiChannelingApply = ref(false);
const batchAntiChannelingEnabled = ref(true);
const generateForm = reactive({ product_id: undefined as any, count: 1000, batch_no: '', prefix: '', auto_activate: true, expires_at: '', anti_channeling_enabled: true });
let loadSeq = 0;
let statsProductKey = '__init__';
let generateBatchLoadSeq = 0;

const auth = useAuthStore();
const canGenerate = computed(() => auth.hasPermission('code:generate'));
const canActivate = computed(() => auth.hasPermission('code:activate'));
const canCancel = computed(() => auth.hasPermission('code:cancel'));
const canDelete = computed(() => auth.hasPermission('code:delete'));
const canExport = computed(() => auth.hasPermission('export:download'));
const batchBusy = computed(() => batchActivating.value || batchLocking.value || batchUnlocking.value || batchCanceling.value || batchDeleting.value || batchUpdating.value);

const qrcodeItems = computed(() => Object.entries(qrcodeData.value || {}).map(([label, value]) => ({ label, value: displayValue(value) })));
const normalizedStats = computed(() => {
  if (Array.isArray(statsData.value)) {
    const total = statsData.value.reduce((sum: number, item: any) => sum + Number(item.total || 0), 0);
    const byStatus = Object.fromEntries(statsData.value.map((item: any) => [Number(item.status), Number(item.total || 0)]));
    return { total, codes: total, activated: Number(byStatus[1] || 0) + Number(byStatus[4] || 0), queried: Number(byStatus[4] || 0) };
  }
  return statsData.value || {};
});
const codeStats = computed(() => [
  { label: '当前筛选总数', value: pagination.total || 0 },
  { label: '总码量', value: normalizedStats.value.total ?? normalizedStats.value.codes ?? 0 },
  { label: '已激活', value: normalizedStats.value.activated ?? 0 },
  { label: '已查询', value: normalizedStats.value.queried ?? 0 },
]);
const batchEditScopeText = computed(() => {
  if (batchEditMode.value === 'selected') return `将修改当前跨页勾选的 ${selectedKeys.value.length} 个防伪码。`;
  if (batchEditMode.value === 'import') return `将修改 Excel/CSV 导入的 ${importedCodes.value.length} 个防伪码。`;
  return `将按当前筛选条件批改，预计命中 ${pagination.total || 0} 条；后端单次保护上限 50000 条。`;
});
const generateOwnerSummary = computed(() => {
  const product = productOptions.value.find((item: any) => String(item.value ?? item.id) === String(generateForm.product_id || ''));
  if (!product) return '';
  const dealer = String(product.product_owner_name || '').trim();
  if (dealer) return `产品所属经销商：${dealer}；防伪码发货前不需要位置授权`;
  return '防伪码发货前不需要位置授权；发货后按发货位置校验';
});

function codeAuthorizationRegionText(row: any) {
  if (row?.anti_channeling_enabled === false) return '无需授权位置';
  if (Number(row?.box_status || 0) < 2) return '发货前无需授权';
  return [row.province_name, row.city_name].filter(Boolean).join(' / ') || row.region_group || '发货位置待设置';
}

async function copyText(value: unknown, label: string, missingMessage: string) {
  const text = String(value ?? '').trim();
  if (!text) return Message.warning(missingMessage);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(input);
      if (!copied) throw new Error('copy failed');
    }
    Message.success(`${label}已复制`);
  } catch {
    Message.warning(`当前浏览器不允许自动复制，请手动复制${label}`);
  }
}

function copyCodeId(row: any) {
  return copyText(row?.id, '防伪码ID', '当前防伪码缺少ID');
}

function copyCode(row: any) {
  return copyText(row?.code, '防伪码', '当前记录缺少防伪码');
}


const companyOptions = computed(() => {
  const map = new Map<string, { label: string; value: string }>();
  for (const item of manufacturerOptions.value) {
    const value = String(item.company_name || item.manufacturer_name || item.value || '').trim();
    if (value && !map.has(value)) map.set(value, { label: value, value });
  }
  return Array.from(map.values());
});
const cityOptionsForQuery = computed(() => cityOptions(query.province_name));
const cityOptionsForBatch = computed(() => cityOptions(batchPatch.province_name));
function onQueryProvinceChange() {
  if (query.city_name && !cityOptions(query.province_name).some((item) => item.value === query.city_name)) query.city_name = '';
}
function syncBatchRegionGroup() {
  if (!batchPatch.region_group && batchPatch.province_name) batchPatch.region_group = `${batchPatch.province_name}${batchPatch.city_name ? ` / ${batchPatch.city_name}` : ''}`;
}
function onBatchProvinceChange() {
  if (batchPatch.city_name && !cityOptions(batchPatch.province_name).some((item) => item.value === batchPatch.city_name)) batchPatch.city_name = '';
  syncBatchRegionGroup();
}
function onBatchCityChange() { syncBatchRegionGroup(); }
function onBatchManufacturerChange(value: any) {
  const text = String(value || '').trim();
  const item = manufacturerOptions.value.find((option) => String(option.value) === text || String(option.manufacturer_name || '') === text || String(option.company_name || '') === text);
  const company = String(item?.company_name || item?.manufacturer_name || item?.value || text).trim();
  if (company) {
    batchPatch.manufacturer = company;
    batchPatch.company_name = company;
  }
}

function findPartnerOption(value: any) {
  const target = String(value ?? '').trim();
  if (!target) return undefined;
  return partnerOptions.value.find((item: any) => String(item.value) === target || String(item.id) === target || String(item.party_name || item.label || '') === target);
}
function onBatchPartnerChange(value: any) {
  const item = findPartnerOption(value);
  const text = String(value ?? '').trim();
  if (!item) {
    if (text) {
      batchPatch.manufacturer = text;
      batchPatch.company_name = text;
    }
    return;
  }
  const partyName = String(item.party_name || item.agent_name || item.company_name || item.manufacturer_name || item.label || text).trim();
  if (item.party_type === 'agent') {
    batchPatch.agent_id = item.source_id || item.agent_id || item.id;
    batchPatch.agent_name = partyName;
    batchPatch.distributor = partyName;
    batchPatch.province_name = item.province || '';
    batchPatch.city_name = item.city || '';
    batchPatch.region_group = [batchPatch.province_name, batchPatch.city_name].filter(Boolean).join(' / ');
    if (item.company_name) {
      batchPatch.company_name = item.company_name;
      batchPatch.manufacturer = item.company_name;
    }
    syncBatchRegionGroup();
    return;
  }
  if (partyName) {
    batchPatch.manufacturer = partyName;
    batchPatch.company_name = partyName;
    batchPatch.agent_id = undefined;
    batchPatch.agent_name = '';
    batchPatch.distributor = '';
  }
}

async function load(forceStats = false) {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    if (forceStats) clearRequestCache();
    const data = normalizePage(await codesApi.list(cleanObject({ ...query })));
    if (seq !== loadSeq) return;
    list.value = data.list;
    Object.assign(pagination, data.pagination);
    await nextTick();
    syncCurrentPageSelection();
    // 保留跨页勾选，批量修改/二维码导出可跨页执行。
    const productKey = String(query.product_id || 'all');
    if (forceStats || productKey !== statsProductKey) {
      statsProductKey = productKey;
      await loadStats();
    }
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}
async function loadStats() {
  try { statsData.value = await codesApi.stats(query.product_id ? Number(query.product_id) : undefined); }
  catch { statsData.value = {}; }
}
const debouncedLoad = debounce(() => load(), 220);
function search() { query.page = 1; debouncedLoad(); }
function reset() { clearRequestCache(); Object.keys(query).forEach((k)=>delete query[k]); Object.assign(query,{ page:1,pageSize:20 }); clearSelectedCodes(); load(true); }
function getCodeKey(row: any) { return String(row?.code || '').trim(); }
function currentPageCodeKeys() { return (list.value || []).map(getCodeKey).filter(Boolean); }
function isCurrentPageAllSelected() {
  const pageKeys = currentPageCodeKeys();
  if (!pageKeys.length) return false;
  const selected = new Set(selectedKeys.value);
  return pageKeys.every((key) => selected.has(key));
}
function syncCurrentPageSelection() {
  const selected = new Set(selectedKeys.value);
  list.value.forEach((row) => {
    const key = getCodeKey(row);
    tableRef.value?.toggleRowSelection?.(row, Boolean(key && selected.has(key)));
  });
}
function toggleCurrentPageSelection(checked = !isCurrentPageAllSelected()) {
  const pageKeys = new Set(currentPageCodeKeys());
  const next = new Set(selectedKeys.value);
  pageKeys.forEach((key) => (checked ? next.add(key) : next.delete(key)));
  selectedKeys.value = Array.from(next);
  syncCurrentPageSelection();
}
function handleSelectionChange(selection: any[]) {
  const pageKeys = new Set(currentPageCodeKeys());
  const next = new Set(selectedKeys.value);
  pageKeys.forEach((key) => next.delete(key));
  selection.forEach((item) => {
    const key = getCodeKey(item);
    if (key) next.add(key);
  });
  selectedKeys.value = Array.from(next);
}
function handleHeaderClick(column: any, event: MouseEvent) {
  if (column?.type !== 'selection') return;
  const target = event.target as HTMLElement | null;
  if (target?.closest?.('.el-checkbox')) return;
  event.preventDefault();
  toggleCurrentPageSelection();
}
function clearSelectedCodes() { selectedKeys.value = []; tableRef.value?.clearSelection?.(); }
function requireSelected() { if (!selectedKeys.value.length) { Message.warning('请先选择防伪码'); return false; } return true; }
function copySelectedCodes() { return Array.from(new Set(selectedKeys.value.map((code) => String(code).trim()).filter(Boolean))); }
function updateVisibleCodeStatus(codes: string[], status: number) {
  const changed = new Set(codes);
  const now = new Date().toISOString();
  list.value = list.value.map((row) => changed.has(getCodeKey(row))
    ? { ...row, status, ...(status === 1 ? { activated_at: row.activated_at || now } : {}) }
    : row);
}
function batchTraceHint(trace?: string) { return trace === 'queued' ? '，溯源后台同步中' : ''; }
function fmtDate(value: any) { return value ? String(value).slice(0, 10) : ''; }
function isCodeExpired(value: any) { if (!value) return false; const d = new Date(String(value).slice(0, 10) + 'T00:00:00'); const today = new Date(); today.setHours(0,0,0,0); return !Number.isNaN(d.getTime()) && d.getTime() < today.getTime(); }
function addMonthsDate(months: number) { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); }
function setGenerateExpiryMonths(months: number) { generateForm.expires_at = addMonthsDate(months); }
async function batchActivate() {
  if (!requireSelected() || batchBusy.value) return;
  const codes = copySelectedCodes();
  batchActivating.value = true;
  try {
    const res = await codesApi.batchActivate(codes);
    updateVisibleCodeStatus(codes, 1);
    Message.success(`激活完成：${res?.affected ?? codes.length} 个${batchTraceHint(res?.trace)}`);
    void load(true);
  } catch (error: any) {
    Message.error(error?.message || '批量激活失败');
  } finally {
    batchActivating.value = false;
  }
}
async function batchLock(lock: boolean) {
  if (!requireSelected() || batchBusy.value) return;
  const codes = copySelectedCodes();
  const flag = lock ? batchLocking : batchUnlocking;
  flag.value = true;
  try {
    const res = await codesApi.batchLock(codes, lock);
    updateVisibleCodeStatus(codes, lock ? 2 : 1);
    Message.success(`${lock ? '锁定' : '解锁'}完成：${res?.affected ?? codes.length} 个${batchTraceHint(res?.trace)}`);
    void load(true);
  } catch (error: any) {
    Message.error(error?.message || (lock ? '批量锁定失败' : '批量解锁失败'));
  } finally {
    flag.value = false;
  }
}
async function batchCancel() {
  if (!requireSelected() || batchBusy.value) return;
  const codes = copySelectedCodes();
  try { await MessageBox.confirm(`确认注销选中的 ${codes.length} 个防伪码？`, '注销确认', { type: 'warning' }); }
  catch { return; }
  batchCanceling.value = true;
  try {
    const res = await codesApi.batchCancel(codes);
    updateVisibleCodeStatus(codes, 3);
    Message.success(`注销完成：${res?.affected ?? codes.length} 个${batchTraceHint(res?.trace)}`);
    void load(true);
  } catch (error: any) {
    Message.error(error?.message || '批量注销失败');
  } finally {
    batchCanceling.value = false;
  }
}
async function batchDelete() {
  if (!requireSelected() || batchBusy.value) return;
  if (!canDelete.value) return Message.warning('没有删除防伪码权限');
  const codes = copySelectedCodes();
  try {
    await MessageBox.confirm(`确认删除选中的 ${codes.length} 个防伪码？删除后不可恢复，并会同步从箱码清单中移除。`, '删除确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' });
  } catch {
    return;
  }
  batchDeleting.value = true;
  try {
    const res = await codesApi.batchDelete(codes);
    Message.success(`删除成功：${res?.affected ?? codes.length} 个`);
    clearSelectedCodes();
    await load(true);
  } catch (error: any) {
    Message.error(error?.message || '批量删除失败');
  } finally {
    batchDeleting.value = false;
  }
}
function findProductOption(productId: any) {
  return productOptions.value.find((item: any) => String(item.value) === String(productId) || String(item.id) === String(productId));
}
async function syncGenerateBatchNo(showNotice = true) {
  const product = findProductOption(generateForm.product_id);
  let productBatchNo = String(product?.batch_no || '').trim();
  const seq = ++generateBatchLoadSeq;

  if (!product) {
    generateBatchOptions.value = [];
    generateForm.batch_no = '';
    return;
  }

  // 选择产品后首先采用产品主数据里已经维护的批号，避免重复手填。
  generateForm.batch_no = productBatchNo;
  generateBatchOptions.value = productBatchNo
    ? [{ label: `${productBatchNo}（产品默认批号）`, value: productBatchNo, source: 'product' }]
    : [];

  loadingGenerateBatches.value = true;
  try {
    // 下拉缓存中没有批号时，再读取一次产品详情，确保刚维护的批号立即自动关联。
    if (!productBatchNo) {
      const detail = await productsApi.detail(product.value ?? product.id);
      if (seq !== generateBatchLoadSeq) return;
      productBatchNo = String(detail?.batch_no || '').trim();
      if (productBatchNo) {
        product.batch_no = productBatchNo;
        generateForm.batch_no = productBatchNo;
      }
    }
    const rows = await codesApi.batches({ product_id: Number(product.value ?? product.id) });
    if (seq !== generateBatchLoadSeq) return;
    const seen = new Set<string>();
    const options: any[] = [];
    const add = (batchNo: any, label?: string, source = 'history') => {
      const value = String(batchNo || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      options.push({ label: label || `${value}（历史批号）`, value, source });
    };
    add(productBatchNo, productBatchNo ? `${productBatchNo}（产品默认批号）` : undefined, 'product');
    (Array.isArray(rows) ? rows : []).forEach((item: any) => add(item?.batch_no));
    generateBatchOptions.value = options;

    // 产品没有默认批号时，自动关联最近使用过的批号；完全没有历史批号则保留空值供新增。
    if (!generateForm.batch_no && options.length) generateForm.batch_no = String(options[0].value);
    if (showNotice && generateForm.batch_no) Message.success(`已关联生产批号：${generateForm.batch_no}`);
  } catch {
    if (seq !== generateBatchLoadSeq) return;
    // 历史批号加载失败时，产品默认批号仍然可用，不阻断生成。
    if (showNotice && productBatchNo) Message.success(`已关联产品批号：${productBatchNo}`);
  } finally {
    if (seq === generateBatchLoadSeq) loadingGenerateBatches.value = false;
  }
}
function onGenerateProductChange() { void syncGenerateBatchNo(true); }
function openGenerate() {
  if (generateForm.product_id && !generateForm.batch_no) void syncGenerateBatchNo(false);
  generateVisible.value = true;
}
function quickGenerate(count: number) {
  generateForm.count = count;
  if (generateForm.product_id && !generateForm.batch_no) void syncGenerateBatchNo(false);
  generateVisible.value = true;
  lowCodeVisible.value = false;
}
async function generate() {
  if (!generateForm.product_id) return Message.warning('请先选择关联产品');
  if (!generateForm.batch_no) return Message.warning('请选择或填写生产批号');
  generating.value = true;
  try {
    await codesApi.generate(cleanObject({ ...generateForm, auto_activate: true, status: 1 }));
    Message.success('生成成功，防伪码已自动启用');
    generateVisible.value = false;
    await load(true);
  } finally {
    generating.value = false;
  }
}
async function openQrcode(record: any) {
  clearQrcode();
  qrcodeVisible.value = true;
  qrcodeLoading.value = true;
  const code = String(record?.code || '').trim();
  if (!code) { qrcodeLoading.value = false; return; }
  try {
    const blob = await codesApi.qrcodeBlob(code) as Blob;
    if (blob?.type?.startsWith('image/')) {
      qrcodeUrl.value = URL.createObjectURL(blob);
    } else {
      const meta = await codesApi.qrcode(code);
      qrcodeData.value = meta || {};
    }
  } catch {
    try { qrcodeData.value = await codesApi.qrcode(code) || {}; } catch { qrcodeData.value = {}; }
  } finally {
    qrcodeLoading.value = false;
  }
}
function clearQrcode() { if (qrcodeUrl.value) URL.revokeObjectURL(qrcodeUrl.value); qrcodeUrl.value = ''; qrcodeData.value = {}; qrcodeLoading.value = false; }
function changePage(page: number) { query.page = page; load(); }
function changePageSize(pageSize: number) { query.pageSize = pageSize; query.page = 1; load(); }
async function loadProductOptions() {
  try {
    productOptions.value = await productsApi.select();
    if (generateForm.product_id && !generateForm.batch_no) void syncGenerateBatchNo(false);
  } catch { productOptions.value = []; }
}
async function loadPartnerOptions() {
  try { partnerOptions.value = await partnersApi.select(); } catch { partnerOptions.value = []; }
}

async function loadBoxOptions() {
  try {
    const data = normalizePage(await boxApi.list({ page: 1, pageSize: 1000 }));
    boxOptions.value = (data.list || []).map((box: any) => ({
      label: `${box.box_no || box.id}${box.product_name ? `（${box.product_name}）` : ''}`,
      value: box.box_no || String(box.id),
      ...box,
    })).filter((item: any) => item.value);
  } catch { boxOptions.value = []; }
}
async function loadManufacturerOptions() {
  try { manufacturerOptions.value = await manufacturersApi.select(); } catch { manufacturerOptions.value = []; }
}
function exportCodes() { exportApi.codes(cleanObject({ ...query })); }
function openSingleEdit(row: any) {
  const code = getCodeKey(row);
  if (!code) return;
  selectedKeys.value = [code];
  syncCurrentPageSelection();
  openBatchEdit('selected', row);
}

function openQrExportDialog() {
  if (!requireSelected()) return;
  qrExportVisible.value = true;
}
async function confirmQrExport() {
  if (!requireSelected()) return;
  exportingZip.value = true;
  try {
    Message.info('正在生成选中二维码，请稍候...');
    await exportApi.qrcodeZip(cleanObject({ codes: selectedKeys.value.join(','), format: qrExportFormat.value }));
    Message.success('选中二维码导出成功');
    qrExportVisible.value = false;
  } catch (error: any) {
    Message.error(error?.message || '导出失败');
  } finally {
    exportingZip.value = false;
  }
}

function resetBatchPatch() {
  Object.keys(batchPatch).forEach((key) => delete batchPatch[key]);
  clearExpiry.value = false;
  batchAntiChannelingApply.value = false;
  batchAntiChannelingEnabled.value = true;
}
function openBatchEdit(mode: 'selected' | 'filter' | 'import', row?: any) {
  if (mode === 'selected' && !requireSelected()) return;
  if (mode === 'import' && !importedCodes.value.length) return Message.warning('请先导入 Excel/CSV 防伪码');
  resetBatchPatch();
  if (row) {
    batchAntiChannelingApply.value = true;
    batchAntiChannelingEnabled.value = row.anti_channeling_enabled !== false;
  }
  batchEditMode.value = mode;
  batchEditVisible.value = true;
}
function openImportPicker() { codeImportRef.value?.click(); }
function pickCodeFromRow(row: Record<string, any>) {
  const keys = ['防伪码', '产品码', 'anti_fake_code', 'code', 'Code', 'CODE'];
  for (const key of keys) {
    const value = String(row[key] ?? '').trim();
    if (value) return value;
  }
  return String(Object.values(row)[0] ?? '').trim();
}
async function handleImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const rows = await parseImportFile(file);
    importedCodes.value = Array.from(new Set(rows.map(pickCodeFromRow).filter(Boolean)));
    if (!importedCodes.value.length) return Message.warning('导入文件中没有识别到防伪码列');
    Message.success(`已导入 ${importedCodes.value.length} 个防伪码`);
    openBatchEdit('import');
  } catch (error: any) {
    Message.error(error?.message || '导入失败，请确认文件格式');
  }
}
function batchFilters() {
  const filters: Record<string, any> = cleanObject({ ...query });
  delete filters.page;
  delete filters.pageSize;
  return filters;
}
async function submitBatchEdit() {
  const patch = cleanObject({ ...batchPatch });
  delete patch.partner_ref;
  if (batchAntiChannelingApply.value) patch.anti_channeling_enabled = batchAntiChannelingEnabled.value;
  if (clearExpiry.value) patch.expires_at = null;
  if (!Object.keys(patch).length) return Message.warning('请至少填写一个要修改的字段');
  const payload: any = { patch, limit: 50000 };
  if (batchEditMode.value === 'selected') {
    if (!requireSelected()) return;
    payload.codes = selectedKeys.value;
  } else if (batchEditMode.value === 'import') {
    if (!importedCodes.value.length) return Message.warning('请先导入防伪码');
    payload.codes = importedCodes.value;
  } else {
    payload.filters = batchFilters();
    if (!Object.keys(payload.filters).length) {
      Message.warning('请先设置筛选条件，系统不会默认全量批改。');
      return;
    }
  }
  try {
    await MessageBox.confirm(`确认批量修改 ${batchEditMode.value === 'filter' ? (pagination.total || '当前筛选') : (payload.codes?.length || 0)} 个防伪码？`, '事务级批量修改确认', { type: 'warning' });
  } catch {
    return;
  }
  batchUpdating.value = true;
  try {
    const res = await codesApi.batchUpdate(payload);
    Message.success(`批量修改完成：命中 ${res?.matched ?? '-'} 条，实际更新 ${res?.affected ?? '-'} 条`);
    batchEditVisible.value = false;
    resetBatchPatch();
    await load(true);
  } catch (error: any) {
    Message.error(error?.message || '批量修改失败');
  } finally {
    batchUpdating.value = false;
  }
}

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return Boolean(el.isContentEditable || ['input', 'textarea', 'select'].includes(tag) || el.closest('.el-dialog, .el-drawer, .el-message-box'));
}

function handleTableHotkeys(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return;
  if (generateVisible.value || qrcodeVisible.value || lowCodeVisible.value || qrExportVisible.value || batchEditVisible.value) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'a') {
    event.preventDefault();
    tableRef.value?.toggleAllSelection?.();
    return;
  }
  if (key === 'delete' || key === 'backspace') {
    if (!selectedKeys.value.length) return;
    event.preventDefault();
    void batchDelete();
    return;
  }
  if (key === 'enter') {
    if (!selectedKeys.value.length || !canActivate.value) return;
    event.preventDefault();
    openBatchEdit('selected');
  }
}

onMounted(() => { void loadProductOptions(); void loadPartnerOptions(); void loadBoxOptions(); void loadManufacturerOptions(); void load(true); window.addEventListener('keydown', handleTableHotkeys); });
onBeforeUnmount(() => window.removeEventListener('keydown', handleTableHotkeys));
</script>

<style scoped>
.hidden-file { display: none; }
.batch-edit-form { margin-top: 16px; }
.batch-edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.batch-edit-tip { margin-top: 8px; color: var(--text-2); font-size: 13px; line-height: 1.6; }
.anti-channeling-toggle-field { display: flex; align-items: center; gap: 16px; min-height: 32px; flex-wrap: wrap; }
.qr-export-form { margin-top: 16px; }
.qr-export-tip { padding: 12px 14px; border: 1px solid rgba(207, 224, 255, .9); border-radius: 12px; background: rgba(248, 251, 255, .8); color: var(--text-2); line-height: 1.7; }
.table-shortcut-hint { color: var(--text-3); font-size: 12px; margin-right: 8px; }
.responsive-table-wrap :deep(.el-table__header .el-table-column--selection) { cursor: pointer; }
.code-id-cell { display: flex; align-items: center; gap: 3px; font-variant-numeric: tabular-nums; }
.code-value-cell { display: flex; align-items: center; gap: 4px; min-width: 0; }
.code-value-cell > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-code-button,
.copy-code-id-button { width: 24px; height: 24px; min-width: 24px; color: var(--text-3); }
.copy-code-button:hover,
.copy-code-id-button:hover { color: var(--primary); }
</style>
