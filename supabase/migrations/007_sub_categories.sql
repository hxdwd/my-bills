-- ============================================================
-- 007: 拆分 tags 为 sub_categories（子分类，绑一级分类）+ 全局 tags
-- 1. 新建 sub_categories 表
-- 2. 将 tags 中带 category_id 的行迁移到 sub_categories
-- 3. tags 表删除 category_id 列与索引
-- 4. transactions 表新增 subcategory_id 列
-- ============================================================

-- 1. 新建子分类表（二级分类，绑一级分类，最末级）
CREATE TABLE IF NOT EXISTS public.sub_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#818cf8',
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sub_categories_user_id ON public.sub_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_categories_category_id ON public.sub_categories(category_id);

ALTER TABLE public.sub_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own sub_categories"
  ON public.sub_categories FOR ALL
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

-- updated_at 触发器
CREATE OR REPLACE FUNCTION update_sub_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sub_categories_updated_at ON public.sub_categories;
CREATE TRIGGER update_sub_categories_updated_at
  BEFORE UPDATE ON public.sub_categories
  FOR EACH ROW EXECUTE FUNCTION update_sub_categories_updated_at();

-- 2. 迁移：tags 中带 category_id 的行 → sub_categories
INSERT INTO public.sub_categories (user_id, name, color, category_id, created_at, updated_at)
SELECT t.user_id, t.name, t.color, t.category_id, t.created_at, t.created_at
FROM public.tags t
WHERE t.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sub_categories sc
    WHERE sc.user_id = t.user_id
      AND sc.category_id = t.category_id
      AND sc.name = t.name
  );

-- 3. tags 表删除 category_id
DROP INDEX IF EXISTS idx_tags_category_id;
ALTER TABLE public.tags DROP COLUMN IF EXISTS category_id;

-- 4. transactions 新增 subcategory_id
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.sub_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_subcategory ON public.transactions(subcategory_id);
