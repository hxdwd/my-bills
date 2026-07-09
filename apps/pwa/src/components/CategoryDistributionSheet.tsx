import { useEffect, useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import { DonutChart } from './charts/DonutChart'
import { X } from 'lucide-react'
import { formatCurrency } from '../utils/format'

export interface CategoryDistributionSheetProps {
  visible: boolean
  categoryId: string
  startDate: Date
  endDate: Date
  type: 'expense'
  onClose: () => void
}

// 未分类固定灰色
const UNCLASSIFIED_COLOR = '#9ca3af'

interface SubItem {
  id: string
  name: string
  color: string
  amount: number
  percent: number
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CategoryDistributionSheet({
  visible,
  categoryId,
  startDate,
  endDate,
  onClose,
}: CategoryDistributionSheetProps) {
  const { theme } = useTheme()
  const { transactions, categories, subCategories } = useApp()

  // ESC 关闭（Web）
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, onClose])

  // 一次遍历完成统计，建立 Map 提高查找效率（不重复查询 IndexedDB）
  const result = useMemo(() => {
    const startStr = ymd(startDate)
    const endStr = ymd(endDate)

    // Map: categoryId -> SubCategory[]，避免重复遍历 subCategories
    const subCategoryByCategory = new Map<string, typeof subCategories>()
    for (const s of subCategories) {
      const arr = subCategoryByCategory.get(s.categoryId)
      if (arr) arr.push(s)
      else subCategoryByCategory.set(s.categoryId, [s])
    }

    const subs = subCategoryByCategory.get(categoryId) || []

    // 当前分类信息
    const category = categories.expense.find(c => c.id === categoryId) ||
      categories.income.find(c => c.id === categoryId)

    // 无子分类：直接返回 null（调用方也会判断，这里双保险）
    if (subs.length === 0) {
      return { hasSubs: false, category, items: [] as SubItem[], total: 0 }
    }

    // 预计算子分类金额累加器
    const subAmountMap = new Map<string, number>()
    subs.forEach(s => subAmountMap.set(s.id, 0))
    let unclassifiedAmount = 0
    let categoryTotal = 0

    // 单次遍历 transactions
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      if (t.categoryId !== categoryId) continue
      const td = t.transactionDate
      if (!td || td < startStr || td > endStr) continue
      const amt = Number(t.amount) || 0
      categoryTotal += amt
      if (t.subcategoryId && subAmountMap.has(t.subcategoryId)) {
        subAmountMap.set(t.subcategoryId, (subAmountMap.get(t.subcategoryId) || 0) + amt)
      } else {
        unclassifiedAmount += amt
      }
    }

    // 组装列表（含"未分类"），按金额从高到低排序
    const items: SubItem[] = subs
      .filter(s => (subAmountMap.get(s.id) || 0) > 0)
      .map(s => ({
        id: s.id,
        name: s.name,
        // 强制使用 sub_categories.color（需求：不要随机生成颜色）
        color: s.color || UNCLASSIFIED_COLOR,
        amount: subAmountMap.get(s.id) || 0,
        percent: 0,
      }))

    if (unclassifiedAmount > 0) {
      items.push({
        id: '__unclassified__',
        name: '未分类',
        color: UNCLASSIFIED_COLOR,
        amount: unclassifiedAmount,
        percent: 0,
      })
    }

    // 百分比分母 = 当前主分类金额（禁止使用全部支出/总消费）
    items.forEach(it => {
      it.percent = categoryTotal > 0 ? Number(((it.amount / categoryTotal) * 100).toFixed(1)) : 0
    })
    items.sort((a, b) => b.amount - a.amount)

    return { hasSubs: true, category, items, total: categoryTotal }
  }, [categoryId, startDate, endDate, transactions, categories, subCategories])

  // 有子分类但当前周期无任何消费 → 空状态
  const isEmpty = result.hasSubs && result.items.length === 0

  const donutData = {
    labels: result.items.map(it => it.name),
    values: result.items.map(it => it.amount),
    colors: result.items.map(it => it.color),
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* 蒙层：约 rgba(0,0,0,0.4)，点击关闭 */}
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* 居中卡片：宽约 88%，高自适应，最大 70vh，圆角 24px，轻阴影，scale+fade 动画 */}
      <div
        className="relative w-[88%] max-h-[70vh] flex flex-col rounded-[24px] shadow-soft-lg animate-scale-in overflow-hidden"
        style={{ backgroundColor: theme === 'dark' ? 'var(--bg-surface)' : '#ffffff' }}
      >
        {/* 右上角关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-black/5 transition-colors z-10"
          aria-label="关闭"
        >
          <X size={20} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
        </button>

        {result.hasSubs && (
          <div className="flex flex-col h-full">
            {/* 顶部信息 */}
            <div className="px-5 pt-5 pb-3 text-center">
              <div className={`text-base font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                {result.category?.icon} {result.category?.name}
              </div>
              <div className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>总支出</div>
              {/* Donut 中心与顶部总金额一致：保留两位小数 */}
              <div className="text-2xl font-bold font-mono amount-fluid-lg text-danger mt-1">
                {formatCurrency(result.total, false, false)}
              </div>
            </div>

            {isEmpty ? (
              <div className={`flex-1 flex items-center justify-center px-5 pb-6 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                暂无子分类消费记录
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-5 px-5 pb-6">
                {/* 左侧 Donut Chart */}
                <div className="shrink-0">
                  <DonutChart
                    data={donutData}
                    size={140}
                  />
                </div>
                {/* 右侧列表 */}
                <div className="flex-1 space-y-3 max-h-full overflow-y-auto hide-scrollbar">
                  {result.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: it.color }}
                        />
                        <span className={`text-sm truncate ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                          {it.name}
                        </span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className={`text-sm font-mono amount-fluid break-amount ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                          {formatCurrency(it.amount, false, false)}
                        </div>
                        <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                          {it.percent}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
