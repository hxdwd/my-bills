import { Account, Category, Transaction, BudgetSummary } from '../types';

type TransactionType = 'expense' | 'income' | 'transfer';

// 账户
export const accounts: Account[] = [
  { id: '1', name: '招商银行', type: 'bank', balance: 45230.00, icon: '🏦', color: '#1e88e5' },
  { id: '2', name: '微信钱包', type: 'wechat', balance: 3850.50, icon: '💚', color: '#07c160' },
  { id: '3', name: '支付宝', type: 'alipay', balance: 12680.00, icon: '💙', color: '#1677ff' },
  { id: '4', name: '现金', type: 'cash', balance: 1200.00, icon: '💵', color: '#52c41a' },
  { id: '5', name: '交通信用卡', type: 'credit', balance: -2350.00, icon: '💳', color: '#ff4d4f' },
];

// 分类
export const categories = {
  expense: [
    { id: 'e1', name: '饮食', icon: '🍜', color: '#ff6b6b', type: 'expense' as const, order: 1 },
    { id: 'e2', name: '交通', icon: '🚗', color: '#4ecdc4', type: 'expense' as const, order: 2 },
    { id: 'e3', name: '房租水电', icon: '🏠', color: '#84cc16', type: 'expense' as const, order: 3 },
    { id: 'e4', name: '生活用品', icon: '🧴', color: '#14b8a6', type: 'expense' as const, order: 4 },
    { id: 'e5', name: '娱乐', icon: '🎮', color: '#f472b6', type: 'expense' as const, order: 5 },
    { id: 'e6', name: '运动', icon: '⚽', color: '#38bdf8', type: 'expense' as const, order: 6 },
    { id: 'e7', name: '衣服鞋包', icon: '👔', color: '#ec4899', type: 'expense' as const, order: 7 },
    { id: 'e8', name: '电子产品', icon: '📱', color: '#818cf8', type: 'expense' as const, order: 8 },
    { id: 'e9', name: '医疗健康', icon: '💊', color: '#fb923c', type: 'expense' as const, order: 9 },
    { id: 'e10', name: '通讯会员', icon: '📡', color: '#6366f1', type: 'expense' as const, order: 10 },
    { id: 'e11', name: '学习教育', icon: '📚', color: '#f59e0b', type: 'expense' as const, order: 11 },
    { id: 'e12', name: '旅游', icon: '✈️', color: '#10b981', type: 'expense' as const, order: 12 },
  ],
  income: [
    { id: 'i1', name: '工资', icon: '💰', color: '#22c55e', type: 'income' as const, order: 1 },
    { id: 'i2', name: '奖金', icon: '🎁', color: '#f59e0b', type: 'income' as const, order: 2 },
    { id: 'i3', name: '投资', icon: '📈', color: '#10b981', type: 'income' as const, order: 3 },
    { id: 'i4', name: '兼职', icon: '💼', color: '#6366f1', type: 'income' as const, order: 4 },
    { id: 'i5', name: '礼金', icon: '🎊', color: '#ef4444', type: 'income' as const, order: 5 },
  ],
};

// 子标签（tags）：关联到父分类
export const defaultTags: { id: string; name: string; color: string; categoryId: string }[] = [
  // 饮食子标签
  { id: 't1', name: '正餐', color: '#ff6b6b', categoryId: 'e1' },
  { id: 't2', name: '大餐', color: '#e05555', categoryId: 'e1' },
  { id: 't3', name: '居家饮食', color: '#ff8a65', categoryId: 'e1' },
  // 旅游子标签
  { id: 't4', name: '交通', color: '#10b981', categoryId: 'e12' },
  { id: 't5', name: '住宿', color: '#059669', categoryId: 'e12' },
  { id: 't6', name: '餐饮', color: '#34d399', categoryId: 'e12' },
  { id: 't7', name: '门票', color: '#6ee7b7', categoryId: 'e12' },
  { id: 't8', name: '购物', color: '#a7f3d0', categoryId: 'e12' },
];

// 最近交易
export const recentTransactions: Transaction[] = [
  {
    id: '1',
    type: 'expense',
    amount: 38.00,
    categoryId: 'e1',
    categoryName: '饮食',
    categoryIcon: '🍜',
    categoryColor: '#ff6b6b',
    accountId: '2',
    accountName: '微信钱包',
    date: '今天',
    time: '14:30',
    tags: ['正餐'],
  },
  {
    id: '2',
    type: 'expense',
    amount: 56.80,
    categoryId: 'e1',
    categoryName: '饮食',
    categoryIcon: '🍜',
    categoryColor: '#ff6b6b',
    accountId: '3',
    accountName: '支付宝',
    date: '今天',
    time: '12:15',
    tags: ['大餐'],
  },
  {
    id: '3',
    type: 'expense',
    amount: 4.00,
    categoryId: 'e2',
    categoryName: '交通',
    categoryIcon: '🚗',
    categoryColor: '#4ecdc4',
    accountId: '2',
    accountName: '微信钱包',
    date: '今天',
    time: '08:20',
  },
  {
    id: '4',
    type: 'income',
    amount: 15000.00,
    categoryId: 'i1',
    categoryName: '工资',
    categoryIcon: '💰',
    categoryColor: '#22c55e',
    accountId: '1',
    accountName: '招商银行',
    date: '昨天',
    time: '10:00',
  },
  {
    id: '5',
    type: 'expense',
    amount: 299.00,
    categoryId: 'e7',
    categoryName: '衣服鞋包',
    categoryIcon: '👔',
    categoryColor: '#ec4899',
    accountId: '3',
    accountName: '支付宝',
    date: '昨天',
    time: '21:30',
  },
  {
    id: '6',
    type: 'transfer',
    amount: 500.00,
    categoryId: 't1',
    categoryName: '转账',
    categoryIcon: '↔️',
    categoryColor: '#5b8dee',
    accountId: '1',
    accountName: '招商银行',
    toAccountId: '2',
    toAccountName: '微信钱包',
    date: '06-29',
    time: '15:00',
  },
];

// 预算数据
export const budget: BudgetSummary = {
  total: 8000,
  spent: 5234.50,
  remaining: 2765.50,
  categoryBudgets: [
    { category: '饮食', categoryIcon: '🍜', budget: 2500, spent: 1860.30, color: '#ff6b6b' },
    { category: '交通', categoryIcon: '🚗', budget: 800, spent: 420.00, color: '#4ecdc4' },
    { category: '衣服鞋包', categoryIcon: '👔', budget: 2000, spent: 1854.20, color: '#ec4899' },
    { category: '娱乐', categoryIcon: '🎮', budget: 500, spent: 320.00, color: '#f472b6' },
  ],
};

// 月度统计
export const monthlyStats = {
  current: {
    month: '2024-07',
    income: 18500.00,
    expense: 5234.50,
    balance: 13265.50,
  },
  previous: {
    month: '2024-06',
    income: 15000.00,
    expense: 6820.30,
    balance: 8179.70,
  },
};

// 总资产
export const totalAssets = {
  assets: 62860.50,
  liabilities: 2350.00,
  netAssets: 60510.50,
};

// 兼容 AddTransaction 的导出
export const mockAccounts = accounts;
export const expenseCategories = categories.expense;
export const incomeCategories = categories.income;
export const transferCategory = { id: 't1', name: '转账', icon: '↔️', color: '#5b8dee', type: 'transfer' as const, order: 0 };

// 获取所有分类
export function getAllCategories(type?: TransactionType | 'transfer'): any[] {
  if (type === 'income') return categories.income;
  if (type === 'transfer') return [transferCategory];
  return categories.expense;
}
