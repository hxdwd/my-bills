-- Migration: 006_account_is_default
-- 为 accounts 表新增 is_default 字段，标记默认账户

ALTER TABLE public.accounts ADD COLUMN is_default BOOLEAN DEFAULT false;

-- 将第一个账户设为默认（如果存在且没有其他默认账户）
UPDATE public.accounts
SET is_default = true
WHERE id = (
  SELECT id FROM public.accounts
  WHERE is_active = true
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.accounts WHERE is_default = true
);

COMMENT ON COLUMN public.accounts.is_default IS '是否为默认账户，有且只有一个';
