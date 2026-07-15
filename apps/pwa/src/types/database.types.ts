export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'cash' | 'bank' | 'credit' | 'wechat' | 'alipay' | 'crypto' | 'investment' | 'debt'
          balance: number
          icon: string
          color: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type?: 'cash' | 'bank' | 'credit' | 'wechat' | 'alipay' | 'crypto' | 'investment' | 'debt'
          balance?: number
          icon?: string
          color?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'cash' | 'bank' | 'credit' | 'wechat' | 'alipay' | 'crypto' | 'investment' | 'debt'
          balance?: number
          icon?: string
          color?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string
          color: string
          type: 'expense' | 'income'
          sort_order: number
          is_system: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string
          color?: string
          type: 'expense' | 'income'
          sort_order?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          icon?: string
          color?: string
          type?: 'expense' | 'income'
          sort_order?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: 'expense' | 'income'
          amount: number
          category_id: string | null
          subcategory_id: string | null
          account_id: string
          to_account_id: string | null
          transaction_date: string
          transaction_time: string
          tags: string[] | null
          note: string | null
          images: string[] | null
          location: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'expense' | 'income'
          amount: number
          category_id?: string | null
          subcategory_id?: string | null
          account_id: string
          to_account_id?: string | null
          transaction_date?: string
          transaction_time?: string
          tags?: string[] | null
          note?: string | null
          images?: string[] | null
          location?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'expense' | 'income'
          amount?: number
          category_id?: string | null
          subcategory_id?: string | null
          account_id?: string
          to_account_id?: string | null
          transaction_date?: string
          transaction_time?: string
          tags?: string[] | null
          note?: string | null
          images?: string[] | null
          location?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      transfers: {
        Row: {
          id: string
          transaction_id: string
          user_id: string
          from_account_id: string
          to_account_id: string
          amount: number
          fee: number
          created_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          user_id: string
          from_account_id: string
          to_account_id: string
          amount: number
          fee?: number
          created_at?: string
        }
        Update: {
          id?: string
          transaction_id?: string
          user_id?: string
          from_account_id?: string
          to_account_id?: string
          amount?: number
          fee?: number
          created_at?: string
        }
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          month: string
          category_id: string | null
          amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          month: string
          category_id?: string | null
          amount: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          month?: string
          category_id?: string | null
          amount?: number
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          currency: string
          locale: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          currency?: string
          locale?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          currency?: string
          locale?: string
          created_at?: string
          updated_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          created_at?: string
        }
      }
      sub_categories: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          category_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          category_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          category_id?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      monthly_stats: {
        Row: {
          user_id: string
          month: string
          income: number
          expense: number
          balance: number
        }
      }
      category_stats: {
        Row: {
          user_id: string
          month: string
          category_id: string
          category_name: string
          category_icon: string
          category_color: string
          type: string
          total_amount: number
          transaction_count: number
        }
      }
    }
    Functions: {
      get_budget_progress: {
        Args: {
          p_user_id: string
          p_month: string
        }
        Returns: {
          budget_id: string
          category_id: string | null
          category_name: string | null
          category_icon: string | null
          category_color: string | null
          budget_amount: number
          spent_amount: number
          remaining_amount: number
          progress_percent: number
        }[]
      }
      login_user: {
        Args: {
          p_username: string
          p_password: string
        }
        Returns: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          currency: string | null
          locale: string | null
          role: string
        }[]
      }
      register_user: {
        Args: {
          p_username: string
          p_password: string
          p_display_name: string
        }
        Returns: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          currency: string | null
          locale: string | null
          role: string
        }[]
      }
    }
  }
}
