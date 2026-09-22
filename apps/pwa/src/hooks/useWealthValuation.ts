import { useEffect, useSyncExternalStore } from 'react'
import { fetchBatchValuation } from '../utils/quoteApi'
import { aggregateHoldings, Holding } from '../db/wealthStore'
import type { ValuationResult } from '../utils/quoteApi'
import { BASE_CURRENCIES, convert, toBase, Currency } from '../utils/currency'

export interface ValuationWithHolding extends ValuationResult {
  holding: Holding
}

// 本地同步缓存：避免从详情页返回时 results 回退为 [] 导致先闪 0 再加载
const CACHE_KEY = 'wealth-valuation-cache'
// 缓存版本：结构变更时递增，旧版本缓存自动丢弃避免字段缺失
const CACHE_VERSION = 2
const CACHE_VERSION_KEY = 'wealth-cache-version'
// 本位币偏好（顶层汇总折算目标），默认人民币
const BASE_KEY = 'wealth-base-currency'
// 60 秒轮询
const DEFAULT_INTERVAL_MS = 60000
// 挂载时的去抖：Home / Assets / 财富 等页面互相跳转时，
// 若刚刚才拉过（同一份数据），直接复用，不再重复发请求。
const MOUNT_DEBOUNCE_MS = 2000

function loadCache(): ValuationWithHolding[] {
  try {
    const ver = localStorage.getItem(CACHE_VERSION_KEY)
    if (ver !== String(CACHE_VERSION)) return []
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ValuationWithHolding[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCache(data: ValuationWithHolding[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    localStorage.setItem(CACHE_VERSION_KEY, String(CACHE_VERSION))
  } catch { /* 忽略配额错误 */ }
}

function loadBaseCurrency(): Currency {
  try {
    const raw = localStorage.getItem(BASE_KEY) as Currency | null
    if (raw && BASE_CURRENCIES.includes(raw)) return raw
  } catch {}
  return 'CNY'
}

// ============================================================
// 模块级共享状态
//
// 为什么不再用「谁调用谁起实例」的普通 hook：useWealthValuation 被
// Home / Assets / WealthHome / WealthDetail / WealthCategory 五处使用，
// 每个页面挂载都会各发一次 valuation/batch、各起一个 60 秒定时器；
// 页面互相跳转就会重复请求同一份数据（首屏出现两次估值请求即源于此）。
// 现在全应用只保留一份状态、一个在途请求、一个定时器。
// ============================================================

interface WealthState {
  holdings: Holding[]
  results: ValuationWithHolding[]
  rates: Record<string, number>
  baseCurrency: Currency
  loading: boolean
  lastUpdated: Date | null
  error: string | null
}

let state: WealthState = {
  holdings: [],
  // 初始化即用同步缓存恢复，挂载瞬间即有上次真实数据，避免闪 0
  results: loadCache(),
  rates: { CNY: 1, USD: 1, HKD: 1 },
  baseCurrency: loadBaseCurrency(),
  loading: false,
  lastUpdated: null,
  error: null,
}

const listeners = new Set<() => void>()

function setState(patch: Partial<WealthState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): WealthState {
  return state
}

let inFlight: Promise<void> | null = null
let lastFetchStart = 0

async function doRefresh(): Promise<void> {
  setState({ loading: true, error: null })
  try {
    const hs = await aggregateHoldings()
    if (hs.length === 0) {
      // 无持仓时也尝试拉取汇率（资产页等其他页面依赖汇率做币种换算）
      try {
        const data = await fetchBatchValuation([])
        if (data?.exchange_rates) setState({ rates: data.exchange_rates })
      } catch { /* 汇率拉取失败不影响页面 */ }
      saveCache([])
      setState({ holdings: [], results: [], lastUpdated: new Date() })
      return
    }
    const items = hs.map(h => ({
      symbol: h.symbol,
      market: h.market,
      quantity: h.quantity,
      cost_price: h.cost_price,
      total_cost: h.total_cost,
      account_currency: h.accountCurrency,
    }))
    // 后端按资产自身币种返回市值/盈亏，汇率随响应带回前端本地折算
    const data = await fetchBatchValuation(items)
    const rates = data?.exchange_rates ? { ...state.rates, ...data.exchange_rates } : state.rates
    const merged: ValuationWithHolding[] = (data?.results ?? []).map(r => {
      const h = hs.find(x => x.symbol === r.symbol && x.market === r.market)
      // 名称优先用数据库持仓的中文名（用户录入/搜索时保存），兜底用后端行情英文名。
      // 否则美股等会被后端返回的英文长名覆盖，丢失中文展示。
      const name = h?.name || r.name || r.symbol
      return { ...r, name, holding: h! }
    })
    saveCache(merged)
    setState({ holdings: hs, results: merged, rates, lastUpdated: new Date() })
  } catch (e: any) {
    setState({ error: e?.message || '估值刷新失败' })
  } finally {
    setState({ loading: false })
  }
}

/** 刷新估值。已有在途请求时直接复用它，不会重复发请求。 */
function refresh(): Promise<void> {
  if (inFlight) return inFlight
  lastFetchStart = Date.now()
  inFlight = doRefresh().finally(() => { inFlight = null })
  return inFlight
}

function setBaseCurrency(c: Currency) {
  try { localStorage.setItem(BASE_KEY, c) } catch {}
  setState({ baseCurrency: c })
}

// 定时轮询：全应用只保留一个，最后一个订阅者卸载时停掉
let timer: ReturnType<typeof setInterval> | null = null
let refCount = 0
let pollIntervalMs = DEFAULT_INTERVAL_MS

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function startPolling(intervalMs: number) {
  pollIntervalMs = intervalMs
  if (timer) return
  // 页面在后台就不轮询：PWA 常驻后台，否则会一天 1400+ 次打后端行情接口
  if (isHidden()) return
  timer = setInterval(() => { void refresh() }, intervalMs)
}

function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// 可见性变化：隐藏即停轮询；回到前台先补一次（若已过期）再恢复轮询。
// 模块级只注册一次；无订阅者时事件里直接 return，不做任何事。
let visibilityBound = false
function bindVisibility() {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (refCount <= 0) return
    if (isHidden()) {
      stopPolling()
      return
    }
    if (Date.now() - lastFetchStart > pollIntervalMs) void refresh()
    startPolling(pollIntervalMs)
  })
}

// 按本位币折算后的分组汇总：返回各币种小计 + 本位币合计
function summary() {
  const { results, baseCurrency, rates } = state
  const byCurrency: Record<Currency, { market_value: number; profit_loss: number }> = {
    CNY: { market_value: 0, profit_loss: 0 },
    USD: { market_value: 0, profit_loss: 0 },
    HKD: { market_value: 0, profit_loss: 0 },
  }
  let baseMV = 0
  let basePL = 0
  for (const r of results) {
    const cur = (r.currency ?? 'CNY') as Currency
    // 港股通：Worker 已折算为 CNY，直接用 converted_value
    const mv = r.converted_value ?? r.market_value
    if (r.market_value != null) byCurrency[cur].market_value += r.market_value
    if (r.profit_loss != null) byCurrency[cur].profit_loss += r.profit_loss
    if (mv != null) baseMV += toBase(mv, (r.converted_currency ?? cur) as Currency, baseCurrency, rates)
    if (r.profit_loss != null) basePL += toBase(r.profit_loss, cur, baseCurrency, rates)
  }
  return { byCurrency, baseMV, basePL }
}

export function useWealthValuation(intervalMs = DEFAULT_INTERVAL_MS) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    refCount++
    // 进入即刷（有缓存兜底显示，不会闪 0）；刚拉过就复用，避免页面跳转重复请求
    if (!inFlight && Date.now() - lastFetchStart > MOUNT_DEBOUNCE_MS) {
      void refresh()
    }
    bindVisibility()
    startPolling(intervalMs)
    return () => {
      refCount--
      if (refCount <= 0) {
        refCount = 0
        stopPolling()
      }
    }
  }, [intervalMs])

  return {
    holdings: snap.holdings,
    results: snap.results,
    rates: snap.rates,
    baseCurrency: snap.baseCurrency,
    setBaseCurrency,
    summary,
    loading: snap.loading,
    lastUpdated: snap.lastUpdated,
    error: snap.error,
    refresh,
  }
}

// 今日收益：change_percent 是小数（如 -0.02 表示 -2%），用资产自身币种市值即可
// 公式：昨日市值 = 当前市值 / (1 + change_percent)
//       今日收益 = 当前市值 - 昨日市值
export function todayProfit(v: ValuationWithHolding): number {
  if (v.market_value == null || v.change_percent == null) return 0
  return v.market_value - v.market_value / (1 + v.change_percent)
}

// 把某资产金额折算到当前本位币（供页面展示时调用）
export function toBaseCurrency(
  amount: number,
  currency: Currency,
  base: Currency,
  rates: Record<string, number>,
): number {
  return toBase(amount, currency, base, rates)
}

// 兼容旧引用：convert 透传
export { convert }
