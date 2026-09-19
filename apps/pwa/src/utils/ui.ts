// 项目统一的 UI 样式片段（单一来源，避免各处自创导致风格分裂）。
// 来源：Search.tsx 筛选面板 —— 全站筛选 chip / 分组标题 / 日期输入沿用同一套 className。

/** 筛选 chip（选中态：品牌底 + 品牌描边；未选：白底 + 浅描边） */
export function filterChipCls(active: boolean): string {
  return `px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
    active ? 'bg-brand text-ink border-brand-strong' : 'bg-surface text-ink-2 border-[#e6e3da]'
  }`
}

/** 筛选面板的分组小标题 */
export const FILTER_LABEL_CLS = 'text-sm font-medium text-ink mb-2'

/** 筛选面板里的日期/数值输入框 */
export const FILTER_INPUT_CLS =
  'px-3 py-2.5 rounded-xl bg-surface border border-[#e6e3da] text-sm text-ink outline-none'

/** 与筛选 chip 等高的紧凑日期/月份输入框（需要与 chip 同排时用，保证高度一致） */
export const FILTER_INPUT_CHIP_CLS =
  'px-3 py-2 rounded-full bg-surface border border-[#e6e3da] text-sm text-ink outline-none'
