export const roleText: Record<number, string> = { 1: '超级管理员', 2: '普通管理员' };

export const statusMaps: Record<string, Record<number, { text: string; color: string }>> = {
  common: { 1: { text: '启用', color: 'green' }, 0: { text: '禁用', color: 'red' } },
  product: { 1: { text: '启用', color: 'green' }, 0: { text: '禁用', color: 'red' } },
  code: {
    0: { text: '未激活', color: 'gray' },
    1: { text: '已激活', color: 'green' },
    2: { text: '已锁定', color: 'orange' },
    3: { text: '已注销', color: 'red' },
    4: { text: '已查询', color: 'blue' },
  },
  trace: { 1: { text: '正常', color: 'green' }, 0: { text: '禁用', color: 'red' } },
  box: {
    0: { text: '装箱中', color: 'blue' },
    1: { text: '已封箱', color: 'green' },
    2: { text: '已发货', color: 'purple' },
  },
  shipment: {
    0: { text: '待发货', color: 'gray' },
    1: { text: '已发货', color: 'blue' },
    2: { text: '已签收', color: 'green' },
    3: { text: '异常', color: 'red' },
  },
  return: {
    0: { text: '待受理', color: 'gray' },
    1: { text: '已受理', color: 'blue' },
    2: { text: '已完成', color: 'green' },
    3: { text: '已拒绝', color: 'red' },
  },
  cert: { 1: { text: '有效', color: 'green' }, 0: { text: '失效', color: 'red' } },
};

export function getStatus(module: string, value: any) {
  return statusMaps[module]?.[Number(value)] || { text: value ?? '-', color: 'gray' };
}

export function toOptions(map: Record<number, { text: string }>) {
  return Object.entries(map).map(([value, item]) => ({ label: item.text, value: Number(value) }));
}
