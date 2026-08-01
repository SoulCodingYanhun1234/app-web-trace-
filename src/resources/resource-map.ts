export type ResourceConfig = {
  delegate: string;
  searchFields?: string[];
  allowedFields?: string[];
  statusField?: string;
  defaultNo?: string;
};

export const resourceMap: Record<string, ResourceConfig> = {
  products: {
    delegate: 'product',
    searchFields: ['product_name', 'product_code', 'batch_no', 'manufacturer', 'shelf_life'],
    allowedFields: ['product_code', 'product_name', 'batch_no', 'category', 'brand', 'specification', 'unit', 'production_date', 'manufacturer', 'shelf_life', 'storage_condition', 'description', 'image_url', 'extra_fields', 'status'],
    statusField: 'status',
  },
  'product-regions': {
    delegate: 'productRegion',
    searchFields: ['product_code', 'product_name', 'brand', 'category', 'province_name', 'city_name', 'region_group', 'warehouse', 'distributor', 'code_rule', 'last_scan_code'],
    allowedFields: ['product_id', 'product_code', 'product_name', 'brand', 'category', 'province_code', 'city_code', 'province_name', 'city_name', 'region_group', 'warehouse', 'distributor', 'agent_id', 'authorized_status', 'code_rule', 'codes', 'scan_count', 'last_scan_code', 'last_scan_at', 'remark', 'status'],
    statusField: 'status',
  },
  manufacturers: {
    delegate: 'manufacturer',
    searchFields: ['manufacturer_code', 'manufacturer_name', 'company_name', 'social_credit_code', 'contact_name', 'contact_phone', 'province', 'city'],
    allowedFields: ['manufacturer_code', 'manufacturer_name', 'company_name', 'social_credit_code', 'legal_person', 'contact_name', 'contact_phone', 'contact_email', 'province', 'city', 'address', 'business_license', 'production_license', 'quality_report', 'status', 'remark'],
    statusField: 'status',
    defaultNo: 'manufacturer_code',
  },
  agents: {
    delegate: 'agent',
    searchFields: ['agent_name', 'agent_code', 'contact_name', 'province', 'city', 'district'],
    allowedFields: ['agent_code', 'agent_name', 'contact_name', 'contact_phone', 'contact_email', 'province', 'city', 'district', 'address', 'business_license', 'level', 'parent_id', 'status', 'remark'],
    statusField: 'status',
  },
  certificates: {
    delegate: 'certificate',
    searchFields: ['cert_name', 'cert_type'],
    allowedFields: ['cert_name', 'cert_type', 'product_id', 'issuing_authority', 'issue_date', 'expiry_date', 'cert_image', 'cert_file', 'status', 'remark'],
  },
  process: {
    delegate: 'processRecord',
    searchFields: ['process_name', 'batch_no', 'operator'],
    allowedFields: ['product_id', 'batch_no', 'process_type', 'process_name', 'process_content', 'process_data', 'operator', 'location', 'process_time', 'status'],
  },
  trace: {
    delegate: 'traceRecord',
    searchFields: ['trace_no', 'batch_no', 'anti_fake_code'],
    allowedFields: ['product_id', 'trace_no', 'anti_fake_code', 'batch_no', 'production_date', 'expiry_date', 'production_place', 'manufacturer', 'trace_chain', 'status'],
    defaultNo: 'trace_no',
  },
  box: {
    delegate: 'box',
    searchFields: ['box_no', 'batch_no', 'product_name', 'box_type', 'packing_address'],
    allowedFields: ['product_id', 'box_no', 'batch_no', 'box_capacity', 'box_spec', 'box_type', 'product_code', 'product_name', 'brand', 'specification', 'unit', 'production_place', 'manufacturer', 'province_code', 'city_code', 'province_name', 'city_name', 'region_group', 'warehouse', 'distributor', 'agent_id', 'agent_name', 'company_name', 'packing_address', 'codes', 'status'],
    defaultNo: 'box_no',
  },
  shipments: {
    delegate: 'shipment',
    searchFields: ['shipment_no', 'batch_no', 'logistics_no', 'sender_address', 'receiver', 'receiver_address', 'province_name', 'city_name', 'region_group', 'warehouse', 'distributor', 'authorization_address', 'authorization_level', 'authorization_source'],
    allowedFields: ['shipment_no', 'batch_no', 'agent_id', 'box_ids', 'logistics_company', 'logistics_no', 'sender', 'sender_address', 'receiver', 'receiver_phone', 'receiver_address', 'province_code', 'city_code', 'province_name', 'city_name', 'region_group', 'warehouse', 'distributor', 'authorization_address', 'authorization_level', 'authorization_source', 'status', 'remark'],
    defaultNo: 'shipment_no',
  },
  returns: {
    delegate: 'returnOrder',
    searchFields: ['return_no', 'shipment_no', 'agent_name'],
    allowedFields: ['return_no', 'shipment_id', 'shipment_no', 'agent_id', 'agent_name', 'return_codes', 'return_reason', 'return_type', 'status', 'remark'],
    defaultNo: 'return_no',
  },
};

export function prefixForField(field: string) {
  if (field === 'box_no') return 'BOX';
  if (field === 'shipment_no') return 'SH';
  if (field === 'return_no') return 'RT';
  if (field === 'trace_no') return 'TR';
  if (field === 'manufacturer_code') return 'MFR';
  return 'NO';
}
