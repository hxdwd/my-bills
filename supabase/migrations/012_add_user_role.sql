-- ============================================================
-- 012: 用户等级体系 — 新增 role 字段
--     role ∈ ('user', 'premium', 'admin')，默认 'user'
-- ============================================================

-- 1. 新增 role 列（带 CHECK 约束）
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'premium', 'admin'));

-- 2. login_user 返回 role 字段
DROP FUNCTION IF EXISTS public.login_user(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.login_user(
  p_username TEXT,
  p_password TEXT
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  currency TEXT,
  locale TEXT,
  role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.avatar_url, u.currency, u.locale, u.role
  FROM public.users u
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash);

  IF NOT FOUND THEN
    RAISE EXCEPTION '用户名或密码错误' USING ERRCODE = '28P01';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
