-- ============================================================
-- 003: 标签重构 & 移除 merchant 字段
-- 1. 删除 transactions 表的 merchant 列
-- 2. tags 表新增 category_id 外键
-- 3. 删除旧的 merchant 索引
-- ============================================================

-- 删除 merchant 索引
DROP INDEX IF EXISTS idx_transactions_merchant;

-- 删除 merchant 列
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS merchant;

-- tags 表新增 category_id 列
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE;

-- 为已有 tags 补充 category_id（如果有的话设为null，后续可以手动修正）
-- 由于之前标签和分类没有关系，这里不做数据迁移

-- 新增 category_id 索引
CREATE INDEX IF NOT EXISTS idx_tags_category_id ON public.tags(category_id);
