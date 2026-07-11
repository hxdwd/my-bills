-- ============================================================
-- 10. 修复 holdings_transactions 的 RLS 鉴权
--     原策略使用 auth.uid()，但本项目为自定义登录（非 Supabase Auth），
--     auth.uid() 恒为 NULL，导致新增/推送持仓被 RLS 拒绝（42501 / 401）。
--     改为与其它表一致的 public.get_current_user_id()：
--       - 优先读取 REST 请求头 x-user-id（PostgREST 放入 request.headers GUC）
--       - 回退到会话变量 app.current_user_id（set_current_user_id RPC）
-- ============================================================

-- 重写 get_current_user_id，支持从 x-user-id 请求头鉴权
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID AS $$
DECLARE
  h text;
  s text;
BEGIN
  BEGIN
    h := current_setting('request.headers', true);
  EXCEPTION WHEN OTHERS THEN
    h := NULL;
  END;
  IF h IS NOT NULL AND h <> '' THEN
    BEGIN
      RETURN NULLIF((h::json->>'x-user-id')::text, '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      -- header 解析失败则继续回退
    END;
  END IF;
  BEGIN
    s := current_setting('app.current_user_id', true);
  EXCEPTION WHEN OTHERS THEN
    s := NULL;
  END;
  RETURN NULLIF(s, '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- 修正 holdings_transactions 策略
DROP POLICY IF EXISTS "Users can CRUD own holdings_transactions" ON public.holdings_transactions;
CREATE POLICY "Users can CRUD own holdings_transactions"
  ON public.holdings_transactions FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());
