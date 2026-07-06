-- ============================================================
-- 005: tags 表添加 updated_at 列和触发器
-- 修复 sync-engine 中 query.gt('updated_at', lastSync) 报错
-- ============================================================

-- 添加 updated_at 列
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 为已有数据填充 updated_at（使用 created_at 作为初始值）
UPDATE public.tags SET updated_at = created_at WHERE updated_at IS NULL;

-- 添加 updated_at 触发器
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
