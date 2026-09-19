// 清仓收益记录：逐笔列出卖出锁定的收益。
// - 支持按时间段筛选（全部 / 近1月 / 近3月 / 今年 / 自定义起止）
// - 支持收益排序（最高 / 最低）
// - 数据来自本地流水（computeRealizedProfit），0 网络请求
// 筛选控件样式与 Search.tsx 的筛选面板保持一致（chip + 分组标题 + date input）。

import { useMemo, useState } from 'react'
import { RealizedEvent, marketLabel } from '../../db/wealthStore'
import { CURRENCY_SYMBOL, Currency, fmtMoney, toBase } from '../../utils/currency'
import { filterChipCls, FILTER_INPUT_CLS } from '../../utils/ui'

type RangeKind = 'all' | '1m' | '3m' | 'year' | 'custom'
type SortKind = 'desc' | 'asc'

const RANGES: { key: RangeKind; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: '1m', label: '近1月' },
  { key: '3m', label: '近3月' },
  { key: 'year', label: '今年' },
  { key: 'custom', label: '自定义' },
]

const SORTS: { key: SortKind; label: string }[] = [
  { key: 'desc', label: '收益最高' },
  { key: 'asc', label: '收益最低' },
]

function colorOf(n: number): string {
  if (n > 0) return '#dc2626'
  if (n < 0) return '#16a34a'
  return '#6b7280'
}

// 本地日期字符串（避免 toISOString 的时区偏移）
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 快捷时间段起始日（含）；'all' 返回 null 表示不限制
function quickStart(kind: RangeKind): string | null {
  const now = new Date()
  if (kind === '1m') return toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()))
  if (kind === '3m') return toDateStr(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()))
  if (kind === 'year') return `${now.getFullYear()}-01-01`
  return null
}

interface RealizedListProps {
  events: RealizedEvent[]
  base: Currency
  rates: Record<string, number>
}

export function RealizedList({ events, base, rates }: RealizedListProps) {
  const [range, setRange] = useState<RangeKind>('all')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [sort, setSort] = useState<SortKind>('desc')

  const rows = useMemo(() => {
    const from = range === 'custom' ? (start || null) : quickStart(range)
    const to = range === 'custom' ? (end || null) : null
    return events
      .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
      .map(e => ({ ...e, baseAmount: toBase(e.amount, e.currency as Currency, base, rates) }))
      .sort((a, b) => (sort === 'desc' ? b.baseAmount - a.baseAmount : a.baseAmount - b.baseAmount))
  }, [events, base, rates, range, start, end, sort])

  return (
    <div className="pb-4" data-testid="realized-list">
      {/* 筛选区：固定不随列表滚动 */}
      <div className="sticky top-0 z-10 bg-surface px-4 pt-3 pb-3 border-b border-brand-tint">
        <div className="text-sm font-medium text-ink mb-2">日期</div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} className={filterChipCls(range === r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="date"
              value={start}
              onChange={e => setStart(e.target.value)}
              className={`flex-1 ${FILTER_INPUT_CLS}`}
            />
            <span className="text-sm text-ink-2">至</span>
            <input
              type="date"
              value={end}
              min={start || undefined}
              onChange={e => setEnd(e.target.value)}
              className={`flex-1 ${FILTER_INPUT_CLS}`}
            />
          </div>
        )}

        <div className="text-sm font-medium text-ink mt-3 mb-2">排序</div>
        <div className="flex flex-wrap gap-2">
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSort(s.key)} className={filterChipCls(sort === s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 记录列表 */}
      {rows.length === 0 ? (
        <div className="py-12 text-center text-xs text-ink-3" data-testid="realized-empty">
          该时间段暂无清仓记录
        </div>
      ) : (
        <div className="px-4">
          <div className="text-[10px] text-ink-3 py-2">共 {rows.length} 笔</div>
          <div className="space-y-1">
            {rows.map((r, i) => (
              <div
                key={`${r.market}:${r.symbol}:${r.date}:${i}`}
                className="flex items-center gap-3 py-2 border-b border-brand-tint last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink truncate">{r.name}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5 truncate">
                    {r.date} · {marketLabel(r.market)} · {r.symbol}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono font-medium whitespace-nowrap" style={{ color: colorOf(r.baseAmount) }}>
                    {r.baseAmount >= 0 ? '+' : '-'}{CURRENCY_SYMBOL[base]}{fmtMoney(Math.abs(r.baseAmount))}
                  </div>
                  {r.currency !== base && (
                    <div className="text-[10px] text-ink-3 font-mono mt-0.5 whitespace-nowrap">
                      {CURRENCY_SYMBOL[r.currency as Currency] ?? ''}{fmtMoney(Math.abs(r.amount))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
