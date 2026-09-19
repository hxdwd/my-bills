// 组合收益曲线：按天重建「持仓浮盈」与「已实现（清仓）收益累计」两条序列。
//
// 设计要点（方案 A + 方案 P）：
// - 持仓量 q(t) 与持仓成本 C(t) 全部由本地流水按日期重建（0 额外请求）；
//   成本冲减口径与 aggregateHoldings 完全一致，否则「持仓收益 + 清仓收益」会与实际总收益对不上。
// - 历史价 P(t) 来自批量历史接口，缺失日（周末/假期/停牌）用最近一个交易日价前向填充。
// - 已实现收益只依赖流水，按卖出日阶梯累加，与历史价无关。
// - 日期轴取各标的日期的并集，因此曲线范围 = 批量接口返回的最新区间（默认 1m）。

import type { Holding, RealizedEvent } from '../db/wealthStore'
import { marketCurrencyOf } from '../db/wealthStore'
import type { HoldingTransactionRecord } from '../db/database'
import type { HistorySeries } from './quoteApi'
import { toBase, Currency } from './currency'

export interface ProfitCurve {
  /** 横轴标签：MM-DD */
  labels: string[]
  /** 持仓浮盈（本位币，按天） */
  holdingPL: number[]
  /** 已实现（清仓）收益累计（本位币，按天，阶梯型） */
  realizedPL: number[]
}

interface PosState {
  buyQuantity: number
  sellQuantity: number
  totalCost: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 构建组合收益曲线。
 *
 * @param holdings 当前持仓（aggregateHoldings 结果）
 * @param txs      全部持仓流水（含清仓归档记录，用于已实现收益）
 * @param series   批量历史接口返回的各标的日线
 * @param realized 已实现收益事件（computeRealizedProfit 结果）
 */
export function buildProfitCurve(params: {
  holdings: Holding[]
  txs: HoldingTransactionRecord[]
  series: HistorySeries[]
  realized: RealizedEvent[]
  base: Currency
  rates: Record<string, number>
}): ProfitCurve {
  const { holdings, txs, series, realized, base, rates } = params

  // 日期轴：所有标的日期的并集（升序）
  const dateSet = new Set<string>()
  series.forEach(s => s.points.forEach(p => dateSet.add(p.date)))
  if (dateSet.size === 0) {
    // 无任何历史价（如当前无持仓）：退化为「已实现事件日 + 今天」，
    // 仍可展示清仓收益的阶梯变化，而不是整块空白。
    realized.forEach(e => { if (e.date) dateSet.add(e.date) })
    dateSet.add(new Date().toISOString().slice(0, 10))
  }
  const dates = [...dateSet].sort()
  if (dates.length === 0) return { labels: [], holdingPL: [], realizedPL: [] }

  // 当前持仓标的的活跃流水（与 aggregateHoldings 口径一致：只算 is_active !== false）
  const txByKey = new Map<string, HoldingTransactionRecord[]>()
  txs
    .filter(t => t.is_active !== false)
    .forEach(t => {
      const k = `${t.market}:${t.symbol}`
      const list = txByKey.get(k)
      if (list) list.push(t)
      else txByKey.set(k, [t])
    })
  txByKey.forEach(list =>
    list.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)),
  )

  const priceByKey = new Map<string, { date: string; price: number }[]>()
  series.forEach(s => {
    const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date))
    if (pts.length > 0) priceByKey.set(`${s.market}:${s.symbol}`, pts)
  })

  // 逐标的推进，累加到每个日期点的持仓浮盈
  const holdingPLByDate: number[] = new Array(dates.length).fill(0)

  for (const h of holdings) {
    const key = `${h.market}:${h.symbol}`
    const list = txByKey.get(key) ?? []
    const prices = priceByKey.get(key) ?? []
    if (prices.length === 0) continue // 无历史价（港股/停牌等）→ 该标的暂不计入曲线
    const currency = (marketCurrencyOf(h.market) as Currency)

    const st: PosState = { buyQuantity: 0, sellQuantity: 0, totalCost: 0 }
    let ti = 0
    let pi = 0
    let lastPrice: number | null = null

    for (let di = 0; di < dates.length; di++) {
      const d = dates[di]

      // 把该标的 date <= d 的流水全部应用（成本冲减口径与 aggregateHoldings 一致）
      while (ti < list.length && list[ti].date <= d) {
        const t = list[ti++]
        if (!t.quantity || t.quantity <= 0) continue
        if (t.direction === 'buy') {
          st.buyQuantity += t.quantity
          st.totalCost += t.quantity * t.price
        } else {
          st.sellQuantity += t.quantity
          const avg = st.buyQuantity > 0 ? st.totalCost / st.buyQuantity : t.price
          st.totalCost -= t.quantity * avg
          if (st.totalCost < 0) st.totalCost = 0
        }
      }

      // 价格前向填充：取最后一个 date <= d 的收盘价
      while (pi < prices.length && prices[pi].date <= d) {
        lastPrice = prices[pi].price
        pi++
      }

      const q = Math.max(0, st.buyQuantity - st.sellQuantity)
      if (q > 0 && lastPrice != null) {
        const pl = q * lastPrice - st.totalCost
        holdingPLByDate[di] += toBase(pl, currency, base, rates)
      }
    }
  }

  // 已实现收益累计：按卖出日阶梯累加
  const realizedPL: number[] = new Array(dates.length).fill(0)
  const evSorted = [...realized].sort((a, b) => a.date.localeCompare(b.date))
  let ri = 0
  let acc = 0
  for (let di = 0; di < dates.length; di++) {
    const d = dates[di]
    while (ri < evSorted.length && evSorted[ri].date <= d) {
      const ev = evSorted[ri++]
      acc += toBase(ev.amount, ev.currency as Currency, base, rates)
    }
    realizedPL[di] = acc
  }

  return {
    labels: dates.map(d => d.slice(5)),
    holdingPL: holdingPLByDate.map(round2),
    realizedPL: realizedPL.map(round2),
  }
}
