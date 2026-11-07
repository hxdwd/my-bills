import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useWealthValuation } from '../hooks/useWealthValuation'
import { useApp } from '../context/AppContext'
import { marketToCategory, marketLabel, AssetCategory } from '../db/wealthStore'
import {
  buildAccountBreakdown,
  bucketValueIn,
  positionPctInBucket,
  UNSET_ACCOUNT_NAME,
} from '../utils/accountBreakdown'
import { fmtMoney, fmtWithSymbol, toBase, CURRENCY_SYMBOL, type Currency } from '../utils/currency'

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
 *      账户总额 = 可用现金（账户余额）+ 持仓市值，与资产页的账户信息保持一致。
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
  const isForeign = accountCurrency !== baseCurrency
  const accSym = CURRENCY_SYMBOL[accountCurrency] || '¥'
  const baseSym = CURRENCY_SYMBOL[baseCurrency] || '¥'
  const { baseMV } = summary()
  const shareOfTotal = baseMV > 0 && bucket ? (bucket.valueBase / baseMV) * 100 : 0

  // ===== 资金构成（原币口径，境外账户额外给本位币折算）=====
  const cashAcc = account?.balance ?? 0
  const holdingsValueAcc = bucket ? bucketValueIn(bucket, accountCurrency, rates) : 0
  const holdingsCostAcc = bucket
    ? bucket.positions.reduce((s, p) => s + toBase(p.costNative, p.currency, accountCurrency, rates), 0)
    : 0
  const totalAcc = cashAcc + holdingsValueAcc
  const toBaseFromAcc = (v: number) => toBase(v, accountCurrency, baseCurrency, rates)

  const accMoney = (v: number) => `${accSym}${fmtMoney(v, 2)}`
  const baseMoney = (v: number) => `${baseSym}${fmtMoney(v, 2)}`

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-24">
      <div className="flex items-center mb-4">
        <button onClick={() => navigate('/wealth')} className="text-ink-2 mr-3" aria-label="返回">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink truncate">{title}</h1>
          <div className="text-[11px] text-ink-3">
            {account ? `投资账户 · ${accountCurrency}` : '未关联账户的历史流水'}
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
          {/* 资金构成：账户总额（可用 + 持仓）+ 拆分 */}
          <div className="bg-surface rounded-3xl p-4 border border-brand-tint mb-3">
            <div className="text-xs text-ink-3 mb-1">账户总额</div>
            <div className="font-bold text-2xl text-ink font-amount amount-fluid">
              {accMoney(totalAcc)}
            </div>
            {isForeign && (
              <div className="text-[11px] text-ink-3 font-amount mt-0.5">
                ≈ {baseMoney(toBaseFromAcc(totalAcc))}（按当前汇率）
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-brand-tint">
              <div>
                <div className="text-[10px] text-ink-3">可用现金</div>
                <div className="text-sm font-medium text-ink mt-0.5 tabular-nums">{accMoney(cashAcc)}</div>
                {isForeign && (
                  <div className="text-[10px] text-ink-3 mt-0.5">≈ {baseMoney(toBaseFromAcc(cashAcc))}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-ink-3">持仓市值</div>
                <div className="text-sm font-medium text-ink mt-0.5 tabular-nums">{accMoney(holdingsValueAcc)}</div>
                {isForeign && (
                  <div className="text-[10px] text-ink-3 mt-0.5">≈ {baseMoney(toBaseFromAcc(holdingsValueAcc))}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-ink-3">持仓本金</div>
                <div className="text-sm font-medium text-ink mt-0.5 tabular-nums">{accMoney(holdingsCostAcc)}</div>
                {isForeign && (
                  <div className="text-[10px] text-ink-3 mt-0.5">≈ {baseMoney(toBaseFromAcc(holdingsCostAcc))}</div>
                )}
              </div>
            </div>
          </div>

          {/* 收益：统一折本位币 */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
              <div className="text-[11px] text-ink-2 mb-1">今日收益{isForeign ? `（折${baseCurrency}）` : ''}</div>
              <div className="text-base font-bold amount-fluid-sm" style={{ color: colorOf(bucket.todayBase) }}>
                {sign(bucket.todayBase)}{baseSym}{fmtMoney(Math.abs(bucket.todayBase), 0)}
              </div>
            </div>
            <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
              <div className="text-[11px] text-ink-2 mb-1">持仓收益{isForeign ? `（折${baseCurrency}）` : ''}</div>
              <div className="text-base font-bold amount-fluid-sm" style={{ color: colorOf(bucket.profitBase) }}>
                {sign(bucket.profitBase)}{baseSym}{fmtMoney(Math.abs(bucket.profitBase), 0)}
              </div>
            </div>
            <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
              <div className="text-[11px] text-ink-2 mb-1">持仓占比</div>
              <div className="text-base font-bold amount-fluid-sm text-ink">{pctText(shareOfTotal)}</div>
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
                          <span className="text-sm text-ink tabular-nums shrink-0">
                            {fmtWithSymbol(p.valueNative, p.valueCurrency, 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-[10px] text-ink-3 truncate">
                            {p.symbol} · {marketLabel(p.market)}
                            {p.valueCurrency !== baseCurrency && ` · ≈ ${baseMoney(valueBase)}`}
                          </span>
                          <span className="text-[11px] text-ink-2 tabular-nums shrink-0">{pctText(pct)}</span>
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
                      {sign(profitBase)}{fmtMoney(Math.abs(profitBase), 2)} 持仓收益（折{baseCurrency}）
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="text-[10px] text-ink-3 mt-3 leading-relaxed">
              占比 = 该持仓市值 ÷ 本账户持仓市值；同一标的分散在多个账户时市值按数量比例分摊。
              {isForeign && ' 金额按账户币种展示，括号内为折算后的本位币。'}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
