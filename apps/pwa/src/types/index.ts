// 账户类型
export type AccountType = 'cash' | 'bank' | 'credit' | 'wechat' | 'alipay' | 'crypto' | 'investment' | 'debt';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  icon: string;
  color: string;
}

// 交易类型
export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  subcategoryId?: string;
  subcategoryName?: string;
  accountId: string;
  accountName: string;
  toAccountId?: string;
  toAccountName?: string;
  // 转账多币种字段（仅 type === 'transfer' 时有效）
  fromAmount?: number;
  toAmount?: number;
  fee?: number;
  fromCurrency?: string;
  toCurrency?: string;
  exchangeRate?: number;
  // 数据来源标记：'txn' = transactions 表（消费/收入/历史转账），'transfer' = transfers 表（新转账）
  source?: 'txn' | 'transfer';
  date: string;
  time: string;
  tags?: string[];
  note?: string;
  images?: string[];
  location?: { lat: number; lng: number; name: string };
}

// 分类类型
export type CategoryType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  order: number;
}

// 预算
export interface Budget {
  id: string;
  month: string;
  categoryId?: string;
  categoryName?: string;
  amount: number;
}

export interface CategoryBudget {
  category: string;
  categoryIcon: string;
  budget: number;
  spent: number;
  color: string;
}

export interface BudgetSummary {
  total: number;
  spent: number;
  remaining: number;
  categoryBudgets: CategoryBudget[];
}

// 月度统计
export interface MonthlyStats {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

// App 全局状态
export interface AppState {
  accounts: Account[];
  transactions: Transaction[];
  categories: {
    expense: Category[];
    income: Category[];
  };
  budgets: BudgetSummary;

}

// 主题
export type ThemeMode = 'light' | 'dark';

// Tab 类型
export type TabType = 'home' | 'add' | 'assets' | 'reports' | 'calendar' | 'budget' | 'ai' | 'search' | 'transactions' | 'settings' | 'wealth';

// 记一笔表单数据
export interface TransactionFormData {
  type: TransactionType;
  amount: string;
  categoryId: string;
  subcategoryId?: string;
  accountId: string;
  toAccountId?: string;
  date: Date;
  time: Date;
  note?: string;
  tags?: string[];
  images?: string[];
  location?: { lat: number; lng: number; name: string };
}

// 子分类（二级分类，绑在一级分类下）
export interface SubCategory {
  id: string;
  name: string;
  color: string;
  categoryId: string;
}

// 标签（全局自由标签，跨分类）
export interface Tag {
  id: string;
  name: string;
  color: string;
}

// ============================================================
// 投资持仓（流水账模型）
// ============================================================

