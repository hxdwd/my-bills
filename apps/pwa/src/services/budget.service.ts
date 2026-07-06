import { supabase } from './supabase';
import type { Budget, BudgetSummary } from '../types';

export const budgetService = {
  async list(userId: string, month?: string) {
    let query = supabase
      .from('budgets')
      .select('*, category:categories(id, name, icon, color)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (month) query = query.eq('month', month);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getProgress(userId: string, month: string): Promise<BudgetSummary> {
    const { data, error } = await supabase
      .rpc('get_budget_progress', {
        p_user_id: userId,
        p_month: month,
      });

    if (error) throw error;

    const total = data.reduce((sum: number, b: any) => sum + Number(b.budget_amount), 0);
    const spent = data.reduce((sum: number, b: any) => sum + Number(b.spent_amount), 0);

    return {
      total,
      spent,
      remaining: total - spent,
      categoryBudgets: data.map((b: any) => ({
        category: b.category_name || '总计',
        categoryIcon: b.category_icon || '💰',
        budget: Number(b.budget_amount),
        spent: Number(b.spent_amount),
        color: b.category_color || '#ccc',
      })),
    };
  },

  async create(userId: string, budget: Omit<Budget, 'id'>) {
    const { data, error } = await supabase
      .from('budgets')
      .insert({ ...budget, user_id: userId })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, userId: string, budget: Partial<Budget>) {
    const { data, error } = await supabase
      .from('budgets')
      .update(budget)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string, userId: string) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },
};
