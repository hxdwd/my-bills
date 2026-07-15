-- ============================================================
-- 011: 同步本地 migration 链与线上数据库的差异
--     线上经过多轮手动修复后已稳定，本 migration 将差异补回文件链
--     确保未来重建数据库时结果与线上一致
-- ============================================================

-- 1. sub_categories 外键：auth.users → public.users
ALTER TABLE public.sub_categories
  DROP CONSTRAINT IF EXISTS sub_categories_user_id_fkey;
ALTER TABLE public.sub_categories
  ADD CONSTRAINT sub_categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 2. sub_categories RLS 策略：auth.uid() → get_current_user_id()
DROP POLICY IF EXISTS "Users can CRUD own sub_categories" ON public.sub_categories;
CREATE POLICY "Users can CRUD own sub_categories"
  ON public.sub_categories FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- 3. profiles 外键：auth.users → public.users
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 4. holdings_transactions 外键：auth.users → public.users
ALTER TABLE public.holdings_transactions
  DROP CONSTRAINT IF EXISTS holdings_transactions_user_id_fkey;
ALTER TABLE public.holdings_transactions
  ADD CONSTRAINT holdings_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 5. transactions.amount CHECK：> 0 → >= 0（线上允许零金额交易）
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_amount_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_amount_check CHECK (amount >= 0::numeric);

-- 6. accounts.balance CHECK：补充非负约束（线上已有）
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_balance_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_balance_check CHECK (balance >= 0::numeric);

-- 7. transfers.fee CHECK：补充非负约束（线上已有）
ALTER TABLE public.transfers
  DROP CONSTRAINT IF EXISTS transfers_fee_check;
ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_fee_check CHECK (fee >= 0::numeric);
