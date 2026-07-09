import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import { formatCurrency } from '../utils/format'

export interface CategoryDetailSheetProps {
  visible: boolean
  /** 已拼好的标题，形如 "【火锅】· 账单明细" */
  title: string
  categoryId: string
  /** 当前选中的子类筛选；null = 全部 */
  subcategoryId: string | null
  /** 该大类下的子类列表（用于筛选 chip）；无子类则不传 */
  subcategories?: { id: string; name: string }[]
  startDate: Date
  endDate: Date
  onClose: () => void
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface DetailRow {
  id: string
  date: string
  note: string
  amount: number
  subcategoryId?: string
}

export default function CategoryDetailSheet({
  visible,
  title,
  categoryId,
  subcategoryId,
  subcategories,
  startDate,
  endDate,
  onClose,
}: CategoryDetailSheetProps) {
  const { theme } = useTheme()
  const { transactions } = useApp()

  // 选中的子类筛选状态；受控于外部传入的 subcategoryId（null=全部）
  const [selectedSub, setSelectedSub] = useState<string | null>(subcategoryId ?? null)
  useEffect(() => {
    setSelectedSub(subcategoryId ?? null)
  }, [subcategoryId, visible])

  // ESC 关闭（Web）
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, onClose])

  // 过滤属于该分类的支出流水；subcategoryId 为空表示全部
  const rows = useMemo<DetailRow[]>(() => {
    const startStr = ymd(startDate)
    const endStr = ymd(endDate)
    const filterSub = selectedSub ?? undefined

    const result: DetailRow[] = []
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      if (t.categoryId !== categoryId) continue
      if (filterSub && t.subcategoryId !== filterSub) continue
      const td = t.transactionDate
      if (!td || td < startStr || td > endStr) continue
      const amt = Number(t.amount)
      result.push({
        id: t.id,
        date: td,
        note: (t.note && t.note.trim()) || '无备注',
        amount: Number.isFinite(amt) ? amt : 0,
        subcategoryId: t.subcategoryId,
      })
    }

    // 日期倒序（新 → 旧）
    result.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return result
  }, [transactions, categoryId, selectedSub, startDate, endDate])

  // 合计（仅统计已过滤流水）
  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0),
    [rows],
  )

  if (!visible) return null

  const hasSubFilter = Array.isArray(subcategories) && subcategories.length > 0

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      {/* 遮罩：点击空白区域收起抽屉 */}
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* 底部半屏抽屉面板 */}
      <div
        className="relative w-full max-w-lg rounded-t-3xl shadow-soft-lg animate-slide-up flex flex-col max-h-[75vh]"
        style={{
          backgroundColor: theme === 'dark' ? 'var(--bg-surface)' : '#ffffff',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        {/* 顶部拖动手柄（居中、优雅圆角） */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <span className="w-10 h-1 rounded-full bg-black/10" />
        </div>

        {/* 标题 */}
        <div className="px-5 pb-3 pt-1 text-center shrink-0">
          <h2 className={`text-base font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            {title}
          </h2>
          <div className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            共 {rows.length} 笔 · 合计
            <span className="font-mono text-danger ml-1">
              {formatCurrency(total, false, false)}
            </span>
          </div>
        </div>

        {/* 子类筛选 chip */}
        {hasSubFilter && (
          <div className="flex gap-2 px-5 pb-3 overflow-x-auto shrink-0 hide-scrollbar">
            <button
              onClick={() => setSelectedSub(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedSub === null
                  ? 'bg-brand text-white'
                  : theme === 'dark'
                    ? 'bg-surface text-ink-2'
                    : 'bg-brand-tint text-ink-2'
              }`}
            >
              全部
            </button>
            {subcategories!.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSub(s.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedSub === s.id
                    ? 'bg-brand text-white'
                    : theme === 'dark'
                      ? 'bg-surface text-ink-2'
                      : 'bg-brand-tint text-ink-2'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* 明细列表（独立滚动） */}
        {rows.length > 0 ? (
          <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1 hide-scrollbar">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-3 border-b border-[var(--border-warm)] last:border-b-0"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className={`text-sm font-medium truncate ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                    {r.note}
                  </div>
                  <div className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    {r.date}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[15px] font-semibold font-mono text-danger">
                    {formatCurrency(r.amount, false, false)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`flex-1 flex items-center justify-center px-5 pb-8 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            暂无该分类记账记录
          </div>
        )}
      </div>
    </div>
  )
}
