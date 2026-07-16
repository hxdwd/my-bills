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
  getGoldCache,
  setGoldCache,
  FxCache,
} from './cache'
import { fetchQuote, fetchHistory, getAdapters } from './adapter'
import { log } from './logger'

const SUPPORTED_CURRENCIES: Currency[] = ['CNY', 'USD', 'HKD']

// 拉取实时汇率：rates[x] 表示「1 x = ? CNY」（如 USD=6.8 即 1 USD=6.8 CNY）
// 失败则用缓存；再失败返回默认 1:1（即不转换）
// 汇率缓存有效期：TTL 内直接用 KV，不回源。
// 一天内汇率波动很小，1 小时回源一次足够，避免每个 batch 都打外部汇率接口。
const FX_FRESH_MS = 60 * 60 * 1000

async function loadExchangeRates(kv: KVNamespace): Promise<FxCache> {
  const cached = await getFxCache(kv)
  // 命中且未过期：直接返回，省去每次回源 + 重复写 KV 的固定开销
  if (cached && Date.now() - cached.timestamp < FX_FRESH_MS) {
    log(2, `[perf] fx KV cache HIT (age ${Math.round((Date.now() - cached.timestamp) / 1000)}s, skip origin)`)
    return cached
  }
  try {
    const _t0 = Date.now()
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
    log(2, `[perf] fx origin fetch ${Date.now() - _t0}ms (exchangerate-api)`)
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
    log(2, '[perf] fx origin FAILED -> ' + (cached ? 'fallback KV cache' : 'fallback 1:1'))
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
  const _total0 = Date.now()

  // 汇率
  const _fxT0 = Date.now()
  const fx = await loadExchangeRates(kv)
  const fxMs = Date.now() - _fxT0
  log(2, `[perf] loadExchangeRates total ${fxMs}ms`)

  // 1. 先批量查 KV 缓存（按归一化 key）
  const cacheKeys: string[] = []
  const keyToItemIndex: Record<string, number[]> = {}
  items.forEach((it, idx) => {
    const market = parseSymbol(it.symbol, it.market).market
    const key = quoteCacheKey(market, it.symbol)
    cacheKeys.push(key)
    ;(keyToItemIndex[key] ||= []).push(idx)
  })

  const uniqueKeys = Array.from(new Set(cacheKeys))
  const cachedMap: Record<string, QuoteCacheValue | null> = {}
  const _kvT0 = Date.now()
  await Promise.all(
    uniqueKeys.map(async (k) => {
      cachedMap[k] = await getQuoteCache(kv, k)
    })
  )
  const _kvMs = Date.now() - _kvT0

  // 2. 找出未命中缓存的 symbol（去重），并行拉取
  // KV 中存有失败标志（__FAIL__）也视为"命中"，跳过回源避免重复无效请求
  const missingKeys = uniqueKeys.filter((k) => cachedMap[k] === null || cachedMap[k] === undefined)
  const fetched: Record<string, QuoteCacheValue | null> = {}
  log(2,
    `[perf] KV quote lookup ${_kvMs}ms | keys=${uniqueKeys.length} hit=${uniqueKeys.length - missingKeys.length} miss=${missingKeys.length}` +
      (missingKeys.length ? ` missKeys=[${missingKeys.join(', ')}]` : '')
  )

  const _fetchT0 = Date.now()
  // 数据源统计：记录本次请求各市场实际回源用的 adapter（level=1 汇总用）
  const srcStats: string[] = []
  await Promise.allSettled(
    missingKeys.map(async (k) => {
      // key 形如 quote:{market}:{symbol}
      const [, marketStr, sym] = k.split(':')
      const _one0 = Date.now()
      // 黄金：先查专用长 TTL 缓存（fresh 直接命中，省去 ~1.5s 回源）
      if (marketStr === 'GOLD') {
        const gc = await getGoldCache(kv)
        if (gc.state === 'fresh' && gc.value) {
          fetched[k] = gc.value
          cachedMap[k] = gc.value
          srcStats.push('gold:kv')
          log(2, `[perf]   gold KV cache HIT (age ${Math.round((Date.now() - gc.value.timestamp) / 1000)}s, skip origin)`)
          return
        }
      }
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
        if (marketStr === 'GOLD') setGoldCache(kv, val)
        // 把最新价格也合并进 cachedMap，供本轮使用
        cachedMap[k] = val
        // 记录该市场第一个可用的数据源名（由 adapter 的 trySources 决定）
        const adapters = getAdapters(marketStr as Market)
        srcStats.push(`${marketStr}:${adapters[0]?.name ?? '?'}`)
        log(2, `[perf]   fetch OK  ${marketStr}:${sym} ${Date.now() - _one0}ms`)
      } catch (e: any) {
        fetched[k] = null
        cachedMap[k] = null
        // 写入失败标志到 KV（短 TTL），避免每次请求都重复回源必然失败的标的
        const FAIL_TTL = 300 // 5 分钟，源服务异常可在此周期后恢复
        try {
          await kv.put(k, JSON.stringify(null), { expirationTtl: FAIL_TTL })
        } catch (putErr) {
          console.error('[cache] 写入失败标志异常', k, putErr)
        }
        // 黄金回源失败：若有过期缓存（6h 宽限内）则降级用旧价，避免报错
        if (marketStr === 'GOLD') {
          const gc = await getGoldCache(kv)
          if (gc.state === 'stale' && gc.value) {
            fetched[k] = gc.value
            cachedMap[k] = gc.value
            srcStats.push('gold:stale')
            log(2, `[perf]   fetch ERR GOLD -> stale fallback age ${Math.round((Date.now() - gc.value.timestamp) / 1000)}s ${e?.message || e}`)
            return
          }
        }
        srcStats.push(`${marketStr}:FAIL`)
        log(2, `[perf]   fetch ERR ${marketStr}:${sym} ${Date.now() - _one0}ms ${e?.message || e}`)
      }
    })
  )
  if (missingKeys.length) {
    log(2, `[perf] origin fetch total ${Date.now() - _fetchT0}ms (${missingKeys.length} symbols)`)
  }

  // 3. 组装每只资产结果
  const results: ValuationResult[] = items.map((it: ValuationItem) => {
    const p = parseSymbol(it.symbol, it.market)
    const market = p.market
    const key = quoteCacheKey(market, it.symbol)
    const cached = cachedMap[key]

    // 成本
    const totalCost = it.total_cost ?? (it.cost_price ?? 0) * it.quantity
    const costPrice = it.cost_price ?? (it.quantity > 0 ? it.total_cost! / it.quantity : 0)

    if (!cached || cached === '__FAIL__') {
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

    // 港股通折算：market=HK 且买入账户为 CNY → 将 HKD 市值折算为 CNY
    // 注意：港股通用户以人民币买入港股，资产实际价值应折人民币展示
    let convertedValue: number | null = null
    let convertedCurrency: Currency | undefined
    if (market === 'HK' && it.account_currency === 'CNY' && currency === 'HKD') {
      const hkdToCny = fx.rates.HKD ?? 1
      convertedValue = round2(marketValue * hkdToCny)
      convertedCurrency = 'CNY'
    }

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
      converted_value: convertedValue,
      converted_currency: convertedCurrency,
    }
  })

  // 4. 汇总：因各资产币种不同，跨币种直接相加无意义，此处不再做合计。
  //    前端按本位币（默认 CNY）用 exchange_rates 本地折算后分组汇总。

  // 5. 按需字段裁剪
  const trimmed = req.fields ? results.map((r) => pickFields(r, req.fields)) : results

  log(1,
    `[perf] runValuation ${Date.now() - _total0}ms items=${items.length} fx=${fxMs}ms kv=${_kvMs}ms miss=${missingKeys.length}` +
      (srcStats.length ? ` src=[${srcStats.join(', ')}]` : '')
  )

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
