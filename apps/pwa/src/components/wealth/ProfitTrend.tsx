// 持仓收益走势：按天重建「当前持仓浮盈」曲线。
//
// 显示与交互：
// - 图表始终铺满容器宽度（小屏也能看全，X 轴标签自动抽稀）；
// - 时间档位：「近一周」（只显示最近 5 个交易日，避免点过密）/「近一月」（最近 30 个自然日）；
//   另可点月份 chip 用滚轮选某个自然月（参考 Reports 的年月双滚轮浮层）；
// - 左右滑动：整体平移查看窗口（平移量为窗口跨度的一半），向前看更早、向后看更晚。
//
// 请求策略（避免大批量）：
// - 只请求当前窗口的日期区间；后端按区间取数（A股走东财 K线、美股/港股/黄金走 Yahoo、基金走东财净值）；
// - 「近一周」请求 15 个自然日以保证覆盖 5 个交易日，再在前端取最后 5 个点；
// - 窗口结果按「标的 + 区间」缓存（纯历史区间永久有效，含今天的当天有效），来回滑动命中缓存即 0 请求。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LineChart } from '../charts'
import WheelPicker from '../ui/WheelPicker'
import { fetchQuoteHistoryBatch, HistoryPoint, HistorySeries, Market } from '../../utils/quoteApi'
import { getAllTransactions, Holding } from '../../db/wealthStore'
import type { HoldingTransactionRecord } from '../../db/database'
import { buildProfitCurve } from '../../utils/profitCurve'
import { CURRENCY_SYMBOL, Currency } from '../../utils/currency'
import { filterChipCls } from '../../utils/ui'

const CACHE_PREFIX = 'wealth-hist-seg:'
// 段缓存结构版本：取数语义变更后递增，旧缓存自动视为未命中并重取，
// 避免"代码改了、页面却还在用旧的残缺数据"（v2：修复基金历史被上游截断到 20 条）。
const SEG_CACHE_VERSION = 2
const HOLDING_COLOR = '#c96442'
const MONTH_DAYS = 30 // 「近一月」窗口（自然日）
const WEEK_REQUEST_DAYS = 15 // 「近一周」请求窗口（自然日，保证覆盖 5 个交易日）
const WEEK_POINTS = 5 // 「近一周」实际展示的交易日数
const YEAR_SPAN = 5 // 月份滚轮可选年份范围
const MONTH_APPLY_DELAY = 400 // 月份滚轮停止滚动后延迟多久才真正加载（防抖：滚动过程不发请求）

type TimeMode = 'week' | 'month' | 'custom'

// 进程内缓存：key = 市场:标的:起_止
const memSeg = new Map<string, HistoryPoint[]>()

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayStr(): string {
  return toDateStr(new Date())
}

function addDaysStr(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return toDateStr(d)
}

