-- 018: 修正 transfers 表的 RLS 策略
-- 017 误写成 auth.uid() = user_id（返回 anon key 的 sub，恒不等于真实用户 ID），
-- 导致同步引擎通过 x-user-id 头推送的转账记录被 RLS 拦截（401 / 42501）。
-- 改为与全站其它表一致的 public.get_current_user_id()（读取 REST 请求头 x-user-id）。

DROP POLICY IF EXISTS "transfers_owner" ON public.transfers;
CREATE POLICY "transfers_owner" ON public.transfers
  FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());
