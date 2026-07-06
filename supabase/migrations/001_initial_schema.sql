-- 钱盒子 - 数据库初始化 Schema
-- Migration: 001_initial_schema

-- ============================================================
-- 1. 用户档案表 (profiles)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  currency TEXT DEFAULT 'CNY' CHECK (currency IN ('CNY', 'USD', 'HKD', 'EUR', 'JPY', 'GBP')),
  locale TEXT DEFAULT 'zh-CN',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: 用户只能读写自己的档案
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 新用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 2. 账户表 (accounts)
-- ============================================================
CREATE TYPE public.account_type AS ENUM (
  'cash', 'bank', 'credit', 'wechat', 'alipay', 'crypto', 'investment', 'debt'
);

CREATE TABLE public.accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type account_type NOT NULL DEFAULT 'bank',
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  icon TEXT DEFAULT '💳',
  color TEXT DEFAULT '#1e88e5',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own accounts"
  ON public.accounts FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- 3. 分类表 (categories)
-- ============================================================
CREATE TYPE public.category_type AS ENUM ('expense', 'income');

CREATE TABLE public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏷️',
  color TEXT NOT NULL DEFAULT '#ff6b6b',
  type category_type NOT NULL,
  sort_order INT DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_categories_user_id ON public.categories(user_id);
CREATE INDEX idx_categories_user_type ON public.categories(user_id, type);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own categories"
  ON public.categories FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- 4. 交易记录表 (transactions)
-- ============================================================
CREATE TABLE public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type public.category_type NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_time TIME NOT NULL DEFAULT CURRENT_TIME,
  merchant TEXT,
  tags TEXT[],
  note TEXT,
  images TEXT[],
  location JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_category ON public.transactions(user_id, category_id);
CREATE INDEX idx_transactions_account ON public.transactions(user_id, account_id);
CREATE INDEX idx_transactions_type ON public.transactions(user_id, type);
CREATE INDEX idx_transactions_merchant ON public.transactions USING gin(merchant gin_trgm_ops) WHERE merchant IS NOT NULL;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own transactions"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- 5. 转账记录表 (transfers) - 扩展交易记录，补充转账特定字段
-- ============================================================
CREATE TABLE public.transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  from_account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  fee DECIMAL(12, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transfers_user_id ON public.transfers(user_id);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own transfers"
  ON public.transfers FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- 6. 预算表 (budgets)
-- ============================================================
CREATE TABLE public.budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month DATE NOT NULL,  -- 存储月份第一天，如 2026-07-01
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, month, category_id)
);

CREATE INDEX idx_budgets_user_month ON public.budgets(user_id, month DESC);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own budgets"
  ON public.budgets FOR ALL
  USING (auth.uid() = user_id);



-- ============================================================
-- 7. 标签表 (tags) - 可选，用于统一管理标签
-- ============================================================
CREATE TABLE public.tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#818cf8',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_tags_user_id ON public.tags(user_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own tags"
  ON public.tags FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- 9. 触发器和函数
-- ============================================================

-- 更新 updated_at 触发器
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 10. 视图 - 月度统计
-- ============================================================
CREATE VIEW public.monthly_stats AS
SELECT
  t.user_id,
  date_trunc('month', t.transaction_date) AS month,
  COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS income,
  COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense,
  COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) AS balance
FROM public.transactions t
GROUP BY t.user_id, date_trunc('month', t.transaction_date)
ORDER BY month DESC;

CREATE VIEW public.category_stats AS
SELECT
  t.user_id,
  date_trunc('month', t.transaction_date) AS month,
  t.category_id,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color,
  t.type,
  SUM(t.amount) AS total_amount,
  COUNT(*) AS transaction_count
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
GROUP BY t.user_id, date_trunc('month', t.transaction_date), t.category_id, c.name, c.icon, c.color, t.type
ORDER BY month DESC, total_amount DESC;


-- ============================================================
-- 11. 函数 - 预算进度计算
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_budget_progress(
  p_user_id UUID,
  p_month DATE
)
RETURNS TABLE (
  budget_id UUID,
  category_id UUID,
  category_name TEXT,
  category_icon TEXT,
  category_color TEXT,
  budget_amount DECIMAL(12, 2),
  spent_amount DECIMAL(12, 2),
  remaining_amount DECIMAL(12, 2),
  progress_percent NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS budget_id,
    b.category_id,
    c.name AS category_name,
    c.icon AS category_icon,
    c.color AS category_color,
    b.amount AS budget_amount,
    COALESCE(
      (SELECT SUM(t.amount) FROM public.transactions t
       WHERE t.user_id = p_user_id
         AND t.type = 'expense'
         AND t.category_id = b.category_id
         AND date_trunc('month', t.transaction_date) = p_month),
      0
    ) AS spent_amount,
    b.amount - COALESCE(
      (SELECT SUM(t.amount) FROM public.transactions t
       WHERE t.user_id = p_user_id
         AND t.type = 'expense'
         AND t.category_id = b.category_id
         AND date_trunc('month', t.transaction_date) = p_month),
      0
    ) AS remaining_amount,
    CASE
      WHEN b.amount > 0 THEN
        ROUND((COALESCE(
          (SELECT SUM(t.amount) FROM public.transactions t
           WHERE t.user_id = p_user_id
             AND t.type = 'expense'
             AND t.category_id = b.category_id
             AND date_trunc('month', t.transaction_date) = p_month),
          0
        ) / b.amount) * 100, 1)
      ELSE 0
    END AS progress_percent
  FROM public.budgets b
  LEFT JOIN public.categories c ON b.category_id = c.id
  WHERE b.user_id = p_user_id
    AND b.month = p_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 启用 pg_trgm 扩展用于模糊搜索
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
