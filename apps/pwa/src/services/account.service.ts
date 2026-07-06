import { supabase } from './supabase';
import type { Account } from '../types';

export const accountService = {
  async list(userId: string) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw error;
    return data as Account[];
  },

  async create(userId: string, account: Omit<Account, 'id'>) {
    const { data, error } = await supabase
      .from('accounts')
      .insert({ ...account, user_id: userId })
      .select()
      .single();

    if (error) throw error;
    return data as Account;
  },

  async update(id: string, userId: string, account: Partial<Account>) {
    const { data, error } = await supabase
      .from('accounts')
      .update(account)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Account;
  },

  async delete(id: string, userId: string) {
    const { error } = await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async getTotalAssets(userId: string) {
    const { data, error } = await supabase
      .from('accounts')
      .select('balance, type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    const assets = data
      .filter(a => a.type !== 'credit' && a.type !== 'debt')
      .reduce((sum, a) => sum + Number(a.balance), 0);
    const liabilities = data
      .filter(a => a.type === 'credit' || a.type === 'debt')
      .reduce((sum, a) => sum + Math.abs(Number(a.balance)), 0);

    return {
      assets,
      liabilities,
      netAssets: assets - liabilities,
    };
  },
};
