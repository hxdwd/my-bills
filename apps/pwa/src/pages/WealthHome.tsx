import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWealthValuation, todayProfit, toBaseCurrency, ValuationWithHolding } from '../hooks/useWealthValuation'
import { marketToCategory, marketLabel, AssetCategory } from '../db/wealthStore'
import type { Market } from '../utils/quoteApi'
import { fmtMoney as fmtMoneyUtil, CURRENCY_SYMBOL, CURRENCY_LABEL, BASE_CURRENCIES, Currency } from '../utils/currency'
import CashIcon from '../components/ui/CashIcon'
import { MoreHorizontal, Upload, BarChart3, Sparkles } from 'lucide-react'

const CAT_META: Record<AssetCategory, { label: string; color: string }> = {
  stock: { label: '股票', color: '#c96442' },
  fund: { label: '基金', color: '#3b82f6' },
  gold: { label: '黄金', color: '#e0a82e' },
}

// 把类别主色转成极淡背景色（12% 透明度），用于持仓行底色，区分资产类别但不刺眼
function catTint(color: string): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, 0.1)`
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

// 红绿着色
function colorOf(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return '#6b7280'
  return n >= 0 ? '#dc2626' : '#16a34a'
}
function sign(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return ''
  return n >= 0 ? '+' : ''
}

function Card({ title, value, sub, color, large }: { title: string; value: string; sub?: string; color?: string; large?: boolean }) {
  return (
    <div className="flex-1 bg-surface rounded-2xl p-3 border border-brand-tint">
      <div className="text-xs text-ink-2 mb-1">{title}</div>
      <div className={`font-amount whitespace-nowrap ${large ? 'text-xl font-extrabold amount-fluid-lg' : 'text-lg font-bold amount-fluid-sm'}`} style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-ink-3 mt-0.5">{sub}</div>}
    </div>
  )
}

type FilterCat = 'all' | AssetCategory | Market
type SortKey = 'market_value' | 'profit_loss' | 'profit_rate'
type ViewMode = 'today' | 'total'

export function WealthHome() {
  const { results, lastUpdated, error, refresh, rates, baseCurrency, setBaseCurrency, summary } = useWealthValuation()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterCat>('all')
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [fabOpen, setFabOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('today')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showDist, setShowDist] = useState(true)
  const [showCurrencyPop, setShowCurrencyPop] = useState(false)
  // 入场动画状态：点击后先挂载再下一帧加 open 类，触发 transition
  const [popOpen, setPopOpen] = useState(false)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function toggleCurrencyPop() {
    if (showCurrencyPop) {
      setPopOpen(false)
      popTimer.current = setTimeout(() => setShowCurrencyPop(false), 200)
    } else {
      setShowCurrencyPop(true)
      // 下一帧开启动画
      requestAnimationFrame(() => requestAnimationFrame(() => setPopOpen(true)))
      showCurToast('点击右侧图标切换计价币种', 'below')
    }
  }
  function selectCurrency(c: Currency) {
    setBaseCurrency(c)
    setPopOpen(false)
    popTimer.current = setTimeout(() => setShowCurrencyPop(false), 200)
    showCurToast(`已切换${CURRENCY_LABEL[c]}计价`, 'right')
  }
  useEffect(() => () => { if (popTimer.current) clearTimeout(popTimer.current) }, [])
  // 币种提示气泡：1.6s 自动消失。pos='below' 胶囊下方（展开时提示），pos='right' 胶囊右方（切换后提示）
  const [curToast, setCurToast] = useState('')
  const [curToastPos, setCurToastPos] = useState<'below' | 'right'>('below')
  const curToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showCurToast = (msg: string, pos: 'below' | 'right' = 'below') => {
    if (curToastTimer.current) clearTimeout(curToastTimer.current)
    setCurToastPos(pos)
    setCurToast(msg)
    curToastTimer.current = setTimeout(() => setCurToast(''), 1600)
  }
  useEffect(() => () => { if (curToastTimer.current) clearTimeout(curToastTimer.current) }, [])

  // 首次进入财富页面时自动提示当前计价币种（同一次会话仅弹一次，从子页返回不重复）
  useEffect(() => {
    const KEY = 'wealth-currency-intro-shown'
    if (sessionStorage.getItem(KEY)) return
    sessionStorage.setItem(KEY, '1')
    showCurToast(`当前${CURRENCY_LABEL[baseCurrency]}计价 · 点击切换`, 'right')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [sortToastLabel, setSortToastLabel] = useState('')
  const sortToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const [viewToast, setViewToast] = useState('')
  const viewToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleViewMode = () => {
    const next: ViewMode = viewMode === 'today' ? 'total' : 'today'
    setViewMode(next)
    const label = next === 'today' ? '当日收益视角' : '累计收益视角'
    setViewToast('')
    if (viewToastTimer.current) clearTimeout(viewToastTimer.current)
    setViewToast(label)
    viewToastTimer.current = setTimeout(() => setViewToast(''), 1500)
  }

  // 点击排序项后，在按钮下方短暂提示"已按 X 排序"，避免纯图标看不出当前排序维度
  const showSortToast = (label: string) => {
    setSortToastLabel('')
    if (sortToastTimer.current) clearTimeout(sortToastTimer.current)
    setSortToastLabel(label)
    sortToastTimer.current = setTimeout(() => setSortToastLabel(''), 1500)
  }

  // 点击外部关闭排序下拉
  useEffect(() => {
    if (!showSortMenu) return
    const onDocClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [showSortMenu])

  // 按本位币折算后的汇总（各币种→本位币合计）
  const { baseMV, basePL } = summary()
  const todayTotal = useMemo(
    () => results.reduce((s, r) => {
      const cur = (r.converted_currency ?? r.currency ?? 'CNY') as Currency
      return s + toBaseCurrency(todayProfit(r), cur, baseCurrency, rates)
    }, 0),
    [results, baseCurrency, rates],
  )

  // 按大类聚合（用于分布图）—— 折算到本位币，港股通用 Worker 折算值
  const byCat = useMemo(() => {
    const acc: Record<AssetCategory, number> = { stock: 0, fund: 0, gold: 0 }
    results.forEach(r => {
      const cur = (r.converted_currency ?? r.currency ?? 'CNY') as Currency
      const mv = r.converted_value ?? r.market_value ?? 0
      acc[marketToCategory(r.market)] += toBaseCurrency(mv, cur, baseCurrency, rates)
    })
    return acc
  }, [results, baseCurrency, rates])

  // 按分类/市场过滤后，按所选排序键排序
  const list = useMemo(() => {
    let arr = results
    if (filter !== 'all') {
      // 大类（stock/fund/gold）按 category 过滤；具体市场（CN/HK/US）按 market 过滤
      arr = results.filter(r =>
        marketToCategory(r.market) === filter || r.market === filter,
      )
    }
    const sorted = [...arr]
    sorted.sort((a, b) => {
      if (sortKey === 'profit_rate') {
        // 当日视角按涨跌幅，累计视角按累计收益率
        const va = viewMode === 'today' ? (a.change_percent ?? -Infinity) : (a.profit_rate ?? -Infinity)
        const vb = viewMode === 'today' ? (b.change_percent ?? -Infinity) : (b.profit_rate ?? -Infinity)
        return vb - va
      }
      if (sortKey === 'profit_loss') {
        // 当日视角按今日收益额，累计视角按累计盈亏
        const va = viewMode === 'today' ? todayProfit(a) : (a.profit_loss ?? -Infinity)
        const vb = viewMode === 'today' ? todayProfit(b) : (b.profit_loss ?? -Infinity)
        return vb - va
      }
      return (b.market_value || 0) - (a.market_value || 0)
    })
    return sorted
  }, [results, filter, sortKey, viewMode])

  const onPullRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  // 扁平化筛选 tab：全部 / A股 / 港股 / 美股 / 基金 / 黄金。
  // 某类无持仓时不展示（全部始终展示），避免空 tab。
  const FILTERS: { key: FilterCat; label: string; color: string }[] = useMemo(() => {
    const present = new Set(results.map(r => r.market))
    const hasCat = (c: AssetCategory) => results.some(r => marketToCategory(r.market) === c)
    const tabs: { key: FilterCat; label: string; color: string }[] = [
      { key: 'all', label: '全部', color: '#c96442' },
    ]
    if (present.has('CN')) tabs.push({ key: 'CN', label: marketLabel('CN'), color: CAT_META.stock.color })
    if (present.has('HK')) tabs.push({ key: 'HK', label: marketLabel('HK'), color: CAT_META.stock.color })
    if (present.has('US')) tabs.push({ key: 'US', label: marketLabel('US'), color: CAT_META.stock.color })
    if (hasCat('fund')) tabs.push({ key: 'fund', label: '基金', color: CAT_META.fund.color })
    if (hasCat('gold')) tabs.push({ key: 'gold', label: '黄金', color: CAT_META.gold.color })
    return tabs
  }, [results])
  // 排序维度：用纯图标表示（无文字），title 提供无障碍提示
  const SORTS: { key: SortKey; label: string; icon: JSX.Element }[] = [
    {
      key: 'market_value',
      label: '市值',
      icon: (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 13V8M8 13V4M13 13V10" />
        </svg>
      ),
    },
    {
      key: 'profit_loss',
      label: '收益额',
      icon: (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 13V3M4.5 6.5L8 3l3.5 3.5M4.5 9.5L8 13l3.5-3.5" />
        </svg>
      ),
    },
    {
      key: 'profit_rate',
      label: '收益率',
      icon: (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="5.2" />
          <path d="M6 6.2h3M6 8.2h2.4" />
        </svg>
      ),
    },
  ]
  const sortLabel = (() => {
    const s = SORTS.find(x => x.key === sortKey)
    if (!s) return '市值'
    if (viewMode === 'today') {
      if (s.key === 'profit_rate') return '涨跌幅'
      if (s.key === 'profit_loss') return '今日收益'
    }
    return s.label
  })()

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-ink">财富</h1>
          {/* 币种切换：Trigger 图标 + 右侧悬浮 Popover（同一组件，不占 Header 高度） */}
          <div className="relative flex items-center">
            <button
              onClick={toggleCurrencyPop}
              data-testid="currency-pill"
              aria-label={`当前币种 ${baseCurrency}，点击切换`}
              aria-expanded={showCurrencyPop}
              className="flex items-center justify-center rounded-full p-0.5 transition-transform active:scale-95"
            >
              <CashIcon currency={baseCurrency} size={46} />
            </button>
            {showCurrencyPop && (
              <div
                data-testid="currency-pop"
                className={`pointer-events-none absolute left-[calc(100%+7px)] top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-2xl border border-black/5 bg-white p-1.5 pl-3 pr-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all duration-200 ease-out ${popOpen ? 'translate-x-0 scale-100 opacity-100' : 'translate-x-1.5 scale-95 opacity-0'}`}
                style={{ transformOrigin: 'left center' }}
              >
                <div className="flex items-center gap-1">
                  {BASE_CURRENCIES.map(c => {
                    const active = baseCurrency === c
                    return (
                      <button
                        key={c}
                        data-testid={`currency-option-${c}`}
                        onClick={() => selectCurrency(c)}
                        aria-label={c}
                        aria-pressed={active}
                        className={`pointer-events-auto flex h-8 w-14 items-center justify-center rounded-xl transition-colors active:scale-90 ${active ? 'bg-[#fbf3d9]' : 'bg-transparent hover:bg-black/[0.04]'}`}
                      >
                        <CashIcon currency={c} size={38} className={active ? '' : 'opacity-60'} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {/* 币种提示气泡：展开提示在胶囊下方，切换后提示在胶囊右方，1.6s 自动消失 */}
            {curToast && (
              <div
                data-testid="currency-toast"
                className={`absolute z-40 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[11px] font-medium text-bg shadow-lg ${curToastPos === 'below' ? 'left-0 top-full mt-2' : 'left-[calc(100%+7px)] top-1/2 -translate-y-1/2'}`}
              >
                {curToast}
              </div>
            )}
          </div>
        </div>
        <button onClick={onPullRefresh} data-testid="pull-refresh" className="text-xs text-ink-2 px-2 py-1 rounded-lg bg-surface border border-brand-tint">
          {refreshing ? '刷新中…' : '下拉刷新'}
        </button>
      </div>

      {showCurrencyPop && (
        <div className="fixed inset-0 z-20" onClick={toggleCurrencyPop} aria-hidden />
      )}

      {/* 三卡片（按本位币折算合计） */}
      <div className="flex gap-2 mb-4">
        <Card title={`总市值 (${CURRENCY_SYMBOL[baseCurrency]})`} value={fmtMoneyUtil(baseMV, 0)} large />
        <Card title="今日收益" value={`${sign(todayTotal)}${fmtMoneyUtil(todayTotal, 0)}`} color={colorOf(todayTotal)} />
        <Card title="累计收益" value={`${sign(basePL)}${fmtMoneyUtil(basePL, 0)}`} color={colorOf(basePL)} />
      </div>


      {error && <div className="text-xs text-red-500 mb-3">{error}</div>}

      {/* 资产分布（可折叠） */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint mb-4" data-testid="distribution">
        <button
          onClick={() => setShowDist(v => !v)}
          data-testid="distribution-toggle"
          className="w-full flex items-center justify-between text-left"
        >
          <div className="text-sm font-semibold text-ink">资产分布</div>
          <span className="text-ink-3 text-xs">{showDist ? '收起 ▴' : '展开 ▾'}</span>
        </button>
        {showDist && (
          <div className="mt-3 space-y-3">
            {((['stock', 'fund', 'gold'] as AssetCategory[]).sort((a, b) => byCat[b] - byCat[a])).map(cat => {
              const v = byCat[cat]
              const pct = baseMV > 0 ? (v / baseMV) * 100 : 0
              const color = CAT_META[cat].color
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  data-testid={`dist-${cat}`}
                  className="w-full text-left block"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-ink">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                      {CAT_META[cat].label}
                      <span className="text-sm text-ink-2">{fmtMoneyUtil(v, 0)}</span>
                    </span>
                    <span className="text-sm text-ink-2 tabular-nums">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 分类筛选（弱化呈现，仅作筛选用） + 视角切换 + 排序入口 */}
      <div className="flex items-center justify-between mb-3 gap-2" data-testid="filter-bar">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                data-testid={`filter-${f.key}`}
                onClick={() => setFilter(f.key)}
                className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                style={{
                  color: active ? f.color : '#9ca3af',
                  borderColor: active ? f.color : 'transparent',
                  backgroundColor: active ? `${f.color}1a` : 'transparent',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1">
          {/* 视角切换按钮：眼睛图标，有神/无神区分当日/累计 */}
          <div className="relative">
            <button
              onClick={toggleViewMode}
              data-testid="view-mode-toggle"
              title={viewMode === 'today' ? '当前：当日收益视角，点击切换' : '当前：累计收益视角，点击切换'}
              aria-label={viewMode === 'today' ? '切换至累计收益视角' : '切换至当日收益视角'}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-brand-tint transition-colors"
            >
              {viewMode === 'today' ? (
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="8" cy="8" rx="6" ry="3.5" />
                  <circle cx="8" cy="8" r="2" />
                  <circle cx="8" cy="8" r="0.8" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="8" cy="8" rx="6" ry="3.5" />
                  <circle cx="8" cy="8" r="2" />
                </svg>
              )}
            </button>
            {/* 视角切换提示气泡 */}
            {viewToast && (
              <div
                data-testid="view-toast"
                className="absolute right-0 bottom-full mb-1 z-30 px-2.5 py-1 rounded-lg bg-ink text-bg text-[11px] font-medium whitespace-nowrap shadow-lg animate-fade-in"
              >
                已切换至{viewToast}
              </div>
            )}
          </div>

          {/* 排序入口 */}
          <div className="relative" ref={sortRef}>
              <button
                onClick={() => setShowSortMenu(v => !v)}
                onContextMenu={(e) => { e.preventDefault(); setShowSortMenu(true) }}
                data-testid="sort-trigger"
                title={`排序：${sortLabel}`}
                aria-label={`排序：${sortLabel}`}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-brand-tint transition-colors"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 3v10M5 13l-2-2M5 13l2-2M11 13V3M11 3l-2 2M11 3l2 2" />
                </svg>
              </button>
              {showSortMenu && (
                <div
                  data-testid="sort-menu"
                  className="absolute right-0 top-full mt-1 z-20 bg-surface border border-brand-tint rounded-xl py-1 shadow-lg"
                >
                  {SORTS.map(s => {
                    const active = sortKey === s.key
                    return (
                      <button
                        key={s.key}
                        data-testid={`sort-${s.key}`}
                        title={s.label}
                        aria-label={s.label}
                        onClick={() => { setSortKey(s.key); setShowSortMenu(false); showSortToast(s.label) }}
                        className={`flex items-center justify-center w-9 h-9 mx-1 rounded-lg transition-colors ${active ? 'text-ink bg-brand-tint' : 'text-ink-3 hover:text-ink'}`}
                      >
                        {s.icon}
                      </button>
                    )
                  })}
                </div>
              )}
              {/* 排序反馈气泡：贴在排序按钮正上方，1.5s 自动消失 */}
              {sortToastLabel && (
                <div
                  data-testid="sort-toast"
                  className="absolute right-0 bottom-full mb-1 z-30 px-2.5 py-1 rounded-lg bg-ink text-bg text-[11px] font-medium whitespace-nowrap shadow-lg animate-fade-in"
                >
                  已按{sortToastLabel}排序
                </div>
              )}
            </div>
        </div>
      </div>

      {/* 持仓列表 */}
      {list.length === 0 ? (
        <div className="bg-surface rounded-3xl p-8 border border-brand-tint text-center">
          <div className="text-ink-2 mb-1">{results.length === 0 ? '还没有持仓' : '该分类下暂无持仓'}</div>
          {results.length === 0 && (
            <button
              onClick={() => navigate('/wealth/add')}
              className="mt-3 bg-brand text-ink px-4 py-2 rounded-xl text-sm font-medium"
            >
              添加第一笔持仓
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(r => {
            const cur = (r.converted_currency ?? r.currency ?? 'CNY') as Currency
            // 列表主数字统一按本位币折算，与上方卡片/分布图口径一致；
            // 资产自身币种的具体数值可在详情页查看，互不冲突。
            // 港股通：Worker 已折算为 CNY，优先用 converted_value
            const mv = toBaseCurrency(r.converted_value ?? r.market_value ?? 0, cur, baseCurrency, rates)
            const pl = r.profit_loss != null ? toBaseCurrency(r.profit_loss, cur, baseCurrency, rates) : null
            const pr = r.profit_rate ?? null
            // 当日收益（本位币折算）
            const td = toBaseCurrency(todayProfit(r), cur, baseCurrency, rates)
            const cp = r.change_percent ?? null
            // 根据视角选择第二行显示内容
            const isToday = viewMode === 'today'
            const line2Val = isToday ? td : pl
            const line2Pct = isToday ? cp : pr
            return (
              <button
                key={`${r.market}:${r.symbol}`}
                data-testid="holding-row"
                onClick={() => navigate(`/wealth/detail/${r.market}/${r.symbol}`)}
                className="w-full rounded-2xl p-3 border flex items-center justify-between text-left active:scale-[0.99]"
                style={{ backgroundColor: catTint(CAT_META[marketToCategory(r.market)].color), borderColor: CAT_META[marketToCategory(r.market)].color + '33' }}
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink truncate">{r.name || r.symbol}</div>
                  <div className="text-xs text-ink-3 mt-0.5">{r.symbol} · {r.market}</div>
                </div>
                <div className="text-right ml-3 min-w-0 flex-shrink-0">
                  <div className="font-bold text-ink font-amount amount-fluid whitespace-nowrap">{fmtMoneyUtil(mv, 0)}</div>
                  <div className="text-[11px] mt-0.5 font-amount amount-fluid-sm whitespace-nowrap leading-tight" style={{ color: colorOf(line2Val) }}>
                    {sign(line2Val)}{fmtMoneyUtil(line2Val, 0)} / {line2Pct != null ? `${sign(line2Pct * 100)}${(line2Pct * 100).toFixed(2)}%` : '—'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {lastUpdated && (
        <div className="text-center text-[10px] text-ink-3/60 mt-5 mb-1">
          更新于 {lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}
      <div className="text-center text-[9px] text-ink-3/40 mb-6 leading-relaxed">
        基金当日收益为盘中估算，仅供参考，实际以确认净值结算
      </div>

      {/* FAB 多功能菜单：右下角，呼吸灯胶囊 → 点击展开 Popover */}
      <div className="fixed right-4 z-40" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}>
        {/* 点击遮罩层 */}
        {fabOpen && (
          <div
            className="fixed inset-0 z-30"
            onClick={() => setFabOpen(false)}
          />
        )}

        {/* Popover 菜单：从 FAB 正上方长出 */}
        <div className={`absolute bottom-full right-0 mb-2 z-40 transition-all duration-200 origin-bottom-right ${
          fabOpen ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'
        }`}>
          <div className="bg-surface rounded-2xl p-1.5 min-w-[130px] shadow-soft-lg border border-brand-tint">
            {/* 导入持仓 */}
            <button
              onClick={() => { setFabOpen(false); navigate('/wealth/add') }}
              className="flex items-center gap-3 w-full h-11 px-3 rounded-xl hover:bg-brand-tint transition-colors text-left"
            >
              <Upload size={16} className="text-brand shrink-0" />
              <span className="text-sm text-ink">导入持仓</span>
            </button>

            {/* 清仓复盘 */}
            <button
              onClick={() => { setFabOpen(false); navigate('/wealth/liquidation') }}
              className="flex items-center gap-3 w-full h-11 px-3 rounded-xl hover:bg-brand-tint transition-colors text-left"
            >
              <BarChart3 size={16} className="text-amber-500 shrink-0" />
              <span className="text-sm text-ink">清仓复盘</span>
            </button>

            {/* AI 诊断 */}
            <button
              onClick={() => { setFabOpen(false); alert('功能开发中，敬请期待') }}
              className="flex items-center gap-3 w-full h-11 px-3 rounded-xl hover:bg-brand-tint transition-colors text-left"
            >
              <Sparkles size={16} className="text-purple-500 shrink-0" />
              <span className="text-sm text-ink"> AI   诊断</span>
            </button>
          </div>
        </div>

        {/* FAB 触发按钮 */}
        <button
          onClick={() => setFabOpen(v => !v)}
          data-testid="wealth-fab"
          aria-label="财富功能"
          className="relative z-30 flex items-center justify-center w-10 h-10 rounded-full bg-white/70 backdrop-blur-sm border border-[#e8e6dc]/60 shadow-sm transition-all active:scale-95"
          style={{
            animation: 'breathe 2.4s ease-in-out infinite, glow-pulse 3s ease-in-out infinite',
          }}
        >
          <MoreHorizontal size={18} className="text-ink-2" />
        </button>
      </div>
    </div>
  )
}
