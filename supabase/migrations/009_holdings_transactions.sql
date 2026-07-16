-- ============================================================
-- 9. 财富持仓流水表 (holdings_transactions)
--    当前持仓由流水聚合得出（净持仓 = Σ买入 − Σ卖出）
--    本地 IndexedDB 经同步引擎与远程双向同步
-- ============================================================
CREATE TABLE public.holdings_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('CN', 'HK', 'US', 'FUND', 'GOLD')),
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  quantity NUMERIC(18, 4) NOT NULL CHECK (quantity >= 0),
  price NUMERIC(18, 4) NOT NULL CHECK (price >= 0),
  date DATE NOT NULL,
  note TEXT,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  asset_currency TEXT CHECK (asset_currency IS NULL OR asset_currency IN ('CNY', 'USD', 'HKD')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_holdings_user_id ON public.holdings_transactions(user_id);
CREATE INDEX idx_holdings_user_symbol ON public.holdings_transactions(user_id, symbol, market);
CREATE INDEX idx_holdings_user_date ON public.holdings_transactions(user_id, date DESC);
CREATE INDEX idx_holdings_account_id ON public.holdings_transactions(account_id);
CREATE INDEX idx_holdings_active ON public.holdings_transactions(user_id, symbol, market, is_active);

ALTER TABLE public.holdings_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own holdings_transactions"
  ON public.holdings_transactions FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());
