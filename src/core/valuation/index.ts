import type {
  BatchRequest,
  ValuationResult,
  ValuationItem,
  Market,
  Currency,
  BatchResponseData,
  QuoteCacheValue,
} from '../../types/api'
import { parseSymbol, quoteCacheKey, historyCacheKey } from './parser'
import {
  getQuoteCache,
  setQuoteCache,
  getFxCache,
  setFxCache,
  getHistoryCache,
  setHistoryCache,
  FxCache,
} from './cache'
import { fetchQuote, fetchHistory } from './adapter'

const SUPPORTED_CURRENCIES: Currency[] = ['CNY', 'USD', 'HKD']

// 拉取实时汇率：rates[x] 表示「1 x = ? CNY」（如 USD=6.8 即 1 USD=6.8 CNY）
// 失败则用缓存；再失败返回默认 1:1（即不转换）
async function loadExchangeRates(kv: KVNamespace): Promise<FxCache> {
  const cached = await getFxCache(kv)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    let json: any
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/CNY', {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`fx http ${res.status}`)
      json = await res.json()
    } finally {
      clearTimeout(timer)
    }
    const ratesRaw: Record<string, number> = json?.rates ?? {}
    const rates: Record<string, number> = { CNY: 1 }
    for (const c of SUPPORTED_CURRENCIES) {
      if (c === 'CNY') continue
      const v = ratesRaw[c]
      if (typeof v === 'number' && v > 0) rates[c] = 1 / v // 转成 1 CNY = ? c
    }
    const fx: FxCache = { rates, timestamp: Date.now() }
    await setFxCache(kv, fx)
    return fx
  } catch {
    // 失败用缓存，再失败默认 1:1
    if (cached) return cached
    return { rates: { CNY: 1, USD: 1, HKD: 1 }, timestamp: Date.now() }
  }
}

function pickFields(result: ValuationResult, fields?: string[]): ValuationResult {
  if (!fields || fields.length === 0) return result
  const out: any = {}
  for (const f of fields) {
    if (f in result) out[f] = (result as any)[f]
  }
  return out as ValuationResult
}

// 主引擎：接收请求体 + KV 环境，返回批量估值结果
export async function runValuation(
  req: BatchRequest,
  kv: KVNamespace
): Promise<BatchResponseData> {
  // 注意：各资产市值/盈亏均以其自身币种返回（见上方组装逻辑），
  // 不再接受 target_currency 折算请求；保留字段以避免破坏请求契约。
  const items = req.items ?? []

  // 汇率
  const fx = await loadExchangeRates(kv)

  // 1. 先批量查 KV 缓存（按归一化 key）
  const cacheKeys: string[] = []
  const keyToItemIndex: Record<string, number[]> = {}
  items.forEach((it, idx) => {
    const market = parseSymbol(it.symbol, it.market).market
    const key = quoteCacheKey(market, it.symbol)
    cacheKeys.push(key)
    ;(keyToItemIndex[key] ||= []).push(idx)
  })

  const cachedMap: Record<string, QuoteCacheValue | null> = {}
  await Promise.all(
    cacheKeys.map(async (k) => {
      cachedMap[k] = await getQuoteCache(kv, k)
    })
  )

  // 2. 找出未命中缓存的 symbol（去重），并行拉取
  const missingKeys = Array.from(new Set(cacheKeys.filter((k) => !cachedMap[k])))
  const fetched: Record<string, QuoteCacheValue | null> = {}

  await Promise.allSettled(
    missingKeys.map(async (k) => {
      // key 形如 quote:{market}:{symbol}
      const [, marketStr, sym] = k.split(':')
      try {
        const q = await fetchQuote(sym, marketStr as Market)
        const val = {
          price: q.price,
          timestamp: Date.now(),
          currency: q.currency,
          changePercent: q.changePercent,
          name: q.name,
        }
        fetched[k] = val
        // 异步写回 KV（不阻塞）
        setQuoteCache(kv, k, val)
        // 把最新价格也合并进 cachedMap，供本轮使用
        cachedMap[k] = val
      } catch {
        fetched[k] = null
        cachedMap[k] = null
      }
    })
  )

  // 3. 组装每只资产结果
  const results: ValuationResult[] = items.map((it: ValuationItem) => {
    const p = parseSymbol(it.symbol, it.market)
    const market = p.market
    const key = quoteCacheKey(market, it.symbol)
    const cached = cachedMap[key]

    // 成本
    const totalCost = it.total_cost ?? (it.cost_price ?? 0) * it.quantity
    const costPrice = it.cost_price ?? (it.quantity > 0 ? it.total_cost! / it.quantity : 0)

    if (!cached) {
      // 拉取失败
      return {
        symbol: it.symbol,
        market,
        quantity: it.quantity,
        cost_price: round2(costPrice),
        total_cost: round2(totalCost),
        current_price: null,
        currency: marketCurrency(market),
        market_value: null,
        profit_loss: null,
        profit_rate: null,
        change_percent: null,
        quote_time: null,
        error: '行情获取失败',
      }
    }

    // 币种优先用缓存中数据源真实币种，缺省按市场默认映射
    const currency: Currency = cached.currency ?? marketCurrency(market)
    const currentPrice = cached.price
    const marketValue = currentPrice * it.quantity
    const profitLoss = marketValue - totalCost
    const profitRate = totalCost > 0 ? profitLoss / totalCost : 0

    // 市值/盈亏均以资产自身真实币种返回（currency 字段标记），
    // 不再折算到本位币，避免前端混用币种。顶层汇总由前端按汇率本地折算。
    return {
      symbol: it.symbol,
      market,
      name: cached.name ?? undefined,
      quantity: it.quantity,
      cost_price: round2(costPrice),
      total_cost: round2(totalCost),
      current_price: currentPrice,
      currency,
      market_value: round2(marketValue),
      profit_loss: round2(profitLoss),
      profit_rate: round4(profitRate),
      change_percent: typeof cached.changePercent === 'number' ? round4(cached.changePercent) : null,
      quote_time: new Date(cached.timestamp).toISOString(),
    }
  })

  // 4. 汇总：因各资产币种不同，跨币种直接相加无意义，此处不再做合计。
  //    前端按本位币（默认 CNY）用 exchange_rates 本地折算后分组汇总。

  // 5. 按需字段裁剪
  const trimmed = req.fields ? results.map((r) => pickFields(r, req.fields)) : results

  return {
    results: trimmed,
    total_market_value: 0,
    total_profit_loss: 0,
    total_currency: 'CNY',
    exchange_rates: fx.rates,
  }
}

