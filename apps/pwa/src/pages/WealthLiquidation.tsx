import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { getLiquidatedHoldings, type LiquidatedHolding, marketLabel } from '../db/wealthStore'
import { CURRENCY_SYMBOL, Currency } from '../utils/currency'

type SortMode = 'date' | 'profit'

function fmtAmount(n: number, sym: string): string {
  return `${sym}${Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 按月份分组 */
function groupByMonth(items: LiquidatedHolding[]) {
  const map = new Map<string, LiquidatedHolding[]>()
  for (const it of items) {
    const m = it.lastSellDate.slice(0, 7) // "2026-07"
    if (!map.has(m)) map.set(m, [])
    map.get(m)!.push(it)
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
}

/** 月份显示名 */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年 ${parseInt(m)}月`
}

export default function WealthLiquidation() {
  const navigate = useNavigate()
  const [list, setList] = useState<LiquidatedHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('date')

  useEffect(() => {
    getLiquidatedHoldings().then(setList).finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(() => {
    const copy = [...list]
    if (sortMode === 'profit') {
      copy.sort((a, b) => b.profitLoss - a.profitLoss)
    }
    // date 排序：getLiquidatedHoldings 已返回倒序，不做二次排序
    return copy
  }, [list, sortMode])

  // 汇总指标
  const totalPL = sorted.reduce((s, i) => s + i.profitLoss, 0)
  const totalAmount = sorted.reduce((s, i) => s + i.totalProceeds, 0)
  const totalCount = sorted.length
  const plUp = totalPL > 0
  const plFlat = totalPL === 0

  // 是否按月分组 (>5条)
  const groups = useMemo(() => (sorted.length > 5 ? groupByMonth(sorted) : null), [sorted])

  return (
    <div className="min-h-screen pb-8 bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-bg/85 backdrop-blur-sm">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-xl hover:bg-brand-tint transition-colors">
          <ArrowLeft size={20} className="text-ink" />
        </button>
        <h1 className="text-base font-semibold flex-1 text-ink">清仓复盘</h1>
        {!loading && totalCount > 0 && (
          <div className="flex rounded-lg overflow-hidden border border-brand-tint text-[11px]">
            <button
              onClick={() => setSortMode('date')}
              className={`px-2.5 py-1.5 transition-colors ${sortMode === 'date' ? 'bg-brand text-ink font-medium' : 'bg-surface text-ink-3'}`}
            >
              日期
            </button>
            <button
              onClick={() => setSortMode('profit')}
              className={`px-2.5 py-1.5 transition-colors ${sortMode === 'profit' ? 'bg-brand text-ink font-medium' : 'bg-surface text-ink-3'}`}
            >
              盈亏
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pt-2">
        {/* ===== 骨架屏加载 ===== */}
        {loading && (
          <div className="space-y-3">
            {/* 汇总卡片骨架 */}
            <div className="rounded-2xl bg-surface border border-brand-tint p-4 flex gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex-1 space-y-2">
                  <div className="h-3 w-10 rounded-full bg-brand-tint animate-pulse" />
                  <div className="h-5 w-16 rounded-md bg-brand-tint animate-pulse" />
                </div>
              ))}
            </div>
            {/* 列表骨架 */}
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl bg-surface border border-brand-tint p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 w-28 rounded-md bg-brand-tint animate-pulse" />
                  <div className="h-4 w-8 rounded-md bg-brand-tint animate-pulse" />
                </div>
                <div className="h-3 w-48 rounded-full bg-brand-tint animate-pulse" />
                <div className="h-6 w-24 rounded-md bg-brand-tint animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* ===== 空状态 ===== */}
        {!loading && list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
              <TrendingUp size={32} className="text-ink-3" />
            </div>
            <div className="text-base font-medium text-ink-2 mb-1">暂无清仓记录</div>
            <div className="text-sm text-ink-3">每笔卖出，都是旅途的总结</div>
          </div>
        )}

        {/* ===== 数据内容 ===== */}
        {!loading && list.length > 0 && (
          <>
            {/* 顶部汇总卡片 */}
            <div className="rounded-2xl bg-surface border border-brand-tint p-4 flex gap-3 mb-3">
              <div className="flex-1 text-center">
                <div className="text-[10px] text-ink-3 mb-1">总清仓盈亏</div>
                <div className={`font-mono text-sm font-bold ${plUp ? 'text-danger' : plFlat ? 'text-ink' : 'text-ok'}`}>
                  {plUp ? '+' : ''}¥{Math.abs(totalPL).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="w-px bg-brand-tint" />
              <div className="flex-1 text-center">
                <div className="text-[10px] text-ink-3 mb-1">清仓总金额</div>
                <div className="font-mono text-sm font-bold text-ink">
                  ¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="w-px bg-brand-tint" />
              <div className="flex-1 text-center">
                <div className="text-[10px] text-ink-3 mb-1">清仓次数</div>
                <div className="font-mono text-sm font-bold text-ink">{totalCount}</div>
              </div>
            </div>

            {/* ===== 分组模式 (列表>5条) ===== */}
            {groups
              ? groups.map(([ym, items]) => (
                  <div key={ym} className="mb-3">
                    <div className="text-xs text-ink-3 font-medium px-1 mb-2">{monthLabel(ym)}</div>
                    <div className="space-y-2">
                      {items.map(item => <LiquidationCard key={`${item.market}:${item.symbol}`} item={item} navigate={navigate} />)}
                    </div>
                  </div>
                ))
              : (
                <div className="space-y-2">
                  {sorted.map(item => <LiquidationCard key={`${item.market}:${item.symbol}`} item={item} navigate={navigate} />)}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}

/** 单张清仓卡片 */
function LiquidationCard({ item, navigate }: { item: LiquidatedHolding; navigate: (path: string) => void }) {
  const up = item.profitLoss > 0
  const flat = item.profitLoss === 0
  const sym = CURRENCY_SYMBOL[(item.currency || 'CNY') as Currency] || '¥'

  return (
    <div
      onClick={() => navigate(`/wealth/detail/${item.market}/${item.symbol}`)}
      className="rounded-2xl border border-brand-tint bg-surface p-4 cursor-pointer transition-colors hover:brightness-95"
    >
      {/* 顶部：资产名 + 代码 + 持有天数 */}
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate text-ink">{item.name}</div>
          <div className="text-xs mt-0.5 text-ink-3">
            {item.symbol} · {marketLabel(item.market)}
          </div>
        </div>
        <span className="text-xs ml-2 shrink-0 text-ink-3">{item.holdingDays} 天</span>
      </div>

      {/* 中部第一行：日期区间 */}
      <div className="flex items-center gap-2 mb-1 text-xs text-ink-3">
        <span>{item.firstBuyDate}</span>
        <span>→</span>
        <span>{item.lastSellDate}</span>
      </div>

      {/* 中部第二行：总清仓金额（极小字） */}
      <div className="text-[10px] text-ink-3 mb-2">
        总清仓金额：{fmtAmount(item.totalProceeds, sym)}
      </div>

      {/* 底部：盈亏 + 收益率 */}
      <div className={`font-mono text-lg font-bold ${up ? 'text-danger' : flat ? 'text-ink' : 'text-ok'}`}>
        {up ? '+' : ''}{fmtAmount(item.profitLoss, sym)}
        <span className={`ml-2 text-sm font-medium ${up ? 'text-danger' : flat ? 'text-ink-3' : 'text-ok'}`}>
          ({up ? '+' : ''}{item.profitRate.toFixed(1)}%)
        </span>
      </div>
    </div>
  )
}
