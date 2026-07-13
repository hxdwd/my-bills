import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWealthValuation, todayProfit, ValuationWithHolding } from '../hooks/useWealthValuation'
import { marketToCategory, categoryToMarkets, marketLabel, AssetCategory } from '../db/wealthStore'
import { ChevronRight } from 'lucide-react'

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

const CAT_LABEL: Record<AssetCategory, string> = { stock: '股票', fund: '基金', gold: '黄金' }

export function WealthCategory() {
  const { type } = useParams<{ type: string }>()
  const cat = (type as AssetCategory) || 'stock'
  const navigate = useNavigate()
  const { results, loading } = useWealthValuation()

  const catResults = useMemo(
    () => results.filter(r => marketToCategory(r.market) === cat),
    [results, cat],
  )
  const markets = categoryToMarkets(cat)

  const totalMarketValue = catResults.reduce((s, r) => s + (r.market_value || 0), 0)
  const totalProfit = catResults.reduce((s, r) => s + (r.profit_loss || 0), 0)
  const todayTotal = catResults.reduce((s, r) => s + todayProfit(r), 0)

  // 按市场分组
  const grouped = useMemo(() => {
    const g: Record<string, ValuationWithHolding[]> = {}
    markets.forEach(m => { g[m] = [] })
    catResults.forEach(r => { if (g[r.market]) g[r.market].push(r) })
    return g
  }, [catResults, markets])

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-24">
      <div className="flex items-center mb-4">
        <button onClick={() => navigate('/wealth')} className="text-ink-2 mr-3">‹</button>
        <h1 className="text-2xl font-bold text-ink">{CAT_LABEL[cat]}</h1>
      </div>

      {/* 三卡片 */}
      <div className="flex gap-2 mb-5">
        <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-xs text-ink-2 mb-1">总市值</div>
          <div className="text-lg font-bold amount-fluid-sm">{fmtMoney(totalMarketValue)}</div>
        </div>
        <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-xs text-ink-2 mb-1">今日收益</div>
          <div className="text-lg font-bold amount-fluid-sm" style={{ color: todayTotal >= 0 ? '#dc2626' : '#16a34a' }}>
            {todayTotal >= 0 ? '+' : ''}{fmtMoney(todayTotal)}
          </div>
        </div>
        <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-xs text-ink-2 mb-1">累计收益</div>
          <div className="text-lg font-bold amount-fluid-sm" style={{ color: totalProfit >= 0 ? '#dc2626' : '#16a34a' }}>
            {totalProfit >= 0 ? '+' : ''}{fmtMoney(totalProfit)}
          </div>
        </div>
      </div>

      {/* 按市场分组 */}
      {markets.map(m => {
        const list = grouped[m] || []
        if (list.length === 0) return null
        return (
          <div key={m} className="mb-4">
            <div className="text-sm font-semibold text-ink-2 mb-2">{marketLabel(m as any)}</div>
            <div className="space-y-2">
              {list.map(r => (
                <button
                  key={`${r.market}:${r.symbol}`}
                  onClick={() => navigate(`/wealth/detail/${r.market}/${r.symbol}`)}
                  className="w-full bg-surface rounded-2xl p-3 border border-brand-tint flex items-center justify-between"
                >
                  <div className="text-left">
                    <div className="font-medium text-ink">{r.name || r.symbol}</div>
                    <div className="text-xs text-ink-3">{r.symbol}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="font-medium text-ink">{fmtMoney(r.market_value)}</div>
                      <div className="text-xs" style={{ color: (r.profit_loss || 0) >= 0 ? '#dc2626' : '#16a34a' }}>
                        {r.profit_loss! >= 0 ? '+' : ''}{fmtMoney(r.profit_loss)}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-ink-3" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {!loading && catResults.length === 0 && (
        <div className="text-center text-ink-3 text-sm mt-10">暂无持仓，点击右下角 + 添加</div>
      )}
    </div>
  )
}
