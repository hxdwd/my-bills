// 全球资产估值 API —— 前后端共享类型定义
// 后端：Cloudflare Pages Functions；前端：React 项目可直接 import 复用。

export type Market = 'CN' | 'HK' | 'US' | 'FUND' | 'GOLD'
export type Currency = 'CNY' | 'USD' | 'HKD'

// ============ 接口一：批量估值 ============

export interface ValuationItem {
  symbol: string
  market?: Market
  quantity: number
  cost_price?: number
  total_cost?: number
  /** 买入账户的币种（CNY/USD/HKD），用于港股通折算 */
  account_currency?: Currency
}

export interface BatchRequest {
  items: ValuationItem[]
  target_currency?: Currency
  fields?: string[]
}

export interface ValuationResult {
  symbol: string
  market: Market
  name?: string
  quantity: number
  cost_price: number
  total_cost: number
  current_price: number | null
  /** 资产原始计价币种 */
  currency: Currency
  market_value: number | null
  profit_loss: number | null
  profit_rate: number | null
  change_percent?: number | null // 当日涨跌幅（来自数据源，缓存命中也有真实值）
  quote_time: string | null
  error?: string
  /** 港股通折算后市值（当 market=HK 且 account_currency=CNY 时，HKD 市价×汇率后的 CNY 值） */
  converted_value?: number | null
  /** 折算目标币种（存在 converted_value 时为 'CNY'） */
  converted_currency?: Currency
}

export interface BatchResponseData {
  results: ValuationResult[]
  total_market_value: number
  total_profit_loss: number
  total_currency: Currency
  exchange_rates: Record<string, number>
}

// ============ 接口二：单资产行情 ============

export interface QuoteDetailQuery {
  symbol: string
  market?: Market
}

export interface QuoteDetailData {
  symbol: string
  market: Market
  name: string
  current_price: number
  change_percent: number
  currency: Currency
  quote_time: string
}

// ============ 接口四：资产搜索 ============

export interface SearchResult {
  symbol: string // 数据源清洗后的代码，可直接用于 batch/detail（如 600519 / 00700 / AAPL / 110011）
  market: Market
  name: string // 资产名称（中文/英文）
  code: string // 原始代码（用户输入形态，如 sh600519 / hk00700 / aapl.oq）
}

// ============ 接口三：历史走势 ============

export type HistoryPeriod = '1m' | '3m' | '1y'

export interface QuoteHistoryQuery {
  symbol: string
  market?: Market
  period?: HistoryPeriod
}

export interface HistoryPoint {
  date: string
  price: number
}

// ============ 统一响应外壳 ============

export interface ApiSuccess<T> {
  code: 0
  message: string
  data: T
}

export interface ApiError {
  code: number
  message: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ============ 内部：行情缓存结构（存入 KV） ============

export interface QuoteCacheValue {
  price: number
  timestamp: number
  currency?: Currency // 数据源真实币种；缺省时按市场默认映射
  changePercent?: number // 当日涨跌幅（与价格同生命周期缓存，避免今日收益恒为 0）
  name?: string // 证券名称（冗余缓存，避免 detail 命中缓存时名称丢失）
}

// 适配器返回的归一化行情
export interface NormalizedQuote {
  price: number
  name?: string
  changePercent?: number
  currency: Currency
  quoteTime: string // ISO 8601
}

// 适配器函数签名：给定清洗后的 symbol 与 market，返回行情；失败抛错（由引擎用 allSettled 兜底）
export type QuoteAdapter = (symbol: string) => Promise<NormalizedQuote>
