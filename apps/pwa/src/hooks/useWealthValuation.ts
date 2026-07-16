import { useState, useEffect, useCallback } from 'react'
import { fetchBatchValuation } from '../utils/quoteApi'
import { aggregateHoldings, Holding } from '../db/wealthStore'
import type { ValuationResult, Currency } from '../utils/quoteApi'
import { BASE_CURRENCIES, convert, toBase } from '../utils/currency'

export interface ValuationWithHolding extends ValuationResult {
  holding: Holding
}

// 本地同步缓存：避免从详情页返回时 results 回退为 [] 导致先闪 0 再加载
const CACHE_KEY = 'wealth-valuation-cache'
// 本位币偏好（顶层汇总折算目标），默认人民币
const BASE_KEY = 'wealth-base-currency'

function loadCache(): ValuationWithHolding[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ValuationWithHolding[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCache(rows: ValuationWithHolding[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows))
  } catch {
    /* 忽略写入失败（如隐私模式） */
  }
}

function loadBaseCurrency(): Currency {
  try {
    const raw = localStorage.getItem(BASE_KEY) as Currency | null
    if (raw && BASE_CURRENCIES.includes(raw)) return raw
  } catch {}
  return 'CNY'
}

// 聚合持仓 → 调 batch 估值（各资产返回自身币种）→ 合并持仓信息
export function useWealthValuation(intervalMs = 60000) {
  // 初始化即用同步缓存恢复，挂载瞬间即有上次真实数据，避免返回时闪 0
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [results, setResults] = useState<ValuationWithHolding[]>(loadCache)
  const [rates, setRates] = useState<Record<string, number>>({ CNY: 1, USD: 1, HKD: 1 })
  const [baseCurrency, setBaseCurrencyState] = useState<Currency>(loadBaseCurrency)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const hs = await aggregateHoldings()
      setHoldings(hs)
      if (hs.length === 0) {
        setResults([])
        saveCache([])
        setLastUpdated(new Date())
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
      if (data?.exchange_rates) setRates(data.exchange_rates)
      const merged: ValuationWithHolding[] = (data?.results ?? []).map(r => {
        const h = hs.find(x => x.symbol === r.symbol && x.market === r.market)
        // 名称优先用数据库持仓的中文名（用户录入/搜索时保存），兜底用后端行情英文名。
        // 否则美股等会被后端返回的英文长名覆盖，丢失中文展示。
        const name = h?.name || r.name || r.symbol
        return { ...r, name, holding: h! }
      })
      setResults(merged)
      saveCache(merged)
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e?.message || '估值刷新失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const setBaseCurrency = useCallback((c: Currency) => {
    setBaseCurrencyState(c)
    try { localStorage.setItem(BASE_KEY, c) } catch {}
  }, [])

  // 按本位币折算后的分组汇总：返回各币种小计 + 本位币合计
  const summary = useCallback(() => {
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
  }, [results, baseCurrency, rates])

  // 进入即刷
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, intervalMs)
    return () => clearInterval(timer)
  }, [refresh, intervalMs])

  return {
    holdings, results, rates, baseCurrency, setBaseCurrency, summary,
    loading, lastUpdated, error, refresh,
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
