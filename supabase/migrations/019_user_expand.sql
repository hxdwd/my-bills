-- 019: 通用用户扩展表 user_expand
-- 设计原则：所有"彩蛋"等扩展类数据共用一张表，绝不为每个彩蛋单独建表，
-- 也绝不改动 users 主表。所有数据以 JSONB 存放在 extras 字段下，
-- 各彩蛋用各自的顶层 key（如 life / 其他未来彩蛋）隔离。
--
-- RLS 约束（项目硬规则）：本项目使用自定义登录 + anon key + x-user-id 头，
-- auth.uid() 恒为 NULL，因此所有策略必须读取 get_current_user_id()
-- （读取 REST 请求头 x-user-id），绝不可写 auth.uid() = user_id。

CREATE TABLE IF NOT EXISTS public.user_expand (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  extras     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_expand_updated_at ON public.user_expand(updated_at);

ALTER TABLE public.user_expand ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_expand_owner" ON public.user_expand;
CREATE POLICY "user_expand_owner" ON public.user_expand
  FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- updated_at 自动维护
DROP TRIGGER IF EXISTS update_user_expand_updated_at ON public.user_expand;
CREATE TRIGGER update_user_expand_updated_at
  BEFORE UPDATE ON public.user_expand
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
