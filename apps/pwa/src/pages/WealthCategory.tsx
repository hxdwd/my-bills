import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWealthValuation, todayProfit, toBaseCurrency, ValuationWithHolding } from '../hooks/useWealthValuation'
import { marketToCategory, categoryToMarkets, marketLabel, AssetCategory } from '../db/wealthStore'
import { fmtMoney, type Currency } from '../utils/currency'
import { ChevronRight } from 'lucide-react'

const CAT_LABEL: Record<AssetCategory, string> = { stock: '股票', fund: '基金', gold: '黄金' }

function pctText(pct: number): string {
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`
}

export function WealthCategory() {
  const { type } = useParams<{ type: string }>()
  const cat = (type as AssetCategory) || 'stock'
  const navigate = useNavigate()
  const { results, loading, rates, baseCurrency } = useWealthValuation()

  const catResults = useMemo(
    () => results.filter(r => marketToCategory(r.market) === cat),
    [results, cat],
  )
  const markets = categoryToMarkets(cat)

  // 统一折到当前本位币：本页会同时出现 A股(CNY)/港股(HKD)/美股(USD)，
  // 原币直接相加没有意义（历史上这里就是这么加的），而占比必须换算后才成立。
  const toBaseValue = (r: ValuationWithHolding) =>
    toBaseCurrency(
      r.converted_value ?? r.market_value ?? 0,
      (r.converted_currency ?? r.currency ?? 'CNY') as Currency,
      baseCurrency,
      rates,
    )
  const toBaseProfit = (r: ValuationWithHolding) =>
    toBaseCurrency(r.profit_loss ?? 0, (r.currency ?? 'CNY') as Currency, baseCurrency, rates)
  const toBaseToday = (r: ValuationWithHolding) =>
    toBaseCurrency(todayProfit(r), (r.currency ?? 'CNY') as Currency, baseCurrency, rates)

  const totalMarketValue = catResults.reduce((s, r) => s + toBaseValue(r), 0)
  const totalProfit = catResults.reduce((s, r) => s + toBaseProfit(r), 0)
  const todayTotal = catResults.reduce((s, r) => s + toBaseToday(r), 0)

  // 按市场分组，并算出每个市场的小计 / 占本页比例
  const groups = markets
    .map(m => {
      const list = catResults.filter(r => r.market === m)
      const subtotal = list.reduce((s, r) => s + toBaseValue(r), 0)
      return { market: m, list, subtotal, pct: totalMarketValue > 0 ? (subtotal / totalMarketValue) * 100 : 0 }
    })
    .filter(g => g.list.length > 0)

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-24">
      <div className="flex items-center mb-4">
        <button onClick={() => navigate('/wealth')} className="text-ink-2 mr-3">‹</button>
        <h1 className="text-2xl font-bold text-ink">{CAT_LABEL[cat]}</h1>
        <span className="ml-2 text-[11px] text-ink-3 mt-1.5">{baseCurrency} 计价</span>
      </div>

      {/* 三卡片 */}
      <div className="flex gap-2 mb-5">
        <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-xs text-ink-2 mb-1">总市值</div>
          <div className="text-lg font-bold amount-fluid-sm">{fmtMoney(totalMarketValue, 0)}</div>
        </div>
        <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-xs text-ink-2 mb-1">今日收益</div>
          <div className="text-lg font-bold amount-fluid-sm" style={{ color: todayTotal >= 0 ? '#dc2626' : '#16a34a' }}>
            {todayTotal >= 0 ? '+' : '-'}{fmtMoney(Math.abs(todayTotal), 0)}
          </div>
        </div>
        <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-xs text-ink-2 mb-1">持仓收益</div>
          <div className="text-lg font-bold amount-fluid-sm" style={{ color: totalProfit >= 0 ? '#dc2626' : '#16a34a' }}>
            {totalProfit >= 0 ? '+' : '-'}{fmtMoney(Math.abs(totalProfit), 0)}
          </div>
        </div>
      </div>

      {/* 按市场分组：分组小计带占比，行内也带占比 */}
      {groups.map(g => (
        <div key={g.market} className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-ink-2">{marketLabel(g.market)}</div>
            <div className="text-[11px] text-ink-3 tabular-nums">
              {fmtMoney(g.subtotal, 0)} · {pctText(g.pct)}
            </div>
          </div>
          <div className="space-y-2">
            {g.list.map(r => {
              const value = toBaseValue(r)
              const pct = totalMarketValue > 0 ? (value / totalMarketValue) * 100 : 0
              const pl = toBaseProfit(r)
              return (
                <button
                  key={`${r.market}:${r.symbol}`}
                  onClick={() => navigate(`/wealth/detail/${r.market}/${r.symbol}`)}
                  data-testid="category-holding-row"
                  className="w-full bg-surface rounded-2xl p-3 border border-brand-tint flex items-center justify-between"
                >
                  <div className="text-left min-w-0">
                    <div className="font-medium text-ink truncate">{r.name || r.symbol}</div>
                    <div className="text-xs text-ink-3">{r.symbol}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="font-medium text-ink tabular-nums">{fmtMoney(value, 0)}</div>
                      <div className="text-xs tabular-nums" style={{ color: pl >= 0 ? '#dc2626' : '#16a34a' }}>
                        {pl >= 0 ? '+' : '-'}{fmtMoney(Math.abs(pl), 0)}
                      </div>
                    </div>
                    <span className="text-[11px] text-ink-2 tabular-nums w-10 text-right">{pctText(pct)}</span>
                    <ChevronRight size={18} className="text-ink-3" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {!loading && catResults.length === 0 && (
        <div className="text-center text-ink-3 text-sm mt-10">暂无持仓，点击右下角 + 添加</div>
      )}
    </div>
  )
}
