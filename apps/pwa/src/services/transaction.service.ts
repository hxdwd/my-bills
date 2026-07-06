import { supabase } from './supabase';
import type { Transaction, TransactionFormData } from '../types';
import type { Database } from '../types/database.types';

type DbTransaction = Database['public']['Tables']['transactions']['Row'];
type DbTransactionInsert = Database['public']['Tables']['transactions']['Insert'];

// 将前端 TransactionFormData 转为数据库 Insert 格式
function formDataToInsert(data: TransactionFormData, userId: string): DbTransactionInsert {
  return {
    user_id: userId,
    type: data.type === 'transfer' ? 'expense' : data.type,
    amount: parseFloat(data.amount),
    category_id: data.categoryId || null,
    account_id: data.accountId,
    to_account_id: data.toAccountId || null,
    transaction_date: data.date.toISOString().split('T')[0],
    transaction_time: `${data.time.getHours().toString().padStart(2, '0')}:${data.time.getMinutes().toString().padStart(2, '0')}:00`,
    tags: data.tags?.length ? data.tags : null,
    note: data.note || null,
    images: data.images?.length ? data.images : null,
    location: data.location ? JSON.parse(JSON.stringify(data.location)) : null,
  };
}

// 将数据库 Row 转为前端 Transaction
function rowToTransaction(row: DbTransaction): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    categoryId: row.category_id || '',
    categoryName: '',
    categoryIcon: '🏷️',
    categoryColor: '#ccc',
    accountId: row.account_id,
    accountName: '',
    toAccountId: row.to_account_id || undefined,
    date: row.transaction_date,
    time: row.transaction_time.substring(0, 5),
    tags: row.tags || undefined,
    note: row.note || undefined,
    images: row.images || undefined,
    location: row.location as Transaction['location'],
  };
}

export const transactionService = {
  // 获取交易列表
  async list(userId: string, options?: {
    page?: number;
    limit?: number;
    type?: 'expense' | 'income';
    categoryId?: string;
    accountId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        category:categories(id, name, icon, color),
        account:accounts(id, name, icon),
        to_account:accounts!to_account_id(id, name, icon)
      `)
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .order('transaction_time', { ascending: false });

    if (options?.type) query = query.eq('type', options.type);
    if (options?.categoryId) query = query.eq('category_id', options.categoryId);
    if (options?.accountId) query = query.eq('account_id', options.accountId);
    if (options?.startDate) query = query.gte('transaction_date', options.startDate);
    if (options?.endDate) query = query.lte('transaction_date', options.endDate);
    if (options?.search) query = query.or(`category_id.in.(select id from categories where name.ilike.%${options.search}%),note.ilike.%${options.search}%`);

    if (options?.page && options?.limit) {
      const from = (options.page - 1) * options.limit;
      query = query.range(from, from + options.limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      transactions: (data || []).map((row: any) => ({
        ...rowToTransaction(row),
        categoryName: row.category?.name || '',
        categoryIcon: row.category?.icon || '🏷️',
        categoryColor: row.category?.color || '#ccc',
        accountName: row.account?.name || '',
        toAccountName: row.to_account?.name || undefined,
      })),
      count,
    };
  },

  // 创建交易
  async create(data: TransactionFormData, userId: string) {
    const insertData = formDataToInsert(data, userId);
    const { data: result, error } = await supabase
      .from('transactions')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  // 更新交易
  async update(id: string, data: Partial<TransactionFormData>, userId: string) {
    const updateData: Database['public']['Tables']['transactions']['Update'] = {};
    if (data.type) updateData.type = data.type === 'transfer' ? 'expense' : data.type;
    if (data.amount) updateData.amount = parseFloat(data.amount);
    if (data.categoryId !== undefined) updateData.category_id = data.categoryId;
    if (data.accountId) updateData.account_id = data.accountId;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.note !== undefined) updateData.note = data.note;

    const { data: result, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  // 删除交易
  async delete(id: string, userId: string) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },

  // 月度统计
  async getMonthlyStats(userId: string, months?: number) {
    const { data, error } = await supabase
      .from('monthly_stats')
      .select('*')
      .eq('user_id', userId)
      .order('month', { ascending: false })
      .limit(months || 12);

    if (error) throw error;
    return data;
  },

  // 分类统计
  async getCategoryStats(userId: string, month: string) {
    const { data, error } = await supabase
      .from('category_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .order('total_amount', { ascending: false });

    if (error) throw error;
    return data;
  },
};
