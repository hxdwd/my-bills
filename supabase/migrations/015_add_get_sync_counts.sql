-- 合并同步计数：一次 RPC 返回所有表的用户行数，替代同步引擎逐表 8 次 COUNT。
-- 显式按 p_user_id 过滤（不再单纯依赖 RLS），让 PostgREST 走 user_id 索引，
-- 计数更准更快，也避免把全库行数当成本用户的计数。
CREATE OR REPLACE FUNCTION public.get_sync_counts(p_user_id UUID)
RETURNS TABLE (tbl TEXT, cnt BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT 'accounts', COUNT(*) FROM accounts WHERE user_id = p_user_id
  UNION ALL SELECT 'categories', COUNT(*) FROM categories WHERE user_id = p_user_id
  UNION ALL SELECT 'transactions', COUNT(*) FROM transactions WHERE user_id = p_user_id
  UNION ALL SELECT 'budgets', COUNT(*) FROM budgets WHERE user_id = p_user_id
  UNION ALL SELECT 'sub_categories', COUNT(*) FROM sub_categories WHERE user_id = p_user_id
  UNION ALL SELECT 'tags', COUNT(*) FROM tags WHERE user_id = p_user_id
  UNION ALL SELECT 'profiles', COUNT(*) FROM profiles WHERE id = p_user_id
  UNION ALL SELECT 'holdings_transactions', COUNT(*) FROM holdings_transactions WHERE user_id = p_user_id
$$;
