import { create } from 'zustand';
import { supabase, setSupabaseUserId, clearSupabaseUserId } from '../services/supabase';
import { syncEngine } from '../db/sync-engine';

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  currency: string;
  locale: string;
}

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  setUser: (user: AppUser | null) => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  initAuth: () => Promise<void>;
}

const AUTH_USER_KEY = 'mybills_user';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  initialized: false,

  setUser: (user) => {
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_KEY);
    }
    set({ user, loading: false, initialized: true });
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.rpc('login_user', {
        p_username: username,
        p_password: password,
      });

      if (error) {
        set({ loading: false, error: error.message });
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        const err = new Error('用户名或密码错误');
        set({ loading: false, error: err.message });
        throw err;
      }

      const row = data[0];
      const user: AppUser = {
        id: row.id,
        username: row.username,
        displayName: row.display_name || row.username,
        avatarUrl: row.avatar_url || undefined,
        currency: row.currency || 'CNY',
        locale: row.locale || 'zh-CN',
      };

      // 设置全局 user_id（用于 RLS header 和 RPC）
      setSupabaseUserId(user.id);

      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      set({ user, loading: false, error: null, initialized: true });
    } catch (err: any) {
      const message = err?.message || '登录失败';
      set({ loading: false, error: message, initialized: true });
      throw err;
    }
  },

  register: async (username, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.rpc('register_user', {
        p_username: username,
        p_password: password,
        p_display_name: displayName || username,
      });

      if (error) {
        set({ loading: false, error: error.message });
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        const err = new Error('注册失败，请稍后重试');
        set({ loading: false, error: err.message });
        throw err;
      }

      const row = data[0];
      const user: AppUser = {
        id: row.id,
        username: row.username,
        displayName: row.display_name || row.username,
        currency: 'CNY',
        locale: 'zh-CN',
      };

      // 设置全局 user_id（用于 RLS header 和 RPC）
      setSupabaseUserId(user.id);

      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      set({ user, loading: false, error: null, initialized: true });
    } catch (err: any) {
      const message = err?.message || '注册失败';
      set({ loading: false, error: message, initialized: true });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem(AUTH_USER_KEY);
    clearSupabaseUserId();
    set({ user: null, loading: false, error: null, initialized: true });
    // 清除 IndexedDB 本地缓存数据
    syncEngine.clearAllData().catch(err => {
      console.error('清除本地数据失败:', err);
    });
  },

  initAuth: async () => {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      if (stored) {
        const user: AppUser = JSON.parse(stored);
        // 恢复全局 user_id
        setSupabaseUserId(user.id);
        set({ user, loading: false, initialized: true });
      } else {
        set({ user: null, loading: false, initialized: true });
      }
    } catch {
      localStorage.removeItem(AUTH_USER_KEY);
      clearSupabaseUserId();
      set({ user: null, loading: false, initialized: true });
    }
  },
}));
