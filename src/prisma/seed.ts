import 'reflect-metadata';
import * as PrismaClientModule from '@prisma/client';
import bcrypt from 'bcryptjs';
import { permissionCatalog } from '../system/permission-catalog.js';
import { initialAdminPassword } from './seed-security.js';

const { PrismaClient } = ((PrismaClientModule as any).default || PrismaClientModule) as any;
const prisma = new PrismaClient();

async function main() {
  const username = process.env.SUPER_ADMIN_USERNAME || 'admin';
  const realName = process.env.SUPER_ADMIN_REAL_NAME || '超级管理员';

  let existing = await prisma.admin.findUnique({ where: { username } });
  if (!existing) {
    const password = initialAdminPassword();
    existing = await prisma.admin.create({
      data: {
        username,
        password_hash: await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12)),
        real_name: realName,
        role: 1,
        status: 1,
        permissions: ['*'],
      },
    });
  }

  await prisma.role.upsert({
    where: { role_code: 'super_admin' },
    create: { role_code: 'super_admin', role_name: '超级管理员', description: '系统最高权限', status: 1 },
    update: {},
  });

  await prisma.role.upsert({
    where: { role_code: 'admin' },
    create: { role_code: 'admin', role_name: '管理员', description: '普通业务管理员', status: 1 },
    update: {},
  });

  const permissions = permissionCatalog;

  for (const item of permissions) {
    await prisma.permission.upsert({
      where: { permission_code: item.permission_code },
      create: item,
      update: { permission_name: item.permission_name, module: item.module, description: item.description ?? null },
    });
  }

  const superRole = await prisma.role.findUnique({ where: { role_code: 'super_admin' } });
  const adminRole = await prisma.role.findUnique({ where: { role_code: 'admin' } });
  const adminPermissions = await prisma.permission.findMany({
    where: { permission_code: { in: ['dashboard:view', 'query:view', 'anti-channeling:view', 'scanner:use', 'scanner:execute', 'product:view', 'product-region:view', 'code:view', 'trace:view', 'box:view', 'shipment:view', 'return:view'] } },
  });
  if (adminRole) {
    await prisma.rolePermission.deleteMany({ where: { role_id: adminRole.id } });
    await Promise.all(adminPermissions.map((permission: any) => prisma.rolePermission.create({ data: { role_id: adminRole.id, permission_id: permission.id } })));
  }
  if (superRole && existing) {
    await prisma.userRole.upsert({
      where: { user_id_role_id: { user_id: existing.id, role_id: superRole.id } },
      create: { user_id: existing.id, role_id: superRole.id },
      update: {},
    }).catch(() => undefined);
  }



  const defaultSettings: Record<string, Record<string, any>> = {
    ui_theme: {
      ui_theme: 'standard',
      theme_mode: 'light',
      primary_color: '#2563eb',
      theme_note: '标准=当前蓝白主题；企业1=商业交付；企业2=简洁商用；极简SaaS=现代卡片看板；极简风格=低装饰办公；Halo/Typecho/WordPress2026=面向内容管理和站点后台的视觉方案。',
    },
    layout_lowcode: {
      layout_mode: 'classic',
      menu_behavior: 'auto',
      content_width: 'fluid',
      show_route_tabs: true,
      layout_json: { pagePadding: 'auto', tableSize: 'default', mobileDrawer: true },
    },
    business_workflow: {
      scanner_enabled: true,
      scanner_global_listen: true,
      scanner_device_type: 'newland_hr32',
      scanner_device_name: 'Newland HR32 / HR3280',
      scanner_submit_key: 'enter_tab',
      scanner_region_mode: 'mixed',
      scanner_min_length: 3,
      scanner_interval_ms: 80,
      enabled_workflows: ['classification_boxing', 'traceability', 'shipment_shipping'],
      packing_strategy: {
        mode: 'one_box_one_code',
        allowMixedProduct: false,
        allowDuplicateCode: false,
        lockBoxAfterShipment: true,
        requireSealBeforeShipment: false,
        scannerSubmitKey: 'enter_tab',
        overflow: 'reject',
      },
      page_quick_actions: [
  {
    "page": "dashboard",
    "label": "扫码业务台",
    "icon": "keyboard",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "quick_entry",
    "visible": true,
    "sort": 10,
    "roles": [
      "super_admin",
      "admin",
      "operator",
      "warehouse"
    ],
    "desc": "统一扫码识别、状态处理、装箱、发货和退货入口"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "search",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 20,
    "desc": "扫描防伪码ID/码值、箱号、发货单号或退货单号并自动识别"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "check",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 30,
    "confirm": true,
    "desc": "扫描后将防伪码置为已激活"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "lock",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "row_more",
    "visible": true,
    "sort": 40,
    "confirm": true,
    "desc": "异常码、投诉码或风险码可扫码锁定"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "unlock",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "row_more",
    "visible": true,
    "sort": 50,
    "confirm": true,
    "desc": "将锁定码恢复为已激活"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "delete",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "row_more",
    "visible": true,
    "sort": 60,
    "confirm": true,
    "riskLevel": "high",
    "desc": "作废错误生成、损坏或召回的防伪码"
  },
  {
    "page": "box",
    "label": "分类装箱",
    "icon": "box",
    "route": "/scanner",
    "workflow": "classification_boxing",
    "placement": "toolbar",
    "visible": true,
    "sort": 70,
    "needTarget": true,
    "targetField": "box_id",
    "targetLabel": "箱子ID",
    "desc": "先选择或填写箱子ID，再连续扫描单品防伪码装箱"
  },
  {
    "page": "box",
    "label": "分类装箱",
    "icon": "box",
    "route": "/scanner",
    "workflow": "classification_boxing",
    "placement": "row_action",
    "visible": true,
    "sort": 80,
    "codeType": "box",
    "desc": "扫描箱号或箱子ID后将箱子状态改为已封箱"
  },
  {
    "page": "shipment",
    "label": "扫码发货",
    "icon": "truck",
    "route": "/scanner",
    "workflow": "shipment_shipping",
    "placement": "toolbar",
    "visible": true,
    "sort": 90,
    "needTarget": true,
    "targetField": "shipment_id",
    "targetLabel": "发货单ID",
    "desc": "先填写发货单ID，再连续扫描箱号追加到发货单"
  },
  {
    "page": "shipment",
    "label": "扫码发货",
    "icon": "truck",
    "route": "/scanner",
    "workflow": "shipment_shipping",
    "placement": "row_action",
    "visible": true,
    "sort": 100,
    "codeType": "shipment",
    "confirm": true,
    "desc": "扫描发货单号或发货单ID后确认发货"
  },
  {
    "page": "return",
    "label": "扫码溯源",
    "icon": "return",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 110,
    "needTarget": true,
    "targetField": "return_id",
    "targetLabel": "退货单ID",
    "desc": "先填写退货单ID，再连续扫描退货防伪码"
  },
  {
    "page": "trace",
    "label": "溯源扫码查询",
    "icon": "link",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 120,
    "desc": "扫描溯源编号或防伪码快速查看链路"
  }
],
      business_templates: {
  "code": [
    {
      "key": "standard_code_query",
      "name": "标准查码",
      "workflow": "traceability",
      "scene": "客服核验/仓库复核/现场稽查",
      "defaultTarget": "",
      "requiredFields": [
        "code"
      ],
      "resultModules": [
        "anti_fake_code",
        "product",
        "box",
        "shipment",
        "return_order",
        "trace"
      ],
      "successMessage": "扫码识别完成，请核对产品、状态、箱号和流转信息。"
    },
    {
      "key": "first_activation",
      "name": "入库扫码激活",
      "workflow": "traceability",
      "scene": "标签贴标后或产品入库前激活",
      "defaultStatus": 1,
      "requiredFields": [
        "code"
      ],
      "successMessage": "防伪码已激活，可进入正常查询和流转环节。"
    },
    {
      "key": "risk_lock",
      "name": "异常码锁定",
      "workflow": "traceability",
      "scene": "投诉、疑似复制、跨区域异常或人工复核",
      "defaultStatus": 2,
      "requiredFields": [
        "code"
      ],
      "confirmText": "确认锁定该防伪码？锁定后消费者查询会显示异常。"
    },
    {
      "key": "risk_unlock",
      "name": "异常码解锁",
      "workflow": "traceability",
      "scene": "风险解除、误锁恢复",
      "defaultStatus": 1,
      "requiredFields": [
        "code"
      ],
      "confirmText": "确认恢复该防伪码为已激活？"
    },
    {
      "key": "code_cancel",
      "name": "防伪码注销",
      "workflow": "traceability",
      "scene": "废码、错码、召回码处理",
      "defaultStatus": 3,
      "requiredFields": [
        "code"
      ],
      "riskLevel": "high",
      "confirmText": "确认注销该防伪码？注销后不建议恢复。"
    }
  ],
  "box": [
    {
      "key": "single_box_add_code",
      "name": "单箱连续装码",
      "workflow": "classification_boxing",
      "scene": "仓库装箱/复核",
      "targetField": "box_id",
      "targetLabel": "箱子ID",
      "requiredFields": [
        "target_id",
        "code"
      ],
      "scanMode": "continuous",
      "duplicatePolicy": "skip",
      "overCapacityPolicy": "block",
      "successMessage": "已加入箱子，重复码会自动跳过。"
    },
    {
      "key": "box_seal",
      "name": "扫码封箱",
      "workflow": "classification_boxing",
      "scene": "装箱完成后封箱",
      "requiredFields": [
        "code"
      ],
      "codeType": "box_no_or_id",
      "confirmText": "确认封箱？封箱后该箱可进入发货环节。"
    }
  ],
  "shipment": [
    {
      "key": "shipment_add_box",
      "name": "发货单连续加箱",
      "workflow": "shipment_shipping",
      "scene": "发货复核/出库扫描",
      "targetField": "shipment_id",
      "targetLabel": "发货单ID",
      "requiredFields": [
        "target_id",
        "code"
      ],
      "scanMode": "continuous",
      "duplicatePolicy": "skip",
      "successMessage": "箱子已加入发货单，并更新为待发货/发货中状态。"
    },
    {
      "key": "shipment_ship",
      "name": "扫码确认发货",
      "workflow": "shipment_shipping",
      "scene": "物流交接/发货完成",
      "requiredFields": [
        "code"
      ],
      "codeType": "shipment_no_or_id",
      "payloadFields": [
        {
          "key": "logistics_company",
          "label": "物流公司",
          "type": "input"
        },
        {
          "key": "tracking_no",
          "label": "物流单号",
          "type": "input"
        },
        {
          "key": "remark",
          "label": "备注",
          "type": "textarea"
        }
      ],
      "confirmText": "确认将该发货单置为已发货？"
    }
  ],
  "returns": [
    {
      "key": "return_add_code",
      "name": "退货单连续加码",
      "workflow": "traceability",
      "scene": "退货入库/售后复核",
      "targetField": "return_id",
      "targetLabel": "退货单ID",
      "requiredFields": [
        "target_id",
        "code"
      ],
      "scanMode": "continuous",
      "duplicatePolicy": "skip",
      "successMessage": "退货码已加入退货单。"
    }
  ],
  "trace": [
    {
      "key": "trace_query",
      "name": "溯源链路扫码查询",
      "workflow": "traceability",
      "scene": "生产、质检、仓储、渠道流转核验",
      "requiredFields": [
        "code"
      ],
      "resultModules": [
        "trace",
        "product",
        "box",
        "shipment"
      ],
      "successMessage": "溯源链路识别完成。"
    }
  ],
  "common": {
    "scanTerminators": [
      "Enter",
      "Tab"
    ],
    "codeSeparators": [
      "\\n",
      ",",
      "，",
      ";",
      "；",
      " "
    ],
    "duplicatePolicy": "skip",
    "notFoundPolicy": "warn",
    "successToast": true,
    "errorToast": true,
    "historyLimit": 20
  }
},
      field_alias_map: {
  "id": "ID",
  "code": "防伪码",
  "anti_fake_code": "防伪码",
  "product_id": "产品ID",
  "product_name": "产品名称",
  "brand": "品牌",
  "category": "产品分类",
  "specification": "规格型号",
  "batch_no": "生产批次",
  "production_date": "生产日期",
  "expiry_date": "有效期至",
  "manufacturer": "公司",
  "origin_place": "产地",
  "status": "状态",
  "query_count": "查询次数",
  "activated_at": "激活时间",
  "created_at": "创建时间",
  "updated_at": "更新时间",
  "box_id": "箱子ID",
  "box_no": "箱号/外箱码",
  "box_code": "箱码",
  "box_capacity": "箱容量",
  "box_status": "箱状态",
  "shipment_id": "发货单ID",
  "shipment_no": "发货单号",
  "shipment_status": "发货状态",
  "box_ids": "发货箱列表",
  "agent_id": "代理商ID",
  "agent_name": "代理商",
  "dealer_name": "经销商",
  "receiver_name": "收货人",
  "receiver_phone": "收货电话",
  "receiver_address": "收货地址",
  "logistics_company": "物流公司",
  "tracking_no": "物流单号",
  "return_id": "退货单ID",
  "return_no": "退货单号",
  "return_codes": "退货防伪码",
  "return_reason": "退货原因",
  "trace_id": "溯源ID",
  "trace_no": "溯源编号",
  "trace_node": "溯源节点",
  "quality_inspector": "质检员",
  "warehouse": "仓库",
  "operator": "操作员",
  "remark": "备注"
},
    },
    integration: {
      scanner_hardware_config: {
  "mode": "usb_keyboard",
  "enabled": true,
  "globalListen": true,
  "terminator": "Enter",
  "alternativeTerminators": [
    "Tab"
  ],
  "minLength": 3,
  "maxIntervalMs": 80,
  "autoTrim": true,
  "normalizeUrl": true,
  "urlCodeParams": [
    "code",
    "q",
    "barcode"
  ],
  "urlPathKeys": [
    "verify",
    "v",
    "query"
  ],
  "prefixRules": [
    {
      "prefix": "code:",
      "remove": true
    },
    {
      "prefix": "CODE:",
      "remove": true
    },
    {
      "prefix": "箱号:",
      "remove": true
    }
  ],
  "devices": [
    {
      "name": "通用USB扫码枪",
      "type": "keyboard_hid",
      "terminator": "Enter",
      "remark": "多数有线/无线USB扫码枪可直接使用"
    },
    {
      "name": "PDA浏览器扫码",
      "type": "manual_or_keyboard",
      "terminator": "Enter",
      "remark": "PDA输入框扫码后回车提交"
    }
  ],
  "businessDefaults": {
    "defaultWorkflow": "traceability",
    "historyLimit": 20,
    "continuousScan": true,
    "duplicatePolicy": "skip",
    "notFoundPolicy": "warn"
  },
  "sound": {
    "success": true,
    "error": true
  },
  "vibration": {
    "pda": true
  },
  "security": {
    "ignoreEditableGlobalInput": true,
    "requireConfirmWorkflows": [
      "code_lock",
      "code_unlock",
      "code_cancel",
      "box_seal",
      "shipment_ship"
    ],
    "highRiskWorkflows": [
      "code_cancel"
    ]
  }
},
      mini_program_config: {
  "enabled": false,
  "h5VerifyPath": "/verify/{code}",
  "shortVerifyPath": "/v/{code}",
  "autoQueryFromUrl": true,
  "codeParam": "code",
  "shareTitle": "官方防伪码验证",
  "shareDesc": "扫码核验真伪并查看产品溯源信息",
  "wechatOfficialAccount": "",
  "miniProgramAppId": "",
  "fallbackUrl": "/verify"
},
    },
  };

  for (const [group_key, settings] of Object.entries(defaultSettings)) {
    for (const [setting_key, setting_value] of Object.entries(settings)) {
      await prisma.systemSetting.upsert({
        where: { group_key_setting_key: { group_key, setting_key } },
        create: {
          group_key,
          setting_key,
          setting_value,
          value_type: Array.isArray(setting_value) ? 'array' : typeof setting_value,
        },
        update: {
          setting_value,
          value_type: Array.isArray(setting_value) ? 'array' : typeof setting_value,
        },
      });
    }
  }
}

main()
  .then(async () => {
    // Seed completed successfully
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