// 单资产行情详情
export async function runQuoteDetail(
  symbol: string,
  market?: Market,
  kv?: KVNamespace
): Promise<{ quote: any; cached: boolean }> {
  const p = parseSymbol(symbol, market)
  const m = p.market
  // 先查缓存
  if (kv) {
    const key = quoteCacheKey(m, symbol)
    const c = await getQuoteCache(kv, key)
    if (c) {
      return {
        quote: {
          symbol,
          market: m,
          name: c.name ?? '',
          current_price: c.price,
          change_percent: typeof c.changePercent === 'number' ? c.changePercent : 0,
          currency: c.currency ?? marketCurrency(m),
          quote_time: new Date(c.timestamp).toISOString(),
        },
        cached: true,
      }
    }
  }
  const q = await fetchQuote(symbol, m)
  if (kv) {
    const key = quoteCacheKey(m, symbol)
    setQuoteCache(kv, key, {
      price: q.price,
      timestamp: Date.now(),
      currency: q.currency,
      changePercent: q.changePercent,
      name: q.name,
    })
  }
  return {
    quote: {
      symbol,
      market: m,
      name: q.name ?? '',
      current_price: q.price,
      change_percent: q.changePercent ?? 0,
      currency: q.currency,
      quote_time: q.quoteTime,
    },
    cached: false,
  }
}

// 历史走势
export async function runHistory(
  symbol: string,
  market: Market | undefined,
  period: string,
  kv: KVNamespace
): Promise<Array<{ date: string; price: number }>> {
  const p = parseSymbol(symbol, market)
  // 缓存命中直接返回
  const key = historyCacheKey(p.market, symbol, period)
  const cached = await getHistoryCache(kv, key)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {
      // 忽略损坏缓存
    }
  }
  try {
    const data = await fetchHistory(symbol, p.market, period)
    if (data.length > 0) {
      setHistoryCache(kv, key, JSON.stringify(data))
    }
    return data
  } catch (e: any) {
    console.error('[history] fetchHistory failed', p.market, symbol, period, e?.message || e)
    return []
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// 市场 → 默认币种（缓存无 currency 时兜底；基金与 A股均为 CNY）
function marketCurrency(market: Market): Currency {
  if (market === 'US') return 'USD'
  if (market === 'HK') return 'HKD'
  if (market === 'GOLD') return 'CNY'
  return 'CNY'
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
