-- ============================================================
-- 021: 同步增量化的前置改动
--
-- 背景：sync-engine 每次 App 启动都无条件全量拉取 9 张表
--       （transactions 4066 行 ≈ 2.4MB），远程毫无变更时也照样拉。
--       改造为「先取各表指纹（行数 + max(updated_at)），只增量拉取真正变更的表」，
--       本迁移补齐该方案依赖的三个前提。
--
-- 安全性：全部为**新增式**改动（新增触发器 / 索引 / 函数），
--         不改任何现有列、不动任何数据、不替换现有 RPC。
--   1) transfers / holdings_transactions 缺 BEFORE UPDATE 触发器
--      → 改了行 updated_at 不变，增量拉取会漏，必须补
--   2) transactions 缺 (user_id, updated_at) 索引
--      → 增量查询按 updated_at 过滤会退化成扫描
--   3) 新增 get_sync_meta RPC：一次返回每表的 行数 + max(updated_at)
--      （老的 get_sync_counts 保持原样不动，新老并行，零风险）
-- ============================================================

-- ---------- 1) 补 updated_at 触发器（复用已有的通用函数） ----------
DROP TRIGGER IF EXISTS update_transfers_updated_at ON public.transfers;
CREATE TRIGGER update_transfers_updated_at
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_holdings_transactions_updated_at ON public.holdings_transactions;
CREATE TRIGGER update_holdings_transactions_updated_at
  BEFORE UPDATE ON public.holdings_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2) 增量查询索引 ----------
-- 仅 transactions 需要（表最大）；其余表都在百行以内，无需额外索引。
CREATE INDEX IF NOT EXISTS idx_transactions_user_updated
  ON public.transactions (user_id, updated_at);

-- ---------- 3) 同步指纹 RPC ----------
-- 前端用「cnt 变了 或 max_updated_at 变了」判断该表是否需要拉取；
-- 两者都没变就直接跳过（0 请求）。注意这里补上了 transfers，
-- 老的 get_sync_counts 漏了它。
CREATE OR REPLACE FUNCTION public.get_sync_meta(p_user_id UUID)
RETURNS TABLE (tbl TEXT, cnt BIGINT, max_updated_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
AS $$
  SELECT 'accounts', COUNT(*), MAX(updated_at) FROM accounts WHERE user_id = p_user_id
  UNION ALL SELECT 'categories', COUNT(*), MAX(updated_at) FROM categories WHERE user_id = p_user_id
  UNION ALL SELECT 'transactions', COUNT(*), MAX(updated_at) FROM transactions WHERE user_id = p_user_id
  UNION ALL SELECT 'transfers', COUNT(*), MAX(updated_at) FROM transfers WHERE user_id = p_user_id
  UNION ALL SELECT 'budgets', COUNT(*), MAX(updated_at) FROM budgets WHERE user_id = p_user_id
  UNION ALL SELECT 'sub_categories', COUNT(*), MAX(updated_at) FROM sub_categories WHERE user_id = p_user_id
  UNION ALL SELECT 'tags', COUNT(*), MAX(updated_at) FROM tags WHERE user_id = p_user_id
  UNION ALL SELECT 'profiles', COUNT(*), MAX(updated_at) FROM profiles WHERE id = p_user_id
  UNION ALL SELECT 'holdings_transactions', COUNT(*), MAX(updated_at) FROM holdings_transactions WHERE user_id = p_user_id
$$;
