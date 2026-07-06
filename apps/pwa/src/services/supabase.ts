import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('请在 .env 文件中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
});

// 设置当前用户 ID（通过 x-user-id header 传递，配合 RLS）
let currentUserId: string | null = null;

export function setSupabaseUserId(userId: string) {
  currentUserId = userId;
}

export function clearSupabaseUserId() {
  currentUserId = null;
}

// 获取当前用户 ID
export function getSupabaseUserId(): string | null {
  return currentUserId;
}

// 辅助函数: 获取当前用户
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// 辅助函数: 获取用户 ID
export async function getUserId() {
  const user = await getCurrentUser();
  if (!user) throw new Error('用户未登录');
  return user.id;
}
