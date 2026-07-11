// 多币种展示与折算工具
// 资产按自身真实币种展示（美股 USD / 港股 HKD / A股·基金·黄金 CNY），
// 顶层汇总可按本位币（默认 CNY）折算对比。

export type Currency = 'CNY' | 'USD' | 'HKD'

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  CNY: '¥',
  USD: '$',
  HKD: 'HK$',
}

export const CURRENCY_LABEL: Record<Currency, string> = {
  CNY: '人民币',
  USD: '美元',
  HKD: '港币',
}

// 所有支持的本位币（汇总切换用）
export const BASE_CURRENCIES: Currency[] = ['CNY', 'USD', 'HKD']

// 数值格式化：按本地习惯，最多 2 位小数；null/NaN 返回占位符
export function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

// 带币种符号的金额（如 $1,234.50）
export function fmtWithSymbol(
  n: number | null | undefined,
  currency: Currency | undefined | null,
  digits = 2,
): string {
  const sym = CURRENCY_SYMBOL[currency ?? 'CNY'] ?? '¥'
  return `${sym}${fmtMoney(n, digits)}`
}

// 汇率折算：rates 中 rates[x] 表示「1 x = ? CNY」（见后端 loadExchangeRates）。
// 例：rates.USD = 6.8 → 1 USD = 6.8 CNY；rates.HKD = 0.862 → 1 HKD = 0.862 CNY。
// amount 从 from 币种折算到 to 币种。
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Record<string, number>,
): number {
  if (from === to) return amount
  // 1 from = rates[from] CNY（CNY 自身为 1）
  const fromToCNY = rates[from] ?? 1
  const cny = amount * fromToCNY
  // 1 CNY = 1 / rates[to] 个 to（CNY 自身为 1）
  const cnyToTarget = to === 'CNY' ? 1 : 1 / (rates[to] ?? 1)
  return cny * cnyToTarget
}

// 把某币种金额折算到本位币（用于顶层汇总）。无汇率时原样返回。
export function toBase(
  amount: number,
  currency: Currency,
  base: Currency,
  rates: Record<string, number>,
): number {
  if (currency === base) return amount
  return convert(amount, currency, base, rates)
}
