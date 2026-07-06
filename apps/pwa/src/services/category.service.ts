import { supabase } from './supabase';
import type { Category } from '../types';

export const categoryService = {
  async list(userId: string, type?: 'expense' | 'income') {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');

    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw error;
    return data as Category[];
  },

  async create(userId: string, category: Omit<Category, 'id'>) {
    const { data, error } = await supabase
      .from('categories')
      .insert({ ...category, user_id: userId })
      .select()
      .single();

    if (error) throw error;
    return data as Category;
  },

  async update(id: string, userId: string, category: Partial<Category>) {
    const { data, error } = await supabase
      .from('categories')
      .update(category)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Category;
  },

  async delete(id: string, userId: string) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_system', false);

    if (error) throw error;
  },
};
