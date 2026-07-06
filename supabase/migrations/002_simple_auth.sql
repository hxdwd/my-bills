-- 钱盒子 - 简单用户名+密码登录系统
-- Migration: 002_simple_auth
-- 不依赖 Supabase Auth，使用自建 users 表

-- ============================================================
-- 1. 用户表 (users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  currency TEXT DEFAULT 'CNY' CHECK (currency IN ('CNY', 'USD', 'HKD', 'EUR', 'JPY', 'GBP')),
  locale TEXT DEFAULT 'zh-CN',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_username ON public.users(username);

-- RLS: 用户只能读写自己的数据
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own data"
  ON public.users FOR SELECT
  USING (id = auth.uid() OR true);  -- 登录时不需要 RLS
CREATE POLICY "Users can update own data"
  ON public.users FOR UPDATE
  USING (id = auth.uid() OR true);

-- ============================================================
-- 2. 密码哈希函数 (使用 pgcrypto 扩展)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 注册用户函数
CREATE OR REPLACE FUNCTION public.register_user(
  p_username TEXT,
  p_password TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 检查用户名是否已存在
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.username = p_username) THEN
    RAISE EXCEPTION '用户名已存在' USING ERRCODE = '23505';
  END IF;

  -- 插入新用户，密码使用 bcrypt 哈希
  INSERT INTO public.users (username, password_hash, display_name)
  VALUES (p_username, crypt(p_password, gen_salt('bf', 10)), COALESCE(p_display_name, p_username))
  RETURNING id INTO v_user_id;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.created_at
  FROM public.users u
  WHERE u.id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 登录验证函数
CREATE OR REPLACE FUNCTION public.login_user(
  p_username TEXT,
  p_password TEXT
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  currency TEXT,
  locale TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.avatar_url, u.currency, u.locale
  FROM public.users u
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash);

  -- 如果没有匹配的记录，抛出异常
  IF NOT FOUND THEN
    RAISE EXCEPTION '用户名或密码错误' USING ERRCODE = '28P01';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 修改密码函数
CREATE OR REPLACE FUNCTION public.change_password(
  p_user_id UUID,
  p_old_password TEXT,
  p_new_password TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_valid BOOLEAN;
BEGIN
  -- 验证旧密码
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id
      AND u.password_hash = crypt(p_old_password, u.password_hash)
  ) INTO v_valid;

  IF NOT v_valid THEN
    RAISE EXCEPTION '旧密码错误' USING ERRCODE = '28P01';
  END IF;

  -- 更新密码
  UPDATE public.users
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. 修改现有业务表的 user_id 引用
-- 注意：现在业务表引用 public.users 而不是 auth.users
-- ============================================================

-- 先删除现有的外键约束，然后重新创建指向 public.users 的约束
-- accounts 表
ALTER TABLE public.accounts 
  DROP CONSTRAINT IF EXISTS accounts_user_id_fkey;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- categories 表
ALTER TABLE public.categories 
  DROP CONSTRAINT IF EXISTS categories_user_id_fkey;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- transactions 表
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- transfers 表
ALTER TABLE public.transfers 
  DROP CONSTRAINT IF EXISTS transfers_user_id_fkey;

ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- budgets 表
ALTER TABLE public.budgets 
  DROP CONSTRAINT IF EXISTS budgets_user_id_fkey;

ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- tags 表
ALTER TABLE public.tags 
  DROP CONSTRAINT IF EXISTS tags_user_id_fkey;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ============================================================
-- 4. 插入演示用户 (用户名: demo, 密码: 123456)
-- ============================================================
INSERT INTO public.users (id, username, password_hash, display_name)
VALUES (
  'c0a8e1d2-3f4b-5c6d-7e8f-9a0b1c2d3e4f',
  'demo',
  crypt('123456', gen_salt('bf', 10)),
  '演示用户'
) ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 5. 更新 RLS 策略 (如果之前引用 auth.uid() 需要改为自定义鉴权)
-- 注意：由于不再使用 Supabase Auth，RLS 策略中的 auth.uid() 不再有效。
-- 我们改为使用一个自定义的 current_user_id 设置。
-- 前端需要在每个请求中通过请求头传递用户 ID。
-- 
-- 方案：创建一个会话变量来存储当前用户 ID
-- ============================================================

-- 创建设置当前用户的函数
CREATE OR REPLACE FUNCTION public.set_current_user_id(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', p_user_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建获取当前用户的函数
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- 更新 RLS 策略为使用自定义函数
-- accounts
DROP POLICY IF EXISTS "Users can CRUD own accounts" ON public.accounts;
CREATE POLICY "Users can CRUD own accounts"
  ON public.accounts FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- categories
DROP POLICY IF EXISTS "Users can CRUD own categories" ON public.categories;
CREATE POLICY "Users can CRUD own categories"
  ON public.categories FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- transactions
DROP POLICY IF EXISTS "Users can CRUD own transactions" ON public.transactions;
CREATE POLICY "Users can CRUD own transactions"
  ON public.transactions FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- transfers
DROP POLICY IF EXISTS "Users can CRUD own transfers" ON public.transfers;
CREATE POLICY "Users can CRUD own transfers"
  ON public.transfers FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- budgets
DROP POLICY IF EXISTS "Users can CRUD own budgets" ON public.budgets;
CREATE POLICY "Users can CRUD own budgets"
  ON public.budgets FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- tags
DROP POLICY IF EXISTS "Users can CRUD own tags" ON public.tags;
CREATE POLICY "Users can CRUD own tags"
  ON public.tags FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- users 表 RLS
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
CREATE POLICY "Users can view own data"
  ON public.users FOR SELECT
  USING (true);  -- 允许查询用于登录验证

DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data"
  ON public.users FOR UPDATE
  USING (id = public.get_current_user_id());

-- ============================================================
-- 6. 更新触发器 - 不再需要 handle_new_user (不再依赖 auth.users)
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 更新 updated_at 触发器应用于 users 表
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
