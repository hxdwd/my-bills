-- Migration: 004_big_expense_threshold
-- 为 profiles 表添加大额支出阈值字段

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS big_expense_threshold INTEGER NOT NULL DEFAULT 3000;

COMMENT ON COLUMN public.profiles.big_expense_threshold IS '大额支出阈值，报表页面大额支出最低金额';
