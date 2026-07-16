-- ============================================================
-- 014: 财富持仓多币种架构 — accounts + holdings_transactions 增量字段
--     V1 数据基建，仅新增字段，不删除/修改任何已有列
-- ============================================================

-- 1. accounts 表新增 currency 字段（默认 CNY）
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CNY'
  CHECK (currency IN ('CNY', 'USD', 'HKD'));

-- 2. holdings_transactions 新增 account_id（关联投资账户，历史可为 null）
ALTER TABLE public.holdings_transactions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_holdings_account_id
  ON public.holdings_transactions(account_id);

-- 3. holdings_transactions 新增 asset_currency（资产原始计价币种）
ALTER TABLE public.holdings_transactions
  ADD COLUMN IF NOT EXISTS asset_currency TEXT
  CHECK (asset_currency IS NULL OR asset_currency IN ('CNY', 'USD', 'HKD'));

-- 4. holdings_transactions 新增 is_active（标记活跃持仓，默认 true）
ALTER TABLE public.holdings_transactions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_holdings_active
  ON public.holdings_transactions(user_id, symbol, market, is_active);
