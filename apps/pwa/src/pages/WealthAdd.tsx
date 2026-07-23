import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchQuote, fetchQuoteDetail, QuoteSearchResult, Market } from '../utils/quoteApi'
import { addHoldingTransaction } from '../db/wealthStore'
import { CURRENCY_SYMBOL, Currency } from '../utils/currency'
import { useApp } from '../context/AppContext'
import { Coins } from 'lucide-react'

function marketToCurrency(market: QuoteSearchResult['market']): Currency {
  if (market === 'US') return 'USD'
  if (market === 'HK') return 'HKD'
  return 'CNY'
}

type Step = 'choose' | 'search' | 'fill'

export function WealthAdd() {
  const navigate = useNavigate()
  const { accounts, updateAccount } = useApp()
  const [step, setStep] = useState<Step>('choose')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QuoteSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<QuoteSearchResult | null>(null)
  // 黄金手动建资产
  const [goldName, setGoldName] = useState('黄金')

  // 填表（新增持仓流程固定为买入建仓）
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  // 根据市场过滤可用投资账户（与 WealthDetail 一致）
  const investmentAccounts = useMemo(() => {
    if (!selected) return []
    const m = selected.market
    return accounts.filter(a => {
      if (a.type !== 'investment') return false
      const ac = a.currency || 'CNY'
      if (m === 'US') return ac === 'USD'
      if (m === 'HK') return ac === 'HKD' || ac === 'CNY' // 港股通用CNY账户
      if (m === 'CN' || m === 'FUND') return ac === 'CNY'
      if (m === 'GOLD') return ac === 'CNY'
      return false
    })
  }, [accounts, selected])

  // 资产原始币种（根据 market 推断）
  const assetCurrency = useMemo(() => {
    if (!selected) return 'CNY'
    const m = selected.market
    if (m === 'US') return 'USD'
    if (m === 'HK') return 'HKD'
    return 'CNY'
  }, [selected])

  // 选择的投资账户
  const [tradeAccountId, setTradeAccountId] = useState('')

  // 最近使用的账户记忆（localStorage，与 WealthDetail 共享同一 key）
  const LAST_ACCOUNT_KEY = 'wealth_last_account_id'
  const getLastAccountId = () => localStorage.getItem(LAST_ACCOUNT_KEY) || ''

  // 进入 fill 步骤时自动选中最近账户或第一个可用账户
  useEffect(() => {
    if (step !== 'fill' || !selected || investmentAccounts.length === 0) return
    const lastId = getLastAccountId()
    const defaultId = investmentAccounts.find(a => a.id === lastId)?.id || investmentAccounts[0]?.id || ''
    setTradeAccountId(defaultId)
  }, [step, selected?.symbol, selected?.market, investmentAccounts.length])

  // 最近搜索记录（localStorage 持久化，最多 8 条，去重，最新在前）
  const RECENT_KEY = 'wealth:recentSearch'
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const pushRecent = (q: string) => {
    const key = q.trim()
    if (!key) return
    setRecent(prev => {
      const next = [key, ...prev.filter(x => x !== key)].slice(0, 8)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }
  const removeRecent = (q: string) => {
    setRecent(prev => {
      const next = prev.filter(x => x !== q)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }
  const clearRecent = () => {
    setRecent([])
    try {
      localStorage.removeItem(RECENT_KEY)
    } catch {}
  }

  const doSearch = async (kw: string) => {
    const key = kw.trim()
    if (!key) {
      setResults([])
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const r = await searchQuote(key)
      setResults(r)
    } catch (e: any) {
      setResults([])
      setSearchError(e?.message || '搜索失败')
    } finally {
      setSearching(false)
    }
  }

  // 输入即搜索，带 300ms 防抖
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (step !== 'search') return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const kw = query.trim()
    if (!kw) {
      setResults([])
      return
    }
    searchTimer.current = setTimeout(() => doSearch(kw), 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query, step])

  const pickResult = async (r: QuoteSearchResult) => {
    pushRecent(query)
    setSelected(r)
    setPrice('')
    setStep('fill')
    // 建仓默认带入当前价作为成本，减少手动输入
    if (r.market !== 'GOLD') {
      try {
        const d = await fetchQuoteDetail(r.symbol, r.market)
        if (d?.current_price != null && !isNaN(d.current_price)) {
          setPrice(String(d.current_price))
        }
      } catch {
        /* 取不到行情则留空，由用户手动填 */
      }
    }
  }

  const pickGold = () => {
    setSelected({ symbol: 'AU9999', market: 'GOLD', name: goldName || '黄金', code: 'AU9999' })
    setStep('fill')
  }

  const save = async () => {
    if (!selected) return
    const q = parseFloat(quantity)
    const p = parseFloat(price)
    if (isNaN(q) || q <= 0 || isNaN(p) || p <= 0) {
      alert('请填写有效的数量和成本')
      return
    }
    if (!tradeAccountId) {
      alert('请选择投资账户')
      return
    }
    setSaving(true)
    try {
      // 确定币种：投资账户币种优先，否则用 market 推断
      const targetAccount = accounts.find(a => a.id === tradeAccountId)
      const accountCur = targetAccount?.currency || assetCurrency
      await addHoldingTransaction({
        symbol: selected.symbol,
        market: selected.market,
        name: selected.name,
        direction: 'buy',
        quantity: q,
        price: p,
        date,
        account_id: tradeAccountId,
        asset_currency: accountCur,
        is_active: true,
      } as any)
      // 资金联动：买入从账户余额扣减
      if (targetAccount) {
        const amount = q * p
        await updateAccount(targetAccount.id, {
          balance: parseFloat((targetAccount.balance - amount).toFixed(2)),
        })
      }
      // 记录最近账户
      localStorage.setItem(LAST_ACCOUNT_KEY, tradeAccountId)
      navigate('/wealth')
    } catch (e: any) {
      alert('保存失败：' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-24">
      <div className="flex items-center mb-4">
        <button onClick={() => step === 'fill' ? setStep('choose') : navigate('/wealth')} className="text-ink-2 mr-3 text-xl">‹</button>
        <h1 className="text-xl font-bold text-ink">新增持仓</h1>
      </div>

      {step === 'choose' && (
        <div className="space-y-3">
          <button
            onClick={() => setStep('search')}
            className="w-full bg-surface rounded-2xl p-4 border border-brand-tint text-left"
          >
            <div className="font-medium text-ink">搜索资产（股票 / 基金）</div>
            <div className="text-xs text-ink-3 mt-1">输入名称或代码搜索</div>
          </button>
          <button
            onClick={pickGold}
            className="w-full bg-surface rounded-2xl p-4 border border-brand-tint text-left flex items-center gap-3"
          >
            <Coins size={22} className="text-yellow-600" />
            <div>
              <div className="font-medium text-ink">黄金（手动建仓）</div>
              <div className="text-xs text-ink-3 mt-1">人民币计价，按克记录</div>
            </div>
          </button>
          <button
            onClick={() => navigate('/wealth/import')}
            className="w-full bg-surface rounded-2xl p-4 border border-brand-tint text-left"
          >
            <div className="font-medium text-ink">批量导入持仓</div>
            <div className="text-xs text-ink-3 mt-1">粘贴理财 App 持仓列表，一次导入多条</div>
          </button>
          {step === 'choose' && false && (
            <div className="mt-3">
              <div className="text-xs text-ink-2 mb-1">黄金名称</div>
              <input value={goldName} onChange={e => setGoldName(e.target.value)} className="w-full bg-surface rounded-xl p-3 border border-brand-tint text-ink" />
            </div>
          )}
        </div>
      )}

      {step === 'search' && (
        <div>
          {recent.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-ink-3">最近搜索</div>
                <button onClick={clearRecent} className="text-xs text-ink-3 underline active:scale-95">全部清除</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map(r => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface border border-brand-tint text-ink-2 text-xs"
                  >
                    <button
                      onClick={() => {
                        setQuery(r)
                        doSearch(r)
                      }}
                      className="active:scale-95"
                    >
                      {r}
                    </button>
                    <button
                      onClick={() => removeRecent(r)}
                      className="text-ink-3 leading-none active:scale-95"
                      aria-label={`删除 ${r}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <input
              value={query}
              autoFocus
              onChange={e => setQuery(e.target.value)}
              placeholder="如 贵州茅台 / 600519 / 00700"
              className="flex-1 bg-surface rounded-xl p-3 border border-brand-tint text-ink"
            />
          </div>
          {searching && <div className="text-center text-ink-3 text-sm py-6">搜索中…</div>}
          {searchError && <div className="text-xs text-red-500 mb-3">{searchError}</div>}
          <div className="space-y-2">
            {Array.isArray(results) && results.map(r => (
              <button
                key={`${r.market}:${r.symbol}`}
                onClick={() => pickResult(r)}
                className="w-full bg-surface rounded-2xl p-3 border border-brand-tint flex items-center justify-between"
              >
                <div className="text-left">
                  <div className="font-medium text-ink">{r.name}</div>
                  <div className="text-xs text-ink-3">{r.symbol} · {r.market}</div>
                </div>
                <span className="text-ink-2 text-sm">选择 ›</span>
              </button>
            ))}
            {!searching && Array.isArray(results) && results.length === 0 && (
              <div className="text-center text-ink-3 text-sm py-6">无结果，试试其它关键词</div>
            )}
          </div>
        </div>
      )}

      {step === 'fill' && selected && (
        <div className="bg-surface rounded-3xl p-4 border border-brand-tint space-y-3">
          <div className="font-medium text-ink">{selected.name} <span className="text-xs text-ink-3">{selected.symbol}</span></div>

          <div>
            <div className="text-xs text-ink-2 mb-1">数量（{selected.market === 'GOLD' ? '克' : '份'}）</div>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full bg-bg rounded-xl p-3 border border-brand-tint text-ink" placeholder="0" />
          </div>
          <div>
            <div className="text-xs text-ink-2 mb-1">{selected.market === 'GOLD' ? '金价' : '成本'}</div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">{CURRENCY_SYMBOL[marketToCurrency(selected.market)]}</span>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full bg-bg rounded-xl p-3 pl-12 border border-brand-tint text-ink"
                placeholder="0.00"
              />
            </div>
          </div>
          {/* 资金账户选择器 */}
          <div>
            <div className="text-xs text-ink-2 mb-1.5">投资账户</div>
            {investmentAccounts.length === 0 ? (
              <div className="text-xs text-red-400 bg-red-50 rounded-xl px-3 py-2.5">
                没有可用的投资账户，请先在账户管理中创建对应币种的投资账户
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {investmentAccounts.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => setTradeAccountId(acc.id)}
                    className={`text-xs px-3 py-2 rounded-xl border transition-colors ${
                      tradeAccountId === acc.id
                        ? 'bg-brand border-brand-tint text-ink font-medium'
                        : 'bg-bg border-brand-tint text-ink-2'
                    }`}
                  >
                    {acc.icon} {acc.name} ({acc.currency || 'CNY'})
                    {acc.currency === 'CNY' && selected.market === 'HK' && <span className="text-[10px] ml-0.5">港股通</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-ink-2 mb-1">日期</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-bg rounded-xl p-3 border border-brand-tint text-ink" />
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-brand text-ink py-3 rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}
