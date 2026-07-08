-- ============================================================
-- 008: 新增饮食子分类「零食饮料」
-- 历史账单导入需要将零食、奶茶、咖啡、饮品、饮料等
-- 归到独立的「零食饮料」子类（而非正餐）。
-- 该子分类绑定一级分类「饮食」。
-- ============================================================

INSERT INTO public.sub_categories (user_id, name, color, category_id, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000000',
  '零食饮料',
  '#ffd166',
  c.id,
  now(),
  now()
FROM public.categories c
WHERE c.name = '饮食'
  AND c.user_id = '00000000-0000-0000-0000-000000000000'
  AND NOT EXISTS (
    SELECT 1 FROM public.sub_categories sc
    WHERE sc.user_id = '00000000-0000-0000-0000-000000000000'
      AND sc.category_id = c.id
      AND sc.name = '零食饮料'
  );
