export type WorkflowKey =
  | 'classification_boxing'
  | 'box_code_binding'
  | 'traceability'
  | 'shipment_shipping';

export type WorkflowMeta = {
  label: string;
  desc: string;
  needTarget?: boolean;
  targetLabel?: string;
  targetPlaceholder?: string;
};

export const workflowMeta: Record<WorkflowKey, WorkflowMeta> = {
  classification_boxing: {
    label: '分类装箱',
    desc: '扫描单品防伪码，系统按产品、批次、地区自动归类装箱；可填写指定箱号/箱子ID，也可自动分配可用箱。',
    needTarget: false,
    targetLabel: '指定箱号/箱子ID（可选）',
    targetPlaceholder: '不填则按产品和批次自动分配箱子',
  },
  box_code_binding: {
    label: '一箱一码绑定',
    desc: '先在装箱管理生成箱码/大码，再连续扫描产品小码，完成后扫描该箱码/大码，系统自动完成大小码关联。',
    needTarget: false,
    targetLabel: '箱码/大码（可选）',
    targetPlaceholder: '可不填；推荐按“小码...小码，最后扫已生成箱码/大码”的顺序自动关联',
  },
  traceability: {
    label: '扫码溯源',
    desc: '扫描防伪码ID/码值或溯源编号，快速查看产品、地区、批次和溯源链路。',
    needTarget: false,
  },
  shipment_shipping: {
    label: '扫码发货',
    desc: '扫描箱号加入指定发货单；批量扫描时选择收件代理商后可自动创建发货单；所有防伪码授权位置以该代理商所属地区为准。',
    needTarget: false,
    targetLabel: '发货单ID/单号（加箱时填写）',
    targetPlaceholder: '批量新建发货单时可不填；扫描箱号加到已有发货单时填写',
  },
};

export const legacyWorkflowMap: Record<string, WorkflowKey> = {
  code_query: 'traceability',
  code_activate: 'traceability',
  code_lock: 'traceability',
  code_unlock: 'traceability',
  code_cancel: 'traceability',
  box_add_code: 'classification_boxing',
  box_code_binding: 'box_code_binding',
  box_bind_codes: 'box_code_binding',
  carton_bind: 'box_code_binding',
  box_seal: 'classification_boxing',
  shipment_add_box: 'shipment_shipping',
  shipment_ship: 'shipment_shipping',
  return_add_code: 'traceability',
};

export function normalizeWorkflowKey(value: unknown): WorkflowKey {
  const key = String(value || 'traceability').trim();
  return (workflowMeta as Record<string, WorkflowMeta>)[key] ? key as WorkflowKey : legacyWorkflowMap[key] || 'traceability';
}

export function workflowList() {
  return Object.entries(workflowMeta).map(([value, meta]) => ({ value, ...meta }));
}
