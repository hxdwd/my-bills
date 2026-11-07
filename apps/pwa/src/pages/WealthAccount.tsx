import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useWealthValuation } from '../hooks/useWealthValuation'
import { useApp } from '../context/AppContext'
import { marketToCategory, marketLabel, AssetCategory } from '../db/wealthStore'
import {
  buildAccountBreakdown,
  positionPctInBucket,
  UNSET_ACCOUNT_NAME,
} from '../utils/accountBreakdown'
import { fmtMoney, toBase, CURRENCY_SYMBOL, type Currency } from '../utils/currency'

const CAT_COLOR: Record<AssetCategory, string> = {
  stock: '#c96442',
  fund: '#3b82f6',
  gold: '#e0a82e',
}

function colorOf(n: number | null | undefined): string {
  if (n == null) return '#9ca3af'
  return n > 0 ? '#dc2626' : n < 0 ? '#16a34a' : '#9ca3af'
}

function sign(n: number | null | undefined): string {
  if (n == null || n === 0) return ''
  return n > 0 ? '+' : '-'
}

function pctText(pct: number): string {
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`
}

/**
 * 单个投资账户的持仓明细与占比。
 *
 * 路由：/wealth/account/:accountId（accountId = 'unspecified' 表示历史流水没有账户）
 * 口径：市值按数量比例从标的市值分摊，成本来自该账户自己的流水；
 *      金额一律折算到当前本位币，与财富首页一致。
 */
export default function WealthAccount() {
  const { accountId } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const { results, slices, baseCurrency, rates, summary } = useWealthValuation()
  const { accounts } = useApp()

  const targetId = !accountId || accountId === 'unspecified' ? null : accountId

  const breakdown = useMemo(
    () => buildAccountBreakdown({ valuations: results, slices, accounts, baseCurrency, rates }),
    [results, slices, accounts, baseCurrency, rates],
  )

  const bucket = useMemo(
    () => breakdown.buckets.find(b => b.accountId === targetId) ?? null,
    [breakdown, targetId],
  )

  const account = targetId ? accounts.find(a => a.id === targetId) : null
  const title = bucket?.name ?? account?.name ?? (targetId ? '账户' : UNSET_ACCOUNT_NAME)
  const accountCurrency = (bucket?.currency ?? (account?.currency as Currency) ?? 'CNY') as Currency
  const { baseMV } = summary()
  const shareOfTotal = baseMV > 0 && bucket ? (bucket.valueBase / baseMV) * 100 : 0

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-24">
      <div className="flex items-center mb-4">
        <button onClick={() => navigate('/wealth')} className="text-ink-2 mr-3" aria-label="返回">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink truncate">{title}</h1>
          <div className="text-[11px] text-ink-3">
            {account ? `投资账户 · ${CURRENCY_SYMBOL[accountCurrency]} ${accountCurrency}` : '未关联账户的历史流水'}
            {bucket ? ` · 占全部持仓 ${pctText(shareOfTotal)}` : ''}
          </div>
        </div>
      </div>

      {!bucket || bucket.positions.length === 0 ? (
        <div className="bg-surface rounded-3xl p-8 border border-brand-tint text-center">
          <div className="text-ink-2 mb-1">该账户暂无持仓</div>
          <button
            onClick={() => navigate('/wealth')}
            className="mt-3 bg-brand text-ink px-4 py-2 rounded-xl text-sm font-medium"
          >
            返回财富首页
          </button>
        </div>
      ) : (
        <>
          {/* 三卡片：持仓市值 / 今日收益 / 持仓收益（均已折本位币） */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
              <div className="text-[11px] text-ink-2 mb-1">持仓市值</div>
              <div className="text-base font-bold text-ink amount-fluid-sm">{fmtMoney(bucket.valueBase, 0)}</div>
            </div>
            <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
              <div className="text-[11px] text-ink-2 mb-1">今日收益</div>
              <div className="text-base font-bold amount-fluid-sm" style={{ color: colorOf(bucket.todayBase) }}>
                {sign(bucket.todayBase)}{fmtMoney(Math.abs(bucket.todayBase), 0)}
              </div>
            </div>
            <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
              <div className="text-[11px] text-ink-2 mb-1">持仓收益</div>
              <div className="text-base font-bold amount-fluid-sm" style={{ color: colorOf(bucket.profitBase) }}>
                {sign(bucket.profitBase)}{fmtMoney(Math.abs(bucket.profitBase), 0)}
              </div>
            </div>
          </div>

          {/* 持仓构成：每行带占比条 */}
          <div className="bg-surface rounded-3xl p-4 border border-brand-tint">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-ink">持仓构成</div>
              <span className="text-[11px] text-ink-3">{bucket.positions.length} 只</span>
            </div>

            <div className="space-y-3">
              {bucket.positions.map(p => {
                const pct = positionPctInBucket(p, bucket, baseCurrency, rates)
                const color = CAT_COLOR[marketToCategory(p.market)]
                const valueBase = toBase(p.valueNative, p.valueCurrency, baseCurrency, rates)
                const profitBase = toBase(p.profitNative, p.currency, baseCurrency, rates)
                return (
                  <button
                    key={`${p.market}:${p.symbol}`}
                    onClick={() => navigate(`/wealth/detail/${p.market}/${p.symbol}`)}
                    data-testid="account-position-row"
                    className="w-full text-left block"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink truncate">{p.name}</span>
                          <span className="text-sm text-ink tabular-nums shrink-0">{fmtMoney(valueBase, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-[10px] text-ink-3 truncate">
                            {p.symbol} · {marketLabel(p.market)}
                          </span>
                          <span className="text-[11px] text-ink-2 tabular-nums shrink-0">
                            {pctText(pct)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-ink-3 shrink-0" />
                    </div>
                    <div className="mt-1.5 ml-3.5 h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
                      />
                    </div>
                    <div className="mt-1 ml-3.5 text-[10px]" style={{ color: colorOf(profitBase) }}>
                      {sign(profitBase)}{fmtMoney(Math.abs(profitBase), 0)} 持仓收益
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="text-[10px] text-ink-3 mt-3 leading-relaxed">
              占比 = 该持仓市值 ÷ 本账户持仓市值；同一标的分散在多个账户时市值按数量比例分摊。
            </div>
          </div>
        </>
      )}
    </div>
  )
}
