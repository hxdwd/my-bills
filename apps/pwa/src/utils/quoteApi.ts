// 行情 / 估值 Functions 接口封装
// 生产环境用同源相对路径（'' → fetch('/api/...') 自动打到 Pages Functions）。
// 本地开发(wrangler dev)时，在 apps/pwa/.env 设 VITE_FUNCTIONS_URL=http://localhost:8799 指向本地函数。
// 注意：VITE_ 变量是构建时注入，改完需重新构建再部署，仅 push 源码不会生效。

const FUNCTIONS_URL = (import.meta.env.VITE_FUNCTIONS_URL || '').replace(/\/$/, '')

export type Market = 'CN' | 'HK' | 'US' | 'FUND' | 'GOLD'

export interface BatchItem {
  symbol: string
  market?: Market
  quantity: number
  cost_price?: number
  total_cost?: number
}

export interface ValuationResult {
  symbol: string
  market: Market
  name?: string | null
  quantity: number
  cost_price: number
  total_cost: number
  current_price: number | null
  currency: 'CNY' | 'USD' | 'HKD'
  market_value: number | null
  profit_loss: number | null
  profit_rate: number | null
  change_percent?: number | null
  quote_time: string | null
  error?: string
}

// 资产搜索结果
export interface QuoteSearchResult {
  symbol: string
  market: Market
  name: string
  code: string
}

export interface BatchResponseData {
  results: ValuationResult[]
  total_market_value: number
  total_profit_loss: number
  total_currency: 'CNY' | 'USD' | 'HKD'
  exchange_rates: Record<string, number>
}

export interface QuoteDetail {
  symbol: string
  market: Market
  name: string
  current_price: number
  change_percent: number
  currency: 'CNY' | 'USD' | 'HKD'
  quote_time: string
}

// 行情服务连接/网络层错误统一中文提示
const QUOTE_NETWORK_ERROR = '行情服务连接失败，请检查网络或服务是否启动'

// 统一请求包装：拦截网络层异常（fetch reject → "Failed to fetch" 等），
// 转成中文提示；业务层错误（code !== 0）保持原 message。
async function requestJSON<T>(init: RequestInit & { path: string }): Promise<T> {
  const _t0 = performance.now()
  let resp: Response
  try {
    resp = await fetch(`${FUNCTIONS_URL}${init.path}`, {
      method: init.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      body: init.body,
    })
  } catch {
    // fetch 本身 reject：网络不通 / 服务未启动（浏览器原生 "Failed to fetch"）
    console.log(`[perf] ${init.method || 'GET'} ${init.path} failed ${(performance.now() - _t0).toFixed(0)}ms`)
    throw new Error(QUOTE_NETWORK_ERROR)
  }
  console.log(`[perf] ${init.method || 'GET'} ${init.path} ${(performance.now() - _t0).toFixed(0)}ms status=${resp.status}`)
  let json: any
  try {
    json = await resp.json()
  } catch {
    // 能连上但返回非 JSON（如 502/网关错误页）
    throw new Error(`行情服务返回异常 (${resp.status})`)
  }
  if (json?.code !== 0) {
    throw new Error(json?.message || `请求失败 (${resp.status})`)
  }
  return json.data as T
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  return requestJSON<T>({ path, method: 'POST', body: JSON.stringify(body) })
}

async function getJSON<T>(path: string): Promise<T> {
  return requestJSON<T>({ path, method: 'GET' })
}

/** 批量估值：输入持仓列表，返回每只市值/累计盈亏（各资产按自身币种）+ 汇率表。
 * 顶层汇总由前端按 exchange_rates 折算到本位币。 */
export function fetchBatchValuation(items: BatchItem[]): Promise<BatchResponseData> {
  return postJSON<BatchResponseData>('/api/valuation/batch', { items })
}

/** 单资产实时行情（含当日涨跌幅 change_percent） */
export function fetchQuoteDetail(symbol: string, market?: Market): Promise<QuoteDetail> {
  const qs = market ? `?symbol=${encodeURIComponent(symbol)}&market=${market}` : `?symbol=${encodeURIComponent(symbol)}`
  return getJSON<QuoteDetail>(`/api/quote/detail${qs}`)
}

// 资产搜索返回结构：后端返回 { code:0, data: { results: [...] } }，
// requestJSON 已剥掉外层、此处 json.data 是 { results: SearchResult[] }。

/** 资产搜索：输入关键词（名称/代码/拼音），返回可选项列表。 */
export function searchQuote(q: string): Promise<QuoteSearchResult[]> {
  return getJSON<{ results: QuoteSearchResult[] }>(`/api/quote/search?q=${encodeURIComponent(q)}`)
    .then(d => Array.isArray(d?.results) ? d.results : [])
}

// 历史走势点结构
export interface HistoryPoint {
  date: string
  price: number
}
export type HistoryPeriod = '1m' | '3m' | '1y'

/** 历史走势：返回该资产的时间序列价格（港股可能为空）。
 * 注意：requestJSON 已剥掉响应外层、直接返回 json.data（即点数组）。 */
export function fetchQuoteHistory(symbol: string, market?: Market, period: HistoryPeriod = '1m'): Promise<HistoryPoint[]> {
  const qs = `?symbol=${encodeURIComponent(symbol)}&period=${period}${market ? `&market=${market}` : ''}`
  return getJSON<HistoryPoint[]>(`/api/quote/history${qs}`)
}
