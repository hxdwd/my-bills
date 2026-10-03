/**
 * 子分类 / 标签共用的调色板。
 *
 * 原先这几个组件各自抄了一份一模一样的颜色数组，改一处就会漂移，故收敛到这里。
 */
export const PRESET_COLORS = [
  '#ff6b6b', '#4ecdc4', '#a855f7', '#f472b6', '#fb923c',
  '#38bdf8', '#84cc16', '#818cf8', '#ec4899', '#14b8a6',
  '#E5C45E', '#22c55e', '#ef4444', '#6366f1', '#10b981', '#1677ff',
]

/**
 * 挑一个还没被用过的颜色，都被用完了就从头轮换。
 *
 * 原先所有新建标签都硬编码 `#818cf8`，于是新建几个标签颜色完全一样、靠颜色区分就失效了。
 */
export function pickUnusedColor(used: Array<string | null | undefined>): string {
  const taken = new Set(used.filter((c): c is string => Boolean(c)))
  return PRESET_COLORS.find((c) => !taken.has(c)) ?? PRESET_COLORS[0]
}
