import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { useWealthValuation } from '../hooks/useWealthValuation'
import { useApp } from '../context/AppContext'
import {
  buildAccountBreakdown,
  bucketValueIn,
  positionPctInBucket,
  UNSET_ACCOUNT_NAME,
} from '../utils/accountBreakdown'
import { toBase, CURRENCY_SYMBOL, CURRENCY_LABEL, type Currency } from '../utils/currency'

// 红涨绿跌
function colorOf(n: number | null | undefined): string {
  if (n == null || n === 0) return '#9ca3af'
  return n > 0 ? '#dc2626' : '#16a34a'
}

function sign(n: number | null | undefined): string {
  if (n == null || n === 0) return ''
  return n > 0 ? '+' : '-'
}

function money2(v: number): string {
  return Math.abs(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pctAbs(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return `${Math.abs(v).toFixed(1)}%`
}

function clockLabel(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * 单个投资账户（账户视角）。
 *
 * 展示规则（按用户要求）：
 *   1. 主数字统一为本位币（人民币），原币只在账户总额下面用括号带一笔，页面不出现 ≈；
 *   2. 「占全部持仓」只在标题副行出现一次，中部不再重复占比卡片；
 *   3. 持仓名称单行截断，名称与盈亏之间留出间距，右侧金额下方给当日涨跌幅；
 *   4. 盈亏金额加粗放大，持仓左侧色条随当日涨跌变红/绿；
 *   5. 底部口径说明默认收起，点 ⓘ 才展开。
 */
export default function WealthAccount() {
  const { accountId } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const { results, slices, baseCurrency, rates, summary, lastUpdated } = useWealthValuation()
  const { accounts } = useApp()
  const [showNote, setShowNote] = useState(false)

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
  const baseSym = CURRENCY_SYMBOL[baseCurrency] || '¥'
  const accSym = CURRENCY_SYMBOL[accountCurrency] || '¥'
  const { baseMV } = summary()
  const shareOfTotal = baseMV > 0 && bucket ? (bucket.valueBase / baseMV) * 100 : 0

  // 全部折成本位币（原币只用于账户总额下面那行小字）
  const cashAcc = account?.balance ?? 0
  const holdingsValueAcc = bucket ? bucketValueIn(bucket, accountCurrency, rates) : 0
  const totalAcc = cashAcc + holdingsValueAcc

  const cashBase = toBase(cashAcc, accountCurrency, baseCurrency, rates)
  const holdingsBase = bucket ? bucket.valueBase : 0
  const costBase = bucket
    ? bucket.positions.reduce((s, p) => s + toBase(p.costNative, p.currency, baseCurrency, rates), 0)
    : 0
  const totalBase = cashBase + holdingsBase
  const profitBase = holdingsBase - costBase
  const profitRate = costBase > 0 ? (profitBase / costBase) * 100 : null
  const todayBase = bucket ? bucket.todayBase : 0

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-24">
      <div className="flex items-center mb-4">
        <button onClick={() => navigate('/wealth')} className="text-ink-2 mr-3" aria-label="返回">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink truncate">{title}</h1>
          <div className="text-[11px] text-ink-3">
            {account
              ? `投资账户 · ${CURRENCY_LABEL[accountCurrency] || accountCurrency}`
              : '未关联账户的历史流水'}
            {bucket && ` · 占全部持仓 ${pctAbs(shareOfTotal)}`}
          </div>
        </div>
      </div>

      {/* ===== 账户总额：主显人民币，原币只在小字带一笔 ===== */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint mb-3" data-testid="account-overview">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-ink-2">账户总额</span>
          <span className="text-[10px] text-ink-3">{lastUpdated ? `更新于 ${clockLabel(lastUpdated)}` : ''}</span>
        </div>
        <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
          <span className="text-2xl font-amount text-ink whitespace-nowrap">
            {baseSym}{money2(totalBase)}
          </span>
          {isForeign && (
            <span className="text-[12px] text-ink-3 font-amount whitespace-nowrap">
              ({accSym}{money2(totalAcc)})
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-brand-tint">
          <div>
            <div className="text-[10px] text-ink-3">可用现金</div>
            <div className="text-[13px] font-amount text-ink mt-0.5">{baseSym}{money2(cashBase)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ink-3">持仓市值</div>
            <div className="text-[13px] font-amount text-ink mt-0.5">{baseSym}{money2(holdingsBase)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ink-3">持仓本金</div>
            <div className="text-[13px] font-amount text-ink mt-0.5">{baseSym}{money2(costBase)}</div>
          </div>
        </div>
      </div>

      {/* ===== 收益：今日 + 持仓（含收益率），不再单独占一栏 ===== */}
      <div className="flex gap-2 mb-3" data-testid="account-pnl">
        {/* 今日收益内容短，给固定比例；持仓收益金额+百分比更长，占剩余宽度，
            窄屏下允许百分比换到第二行（宁可换行也不能顶出卡片） */}
        <div className="basis-[37%] shrink-0 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-[10px] text-ink-3 mb-1">今日收益</div>
          <div className="whitespace-nowrap">
            <span
              className="inline-block text-[12px] font-amount px-1.5 py-0.5 rounded-md"
              style={{
                color: colorOf(todayBase),
                backgroundColor: todayBase === 0 ? 'transparent' : `${colorOf(todayBase)}14`,
              }}
            >
              {sign(todayBase)}{baseSym}{money2(todayBase)}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0 bg-surface rounded-2xl p-3 border border-brand-tint">
          <div className="text-[10px] text-ink-3 mb-1">持仓收益</div>
          <div
            className="flex flex-wrap items-baseline text-[12px] font-amount"
            style={{ color: colorOf(profitBase) }}
          >
            <span className="whitespace-nowrap">{sign(profitBase)}{baseSym}{money2(profitBase)}</span>
            {profitRate != null && (
              <span className="whitespace-nowrap">({sign(profitRate)}{pctAbs(profitRate)})</span>
            )}
          </div>
        </div>
      </div>

      {/* ===== 持仓构成 ===== */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[12px] font-medium text-ink-2">持仓构成</div>
          <span className="text-[10px] text-ink-3">
            {bucket?.positions.length ? `${bucket.positions.length} 只` : ''}
          </span>
        </div>

        {!bucket || bucket.positions.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-3">暂无持仓</div>
        ) : (
          <div className="divide-y divide-brand-tint">
            {bucket.positions.map(p => {
              const pct = positionPctInBucket(p, bucket, baseCurrency, rates)
              const valueBase = toBase(p.valueNative, p.valueCurrency, baseCurrency, rates)
              const posProfitBase = toBase(p.profitNative, p.currency, baseCurrency, rates)
              const dayColor = colorOf(p.changePct)
              return (
                <button
                  key={`${p.market}:${p.symbol}`}
                  onClick={() => navigate(`/wealth/detail/${p.market}/${p.symbol}`)}
                  data-testid="account-position-row"
                  className="w-full text-left block py-2.5 first:pt-1"
                >
                  <div className="flex items-center gap-2.5">
                    {/* 色条随当日涨跌变红/绿 */}
                    <span className="w-1 h-9 rounded-full shrink-0" style={{ background: dayColor }} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-medium text-ink truncate">{p.name}</span>
                        <span className="text-[13px] font-amount text-ink shrink-0">
                          {baseSym}{money2(valueBase)}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-3 mt-1.5">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-ink-3 truncate">{p.symbol}</span>
                          {p.changePct != null && (
                            <span
                              className="text-[10px] font-amount px-1 py-[1px] rounded shrink-0"
                              style={{
                                color: dayColor,
                                backgroundColor: p.changePct === 0 ? 'transparent' : `${dayColor}14`,
                              }}
                            >
                              {sign(p.changePct)}{pctAbs(p.changePct * 100)}
                            </span>
                          )}
                        </span>
                        <span
                          className="text-[13px] font-amount shrink-0"
                          style={{ color: colorOf(posProfitBase) }}
                        >
                          {sign(posProfitBase)}{baseSym}{money2(posProfitBase)}
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={15} className="text-ink-3 shrink-0" />
                  </div>

                  <div className="mt-2 ml-[14px] flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-black/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: dayColor }}
                      />
                    </div>
                    <span className="text-[10px] text-ink-3 tabular-nums w-8 text-right">{pctAbs(pct)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 口径说明：默认收起 */}
        <div className="mt-2">
          <button
            onClick={() => setShowNote(v => !v)}
            className="flex items-center gap-1 text-[10px] text-ink-3"
            aria-expanded={showNote}
          >
            <Info size={11} />
            口径说明
          </button>
          {showNote && (
            <p className="text-[10px] text-ink-3 mt-1 leading-relaxed">
              金额均已折算为 {baseCurrency}；占比 = 该持仓市值 ÷ 本账户持仓市值；
              同一标的分散在多个账户时，市值按数量比例分摊。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
