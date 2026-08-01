<template>
  <IosPage class="anti-channeling-page">
    <IosPageHero class="anti-channeling-hero" eyebrow="Channel Control Center" title="企业防窜预警" description="以唯一码、地理围栏、全链路扫码和异常行为分析为核心，实时捕捉跨区域窜货、异地扫码、IP 高频和设备风险。">
      <template #actions>
        <el-button :loading="loading" @click="loadAll">
          <template #icon><AppIcon name="refresh" /></template>
          刷新
        </el-button>
        <el-button v-if="canManage" @click="manualVisible = true">
          <template #icon><AppIcon name="edit" /></template>
          人工登记
        </el-button>
        <el-button type="primary" @click="openRules">
          <template #icon><AppIcon name="setting" /></template>
          预警规则
        </el-button>
        <el-button v-if="canManage" type="success" @click="batchAckRows">批量确认</el-button>
        <el-popover width="340" trigger="click">
          <template #reference><el-button>编码轨迹</el-button></template>
          <div>
            <p style="font-size:13px;color:#666;margin-bottom:8px">查询防伪码的完整扫码轨迹</p>
            <el-input v-model="trajectoryCode" placeholder="输入防伪码" size="small" style="margin-bottom:8px" clearable />
            <el-button type="primary" size="small" :loading="trajectoryLoading" @click="queryTrajectory" style="width:100%">查询轨迹</el-button>
          </div>
        </el-popover>
      </template>
    </IosPageHero>

    <AiTraceAutomationPanel v-if="AI_FEATURE_ENABLED" module-key="anti-channeling" compact @completed="loadAll" />

    <IosStatGrid>
      <IosStatCard v-for="item in stats" :key="item.key" :icon="item.icon" :value="overview[item.key] ?? 0" :label="item.label" />
    </IosStatGrid>

    <div class="warning-insight-grid">
      <div class="warning-insight-card danger">
        <span>高危待闭环</span>
        <strong>{{ urgentPendingCount }}</strong>
        <small>严重/紧急且仍未关闭</small>
      </div>
      <div class="warning-insight-card">
        <span>重点异常区域</span>
        <strong>{{ topArea.name || '-' }}</strong>
        <small>{{ topArea.count || 0 }} 条异常</small>
      </div>
      <div class="warning-insight-card">
        <span>重点责任主体</span>
        <strong>{{ topDealer.name || '-' }}</strong>
        <small>{{ topDealer.count || 0 }} 条线索</small>
      </div>
    </div>

    <ChannelingMap :hotspots="mapHotspots" :flows="mapFlows" />

    <el-row :gutter="16" class="channeling-grid">
      <el-col :xs="24" :lg="24">
        <el-card shadow="never" class="table-card glass-card warning-ledger-card">
          <template #header>
            <div class="card-head warning-card-head">
              <div>
                <strong>异常预警台账</strong>
                <small>自动留存异常编码、异常位置、扫码时间、责任线索和授权区域。</small>
              </div>
              <div class="warning-head-tags">
                <el-tag type="danger" effect="light">待处理 {{ overview.pending || 0 }}</el-tag>
                <el-tag type="warning" effect="plain">高危 {{ overview.severe || 0 }}</el-tag>
              </div>
            </div>
          </template>

          <el-form :model="query" inline class="search-form warning-search-form" @submit.prevent>
            <el-form-item label="关键词">
              <el-input v-model="query.keyword" clearable placeholder="编码 / 发货单 / 主体 / 位置" @keyup.enter="searchAlerts" />
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="query.alert_type" clearable style="width: 180px">
                <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="级别">
              <el-select v-model="query.severity" clearable style="width: 120px">
                <el-option label="低" :value="1" />
                <el-option label="中" :value="2" />
                <el-option label="高" :value="3" />
                <el-option label="严重" :value="4" />
                <el-option label="紧急" :value="5" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="query.status" clearable style="width: 130px">
                <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-space>
                <el-button type="primary" :loading="loading" @click="searchAlerts">查询</el-button>
                <el-button @click="resetQuery">重置</el-button>
              </el-space>
            </el-form-item>
          </el-form>

          <div class="warning-table-panel">
            <div class="warning-table-toolbar">
              <div class="warning-table-tools-left">
                <el-tooltip content="列表视图" placement="top">
                  <el-button circle class="table-tool-btn is-active"><AppIcon name="dashboard" :size="16" /></el-button>
                </el-tooltip>
                <el-tooltip content="编码轨迹" placement="top">
                  <el-button circle class="table-tool-btn" @click="trajectoryVisible = true"><AppIcon name="code" :size="16" /></el-button>
                </el-tooltip>
                <el-tooltip content="高危预警" placement="top">
                  <el-button circle class="table-tool-btn danger"><AppIcon name="risk" :size="16" /></el-button>
                </el-tooltip>
                <el-tooltip v-if="canManage" content="批量确认" placement="top">
                  <el-button circle class="table-tool-btn warning" @click="batchAckRows"><AppIcon name="shield" :size="16" /></el-button>
                </el-tooltip>
              </div>
              <div class="warning-table-title">
                <strong>防窜预警列表</strong>
                <small>共 {{ pagination.total }} 条 · 当前 {{ alerts.length }} 条</small>
              </div>
              <div class="warning-table-tools-right">
                <el-tooltip content="刷新" placement="top">
                  <el-button circle class="table-tool-btn" :loading="loading" @click="loadAll"><AppIcon name="refresh" :size="16" /></el-button>
                </el-tooltip>
                <el-tooltip content="预警规则" placement="top">
                  <el-button circle class="table-tool-btn" @click="openRules"><AppIcon name="setting" :size="16" /></el-button>
                </el-tooltip>
                <el-tooltip content="导出当前列表" placement="top">
                  <el-button circle class="table-tool-btn" :loading="exporting" @click="exportAlerts"><AppIcon name="download" :size="16" /></el-button>
                </el-tooltip>
                <el-tooltip v-if="canManage" content="清空选中或筛选结果" placement="top">
                  <el-button circle class="table-tool-btn danger" :loading="clearing" @click="clearAlertRows"><AppIcon name="delete" :size="16" /></el-button>
                </el-tooltip>
                <el-tooltip v-if="canManage" content="人工登记" placement="top">
                  <el-button circle type="primary" class="table-tool-btn primary" @click="manualVisible = true"><AppIcon name="plus" :size="16" /></el-button>
                </el-tooltip>
              </div>
            </div>

            <div class="anti-alert-table-wrap responsive-table-wrap">
              <el-table
                ref="warningTableRef"
                class="anti-alert-table warning-ledger-table"
                :data="alerts"
                v-loading="loading"
                row-key="id"
                size="small"
                border
                stripe
                style="width: 100%"
                :row-class-name="alertRowClassName"
                :scrollbar-always-on="true"
                table-layout="fixed"
                @selection-change="onAlertSelectionChange"
              >
                <el-table-column type="selection" width="52" align="center" />
                <el-table-column label="预警信息" min-width="260" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="alert-main-cell ledger-alert-cell">
                      <div class="alert-main-head">
                        <el-tag :type="severityTag(row.severity)" size="small" effect="light">{{ severityText(row.severity) }}</el-tag>
                        <el-tag :type="statusTag(row.status)" size="small" effect="plain">{{ statusText(row.status) }}</el-tag>
                        <strong>{{ row.title || typeText(row.alert_type) }}</strong>
                      </div>
                      <div class="alert-meta">
                        <span>{{ row.alert_no || '-' }}</span>
                        <span>{{ codeText(row) }}</span>
                      </div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="产品 / 批次" min-width="190" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="business-cell-strong">
                      <strong>{{ row.product_name || row.product_code || row.product_id || '-' }}</strong>
                      <span>{{ productBatchText(row) }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="责任主体" min-width="180" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="plain-ellipsis strong-text">{{ responsibleText(row) }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="授权区域" min-width="190" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="region-pill from">{{ locationText(row, 'authorized') }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="扫码区域" min-width="210" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="region-pill to">{{ locationText(row, 'actual') }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="异常摘要" min-width="230" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="risk-summary ledger-summary">{{ rowRiskSummary(row) }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="级别" width="120" align="center">
                  <template #default="{ row }">
                    <span class="risk-level-dot" :class="riskLevelClass(row)">L{{ Number(row.severity) || 2 }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="126" align="center">
                  <template #default="{ row }">
                    <el-tag :type="statusTag(row.status)" effect="light" round>{{ statusText(row.status) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="最新时间" width="170">
                  <template #default="{ row }">{{ fmtTime(row.last_seen_at || row.scan_time || row.created_at) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="168" fixed="right" align="center" class-name="ledger-action-column ios27-operation-column" label-class-name="ledger-action-column-head ios27-operation-column-head">
                  <template #default="{ row }">
                    <div class="ledger-action-buttons">
                      <el-tooltip content="详情" placement="top">
                        <el-button circle size="small" class="row-icon-btn" @click="openDetail(row)"><AppIcon name="code" :size="14" /></el-button>
                      </el-tooltip>
                      <el-tooltip v-if="canManage && Number(row.status) === 0" content="确认" placement="top">
                        <el-button circle size="small" class="row-icon-btn warning" @click="ack(row)"><AppIcon name="shield" :size="14" /></el-button>
                      </el-tooltip>
                      <el-tooltip v-if="canManage && Number(row.status) < 3" content="处理" placement="top">
                        <el-button circle size="small" class="row-icon-btn primary" @click="processRow(row)"><AppIcon name="edit" :size="14" /></el-button>
                      </el-tooltip>
                      <el-dropdown v-if="canManage && Number(row.status) < 3" trigger="click">
                        <el-button circle size="small" class="row-icon-btn"><AppIcon name="menu" :size="14" /></el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item @click="close(row)">关闭预警</el-dropdown-item>
                            <el-dropdown-item @click="falsePositive(row)">标记误报</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <div class="pagination-bar warning-pagination-bar">
            <el-pagination
              :current-page="pagination.page"
              :page-size="pagination.pageSize"
              :total="pagination.total"
              :page-sizes="[10,20,50,100]"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="(page:number)=>{ pagination.page = page; loadAlerts(); }"
              @size-change="(size:number)=>{ pagination.pageSize = size; pagination.page = 1; loadAlerts(); }"
            />
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="24" class="warning-side-col">
        <div class="warning-side-layout">
        <el-card shadow="never" class="table-card glass-card rank-card uapi-card">
          <template #header>
            <div class="card-head">
              <div>
                <strong>智能防窜环境</strong>
                <small>公网位置、天气、节日与每日一言辅助判断区域异常。</small>
              </div>
              <el-button text size="small" :loading="uapiLoading" @click="loadUapiContext">刷新</el-button>
            </div>
          </template>
          <el-skeleton v-if="uapiLoading && !uapiContext" :rows="4" animated />
          <template v-else>
            <el-alert v-if="uapiError" type="warning" :closable="false" show-icon class="uapi-error">{{ uapiError }}</el-alert>
            <div class="uapi-location">
              <span>当前公网位置</span>
              <strong>{{ uapiLocationText }}</strong>
              <small v-if="uapiContext?.myip?.ip">IP：{{ uapiContext.myip.ip }} <template v-if="uapiContext.myip.isp">· {{ uapiContext.myip.isp }}</template></small>
            </div>
            <div class="uapi-weather">
              <div>
                <span>{{ uapiWeather?.city || uapiContext?.myip?.city || '本地天气' }}</span>
                <strong>{{ uapiWeather?.weather || '-' }}</strong>
              </div>
              <b>{{ uapiWeather?.temperature ?? '-' }}<small v-if="uapiWeather?.temperature !== undefined">℃</small></b>
              <small>{{ [uapiWeather?.wind_direction, uapiWeather?.wind_power, uapiWeather?.humidity ? `湿度${uapiWeather.humidity}` : ''].filter(Boolean).join(' · ') || '天气数据待更新' }}</small>
            </div>
            <div class="uapi-section">
              <div class="uapi-section-title">最近节日</div>
              <div v-for="item in uapiHolidayItems" :key="`${item.date}-${item.name}`" class="uapi-holiday-row">
                <span>{{ compactDate(item.date) }}</span>
                <strong>{{ item.name || item.type || '节日/日历' }}</strong>
              </div>
              <el-empty v-if="!uapiHolidayItems.length" description="暂无节日日历" :image-size="48" />
            </div>
            <blockquote v-if="uapiSaying?.content" class="uapi-saying">
              “{{ uapiSaying.content }}”
              <small v-if="uapiSaying.author || uapiSaying.from">—— {{ [uapiSaying.author, uapiSaying.from].filter(Boolean).join(' · ') }}</small>
            </blockquote>
          </template>
        </el-card>
        <el-card shadow="never" class="table-card glass-card rank-card">
          <template #header><strong>高频窜货区域</strong></template>
          <div v-for="item in overview.area_rank || []" :key="item.name" class="rank-row">
            <span>{{ item.name }}</span><strong>{{ item.count }}</strong>
          </div>
          <el-empty v-if="!(overview.area_rank || []).length" description="暂无异常区域" />
        </el-card>
        <el-card shadow="never" class="table-card glass-card rank-card">
          <template #header><strong>重点违规经销商</strong></template>
          <div v-for="item in overview.dealer_rank || []" :key="item.name" class="rank-row">
            <span>{{ item.name }}</span><strong>{{ item.count }}</strong>
          </div>
          <el-empty v-if="!(overview.dealer_rank || []).length" description="暂无异常经销商" />
        </el-card>
        <el-card shadow="never" class="table-card glass-card rank-card">
          <template #header><strong>预警类型分布</strong></template>
          <div v-for="item in overview.type_rank || []" :key="item.name" class="rank-row">
            <span>{{ typeText(item.name) }}</span><strong>{{ item.count }}</strong>
          </div>
          <el-empty v-if="!(overview.type_rank || []).length" description="暂无预警数据" />
        </el-card>
        <el-card shadow="never" class="table-card glass-card rank-card">
          <template #header><strong>代理商风险指数</strong></template>
          <div v-for="item in agentRisk.slice(0, 8)" :key="item.agent_id" class="rank-row">
            <span>
              <el-tag :type="item.risk_level === 'danger' ? 'danger' : item.risk_level === 'warning' ? 'warning' : 'info'" size="small" style="margin-right:6px">{{ item.risk_score }}</el-tag>
              {{ item.agent_name || '经销商#' + item.agent_id }}
            </span>
            <strong>{{ item.total_alerts }}</strong>
          </div>
          <el-empty v-if="!agentRisk.length" description="暂无风险数据" />
        </el-card>
        <el-card shadow="never" class="table-card glass-card rank-card analysis-card">
          <template #header><strong>大数据分析</strong></template>
          <div class="analysis-kpis">
            <div><strong>{{ analytics.estimated_precision || 0 }}%</strong><span>闭环有效率</span></div>
            <div><strong>{{ analytics.severe || 0 }}</strong><span>高危样本</span></div>
            <div><strong>{{ analytics.closed || 0 }}</strong><span>已闭环</span></div>
          </div>
          <h4 class="mini-title">高频异常编码</h4>
          <div v-for="item in analytics.code_rank || []" :key="item.name" class="rank-row compact">
            <span>{{ item.name }}</span><strong>{{ item.count }}</strong>
          </div>
          <el-empty v-if="!(analytics.code_rank || []).length" description="暂无异常编码" />
          <h4 class="mini-title">近 7 日趋势</h4>
          <div class="trend-strip">
            <span v-for="item in lastTrend" :key="item.date" :title="`${item.date}: ${item.count}`">{{ item.count }}</span>
          </div>
        </el-card>
        </div>
      </el-col>
    </el-row>

    <el-drawer v-model="detailVisible" title="防窜预警详情" size="min(680px, 100%)" append-to-body :lock-scroll="true">
      <template v-if="detail">
        <el-alert :type="severityTag(detail.severity)" show-icon :closable="false" class="detail-alert">
          {{ detail.title || typeText(detail.alert_type) }}
        </el-alert>
        <DetailDescriptions :data="detailItems" :column="1" />
        <h3 class="drawer-subtitle">异常证据</h3>
        <pre class="json-box">{{ prettyJson(detail.evidence) }}</pre>
        <h3 class="drawer-subtitle">定位对比</h3>
        <div class="location-compare">
          <div class="location-card auth-loc">
            <div class="loc-label">授权区域</div>
            <div class="loc-name">{{ detail.authorized_region || [detail.authorized_province, detail.authorized_city].filter(Boolean).join(' / ') || '-' }}</div>
            <div class="loc-coord">{{ detail.authorized_province || '--' }} {{ detail.authorized_city || '' }}</div>
          </div>
          <div class="location-arrow">→</div>
          <div class="location-card actual-loc">
            <div class="loc-label">异常位置</div>
            <div class="loc-name">{{ detail.actual_location || [detail.actual_province, detail.actual_city].filter(Boolean).join(' / ') || '-' }}</div>
            <div class="loc-coord">{{ detail.actual_province || '--' }} {{ detail.actual_city || '' }}</div>
          </div>
          <div v-if="detail.evidence?.distance_km" class="loc-distance">
            直线距离约 <strong>{{ detail.evidence.distance_km }}</strong> 公里
            <el-tag v-if="detail.evidence.cross_province" type="danger" size="small" effect="dark" style="margin-left:8px">跨省</el-tag>
          </div>
        </div>
        <h3 class="drawer-subtitle">通知记录</h3>
        <div class="responsive-table-wrap">
          <el-table :data="detail.notifications || []" size="small" border>
            <el-table-column label="渠道" prop="channel" width="90" />
            <el-table-column label="接收人" prop="receiver" min-width="160" />
            <el-table-column label="状态" width="90"><template #default="{ row }">{{ Number(row.status) === 1 ? '已生成' : '待发送' }}</template></el-table-column>
            <el-table-column label="时间" width="160"><template #default="{ row }">{{ fmtTime(row.sent_at || row.created_at) }}</template></el-table-column>
          </el-table>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="manualVisible" title="人工稽查登记" width="760px" append-to-body align-center :lock-scroll="true">
      <el-alert type="warning" show-icon :closable="false" class="detail-alert">
        用于线下稽查、经销商反馈、APP/短信外部线索补录，登记后会进入异常台账并生成推送记录。
      </el-alert>
      <el-form :model="manualForm" label-width="120px" class="manual-form">
        <el-row :gutter="12">
          <el-col :xs="24" :sm="12">
            <el-form-item label="预警类型">
              <el-select v-model="manualForm.alert_type" style="width: 100%">
                <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="严重级别"><el-input-number v-model="manualForm.severity" :min="1" :max="5" style="width: 100%" /></el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="异常编码"><el-input v-model="manualForm.code" clearable placeholder="唯一码/防伪码" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="箱号"><el-input v-model="manualForm.box_no" clearable placeholder="箱码/箱号" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="发货单号"><el-input v-model="manualForm.shipment_no" clearable placeholder="发货单号" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="责任主体"><el-input v-model="manualForm.agent_name" clearable placeholder="代理商/公司/渠道名称" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="授权区域"><el-input v-model="manualForm.authorized_region" clearable placeholder="如：广东省 / 广州市" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="异常位置"><el-input v-model="manualForm.actual_location" clearable placeholder="如：广东省深圳市" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="manualForm.remark" type="textarea" :rows="3" placeholder="稽查说明、证据编号、现场情况" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="manualVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submitManualAlert">提交登记</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rulesVisible" title="防窜预警规则" width="900px" class="md-auto-dialog" append-to-body align-center :lock-scroll="true">
      <div class="responsive-table-wrap">
        <el-table :data="rules" size="small" border>
        <el-table-column label="启用" width="80"><template #default="{ row }"><el-switch v-model="row.enabled" :disabled="!canManage" @change="saveRule(row)" /></template></el-table-column>
        <el-table-column label="规则" min-width="220">
          <template #default="{ row }">
            <strong>{{ row.rule_name }}</strong>
            <p class="rule-desc">{{ row.description }}</p>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="150"><template #default="{ row }"><el-input-number v-model="row.severity" :min="1" :max="5" size="small" :disabled="!canManage" @change="saveRule(row)" /></template></el-table-column>
        <el-table-column label="阈值" width="150"><template #default="{ row }"><el-input-number v-model="row.threshold" :min="1" size="small" :disabled="!canManage" @change="saveRule(row)" /></template></el-table-column>
        <el-table-column label="窗口/秒" width="160"><template #default="{ row }"><el-input-number v-model="row.window_seconds" :min="10" size="small" :disabled="!canManage" @change="saveRule(row)" /></template></el-table-column>
        <el-table-column label="通知" width="190">
          <template #default="{ row }">
            <el-select v-model="row.notify_channels" multiple collapse-tags size="small" :disabled="!canManage" @change="saveRule(row)">
              <el-option label="系统弹窗" value="system" />
              <el-option label="APP推送" value="app" />
              <el-option label="短信" value="sms" />
            </el-select>
          </template>
        </el-table-column>
        </el-table>
      </div>
      <template #footer><el-button @click="rulesVisible = false">关闭</el-button></template>
    </el-dialog>

    <el-dialog v-model="trajectoryVisible" title="编码扫码轨迹" width="800px" class="md-auto-dialog" destroy-on-close>
      <div v-if="trajectory">
        <div style="display:flex;gap:24px;margin-bottom:16px;flex-wrap:wrap">
          <div class="trajectory-kpi"><span>编码</span><strong>{{ trajectory.code }}</strong></div>
          <div class="trajectory-kpi"><span>扫码次数</span><strong>{{ trajectory.query_count }}</strong></div>
          <div class="trajectory-kpi"><span>预警次数</span><strong>{{ trajectory.alert_count }}</strong></div>
          <div class="trajectory-kpi"><span>出现区域</span><strong>{{ trajectory.region_count }}</strong></div>
        </div>
        <div v-if="trajectory.unique_regions?.length" style="margin-bottom:12px">
          <el-tag v-for="r in trajectory.unique_regions" :key="r" type="info" style="margin:2px 4px" size="small">{{ r }}</el-tag>
        </div>
        <el-timeline>
          <el-timeline-item
            v-for="(item, idx) in trajectory.timeline"
            :key="idx"
            :type="item.type === 'alert' ? 'danger' : 'primary'"
            :timestamp="item.time"
            placement="top"
          >
            <template v-if="item.type === 'query'">
              <span style="font-size:13px">{{ item.location || '未知位置' }}</span>
              <span v-if="item.ip" style="color:#999;font-size:12px;margin-left:8px">IP: {{ item.ip }}</span>
              <div style="font-size:12px;color:#909399">渠道: {{ item.channel || '-' }} · 结果: {{ item.result || '-' }}</div>
            </template>
            <template v-else>
              <el-tag type="danger" size="small">{{ item.alert_type }}</el-tag>
              <span style="font-size:13px;margin-left:8px">{{ item.title }}</span>
              <div style="font-size:12px;color:#909399">
                {{ item.authorized_region }} → {{ item.actual_location }}
                <el-tag :type="Number(item.severity) >= 4 ? 'danger' : 'warning'" size="small" style="margin-left:6px">L{{ item.severity }}</el-tag>
              </div>
            </template>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-if="!trajectory.timeline?.length" description="暂无轨迹数据" />
      </div>
    </el-dialog>

  </IosPage>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElMessage as Message, ElMessageBox as MessageBox } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import AiTraceAutomationPanel from '@/components/AiTraceAutomationPanel.vue';
import { AI_FEATURE_ENABLED } from '@/config/features';
import DetailDescriptions from '@/components/DetailDescriptions.vue';
import ChannelingMap from '@/components/ChannelingMap.vue';
import { IosPage, IosPageHero, IosStatCard, IosStatGrid } from '@/components/ios27';
import { antiChannelingApi, exportApi } from '@/api/resources';
import { loadUapiPanelContext, type UapiHolidayItem, type UapiPanelContext } from '@/api/uapi';
import { fmtTime } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const warningTableRef = ref<any>(null);
let warningTableLayoutFrame = 0;

async function refreshWarningTableLayout() {
  await nextTick();
  if (warningTableLayoutFrame) window.cancelAnimationFrame(warningTableLayoutFrame);
  warningTableLayoutFrame = window.requestAnimationFrame(() => {
    warningTableRef.value?.doLayout?.();
    warningTableLayoutFrame = 0;
  });
}

const loading = ref(false);
const rulesVisible = ref(false);
const detailVisible = ref(false);
const manualVisible = ref(false);
const trajectoryVisible = ref(false);
const overview = shallowRef<Record<string, any>>({});
const analytics = shallowRef<Record<string, any>>({});
const alerts = shallowRef<any[]>([]);
const selectedAlertRows = shallowRef<any[]>([]);
const mapDataset = shallowRef<any>({ hotspots: [], flows: [] });
const rules = shallowRef<any[]>([]);
const detail = shallowRef<any | null>(null);
const agentRisk = shallowRef<any[]>([]);
const trajectory = shallowRef<any | null>(null);
const uapiContext = shallowRef<UapiPanelContext | null>(null);
const uapiLoading = ref(false);
const uapiError = ref('');
const trajectoryLoading = ref(false);
const exporting = ref(false);
const clearing = ref(false);
const trajectoryCode = ref('');
const canManage = computed(() => auth.hasPermission('anti-channeling:manage'));
const query = reactive<any>({ page: 1, pageSize: 20, keyword: '', alert_type: '', severity: '', status: '' });
const pagination = reactive({ page: 1, pageSize: 20, total: 0 });
const manualForm = reactive<any>({ alert_type: 'geo_mismatch', severity: 3, code: '', box_no: '', shipment_no: '', agent_name: '', authorized_region: '', actual_location: '', remark: '' });

const stats = [
  { key: 'total', label: '累计预警', icon: 'risk' },
  { key: 'pending', label: '待处理', icon: 'message' },
  { key: 'severe', label: '高危预警', icon: 'shield' },
  { key: 'today', label: '今日新增', icon: 'dashboard' },
];
const typeOptions = [
  { label: '扫码位置与授权区域不符', value: 'geo_mismatch' },
  { label: '扫码位置待核验', value: 'location_unverified' },
  { label: '同一编码短时间异地扫码', value: 'same_code_multi_region' },
  { label: '同一 IP 短时高频扫码', value: 'ip_high_frequency' },
  { label: '越狱/Root/自动化设备访问', value: 'device_risk' },
  { label: '经销商跨区域调拨/出库异常', value: 'shipment_region_mismatch' },
  { label: '无效码/假码扫码', value: 'fake_code_scan' },
  { label: '代理商多区域集中异常', value: 'agent_cross_boundary' },
  { label: '编码轨迹异常跳跃', value: 'code_trajectory_anomaly' },
];
const statusOptions = [
  { label: '新预警', value: 0 },
  { label: '已确认', value: 1 },
  { label: '处理中', value: 2 },
  { label: '已关闭', value: 3 },
  { label: '误报', value: 4 },
];

const urgentPendingCount = computed(() => (alerts.value || []).filter((row: any) => Number(row.status) < 3 && Number(row.severity) >= 4).length);
const topArea = computed(() => (overview.value.area_rank || [])[0] || {});
const topDealer = computed(() => (overview.value.dealer_rank || [])[0] || {});
const lastTrend = computed(() => (analytics.value.trend || []).slice(-7));
const uapiWeather = computed(() => uapiContext.value?.weather || null);
const uapiSaying = computed(() => uapiContext.value?.saying || null);
const uapiLocationText = computed(() => {
  const info = uapiContext.value?.myip;
  if (!info) return '等待获取';
  return info.location || [info.province, info.city, info.district].filter(Boolean).join('') || '位置未知';
});
const uapiHolidayItems = computed<UapiHolidayItem[]>(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const holidayTime = (value?: string) => {
    const text = String(value || '').slice(0, 10);
    const time = new Date(`${text}T00:00:00`).getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  return [...(uapiContext.value?.holiday || [])]
    .filter((item) => {
      const label = String(item.name || item.type || '').trim();
      if (!label || label.includes('班')) return false;
      const time = holidayTime(item.date);
      if (!time || time < today.getTime()) return false;
      return item.holiday || /节|假|元旦|春节|除夕|清明|劳动|端午|中秋|国庆/i.test(label);
    })
    .sort((a, b) => holidayTime(a.date) - holidayTime(b.date))
    .slice(0, 4);
});

function cleanRegionText(value: any) {
  return String(value ?? '').trim().replace(/\s+/g, '').replace(/[｜|／>]+/g, '/');
}
function compactRegion(value: any) {
  return cleanRegionText(value).replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|自治州|地区|省|市|盟|州|区|县|旗|新区)$/g, '');
}
function cleanRegionPart(value: any) {
  return String(value ?? '').trim().replace(/[\s,，;；|｜/／>\-]+/g, '').replace(/^(中国|中华人民共和国)/, '');
}
function normalizeProvinceName(value: any) {
  const text = cleanRegionPart(value);
  if (!text) return '';
  if (/(省|自治区|特别行政区|市)$/.test(text)) return text;
  const special: Record<string, string> = { 内蒙古: '内蒙古自治区', 广西: '广西壮族自治区', 宁夏: '宁夏回族自治区', 新疆: '新疆维吾尔自治区', 西藏: '西藏自治区', 香港: '香港特别行政区', 澳门: '澳门特别行政区', 北京: '北京市', 上海: '上海市', 天津: '天津市', 重庆: '重庆市' };
  return special[text] || `${text}省`;
}
function normalizeCityName(value: any) {
  const text = cleanRegionPart(value);
  if (!text) return '';
  if (/(市|地区|盟|自治州|州)$/.test(text)) return text;
  return `${text}市`;
}
function normalizeDistrictName(value: any) {
  const text = cleanRegionPart(value).replace(/(.{2,})\1$/u, '$1');
  if (!text) return '';
  return /(区|县|市|旗|新区|林区|特区)$/.test(text) ? text : `${text}区`;
}
function sameRegionPart(a: any, b: any) {
  const aa = compactRegion(a);
  const bb = compactRegion(b);
  return Boolean(aa && bb && (aa === bb || aa.includes(bb) || bb.includes(aa)));
}
function parseRegionText(value: any) {
  const text = cleanRegionText(value);
  if (!text) return { province: '', city: '', district: '' };
  const compactText = cleanRegionPart(text);
  const municipality = compactText.match(/(北京|上海|天津|重庆)市?/);
  const province = compactText.match(/([一-龥]{2,12}(?:省|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区))/);
  const provinceName = province?.[1] || (municipality ? `${municipality[1]}市` : '');
  const citySource = provinceName ? compactText.replace(provinceName, '') : compactText;
  const city = citySource.match(/([一-龥]{2,12}(?:市|地区|盟|自治州|州))/);
  const cityName = city?.[1] || (municipality ? `${municipality[1]}市` : '');
  const districtSource = cityName ? citySource.replace(cityName, '') : citySource;
  const district = districtSource.match(/([一-龥]{2,12}(?:区|县|市|旗|新区|林区|特区))/);
  let districtName = district?.[1] || '';
  if (!districtName && provinceName && cityName) {
    const tail = compactText.replace(provinceName, '').replace(cityName, '').replace(/(.{2,})\1$/u, '$1');
    if (tail && !sameRegionPart(tail, provinceName) && !sameRegionPart(tail, cityName)) districtName = normalizeDistrictName(tail);
  }
  return { province: provinceName, city: cityName, district: districtName };
}
function formatRegionText(value: any, provinceValue?: any, cityValue?: any, districtValue?: any) {
  const parsed = parseRegionText(value);
  const province = parsed.province || provinceValue;
  const city = parsed.city || cityValue;
  let district = parsed.district || districtValue;
  if (!district && province && city) {
    const tail = cleanRegionPart(value)
      .replace(compactRegion(province), '')
      .replace(compactRegion(city), '')
      .replace(/(.{2,})\1$/u, '$1');
    if (tail && !sameRegionPart(tail, province) && !sameRegionPart(tail, city)) district = normalizeDistrictName(tail);
  }
  const parts = [normalizeProvinceName(province), normalizeCityName(city), normalizeDistrictName(district)]
    .filter((item, index, arr) => item && arr.findIndex((other) => sameRegionPart(other, item)) === index);
  return parts.join('') || cleanRegionText(value) || [provinceValue, cityValue].filter(Boolean).join(' / ') || '-';
}
function numberOrUndefined(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
function actualLngLat(row: any) {
  const evidence = evidenceOf(row);
  return { lng: numberOrUndefined(evidence.longitude ?? evidence.lng), lat: numberOrUndefined(evidence.latitude ?? evidence.lat) };
}
function normalizedRegionFromAlert(row: any, type: 'actual' | 'authorized') {
  const evidence = evidenceOf(row);
  const fallback = type === 'actual'
    ? parseRegionText(row.actual_location)
    : parseRegionText(row.authorized_region);
  const province = cleanRegionText(type === 'actual' ? row.actual_province || fallback.province : row.authorized_province || fallback.province);
  const city = cleanRegionText(type === 'actual' ? row.actual_city || fallback.city : row.authorized_city || fallback.city);
  const districtSource = type === 'actual'
    ? row.actual_district ?? evidence.actual_district ?? evidence.district ?? evidence.county ?? evidence.area ?? fallback.district
    : row.authorized_district ?? evidence.authorized_district ?? fallback.district;
  const district = cleanRegionText(districtSource);
  const location = type === 'actual' ? row.actual_location : row.authorized_region;
  const label = formatRegionText(location, province, city, district) || [province, city, district].filter(Boolean).join(' / ') || cleanRegionText(location) || '未识别地区';
  const key = [compactRegion(province), compactRegion(city), compactRegion(district)].filter(Boolean).join('/') || compactRegion(location) || label;
  const coord = type === 'actual' ? actualLngLat(row) : { lng: undefined, lat: undefined };
  return { key, label, province, city, district, location, ...coord, evidence };
}

const pageMapHotspots = computed(() => {
  const pointMap = new Map<string, { label: string; province?: string; city?: string; district?: string; location?: string; lng?: number; lat?: number; count: number; isActual: boolean; level?: 'province' | 'city' | 'district' }>();
  const pushPoint = (row: any, type: 'actual' | 'authorized') => {
    const region = normalizedRegionFromAlert(row, type);
    if (!region.key || region.label === '未识别地区') return;
    const mapKey = `${type}|${region.key}`;
    const existing = pointMap.get(mapKey);
    if (existing) {
      existing.count += 1;
      if (!existing.lng && region.lng) existing.lng = region.lng;
      if (!existing.lat && region.lat) existing.lat = region.lat;
    } else {
      pointMap.set(mapKey, {
        label: region.label,
        province: region.province,
        city: region.city,
        district: region.district,
        location: region.location,
        lng: region.lng,
        lat: region.lat,
        count: 1,
        isActual: type === 'actual',
        level: region.district ? 'district' : region.city ? 'city' : 'province',
      });
    }
  };
  for (const a of (alerts.value || [])) {
    pushPoint(a, 'actual');
    pushPoint(a, 'authorized');
  }
  return Array.from(pointMap.values()).sort((a, b) => Number(b.isActual) - Number(a.isActual) || b.count - a.count);
});

function normalizeMapHotspot(item: any) {
  const parsed = parseRegionText(item?.location || item?.label || item?.name);
  const province = cleanRegionText(item?.province || parsed.province);
  const city = cleanRegionText(item?.city || parsed.city);
  const district = cleanRegionText(item?.district || item?.county || item?.area || parsed.district);
  const location = item?.location || item?.label || item?.name || '';
  return {
    ...item,
    province,
    city,
    district,
    location,
    label: formatRegionText(location, province, city, district),
    level: district ? 'district' : city ? 'city' : 'province',
  };
}

const mapHotspots = computed(() => {
  const source = Array.isArray(mapDataset.value?.hotspots) && mapDataset.value.hotspots.length
    ? mapDataset.value.hotspots
    : pageMapHotspots.value;
  return source.map(normalizeMapHotspot);
});

const pageMapFlows = computed(() => {
  const flowMap = new Map<string, { from: string; fromProvince?: string; fromCity?: string; fromDistrict?: string; fromLocation?: string; fromLng?: number; fromLat?: number; to: string; toProvince?: string; toCity?: string; toDistrict?: string; toLocation?: string; toLng?: number; toLat?: number; count: number }>();
  for (const a of (alerts.value || [])) {
    const from = normalizedRegionFromAlert(a, 'authorized');
    const to = normalizedRegionFromAlert(a, 'actual');
    if (!from.key || !to.key || from.key === to.key) continue;
    const key = `${from.key}→${to.key}`;
    const existing = flowMap.get(key);
    if (existing) { existing.count++; }
    else {
      flowMap.set(key, {
        from: from.label,
        fromProvince: from.province,
        fromCity: from.city,
        fromDistrict: from.district,
        fromLocation: from.location,
        to: to.label,
        toProvince: to.province,
        toCity: to.city,
        toDistrict: to.district,
        toLocation: to.location,
        toLng: to.lng,
        toLat: to.lat,
        count: 1,
      });
    }
  }
  return Array.from(flowMap.values()).sort((a, b) => b.count - a.count);
});

function normalizeMapFlow(item: any) {
  const fromParsed = parseRegionText(item?.fromLocation || item?.from || '');
  const toParsed = parseRegionText(item?.toLocation || item?.to || '');
  const fromProvince = cleanRegionText(item?.fromProvince || fromParsed.province);
  const fromCity = cleanRegionText(item?.fromCity || fromParsed.city);
  const fromDistrict = cleanRegionText(item?.fromDistrict || item?.fromCounty || fromParsed.district);
  const toProvince = cleanRegionText(item?.toProvince || toParsed.province);
  const toCity = cleanRegionText(item?.toCity || toParsed.city);
  const toDistrict = cleanRegionText(item?.toDistrict || item?.toCounty || toParsed.district);
  return {
    ...item,
    fromProvince,
    fromCity,
    fromDistrict,
    toProvince,
    toCity,
    toDistrict,
    from: formatRegionText(item?.from || item?.fromLocation, fromProvince, fromCity, fromDistrict),
    to: formatRegionText(item?.to || item?.toLocation, toProvince, toCity, toDistrict),
  };
}

const mapFlows = computed(() => {
  const source = Array.isArray(mapDataset.value?.flows) && mapDataset.value.flows.length
    ? mapDataset.value.flows
    : pageMapFlows.value;
  return source.map(normalizeMapFlow);
});

const detailItems = computed(() => {
  const row = detail.value || {};
  return [
    { label: '预警编号', value: row.alert_no },
    { label: '预警类型', value: typeText(row.alert_type) },
    { label: '严重级别', value: severityText(row.severity) },
    { label: '状态', value: statusText(row.status) },
    { label: '异常编码', value: row.code || row.box_no || row.shipment_no },
    { label: '产品', value: row.product_name || row.product_code || row.product_id },
    { label: '责任线索', value: responsibleText(row) },
    { label: '线索来源', value: evidenceOf(row).responsible_party?.source || evidenceOf(row).latest?.responsible_party?.source },
    { label: '授权区域', value: row.authorized_region || [row.authorized_province, row.authorized_city].filter(Boolean).join(' / ') },
    { label: '异常位置', value: row.actual_location || [row.actual_province, row.actual_city].filter(Boolean).join(' / ') },
    { label: '扫码 IP', value: row.ip },
    { label: '设备 ID', value: row.device_id },
    { label: '扫码时间', value: fmtTime(row.scan_time || row.last_seen_at) },
    { label: '处理结果', value: row.handle_result },
    { label: '备注', value: row.remark },
  ];
});

function typeText(type: string) {
  const map: Record<string, string> = {
    geo_mismatch: '区域不符',
    location_unverified: '位置待核验',
    same_code_multi_region: '多地扫码',
    ip_high_frequency: 'IP高频',
    device_risk: '设备风险',
    shipment_region_mismatch: '调拨异常',
    fake_code_scan: '无效码',
    agent_cross_boundary: '跨区集扫',
    code_trajectory_anomaly: '轨迹异常',
  };
  return map[type] || type;
}
function severityText(value: any) {
  const map: Record<number, string> = { 1: '低', 2: '中', 3: '高', 4: '严重', 5: '紧急' };
  return map[Number(value)] || '中';
}
function severityTag(value: any) {
  const n = Number(value);
  if (n >= 4) return 'danger';
  if (n === 3) return 'warning';
  if (n === 2) return 'primary';
  return 'info';
}
function statusText(value: any) {
  return statusOptions.find((item) => Number(item.value) === Number(value))?.label || '-';
}
function statusTag(value: any) {
  const n = Number(value);
  if (n === 0) return 'danger';
  if (n === 1 || n === 2) return 'warning';
  if (n === 3) return 'success';
  return 'info';
}
function alertRowClassName({ row }: { row: any }) {
  if (Number(row.status) !== 0) return '';
  if (Number(row.severity) >= 4) return 'critical-alert-row';
  return 'pending-alert-row';
}
function prettyJson(value: any) {
  try { return JSON.stringify(value || {}, null, 2); } catch { return String(value || ''); }
}
function evidenceOf(row: any) {
  const raw = row?.evidence || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw && typeof raw === 'object' ? raw : {};
}
function responsibleText(row: any) {
  const evidence = evidenceOf(row);
  const party = evidence.responsible_party || evidence.latest?.responsible_party || {};
  return row?.agent_name || party.name || party.distributor || party.company_name || party.manufacturer_name || (row?.agent_id ? `代理商#${row.agent_id}` : '-');
}
function codeText(row: any) {
  return row?.code || row?.box_no || row?.shipment_no || '-';
}
function productBatchText(row: any) {
  const evidence = evidenceOf(row);
  return row?.batch_no || row?.product_batch_no || evidence.batch_no || evidence.latest?.batch_no || evidence.product?.batch_no || '批次 -';
}
function riskLevelClass(row: any) {
  const level = Number(row?.severity);
  if (level >= 4) return 'danger';
  if (level === 3) return 'warning';
  if (level === 2) return 'primary';
  return 'info';
}
function locationText(row: any, type: 'authorized' | 'actual') {
  return type === 'authorized'
    ? formatRegionText(row.authorized_region, row.authorized_province, row.authorized_city)
    : formatRegionText(row.actual_location, row.actual_province, row.actual_city);
}
function rowRiskSummary(row: any) {
  const evidence = evidenceOf(row);
  const parts = [
    typeText(row.alert_type),
    evidence.distance_km ? `偏离约 ${evidence.distance_km}km` : '',
    evidence.ip_count ? `IP ${evidence.ip_count} 次` : '',
    evidence.scan_count ? `扫码 ${evidence.scan_count} 次` : '',
    row.ip ? `IP ${row.ip}` : '',
  ];
  return parts.filter(Boolean).join(' · ') || row.remark || '-';
}
async function loadOverview() {
  overview.value = await antiChannelingApi.overview();
}
async function loadAnalytics() {
  analytics.value = await antiChannelingApi.analytics({ days: 30 });
}
function mapQueryParams() {
  const { page, pageSize, ...filters } = query;
  return { ...filters, days: 30, limit: 3000 };
}
async function loadMapData() {
  try {
    mapDataset.value = await antiChannelingApi.mapData(mapQueryParams());
  } catch {
    mapDataset.value = { hotspots: [], flows: [] };
  }
}
async function searchAlerts() {
  pagination.page = 1;
  await Promise.all([loadAlerts(), loadMapData()]);
}
async function loadAlerts() {
  loading.value = true;
  try {
    query.page = pagination.page;
    query.pageSize = pagination.pageSize;
    const res = await antiChannelingApi.alerts(query);
    alerts.value = res?.list || [];
    pagination.total = Number(res?.pagination?.total || 0);
    pagination.page = Number(res?.pagination?.page || pagination.page);
    pagination.pageSize = Number(res?.pagination?.pageSize || pagination.pageSize);
  } finally {
    loading.value = false;
    void refreshWarningTableLayout();
  }
}
async function loadRules() {
  const res = await antiChannelingApi.rules();
  rules.value = (res?.list || []).map((item: any) => ({ ...item, notify_channels: Array.isArray(item.notify_channels) ? item.notify_channels : ['system'] }));
}
async function loadAll() {
  await Promise.all([loadOverview(), loadAnalytics(), loadAlerts(), loadMapData(), loadRules(), loadAgentRisk()]);
}
async function loadUapiContext() {
  uapiLoading.value = true;
  uapiError.value = '';
  try {
    uapiContext.value = await loadUapiPanelContext({ timeoutMs: 3500 });
  } catch (error: any) {
    uapiError.value = error?.message || 'UAPI 信息暂时不可用';
  } finally {
    uapiLoading.value = false;
  }
}
function compactDate(value?: string) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function alertFilterParams() {
  const { page, pageSize, ...filters } = query;
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined));
}
async function exportAlerts() {
  exporting.value = true;
  try {
    const selectedIds = selectedAlertRows.value.map((row: any) => Number(row.id)).filter((id: number) => Number.isInteger(id) && id > 0);
    await exportApi.antiChannelingAlerts({ ...alertFilterParams(), ...(selectedIds.length ? { ids: selectedIds.join(',') } : {}) });
    Message.success(selectedIds.length ? `已导出 ${selectedIds.length} 条选中预警` : '已导出当前筛选结果');
  } finally {
    exporting.value = false;
  }
}
async function clearAlertRows() {
  const selectedIds = selectedAlertRows.value.map((row: any) => Number(row.id)).filter((id: number) => Number.isInteger(id) && id > 0);
  const filters = alertFilterParams();
  const hasFilters = Object.keys(filters).length > 0;
  const scopeText = selectedIds.length
    ? `已选中的 ${selectedIds.length} 条预警`
    : (hasFilters ? '当前筛选结果中的预警' : '全部防窜预警');
  try {
    await MessageBox.confirm(
      `将永久清空${scopeText}。风险事件审计记录会保留，此操作不可撤销。`,
      '清空防窜预警',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消', distinguishCancelAndClose: true },
    );
  } catch { return; }
  clearing.value = true;
  try {
    const result = await antiChannelingApi.clearAlerts({
      ...(selectedIds.length ? { ids: selectedIds } : { filters }),
      confirm_all: !selectedIds.length && !hasFilters,
    });
    selectedAlertRows.value = [];
    Message.success(`已清空 ${Number(result?.deleted || 0)} 条预警`);
    await loadAll();
  } finally {
    clearing.value = false;
  }
}
function resetQuery() {
  Object.assign(query, { keyword: '', alert_type: '', severity: '', status: '' });
  pagination.page = 1;
  void searchAlerts();
}
async function openDetail(row: any) {
  detail.value = await antiChannelingApi.detail(row.id);
  detailVisible.value = true;
}
async function ack(row: any) {
  await antiChannelingApi.ack(row.id, { remark: '后台确认收到预警' });
  Message.success('已确认预警');
  await loadAll();
}
async function processRow(row: any) {
  await antiChannelingApi.process(row.id, { handle_result: '已分派区域负责人稽查处理', remark: '进入稽查流程' });
  Message.success('已进入处理流程');
  await loadAll();
}
function isPromptCancel(error: any) {
  return error === 'cancel' || error === 'close' || error?.action === 'cancel' || error?.action === 'close';
}
async function close(row: any) {
  try {
    const { value } = await MessageBox.prompt('请输入处理结果或关闭说明', '关闭预警', { inputType: 'textarea', inputValue: row.handle_result || '已稽查处理，关闭预警' });
    await antiChannelingApi.close(row.id, { handle_result: value || '已稽查处理，关闭预警', status: 3 });
    Message.success('预警已关闭');
    await loadAll();
  } catch (error: any) {
    if (!isPromptCancel(error)) Message.error(error?.message || '预警关闭失败，请稍后重试');
  }
}
async function falsePositive(row: any) {
  try {
    const { value } = await MessageBox.prompt('请输入误报说明', '标记误报', { inputType: 'textarea', inputValue: row.handle_result || '经稽查核实为误报' });
    await antiChannelingApi.close(row.id, { handle_result: value || '经稽查核实为误报', status: 4 });
    Message.success('已标记为误报');
    await loadAll();
  } catch (error: any) {
    if (!isPromptCancel(error)) Message.error(error?.message || '误报标记失败，请稍后重试');
  }
}
async function submitManualAlert() {
  if (!manualForm.code && !manualForm.box_no && !manualForm.shipment_no) {
    Message.warning('请至少填写异常编码、箱号或发货单号');
    return;
  }
  loading.value = true;
  try {
    await antiChannelingApi.createAlert({ ...manualForm });
    Message.success('人工稽查预警已登记');
    manualVisible.value = false;
    Object.assign(manualForm, { alert_type: 'geo_mismatch', severity: 3, code: '', box_no: '', shipment_no: '', agent_name: '', authorized_region: '', actual_location: '', remark: '' });
    await loadAll();
  } finally {
    loading.value = false;
  }
}
function openRules() {
  rulesVisible.value = true;
  void loadRules();
}
async function saveRule(row: any) {
  if (!canManage.value) return;
  await antiChannelingApi.updateRule(row.id || row.rule_code, {
    enabled: row.enabled,
    severity: row.severity,
    threshold: row.threshold,
    window_seconds: row.window_seconds,
    notify_channels: row.notify_channels,
  });
  Message.success('规则已保存');
}

async function loadAgentRisk() {
  agentRisk.value = (await antiChannelingApi.agentRisk(20)).list || [];
}

async function queryTrajectory() {
  if (!trajectoryCode.value.trim()) { Message.warning('请输入编码'); return; }
  trajectoryLoading.value = true;
  try {
    trajectory.value = await antiChannelingApi.codeTrajectory(trajectoryCode.value.trim(), 30);
    trajectoryVisible.value = true;
  } finally {
    trajectoryLoading.value = false;
  }
}

function onAlertSelectionChange(rows: any[]) {
  selectedAlertRows.value = rows || [];
}

async function batchAckRows() {
  const sourceRows = selectedAlertRows.value.length ? selectedAlertRows.value : (alerts.value || []);
  const selected = sourceRows.filter((row: any) => Number(row.status) === 0);
  if (!selected.length) { Message.warning(selectedAlertRows.value.length ? '选中的预警中没有待确认项' : '没有待确认的预警'); return; }
  try {
    await MessageBox.confirm(`确认要批量确认 ${selected.length} 条预警吗？`, '批量确认', { type: 'warning' });
  } catch { return; }
  loading.value = true;
  try {
    await antiChannelingApi.batchAck(selected.map((row: any) => row.id));
    Message.success(`已批量确认 ${selected.length} 条预警`);
    await loadAll();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadAll();
  void loadUapiContext();
  window.addEventListener('resize', refreshWarningTableLayout, { passive: true });
  void refreshWarningTableLayout();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', refreshWarningTableLayout);
  if (warningTableLayoutFrame) window.cancelAnimationFrame(warningTableLayoutFrame);
});
</script>

<style scoped>
.anti-channeling-page { padding-bottom: 32px; --ledger-blue: #2563eb; --ledger-blue-soft: #edf5ff; --ledger-border: #dbeafe; --ledger-shadow: 0 18px 46px rgba(37, 99, 235, .10); }
.anti-channeling-hero { background: radial-gradient(circle at 88% 12%, rgba(239, 68, 68, .13), transparent 30%), radial-gradient(circle at 12% 6%, rgba(37, 99, 235, .16), transparent 28%), linear-gradient(135deg, rgba(255,255,255,.96), rgba(243,248,255,.92)); border: 1px solid rgba(219, 234, 254, .86); box-shadow: 0 18px 45px rgba(37,99,235,.08); }
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
.stat-card { border-radius: 20px; border: 1px solid rgba(219, 234, 254, .9); background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,251,255,.94)); box-shadow: 0 12px 28px rgba(37,99,235,.06); transition: transform .18s ease, box-shadow .18s ease; }
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(37,99,235,.10); }
.stat-icon { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; color: var(--primary); background: rgba(var(--primary-rgb), .1); margin-bottom: 12px; }
.stat-value { font-size: 28px; font-weight: 950; color: var(--text-1); }
.stat-label { color: var(--text-3); margin-top: 4px; }
.warning-insight-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 0 0 16px; }
.warning-insight-card { border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px; background: linear-gradient(135deg, rgba(var(--primary-rgb), .08), var(--surface)); }
.warning-insight-card.danger { background: linear-gradient(135deg, rgba(239, 68, 68, .12), var(--surface)); border-color: rgba(239, 68, 68, .22); }
.warning-insight-card span { display: block; color: var(--text-3); font-size: 12px; margin-bottom: 6px; }
.warning-insight-card strong { display: block; color: var(--text-1); font-size: 22px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warning-insight-card small { display: block; color: var(--text-3); margin-top: 5px; }
.channeling-grid { align-items: stretch; }
.warning-side-col { margin-top: 16px; }
.warning-side-layout { display: grid; grid-template-columns: minmax(320px, 1.25fr) repeat(2, minmax(260px, 1fr)); gap: 16px; align-items: stretch; }
.warning-side-layout .rank-card { margin-bottom: 0; min-height: 100%; }
.warning-side-layout .uapi-card { grid-row: span 2; }
.warning-side-layout .analysis-card { grid-column: 1 / -1; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.card-head strong { display: block; color: var(--text-1); font-size: 15px; }
.card-head small { display: block; color: var(--text-3); margin-top: 4px; }
.alert-title { display: flex; gap: 8px; align-items: center; min-width: 0; }
.alert-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alert-title + small { color: var(--text-3); margin-left: 2px; }
.alert-main-cell { min-width: 0; line-height: 1.45; }
.alert-main-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.alert-main-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-1); }
.alert-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; color: var(--text-3); font-size: 12px; }
.risk-summary { margin-top: 4px; color: var(--text-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.business-cell-strong { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.business-cell-strong strong { color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.business-cell-strong span { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.location-flow-cell { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; align-items: center; min-width: 0; }
.location-flow-cell span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.location-flow-cell .from { color: var(--text-2); }
.location-flow-cell .to { color: #ef4444; font-weight: 700; }
.location-flow-cell b { color: #ef4444; }

.warning-ledger-card { overflow: visible; }
.warning-ledger-card :deep(.el-card__body) { padding-top: 16px; }
.warning-card-head { align-items: flex-start; }
.warning-head-tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.warning-search-form { padding: 16px 16px 8px; border: 1px solid rgba(219, 234, 254, .92); border-radius: 22px; background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(246,250,255,.86)); box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 14px 34px rgba(37, 99, 235, .06); margin-bottom: 18px; }
.warning-search-form :deep(.el-form-item) { margin-right: 16px; margin-bottom: 10px; }
.warning-search-form :deep(.el-input__wrapper),
.warning-search-form :deep(.el-select__wrapper) { min-height: 36px; border-radius: 11px; background: rgba(255,255,255,.96); }
.warning-table-panel { position: relative; border: 1px solid rgba(207, 224, 255, .95); border-radius: 24px; padding: 16px; background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,251,255,.94)); box-shadow: var(--ledger-shadow); overflow: hidden; }
.warning-table-panel::before { content: ''; position: absolute; inset: 0 0 auto; height: 64px; background: linear-gradient(90deg, rgba(37,99,235,.06), transparent 48%, rgba(14,165,233,.06)); pointer-events: none; }
.warning-table-panel > * { position: relative; z-index: 1; }
.warning-table-toolbar { min-height: 48px; display: grid; grid-template-columns: minmax(260px, 1fr) auto minmax(260px, 1fr); gap: 16px; align-items: center; margin-bottom: 14px; }
.warning-table-tools-left,
.warning-table-tools-right { display: flex; align-items: center; gap: 12px; min-width: 0; }
.warning-table-tools-right { justify-content: flex-end; }
.warning-table-title { text-align: center; min-width: 240px; color: var(--text-1); }
.warning-table-title strong { display: block; font-size: 15px; font-weight: 900; letter-spacing: .02em; }
.warning-table-title small { display: block; margin-top: 3px; color: var(--text-3); font-size: 12px; }
.table-tool-btn { --el-button-bg-color: #fff; --el-button-border-color: #e4efff; --el-button-hover-border-color: #cfe0ff; --el-button-hover-bg-color: #f5f9ff; width: 40px; height: 40px; color: #6b7f99; box-shadow: 0 8px 20px rgba(37,99,235,.08); }
.table-tool-btn.is-active { color: var(--primary); background: #edf4ff; border-color: #d7e5fd; }
.table-tool-btn.danger { color: #ef4444; background: #fff1f2; border-color: #ffd7dc; }
.table-tool-btn.warning { color: #d97706; background: #fff7ed; border-color: #fed7aa; }
.table-tool-btn.primary { color: #fff; }
.anti-alert-table-wrap { width: 100%; max-width: 100%; overflow: hidden; border: 1px solid rgba(219, 234, 254, .98); border-radius: 18px; background: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.95); }
.anti-alert-table { width: 100%; --el-table-header-bg-color: #edf5ff; --el-table-row-hover-bg-color: #eef6ff; --el-table-border-color: #e4efff; --el-table-fixed-right-column: 168px; }
.warning-ledger-table :deep(.el-table__header-wrapper),
.warning-ledger-table :deep(.el-table__body-wrapper),
.warning-ledger-table :deep(.el-table__inner-wrapper) { background: #fff !important; }
.warning-ledger-table :deep(.el-table__inner-wrapper)::before { height: 0; }
.warning-ledger-table :deep(.el-table__header th.el-table__cell) { height: 48px; background: linear-gradient(180deg, #f1f7ff, #e9f2ff) !important; color: #173b63; font-weight: 900; border-bottom: 1px solid #dfeeff; }
.warning-ledger-table :deep(.el-table__body td.el-table__cell) { height: 60px; border-bottom-color: #edf3fb; transition: background .16s ease; }
.warning-ledger-table :deep(.el-table__row--striped td.el-table__cell) { background: #f7fbff !important; }
.warning-ledger-table :deep(.el-table__body tr:hover > td.el-table__cell) { background: #eef6ff !important; }
/* Only the action column is fixed. Keeping a second left-fixed layer caused
   Element Plus to leave an empty white overlay after horizontal scrolling. */
.warning-ledger-table :deep(.el-table-fixed-column--right) {
  z-index: 3 !important;
  background: #ffffff !important;
  box-shadow: -14px 0 24px rgba(33, 78, 138, .10);
}
.warning-ledger-table :deep(.ledger-action-column) {
  z-index: 5 !important;
  background: #ffffff !important;
  border-left: 1px solid #dbeafe !important;
}
.warning-ledger-table :deep(.ledger-action-column-head) {
  z-index: 7 !important;
  background: #ffffff !important;
  background-image: none !important;
  color: #173b63 !important;
  border-left: 1px solid #dbeafe !important;
}
.warning-ledger-table :deep(.el-table__row--striped .ledger-action-column),
.warning-ledger-table :deep(.el-table__body tr:hover > .ledger-action-column) { background: #ffffff !important; }
.warning-ledger-table :deep(.el-table__fixed-right-patch) { background: #ffffff !important; }
.ledger-alert-cell .alert-meta span { padding: 2px 8px; border-radius: 999px; background: #f2f7ff; color: #7088a5; }
.plain-ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.strong-text { color: var(--text-1); font-weight: 800; }
.region-pill { max-width: 100%; display: inline-flex; align-items: center; min-height: 28px; padding: 4px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.region-pill.from { color: #31516f; background: #f3f8ff; border: 1px solid #e2edff; }
.region-pill.to { color: #dc2626; background: #fff1f2; border: 1px solid #fecdd3; }
.ledger-summary { margin-top: 0; color: #617891; }
.risk-level-dot { display: inline-flex; align-items: center; justify-content: center; min-width: 54px; height: 26px; padding: 0 10px; border-radius: 999px; font-weight: 900; font-size: 12px; }
.risk-level-dot.danger { color: #dc2626; background: #fee2e2; }
.risk-level-dot.warning { color: #d97706; background: #fef3c7; }
.risk-level-dot.primary { color: #2563eb; background: #dbeafe; }
.risk-level-dot.info { color: #64748b; background: #f1f5f9; }
.ledger-action-buttons { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: nowrap; }
.row-icon-btn { width: 31px; height: 31px; color: #5f7896; border-color: #dbeafe; background: #fff; box-shadow: 0 6px 14px rgba(37,99,235,.08); }
.row-icon-btn:hover { color: var(--primary); border-color: #cfe0ff; background: #f5f9ff; }
.row-icon-btn.primary { color: #2563eb; }
.row-icon-btn.warning { color: #d97706; }
.table-card :deep(.alert-actions.el-space) { display: flex !important; flex-wrap: wrap !important; gap: 2px 4px !important; justify-content: flex-start !important; align-items: center !important; }
.table-card :deep(.alert-actions .el-space__item) { margin: 0 !important; }
.table-card :deep(.alert-actions .el-button.is-text) { padding: 3px 5px !important; min-height: 26px; }
.pagination-bar { display: flex; justify-content: flex-end; padding-top: 14px; }
.warning-ledger-table :deep(.el-scrollbar__bar.is-horizontal) { height: 12px; border-radius: 999px; }
.warning-ledger-table :deep(.el-scrollbar__bar.is-horizontal .el-scrollbar__thumb) { border-radius: 999px; background: rgba(37,99,235,.28); }
.warning-pagination-bar { padding-top: 16px; }
.rank-card { margin-bottom: 16px; border-radius: 22px; border: 1px solid rgba(219, 234, 254, .92); background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,251,255,.9)); box-shadow: 0 12px 30px rgba(37, 99, 235, .06); }
.rank-card :deep(.el-card__header) { padding: 14px 16px; border-bottom: 1px solid rgba(226, 239, 255, .95); background: linear-gradient(90deg, rgba(37,99,235,.05), rgba(255,255,255,0)); }
.rank-card :deep(.el-card__body) { padding: 14px 16px; }
.warning-side-layout .rank-card:hover { transform: translateY(-2px); box-shadow: 0 18px 38px rgba(37,99,235,.10); transition: transform .18s ease, box-shadow .18s ease; }
.table-card :deep(.critical-alert-row td) { background: rgba(239, 68, 68, .09) !important; }
.table-card :deep(.critical-alert-row td:first-child) { box-shadow: inset 4px 0 0 #ef4444; }
.table-card :deep(.pending-alert-row td) { background: rgba(245, 158, 11, .06) !important; }
.table-card :deep(.pending-alert-row td:first-child) { box-shadow: inset 4px 0 0 #f59e0b; }
.rank-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 34px; padding: 8px 0; border-bottom: 1px dashed var(--line); }
.rank-row:last-child { border-bottom: 0; }
.rank-row span { color: var(--text-2); }
.rank-row strong { color: var(--primary); }
.detail-alert { margin-bottom: 14px; }
.drawer-subtitle { margin: 18px 0 10px; color: var(--text-1); font-size: 15px; }
.json-box { white-space: pre-wrap; word-break: break-word; background: var(--page-bg-soft); border: 1px solid var(--line); border-radius: 14px; padding: 12px; color: var(--text-2); font-size: 12px; line-height: 1.6; }
.rule-desc { margin: 4px 0 0; color: var(--text-3); font-size: 12px; line-height: 1.5; }
.analysis-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
.analysis-kpis div { border: 1px solid var(--line); border-radius: 14px; padding: 10px; background: var(--page-bg-soft); }
.analysis-kpis strong { display: block; color: var(--text-1); font-size: 18px; }
.analysis-kpis span { color: var(--text-3); font-size: 12px; }
.mini-title { margin: 14px 0 8px; color: var(--text-2); font-size: 13px; }
.rank-row.compact { min-height: 28px; padding: 5px 0; }
.trend-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.trend-strip span { min-height: 30px; border-radius: 10px; background: var(--page-bg-soft); border: 1px solid var(--line); display: grid; place-items: center; color: var(--text-2); font-size: 12px; }
.trajectory-kpi { border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px; background: var(--page-bg-soft); min-width: 120px; }
.trajectory-kpi span { display: block; color: var(--text-3); font-size: 12px; }
.trajectory-kpi strong { display: block; color: var(--text-1); font-size: 20px; font-weight: 700; margin-top: 4px; }
.manual-form :deep(.el-form-item) { margin-bottom: 14px; }
.location-compare { display: flex; align-items: center; gap: 12px; padding: 12px 0; flex-wrap: wrap; }
.location-card { flex: 1; min-width: 140px; border: 1px solid var(--line); border-radius: 14px; padding: 14px; background: var(--page-bg-soft); }
.location-card.auth-loc { border-left: 4px solid var(--primary); }
.location-card.actual-loc { border-left: 4px solid #ef4444; }
.loc-label { font-size: 11px; color: var(--text-3); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
.loc-name { font-size: 15px; font-weight: 700; color: var(--text-1); }
.loc-coord { font-size: 12px; color: var(--text-3); margin-top: 4px; }
.location-arrow { font-size: 24px; color: #ef4444; font-weight: 900; flex-shrink: 0; }
.loc-distance { width: 100%; text-align: center; padding: 10px; font-size: 13px; color: var(--text-2); background: rgba(239, 68, 68, .06); border-radius: 10px; margin-top: 4px; }
.loc-distance strong { color: #ef4444; }

.uapi-card { overflow: hidden; background: radial-gradient(circle at 90% 10%, rgba(37, 99, 235, .14), transparent 34%), linear-gradient(180deg, rgba(255,255,255,.98), rgba(246,250,255,.94)); }
.uapi-card :deep(.el-card__body) { padding-top: 14px; }
.uapi-error { margin-bottom: 10px; }
.uapi-location { border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: var(--page-bg-soft); margin-bottom: 10px; }
.uapi-location span,
.uapi-weather span,
.uapi-section-title { display: block; color: var(--text-3); font-size: 12px; margin-bottom: 4px; }
.uapi-location strong { display: block; color: var(--text-1); font-size: 16px; }
.uapi-location small { color: var(--text-3); display: block; margin-top: 4px; }
.uapi-weather { display: grid; grid-template-columns: 1fr auto; gap: 8px; border-radius: 16px; padding: 14px; background: linear-gradient(135deg, rgba(var(--primary-rgb), .11), rgba(14, 165, 233, .08)); border: 1px solid rgba(var(--primary-rgb), .18); margin-bottom: 12px; }
.uapi-weather strong { color: var(--text-1); font-size: 15px; }
.uapi-weather b { grid-row: span 2; align-self: center; color: var(--primary); font-size: 30px; line-height: 1; }
.uapi-weather b small { font-size: 13px; color: var(--text-3); }
.uapi-weather > small { grid-column: 1 / -1; color: var(--text-3); }
.uapi-section { margin-top: 8px; }
.uapi-holiday-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 30px; border-bottom: 1px dashed var(--line); color: var(--text-2); }
.uapi-holiday-row:last-child { border-bottom: 0; }
.uapi-holiday-row span { color: var(--text-3); font-variant-numeric: tabular-nums; }
.uapi-holiday-row strong { color: var(--text-1); font-size: 13px; }
.uapi-saying { margin: 12px 0 0; padding: 12px; border-left: 4px solid var(--primary); background: var(--page-bg-soft); border-radius: 12px; color: var(--text-2); line-height: 1.7; }
.uapi-saying small { display: block; margin-top: 6px; color: var(--text-3); }
@media (max-width: 1180px) { .warning-side-layout { grid-template-columns: repeat(2, minmax(0, 1fr)); } .warning-side-layout .uapi-card, .warning-side-layout .analysis-card { grid-column: span 2; grid-row: auto; } }
@media (max-width: 920px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .warning-insight-grid { grid-template-columns: 1fr; } .warning-table-toolbar { grid-template-columns: 1fr; text-align: left; } .warning-table-title { text-align: left; min-width: 0; } .warning-table-tools-right { justify-content: flex-start; } }
@media (max-width: 680px) { .warning-side-layout { grid-template-columns: 1fr; } .warning-side-layout .uapi-card, .warning-side-layout .analysis-card { grid-column: auto; } }
@media (max-width: 680px) {
  .warning-table-panel { padding: 12px; border-radius: 20px; }
  .warning-table-tools-left,
  .warning-table-tools-right { gap: 8px; flex-wrap: wrap; }
  .warning-table-title { width: 100%; }
  .anti-alert-table-wrap { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
  .warning-ledger-table { min-width: 1180px; }
}
@media (max-width: 560px) { .stat-grid { grid-template-columns: 1fr; } }
</style>