// 两个日期相差的自然日数
function daysBetween(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00`).getTime()
  const t2 = new Date(`${b}T00:00:00`).getTime()
  return Math.round((t2 - t1) / 86400000)
}

// 'YYYY-MM' → 该月最后一天
function monthEndStr(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return toDateStr(new Date(y, m, 0)) // 下月第 0 天 = 本月最后一天
}

function segKey(market: string, symbol: string, start: string, end: string): string {
  return `${market}:${symbol}:${start}_${end}`
}

/** 读段缓存：纯历史区间（end 早于今天）永久有效；含今天的区间仅当天有效 */
function readSegCache(market: string, symbol: string, start: string, end: string): HistoryPoint[] | null {
  const k = segKey(market, symbol, start, end)
  const mem = memSeg.get(k)
  if (mem) return mem
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + k)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: string; points?: HistoryPoint[]; v?: number }
    if (!Array.isArray(parsed.points)) return null
    if (parsed.v !== SEG_CACHE_VERSION) return null // 旧版本结构 → 视为未命中，重新取数
    if (end >= todayStr() && parsed.savedAt !== todayStr()) return null
    memSeg.set(k, parsed.points)
    return parsed.points
  } catch {
    return null
  }
}

function writeSegCache(market: string, symbol: string, start: string, end: string, points: HistoryPoint[]) {
  memSeg.set(segKey(market, symbol, start, end), points)
  try {
    localStorage.setItem(
      CACHE_PREFIX + segKey(market, symbol, start, end),
      JSON.stringify({ v: SEG_CACHE_VERSION, savedAt: todayStr(), points }),
    )
  } catch {
    /* 配额溢出忽略 */
  }
}

interface ProfitTrendProps {
  holdings: Holding[]
  base: Currency
  rates: Record<string, number>
}

export function ProfitTrend({ holdings, base, rates }: ProfitTrendProps) {
  const [txs, setTxs] = useState<HoldingTransactionRecord[] | null>(null)
  const [seriesList, setSeriesList] = useState<HistorySeries[]>([])
  const [view, setView] = useState(() => {
    const t = todayStr()
    return { start: addDaysStr(t, -(MONTH_DAYS - 1)), end: t }
  })
  const [mode, setMode] = useState<TimeMode>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 月份滚轮浮层
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  // 滚轮"待选"月份：滚动过程中只更新它（chip 实时反馈），停止一段时间或收起浮层时才真正加载
  const [pendingMonth, setPendingMonth] = useState<{ year: number; month: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const years = useMemo(() => {
    const cur = new Date().getFullYear()
    return Array.from({ length: YEAR_SPAN }, (_, i) => cur - (YEAR_SPAN - 1) + i)
  }, [])
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])

  const holdingsKey = useMemo(
    () => holdings.map(h => `${h.market}:${h.symbol}`).join(','),
    [holdings],
  )
  // 供 loadRange 读取最新持仓，避免其闭包随 holdings 频繁重建
  const holdingsRef = useRef(holdings)
  holdingsRef.current = holdings

  // 1) 全部流水：本地 IndexedDB，0 网络请求，只读一次
  useEffect(() => {
    let alive = true
    getAllTransactions()
      .then(all => { if (alive) setTxs(all) })
      .catch(() => { if (alive) setTxs([]) })
    return () => { alive = false }
  }, [])

  // 2) 按窗口区间加载（命中段缓存则 0 请求）
  const loadRange = useCallback(async (start: string, end: string) => {
    const hs = holdingsRef.current
    const cached: HistorySeries[] = []
    const missing: { symbol: string; market: Market }[] = []
    for (const h of hs) {
      const pts = readSegCache(h.market, h.symbol, start, end)
      if (pts) cached.push({ symbol: h.symbol, market: h.market, points: pts })
      else missing.push({ symbol: h.symbol, market: h.market })
    }
    if (cached.length > 0) setSeriesList(cached) // 命中缓存先出图
    if (missing.length === 0) return

    // 取消上一次在途请求，避免快速切换时堆积无用请求
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const fetched = await fetchQuoteHistoryBatch(missing, { start, end, signal: ac.signal })
      if (ac.signal.aborted) return
      fetched.forEach(s => writeSegCache(s.market, s.symbol, start, end, s.points))
      setSeriesList([...cached, ...fetched])
    } catch (e: any) {
      if (e?.name === 'AbortError') return // 已被新请求取代：静默忽略
      setError(e?.message || '历史行情加载失败')
    }
  }, [])

  // 3) 窗口变化即加载
  useEffect(() => {
    if (!txs) return
    let alive = true
    setLoading(true)
    setError(null)
    loadRange(view.start, view.end).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [txs, holdingsKey, view.start, view.end, loadRange])

  // 4) 左右滑动平移窗口：平移量为窗口跨度的一半；向前看更早、向后看更晚（不超过今天）
  const handleSwipe = useCallback((dir: 'prev' | 'next') => {
    setView(v => {
      const span = Math.max(1, daysBetween(v.start, v.end))
      const shift = Math.max(1, Math.round(span / 2))
      if (dir === 'prev') {
        return { start: addDaysStr(v.start, -shift), end: addDaysStr(v.start, -1) }
      }
      const t = todayStr()
      const nextStart = addDaysStr(v.start, shift)
      if (nextStart > t) return v // 已在最新
      const nextEnd = addDaysStr(v.end, shift)
      return { start: nextStart, end: nextEnd > t ? t : nextEnd }
    })
    setMode('custom')
  }, [])

  const showWeek = () => {
    const t = todayStr()
    setView({ start: addDaysStr(t, -(WEEK_REQUEST_DAYS - 1)), end: t })
    setMode('week')
  }
  const showMonth = () => {
    const t = todayStr()
    setView({ start: addDaysStr(t, -(MONTH_DAYS - 1)), end: t })
    setMode('month')
  }
  // 真正应用某个月（这一步才会触发加载）
  const applyMonth = useCallback((year: number, month: number) => {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const t = todayStr()
    const endRaw = monthEndStr(ym)
    setView({ start: `${ym}-01`, end: endRaw > t ? t : endRaw })
    setMode('custom')
  }, [])

  // 滚轮滚动：只更新待选值，停止 400ms 后才加载（防抖，避免滚一次发一次请求）
  const scheduleMonth = useCallback((year: number, month: number) => {
    setPendingMonth({ year, month })
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      setPendingMonth(null)
      applyMonth(year, month)
    }, MONTH_APPLY_DELAY)
  }, [applyMonth])

  // 收起浮层：立即应用待选月份（不必再等防抖），并清理定时器
  const closeMonthPicker = useCallback(() => {
    setShowMonthPicker(false)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (pendingMonth) {
      applyMonth(pendingMonth.year, pendingMonth.month)
      setPendingMonth(null)
    }
  }, [applyMonth, pendingMonth])

  // 卸载清理：待执行的防抖定时器与在途请求
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
  }, [])

  const curve = useMemo(() => {
    if (!txs) return null
    return buildProfitCurve({ holdings, txs, series: seriesList, realized: [], base, rates })
  }, [txs, holdings, seriesList, base, rates])

  // 「近一周」：只展示最后 5 个交易日，避免曲线过密
  const display = useMemo(() => {
    if (!curve) return null
    if (mode !== 'week' || curve.labels.length <= WEEK_POINTS) return curve
    return {
      labels: curve.labels.slice(-WEEK_POINTS),
      holdingPL: curve.holdingPL.slice(-WEEK_POINTS),
      realizedPL: curve.realizedPL.slice(-WEEK_POINTS),
    }
  }, [curve, mode])

  const hasData = !!display && display.holdingPL.some(v => v !== 0)

  // Y 轴按整轴量级统一单位：默认 formatCompact 会在同一轴上混出「1.20万」和「10,000.00」
  const yTickFormatter = useMemo(() => {
    const maxAbs = display ? Math.max(...display.holdingPL.map(v => Math.abs(v)), 0) : 0
    if (maxAbs >= 10000) return (v: number) => `${(v / 10000).toFixed(2)}万`
    return (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
  }, [display])

  const viewYear = Number(view.start.slice(0, 4))
  const viewMonth = Number(view.start.slice(5, 7))
  // chip 与滚轮显示：滚动过程中优先显示「待选」值，让用户即时看到自己滚到了哪个月
  const shownYear = pendingMonth?.year ?? viewYear
  const shownMonth = pendingMonth?.month ?? viewMonth

  return (
    <div data-testid="profit-trend">
      {/* 时间档位 + 月份滚轮 */}
      <div className="relative mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={showWeek}
            data-testid="trend-range-week"
            className={`${filterChipCls(mode === 'week')} shrink-0`}
          >
            近一周
          </button>
          <button
            onClick={showMonth}
            data-testid="trend-range-month"
            className={`${filterChipCls(mode === 'month')} shrink-0`}
          >
            近一月
          </button>
          <button
            onClick={() => { if (showMonthPicker) closeMonthPicker(); else setShowMonthPicker(true) }}
            data-testid="trend-month-trigger"
            aria-expanded={showMonthPicker}
            className={`${filterChipCls(false)} shrink-0 inline-flex items-center gap-1`}
          >
            {shownYear}年{shownMonth}月
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showMonthPicker ? 'rotate-180' : ''}`}>
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>
          <span className="ml-auto shrink-0 text-[10px] text-ink-3">按天</span>
        </div>

        {showMonthPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeMonthPicker} />
            <div
              className="absolute left-0 top-full mt-1 z-50 rounded-3xl bg-surface shadow-lg border border-brand-tint px-4 py-4"
              onClick={e => e.stopPropagation()}
              data-testid="trend-month-pop"
            >
              <div className="flex gap-6 justify-center items-start">
                <div className="w-[80px]">
                  <WheelPicker
                    items={years}
                    value={Math.max(0, years.indexOf(shownYear))}
                    onChange={i => scheduleMonth(years[i], shownMonth)}
                    itemHeight={32}
                    visibleCount={3}
                  />
                </div>
                <div className="w-[80px]">
                  <WheelPicker
                    items={months.map(m => `${m}月`)}
                    value={shownMonth - 1}
                    onChange={i => scheduleMonth(shownYear, i + 1)}
                    itemHeight={32}
                    visibleCount={3}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {loading && !hasData ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-ink-3">
          正在加载收益走势…
        </div>
      ) : !hasData ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-ink-3">
          暂无收益走势数据
        </div>
      ) : (
        <>
          <LineChart
            labels={display!.labels}
            datasets={[{ label: '持仓收益', data: display!.holdingPL, color: HOLDING_COLOR, fill: true }]}
            height={180}
            valuePrefix={CURRENCY_SYMBOL[base]}
            yTickFormatter={yTickFormatter}
            onSwipe={handleSwipe}
          />
          <div className="text-[10px] text-ink-3 mt-1 leading-relaxed">
            {error
              ? `部分行情加载失败（${error}），仅展示已获取部分`
              : loading
                ? '正在加载…'
                : '左右滑动查看更早/更晚 · 仅含已收盘交易日 · 跨币种按当前汇率折算'}
          </div>
        </>
      )}
    </div>
  )
}
