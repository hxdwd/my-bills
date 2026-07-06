import { supabase } from './supabase';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  currency: string;
  locale: string;
  big_expense_threshold: number;
  created_at: string;
  updated_at: string;
}

export const profileService = {
  async get(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // 如果 profile 不存在（新用户还未触发 trigger），创建默认 profile
      if (error.code === 'PGRST116') {
        return this.createDefault(userId);
      }
      throw error;
    }
    return data as Profile;
  },

  async createDefault(userId: string): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        display_name: null,
        avatar_url: null,
        currency: 'CNY',
        locale: 'zh-CN',
        big_expense_threshold: 3000,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async updateBigExpenseThreshold(userId: string, threshold: number): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ big_expense_threshold: threshold })
      .eq('id', userId);

    if (error) throw error;
  },

  async update(userId: string, updates: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'currency' | 'locale' | 'big_expense_threshold'>>): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;
  },
};
