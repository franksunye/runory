// Demo data for CRM Lite — realistic Chinese business records.
// Used by the /api/workspaces/[id]/seed-demo endpoint to seed a fresh
// workspace with sample customers, contacts, and tasks.
//
// Linking: contacts and tasks reference a customer via `customerEmail`,
// which the seed endpoint resolves to the real `customer_id` after creating
// the customer records.

export interface DemoCustomer {
  name: string;
  email: string;
  phone: string;
}

export interface DemoContact {
  customerEmail: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

export interface DemoTask {
  customerEmail: string | null;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string;
  assignee: string;
}

// 8 realistic Chinese business customers
export function getDemoCustomers(): DemoCustomer[] {
  return [
    {
      name: "上海明远科技有限公司",
      email: "contact@mingyuan-tech.cn",
      phone: "021-55886677",
    },
    {
      name: "深圳蓝海智能装备股份有限公司",
      email: "sales@blueocean-equip.cn",
      phone: "0755-88662211",
    },
    {
      name: "北京华夏云创数据服务有限责任公司",
      email: "service@huaxia-cloud.cn",
      phone: "010-66778899",
    },
    {
      name: "杭州瑞丰电子商务有限公司",
      email: "bd@ruifeng-ec.cn",
      phone: "0571-88997766",
    },
    {
      name: "广州新纪元医疗器械有限公司",
      email: "info@newera-med.cn",
      phone: "020-33225588",
    },
    {
      name: "成都西部的物流供应链管理有限公司",
      email: "ops@westlogistics.cn",
      phone: "028-55667788",
    },
    {
      name: "苏州精工自动化设备有限公司",
      email: "support@jinggong-auto.cn",
      phone: "0512-66889900",
    },
    {
      name: "武汉中科创新生物技术有限公司",
      email: "rnd@zhongke-bio.cn",
      phone: "027-87654321",
    },
  ];
}

// 12 contacts linked to the demo customers
export function getDemoContacts(): DemoContact[] {
  return [
    {
      customerEmail: "contact@mingyuan-tech.cn",
      name: "李伟",
      email: "liwei@mingyuan-tech.cn",
      phone: "13800138001",
      role: "采购总监",
    },
    {
      customerEmail: "contact@mingyuan-tech.cn",
      name: "王芳",
      email: "wangfang@mingyuan-tech.cn",
      phone: "13800138002",
      role: "技术负责人",
    },
    {
      customerEmail: "sales@blueocean-equip.cn",
      name: "张强",
      email: "zhangqiang@blueocean-equip.cn",
      phone: "13900139001",
      role: "销售经理",
    },
    {
      customerEmail: "sales@blueocean-equip.cn",
      name: "陈静",
      email: "chenjing@blueocean-equip.cn",
      phone: "13900139002",
      role: "项目协调员",
    },
    {
      customerEmail: "service@huaxia-cloud.cn",
      name: "刘洋",
      email: "liuyang@huaxia-cloud.cn",
      phone: "13700137001",
      role: "CTO",
    },
    {
      customerEmail: "bd@ruifeng-ec.cn",
      name: "赵敏",
      email: "zhaomin@ruifeng-ec.cn",
      phone: "13600136001",
      role: "运营总监",
    },
    {
      customerEmail: "bd@ruifeng-ec.cn",
      name: "孙磊",
      email: "sunlei@ruifeng-ec.cn",
      phone: "13600136002",
      role: "商务经理",
    },
    {
      customerEmail: "info@newera-med.cn",
      name: "周婷",
      email: "zhouting@newera-med.cn",
      phone: "13500135001",
      role: "市场部经理",
    },
    {
      customerEmail: "ops@westlogistics.cn",
      name: "吴鹏",
      email: "wupeng@westlogistics.cn",
      phone: "13400134001",
      role: "运营副总",
    },
    {
      customerEmail: "support@jinggong-auto.cn",
      name: "郑浩",
      email: "zhenghao@jinggong-auto.cn",
      phone: "13300133001",
      role: "设备主管",
    },
    {
      customerEmail: "support@jinggong-auto.cn",
      name: "黄丽",
      email: "huangli@jinggong-auto.cn",
      phone: "13300133002",
      role: "采购专员",
    },
    {
      customerEmail: "rnd@zhongke-bio.cn",
      name: "林峰",
      email: "linfeng@zhongke-bio.cn",
      phone: "13200132001",
      role: "研发总监",
    },
  ];
}

// 10 tasks with various statuses and priorities
export function getDemoTasks(): DemoTask[] {
  return [
    {
      customerEmail: "contact@mingyuan-tech.cn",
      title: "明远科技需求调研会议",
      description: "与李伟沟通本季度采购需求，确认设备型号与交付时间。",
      status: "in_progress",
      priority: "high",
      due_date: "2026-06-28",
      assignee: "Alex",
    },
    {
      customerEmail: "contact@mingyuan-tech.cn",
      title: "明远科技技术方案评审",
      description: "完成技术方案文档并安排内部评审。",
      status: "todo",
      priority: "medium",
      due_date: "2026-07-05",
      assignee: "Sam",
    },
    {
      customerEmail: "sales@blueocean-equip.cn",
      title: "蓝海智能报价单发送",
      description: "根据张强提供的需求清单出具正式报价单。",
      status: "done",
      priority: "urgent",
      due_date: "2026-06-20",
      assignee: "Alex",
    },
    {
      customerEmail: "sales@blueocean-equip.cn",
      title: "蓝海智能合同跟进",
      description: "跟进合同盖章流程，预计本周内完成。",
      status: "in_progress",
      priority: "high",
      due_date: "2026-06-30",
      assignee: "Sam",
    },
    {
      customerEmail: "service@huaxia-cloud.cn",
      title: "华夏云创 POC 部署",
      description: "协助刘洋完成 POC 环境部署与联调测试。",
      status: "todo",
      priority: "high",
      due_date: "2026-07-10",
      assignee: "Alex",
    },
    {
      customerEmail: "bd@ruifeng-ec.cn",
      title: "瑞丰电商年度续约沟通",
      description: "与赵敏确认续约条款及下一年度服务范围。",
      status: "todo",
      priority: "medium",
      due_date: "2026-07-15",
      assignee: "Sam",
    },
    {
      customerEmail: "info@newera-med.cn",
      title: "新纪元医疗产品演示",
      description: "为周婷团队安排产品功能演示及 Q&A。",
      status: "done",
      priority: "medium",
      due_date: "2026-06-18",
      assignee: "Alex",
    },
    {
      customerEmail: "ops@westlogistics.cn",
      title: "西部物流系统对接",
      description: "完成 API 对接与数据迁移方案确认。",
      status: "cancelled",
      priority: "low",
      due_date: "2026-06-25",
      assignee: "Sam",
    },
    {
      customerEmail: "support@jinggong-auto.cn",
      title: "精工自动化售后回访",
      description: "回访郑浩确认设备运行情况并记录反馈。",
      status: "in_progress",
      priority: "low",
      due_date: "2026-07-01",
      assignee: "Alex",
    },
    {
      customerEmail: "rnd@zhongke-bio.cn",
      title: "中科创新联合研发立项",
      description: "与林峰确认联合研发课题方向并签署合作协议。",
      status: "todo",
      priority: "urgent",
      due_date: "2026-07-20",
      assignee: "Sam",
    },
  ];
}
