// 总资产 / 净资产统一口径计算（资产页与首页共用，以资产页为准）
import { toBase, Currency } from './currency'
import type { ValuationWithHolding } from '../hooks/useWealthValuation'

interface AssetAccountLike {
  id: string
  type: string
  balance: number
  currency?: string
}

// 账户余额折算到 CNY（无汇率时原样返回）
export function toCNYAmount(balance: number, currency?: string, rates?: Record<string, number>): number {
  const c = (currency || 'CNY') as Currency
  return toBase(balance, c, 'CNY', rates || {})
}

// 按投资账户聚合持仓市值（account_id → 该账户下所有持仓的市值汇总）
// 港股通用 converted_value（Worker 已折 CNY），其余用 market_value（原始币种）
export function computeHoldingsValueByAccount(results: ValuationWithHolding[]) {
  const map: Record<string, { value: number; currency: string }> = {}
  for (const r of results) {
    const h = r.holding
    if (!h?.accountId) continue
    const accId = h.accountId
    if (!map[accId]) map[accId] = { value: 0, currency: r.currency || 'CNY' }
    map[accId].value += r.converted_value ?? r.market_value ?? 0
  }
  return map
}

// 总资产（折 CNY）：非负债账户（balance >= 0），投资账户余额 + 持仓市值
export function computeTotalAssetsCNY(
  accounts: AssetAccountLike[],
  rates: Record<string, number>,
  results: ValuationWithHolding[],
): number {
  const holdingsMap = computeHoldingsValueByAccount(results)
  return accounts
    .filter(a => a.type !== 'credit' && a.type !== 'debt' && a.balance >= 0)
    .reduce((sum, a) => {
      if (a.type !== 'investment') {
        return sum + toCNYAmount(a.balance, a.currency, rates)
      }
      const hv = holdingsMap[a.id]
      const holdingsVal = hv?.value ?? 0
      return sum + toCNYAmount(a.balance + holdingsVal, a.currency, rates)
    }, 0)
}
