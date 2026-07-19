-- 反范式化：把子分类名称/颜色冗余到 transactions 记录。
-- 目的：列表/搜索/明细等展示子分类时，不再依赖本地 sub_categories 缓存的完整性。
-- 之前若本地 sub_categories 缓存缺失某分类（如饮食）的子分类，subCategoryMap 查不到
-- subcategory_id，导致 subcategoryName 为空、子分类 chip 不渲染（旅游等已缓存的分类正常）。
-- 冗余字段后，即便子分类缓存不完整，也能从交易记录本身展示正确的子分类名/色。
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subcategory_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subcategory_color TEXT;

-- 回填历史数据：用交易引用的 subcategory_id 关联 sub_categories 取名称/颜色
UPDATE transactions
SET subcategory_name = sc.name,
    subcategory_color = sc.color
FROM sub_categories sc
WHERE transactions.subcategory_id = sc.id
  AND transactions.subcategory_name IS NULL;
