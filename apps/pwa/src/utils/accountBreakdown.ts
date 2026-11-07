// ============================================================
// 投资账户维度的持仓拆分（纯函数，不碰网络/DB）
//
// 背景：行情接口只按「标的」报价，拿不到「某账户的价」。
// 所以账户维度的市值只能按数量占比从标的市值里分摊：
//   该账户市值 = 标的市值 × 该账户数量 / 标的数量合计
// 成本则是精确的（来自该账户自己的买入流水）。
//
// 数据来源：
//   - valuations：useWealthValuation 的 results（一个标的一条）
//   - slices：splitHoldingsByAccount()（一个标的被拆成若干账户切片）
// ============================================================

import type { Market } from './quoteApi'
import type { AccountSlice } from '../db/wealthStore'
import { toBase, type Currency } from './currency'

export const UNSET_ACCOUNT_NAME = '未指定账户'

/** 只取需要的字段，避免和 hook 互相 import */
export interface BreakdownValuation {
  symbol: string
  market: Market
  name?: string | null
  market_value: number | null
  converted_value?: number | null
  converted_currency?: 'CNY' | 'USD' | 'HKD' | null
  profit_loss: number | null
  currency: 'CNY' | 'USD' | 'HKD'
  change_percent?: number | null
}

export interface AccountPosition {
  symbol: string
  market: Market
  name: string
  quantity: number
  /** 该账户这部分持仓的成本（标的计价币种） */
  costNative: number
  /** 标的自身币种 */
  currency: Currency
  /** 市值（标的自身币种） */
  valueAssetNative: number
  /** 市值（展示用币种，港股通折算后为 CNY） */
  valueNative: number
  valueCurrency: Currency
  /** 持仓盈亏（标的自身币种） */
  profitNative: number
  /** 今日收益（标的自身币种） */
  todayNative: number
}

export interface AccountBucket {
  accountId: string | null
  name: string
  /** 账户币种（来自账户配置，找不到时退回 CNY） */
  currency: Currency
  positions: AccountPosition[]
  /** 以下三个都已折算到本位币 */
  valueBase: number
  profitBase: number
  todayBase: number
  /** 该账户占全部投资市值的百分比（0~100） */
  pct: number
}

export interface AccountBreakdown {
  buckets: AccountBucket[]
  totalBase: number
}

interface AccountLike {
  id: string
  name: string
  currency?: string
  type?: string
}

function asCurrency(v: string | null | undefined, fallback: Currency = 'CNY'): Currency {
  return v === 'CNY' || v === 'USD' || v === 'HKD' ? v : fallback
}

/** 把某个账户的持仓市值折算到指定币种（资产页需要按账户币种展示） */
export function bucketValueIn(
  bucket: AccountBucket,
  target: Currency,
  rates: Record<string, number>,
): number {
  return bucket.positions.reduce(
    (sum, p) => sum + toBase(p.valueAssetNative, p.currency, target, rates),
    0,
  )
}

export function buildAccountBreakdown(params: {
  valuations: BreakdownValuation[]
  slices: Map<string, AccountSlice[]>
  accounts: AccountLike[]
  baseCurrency: Currency
  rates: Record<string, number>
}): AccountBreakdown {
  const { valuations, slices, accounts, baseCurrency, rates } = params

  const accountMap = new Map<string, AccountLike>()
  for (const a of accounts) accountMap.set(a.id, a)

  const buckets = new Map<string, AccountBucket>()
  const ensureBucket = (accountId: string | null): AccountBucket => {
    const key = accountId ?? '__unset__'
    let b = buckets.get(key)
    if (!b) {
      const acc = accountId ? accountMap.get(accountId) : undefined
      b = {
        accountId,
        name: acc?.name ?? UNSET_ACCOUNT_NAME,
        currency: asCurrency(acc?.currency),
        positions: [],
        valueBase: 0,
        profitBase: 0,
        todayBase: 0,
        pct: 0,
      }
      buckets.set(key, b)
    }
    return b
  }

  for (const v of valuations) {
    const cur = asCurrency(v.currency)
    const valueCur = asCurrency(v.converted_currency ?? v.currency)
    const key = `${v.market}:${v.symbol}`
    const parts = slices.get(key)

    // 没有切片（理论上不该发生）：整只归到「未指定账户」，避免市值凭空消失
    const effective: AccountSlice[] = parts && parts.length > 0
      ? parts
      : [{ accountId: null, quantity: 0, cost: 0 }]

    if (!parts || parts.length === 0) {
      const b = ensureBucket(null)
      const mvAsset = v.market_value ?? 0
      const cp = v.change_percent ?? 0
      b.positions.push({
        symbol: v.symbol,
        market: v.market,
        name: v.name || v.symbol,
        quantity: 0,
        costNative: 0,
        currency: cur,
        valueAssetNative: mvAsset,
        valueNative: v.converted_value ?? mvAsset,
        valueCurrency: valueCur,
        profitNative: v.profit_loss ?? 0,
        todayNative: mvAsset - mvAsset / (1 + cp),
      })
      continue
    }

    const totalQty = effective.reduce((s, p) => s + p.quantity, 0)
    if (totalQty <= 0) continue

    for (const p of effective) {
      const share = p.quantity / totalQty
      const mvAsset = (v.market_value ?? 0) * share
      const cp = v.change_percent ?? 0
      const b = ensureBucket(p.accountId)
      b.positions.push({
        symbol: v.symbol,
        market: v.market,
        name: v.name || v.symbol,
        quantity: p.quantity,
        costNative: p.cost,
        currency: cur,
        valueAssetNative: mvAsset,
        valueNative: (v.converted_value ?? v.market_value ?? 0) * share,
        valueCurrency: valueCur,
        profitNative: (v.profit_loss ?? 0) * share,
        todayNative: mvAsset - mvAsset / (1 + cp),
      })
    }
  }

  const list = [...buckets.values()]
  let totalBase = 0
  for (const b of list) {
    b.valueBase = b.positions.reduce((s, p) => s + toBase(p.valueNative, p.valueCurrency, baseCurrency, rates), 0)
    b.profitBase = b.positions.reduce((s, p) => s + toBase(p.profitNative, p.currency, baseCurrency, rates), 0)
    b.todayBase = b.positions.reduce((s, p) => s + toBase(p.todayNative, p.currency, baseCurrency, rates), 0)
    totalBase += b.valueBase
  }
  for (const b of list) {
    b.pct = totalBase > 0 ? (b.valueBase / totalBase) * 100 : 0
    b.positions.sort((x, y) => y.valueAssetNative - x.valueAssetNative)
  }

  list.sort((a, b) => b.valueBase - a.valueBase)
  return { buckets: list, totalBase }
}

/** 账户内某个持仓占该账户市值的百分比（都折到本位币后比较） */
export function positionPctInBucket(
  p: AccountPosition,
  bucket: AccountBucket,
  base: Currency,
  rates: Record<string, number>,
): number {
  if (bucket.valueBase <= 0) return 0
  return (toBase(p.valueNative, p.valueCurrency, base, rates) / bucket.valueBase) * 100
}
