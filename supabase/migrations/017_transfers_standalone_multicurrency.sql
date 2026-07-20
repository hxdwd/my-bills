-- 017: transfers 独立表 + 多币种支持
-- 旧 transfers 表是 transactions 的扩展（FK transaction_id），且从未被应用写入，直接重建为独立表。
-- 本迁移【不迁移历史数据】：历史转账仍留在 transactions 表（to_account_id 非空），继续由前端按 to_account_id 识别，
-- 仅新记账走独立 transfers 表。

DROP TABLE IF EXISTS public.transfers;

CREATE TABLE public.transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  from_currency    TEXT NOT NULL DEFAULT 'CNY' CHECK (from_currency IN ('CNY','USD','HKD')),
  from_amount      NUMERIC(18,4) NOT NULL CHECK (from_amount > 0),
  to_account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  to_currency      TEXT NOT NULL DEFAULT 'CNY' CHECK (to_currency IN ('CNY','USD','HKD')),
  to_amount        NUMERIC(18,4) NOT NULL CHECK (to_amount >= 0),
  exchange_rate    NUMERIC(18,8) NOT NULL DEFAULT 1,
  fee              NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  transaction_date DATE NOT NULL,
  transaction_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '00:00:00',
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transfers_different_accounts CHECK (from_account_id <> to_account_id)
);

CREATE INDEX idx_transfers_user_id ON public.transfers (user_id);
CREATE INDEX idx_transfers_date    ON public.transfers (user_id, transaction_date DESC);
CREATE INDEX idx_transfers_from    ON public.transfers (from_account_id);
CREATE INDEX idx_transfers_to      ON public.transfers (to_account_id);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfers_owner" ON public.transfers;
CREATE POLICY "transfers_owner" ON public.transfers
  FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- get_sync_counts 增加 transfers 计数，使同步进度准确
CREATE OR REPLACE FUNCTION public.get_sync_counts(p_user_id UUID)
RETURNS TABLE (tbl TEXT, cnt BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT 'accounts', COUNT(*) FROM accounts WHERE user_id = p_user_id
  UNION ALL SELECT 'categories', COUNT(*) FROM categories WHERE user_id = p_user_id
  UNION ALL SELECT 'transactions', COUNT(*) FROM transactions WHERE user_id = p_user_id
  UNION ALL SELECT 'transfers', COUNT(*) FROM transfers WHERE user_id = p_user_id
  UNION ALL SELECT 'budgets', COUNT(*) FROM budgets WHERE user_id = p_user_id
  UNION ALL SELECT 'sub_categories', COUNT(*) FROM sub_categories WHERE user_id = p_user_id
  UNION ALL SELECT 'tags', COUNT(*) FROM tags WHERE user_id = p_user_id
  UNION ALL SELECT 'profiles', COUNT(*) FROM profiles WHERE id = p_user_id
  UNION ALL SELECT 'holdings_transactions', COUNT(*) FROM holdings_transactions WHERE user_id = p_user_id
$$;
