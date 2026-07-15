-- ============================================================
-- 013: sub_categories 新增 sort_order 列
--     本地 IndexedDB 已有此字段（reorder 功能），
--     但远程表缺失，导致同步推送 400 报错
-- ============================================================

ALTER TABLE public.sub_categories
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sub_categories_sort_order
  ON public.sub_categories(user_id, sort_order);
