import type { Market, NormalizedQuote, Currency } from '../../types/api'
import { parseSymbol } from './parser'
import { log } from './logger'

// 统一超时 fetch：超过 timeoutMs 视为失败抛 AbortError
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 3000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } catch (e: any) {
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// 内部：依次尝试多个源，任一成功即返回；全部失败抛最后一个错误。
// level=2 时记录每次源调用的耗时与结果，方便线上排查数据源波动。
type NamedAdapter = { name: string; fn: () => Promise<NormalizedQuote> }
async function trySources(sources: NamedAdapter[]): Promise<NormalizedQuote> {
  let lastErr: unknown
  for (const src of sources) {
    const t0 = Date.now()
    try {
      const result = await src.fn()
      log(2, `[adapter]   ${src.name} OK ${Date.now() - t0}ms`)
      return result
    } catch (e: any) {
      log(2, `[adapter]   ${src.name} FAIL ${Date.now() - t0}ms ${e?.message || e} -> try next`)
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all sources failed')
}

// ============ A股：新浪财经 ============
// 注意：新浪必须带 Referer: https://finance.sina.com.cn，否则 403
async function fetchSinaA(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'CN')
  const url = `https://hq.sinajs.cn/list=${p.sina}`
  const res = await fetchWithTimeout(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent': 'Mozilla/5.0',
    },
  })
  if (!res.ok) throw new Error(`sina http ${res.status}`)
  const buf = await res.arrayBuffer()
  // 新浪返回 GBK 编码，需解码
  const text = new TextDecoder('gbk').decode(buf)
  // 格式：var hq_str_sh600519="名称,今日开盘,昨收,当前价,...";
  const m = text.match(/="(.+)";/)
  if (!m) throw new Error('sina parse empty')
  const parts = m[1].split(',')
  const name = parts[0]
  const price = parseFloat(parts[3])
  if (!isFinite(price)) throw new Error('sina price NaN')
  // 涨跌幅：新浪给的是"涨跌额"(parts[4-5])，这里用 (当前-昨收)/昨收 估算
  const prevClose = parseFloat(parts[2])
  const changePercent = prevClose > 0 ? (price - prevClose) / prevClose : 0
  return {
    price,
    name: name || undefined,
    changePercent,
    currency: 'CNY',
    quoteTime: new Date().toISOString(),
  }
}

// ============ 港股：腾讯财经 ============
// 腾讯接口：https://qt.gtimg.cn/q=hk00700 返回 var hk00700="名称~代码~当前价~...";
async function fetchTencentHK(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'HK')
  const url = `https://qt.gtimg.cn/q=${p.tencent}`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`tencent http ${res.status}`)
  const buf = await res.arrayBuffer()
  // 腾讯返回 GBK 编码，需解码
  const text = new TextDecoder('gbk').decode(buf)
  const m = text.match(/="(.+)";/)
  if (!m) throw new Error('tencent parse empty')
  const parts = m[1].split('~')
  const name = parts[1]
  const price = parseFloat(parts[3])
  if (!isFinite(price)) throw new Error('tencent price NaN')
  const prevClose = parseFloat(parts[4])
  const changePercent = prevClose > 0 ? (price - prevClose) / prevClose : 0
  return {
    price,
    name: name || undefined,
    changePercent,
    currency: 'HKD',
    quoteTime: new Date().toISOString(),
  }
}

// 港股备用源：新浪港股 rt_hk00700
async function fetchSinaHK(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'HK')
  const url = `https://hq.sinajs.cn/list=${p.sina}`
  const res = await fetchWithTimeout(url, {
    headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`sinaHK http ${res.status}`)
  const buf = await res.arrayBuffer()
  // 新浪返回 GBK 编码，需解码
  const text = new TextDecoder('gbk').decode(buf)
  const m = text.match(/="(.+)";/)
  if (!m) throw new Error('sinaHK parse empty')
  const parts = m[1].split(',')
  const price = parseFloat(parts[6]) // rt_hk 第 7 字段为当前价
  if (!isFinite(price)) throw new Error('sinaHK price NaN')
  const prevClose = parseFloat(parts[5])
  const changePercent = prevClose > 0 ? (price - prevClose) / prevClose : 0
  return {
    price,
    name: parts[1] || undefined,
    changePercent,
    currency: 'HKD',
    quoteTime: new Date().toISOString(),
  }
}

// ============ 美股：Yahoo Finance ============
async function fetchYahoo(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'US')
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${p.yahoo}`
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetValuation/1.0)' } },
    3500, // 边缘出网 Yahoo 常不通，收紧超时避免单源拖垮整批（见 fetchYahoo2）
  )
  if (!res.ok) throw new Error(`yahoo http ${res.status}`)
  const json = (await res.json()) as any
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('yahoo no result')
  const meta = result.meta
  const price = meta?.regularMarketPrice
  if (typeof price !== 'number' || !isFinite(price)) throw new Error('yahoo price NaN')
  const prevClose = meta?.chartPreviousClose ?? meta?.previousClose
  const changePercent =
    typeof prevClose === 'number' && prevClose > 0
      ? (price - prevClose) / prevClose
      : 0
  return {
    price,
    name: meta?.shortName ?? meta?.longName ?? undefined,
    changePercent,
    currency: (meta?.currency as Currency) ?? 'USD',
    quoteTime: new Date().toISOString(),
  }
}

// Yahoo 备用源：query2
async function fetchYahoo2(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'US')
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${p.yahoo}`
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetValuation/1.0)' } },
    3500, // 边缘出网 Yahoo 常不通，收紧超时避免单源拖垮整批
  )
  if (!res.ok) throw new Error(`yahoo2 http ${res.status}`)
  const json = (await res.json()) as any
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('yahoo2 no result')
  const meta = result.meta
  const price = meta?.regularMarketPrice
  if (typeof price !== 'number' || !isFinite(price)) throw new Error('yahoo2 price NaN')
  const prevClose = meta?.chartPreviousClose ?? meta?.previousClose
  const changePercent =
    typeof prevClose === 'number' && prevClose > 0
      ? (price - prevClose) / prevClose
      : 0
  return {
    price,
    name: meta?.shortName ?? meta?.longName ?? undefined,
    changePercent,
    currency: (meta?.currency as Currency) ?? 'USD',
    quoteTime: new Date().toISOString(),
  }
}

// ============ 美股备用源：腾讯财经 ============
// 腾讯美股接口：https://qt.gtimg.cn/q=us{CODE} 返回延时行情（15min）
// 字段：0=名称, 3=现价, 4=昨收, 31=涨跌幅(%), 32=涨跌额
async function fetchTencentUS(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'US')
  const url = `https://qt.gtimg.cn/q=us${p.yahoo.toLowerCase()}`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }, 3000)
  if (!res.ok) throw new Error(`tencentUS http ${res.status}`)
  const buf = await res.arrayBuffer()
  const text = new TextDecoder('gbk').decode(buf)
  const m = text.match(/="(.+)";/)
  if (!m) throw new Error('tencentUS parse empty')
  const parts = m[1].split('~')
  const price = parseFloat(parts[3])
  if (!isFinite(price)) throw new Error('tencentUS price NaN')
  const prevClose = parseFloat(parts[4])
  const changePercent = prevClose > 0 ? (price - prevClose) / prevClose : 0
  return {
    price,
    name: parts[1] || undefined,
    changePercent,
    currency: 'USD',
    quoteTime: new Date().toISOString(),
  }
}

// ============ 美股备用源：东方财富 ============
// 东财美股接口：secid=105.{CODE}，f43=最新价(×1000), f169=涨跌额(×1000), f170=涨跌幅(×100)
// 注意：美股价格精度需 3 位小数（如 $315.320），因此东财用 ×1000 而非 A股的 ×100。
async function fetchEastmoneyUS(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'US')
  const secid = `105.${p.yahoo}`
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f169,f170,f57,f58`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }, 3000)
  if (!res.ok) throw new Error(`eastmoneyUS http ${res.status}`)
  const json = (await res.json()) as any
  const d = json?.data
  if (!d) throw new Error('eastmoneyUS no data')
  const price = parseFloat(d.f43) / 1000
  if (!isFinite(price) || price <= 0) throw new Error('eastmoneyUS price NaN')
  const changePercent = parseFloat(d.f170) / 10000
  return {
    price,
    name: d.f58 || undefined,
    changePercent: isFinite(changePercent) ? changePercent : 0,
    currency: 'USD',
    quoteTime: new Date().toISOString(),
  }
}

// ============ 国内基金：新浪财经基金实时估值 ============
// 接口：https://hq.sinajs.cn/list=fu_{code}  （带 Referer 防 403）
// 返回：var hq_str_fu_110011="名称,时间,当前净值,昨收净值,...";
//   字段：0=名称, 2=当前净值(估算), 3=昨日净值
async function fetchSinaFund(symbol: string): Promise<NormalizedQuote> {
  const p = parseSymbol(symbol, 'FUND')
  const code = p.cacheKeySymbol
  const url = `https://hq.sinajs.cn/list=fu_${code}`
  const res = await fetchWithTimeout(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent': 'Mozilla/5.0',
    },
  })
  if (!res.ok) throw new Error(`sinaFund http ${res.status}`)
  const buf = await res.arrayBuffer()
  // 新浪返回 GBK 编码，需解码
  const text = new TextDecoder('gbk').decode(buf)
  const m = text.match(/="(.+)";/)
  if (!m) throw new Error('sinaFund parse empty')
  const parts = m[1].split(',')
  const name = parts[0]
  const price = parseFloat(parts[2]) // 当前净值/估算值
  if (!isFinite(price)) throw new Error('sinaFund price NaN')
  const prevClose = parseFloat(parts[3]) // 昨日净值
  const changePercent = prevClose > 0 ? (price - prevClose) / prevClose : 0
  return {
    price,
    name: name || undefined,
    changePercent,
    currency: 'CNY',
    quoteTime: new Date().toISOString(),
  }
}


// ============ 黄金（人民币计价，实物金/积存金）：东方财富 AU9999 现货 ============
// AU9999 = 上海黄金交易所黄金9999现货，单位 元/克，人民币计价。
// 接口返回 f43=最新价(×100), f169=昨收(×100), f170=涨跌幅(×100), f58=名称, f57=代码
async function fetchGold(_symbol: string): Promise<NormalizedQuote> {
  // symbol 约定固定为 'AU9999'（前端黄金资产统一用此 symbol）
  const secid = '118.AU9999'
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f169,f170,f57,f58`
  // 黄金价格变化慢，收紧超时避免东方财富 502/慢响应拖垮整批（原默认 3000ms 曾耗 2.5s）
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 1500)
  if (!res.ok) throw new Error(`gold http ${res.status}`)
  const json = (await res.json()) as any
  const d = json?.data
  if (!d) throw new Error('gold no data')
  const price = parseFloat(d.f43) / 100
  if (!isFinite(price) || !isPlausibleGoldPrice(price)) throw new Error(`gold price invalid: ${price}`)
  // f170 是涨跌幅 × 100（如 -104 表示 -1.04%），需 /10000 转为小数（如 -0.0104）与其它适配器一致
  const changePercent = parseFloat(d.f170) / 10000
  return {
    price,
    name: d.f58 || '黄金',
    changePercent: isFinite(changePercent) ? changePercent : 0,
    currency: 'CNY',
    quoteTime: new Date().toISOString(),
  }
}

// 黄金价格合理性校验：AU9999 现货单位元/克，国内金价长期在 300~5000 区间。
// 用于拦截数据源字段错位/脏值（曾把新浪 parts[7]=1000 当现价入库，真实价约 951）。
function isPlausibleGoldPrice(price: number): boolean {
  return isFinite(price) && price > 0 && price >= 300 && price <= 5000
}

// 黄金备用源：新浪 SGE_AU9999（上金所黄金9999现货，元/克，人民币计价）
// 接口：https://hq.sinajs.cn/list=SGE_AU9999  返回 GBK
// 实测字段（2026-08-31 与东方财富交叉验证）：
//   0=AU9999 1=沪金99 2=Au99.99(名称) 3=今开 4=昨收 5=最高 6=最低 7=买价? 8=现价 9=卖价? ...
//   parts[17] = 新浪自带涨跌幅（如 "-4.37%"），与东财口径一致。
// 注意：parts[7]（约1000）不是现价！曾误用导致金价虚高到 1000 元/克。
async function fetchGoldSina(_symbol: string): Promise<NormalizedQuote> {
  const url = 'https://hq.sinajs.cn/list=SGE_AU9999'
  const res = await fetchWithTimeout(
    url,
    { headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' } },
    1500,
  )
  if (!res.ok) throw new Error(`goldSina http ${res.status}`)
  const buf = await res.arrayBuffer()
  const text = new TextDecoder('gbk').decode(buf)
  const m = text.match(/="(.+)";/)
  if (!m) throw new Error('goldSina parse empty')
  const parts = m[1].split(',')
  // 现价 fields[8]（与东财 f43/100=951.61 吻合）；涨跌幅直接用新浪自带的 parts[17]
  const price = parseFloat(parts[8])
  if (!isFinite(price) || !isPlausibleGoldPrice(price)) throw new Error(`goldSina price invalid: ${price}`)
  // 新浪自带涨跌幅字段形如 "-4.37%"，转小数（-0.0437）
  const pctStr = String(parts[17] ?? '').replace('%', '').trim()
  const pctNum = parseFloat(pctStr)
  const changePercent = isFinite(pctNum) ? pctNum / 100 : 0
  return {
    price,
    name: '黄金',
    changePercent,
    currency: 'CNY',
    quoteTime: new Date().toISOString(),
  }
}

// ============ 对外：按市场返回适配器链 ============
export function getAdapters(market: Market): NamedAdapter[] {
  switch (market) {
    case 'CN':
      return [{ name: 'sinaA', fn: (s) => fetchSinaA(s) }]
    case 'HK':
      return [{ name: 'tencentHK', fn: (s) => fetchTencentHK(s) }, { name: 'sinaHK', fn: (s) => fetchSinaHK(s) }]
    case 'US':
      return [
        { name: 'tencentUS', fn: (s) => fetchTencentUS(s) },
        { name: 'eastmoneyUS', fn: (s) => fetchEastmoneyUS(s) },
        { name: 'yahoo', fn: (s) => fetchYahoo(s) },
        { name: 'yahoo2', fn: (s) => fetchYahoo2(s) },
      ]
    case 'FUND':
      return [{ name: 'sinaFund', fn: (s) => fetchSinaFund(s) }]
    case 'GOLD':
      return [{ name: 'eastmoneyGold', fn: (s) => fetchGold(s) }, { name: 'sinaGold', fn: (s) => fetchGoldSina(s) }]
  }
}

// 统一入口：带备用源容错
export async function fetchQuote(symbol: string, market: Market): Promise<NormalizedQuote> {
  const adapters = getAdapters(market).map(a => ({ name: a.name, fn: () => a.fn(symbol) }))
  return trySources(adapters)
}

// 东财基金净值（lsjz）分页拉取。
//
// 关键坑：该接口**单页硬截断为 20 条**——实测 pageSize 传 50 / 200 均无效，
// 永远只返回 20 条（而响应里的 TotalCount 是正确的总条数）。
// 因此若只请求 pageIndex=1，区间内**最早**的那几天会被丢掉：
// 「近一月」共 21 个净值日，恰好丢 1 天；区间越长丢得越多（选 3 个月会丢 40 天以上）。
// 这里按 pageIndex 循环翻页直到取满。
const FUND_PAGE_SIZE = 20
const FUND_MAX_PAGES = 30 // 兜底：最多 30 页（600 条 ≈ 2.5 年），避免异常时无限翻页
const FUND_PAGE_CONCURRENCY = 4 // 页与页之间限量并发，避免「1 年」档串行等 19 次往返

async function fetchFundNavPage(
  code: string,
  page: number,
  rangeQuery: string
): Promise<{ list: any[]; total: number }> {
  const url =
    `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=${page}` +
    `&pageSize=${FUND_PAGE_SIZE}${rangeQuery}`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://fundf10.eastmoney.com/' },
  })
  if (!res.ok) throw new Error(`fundHist http ${res.status}`)
  const json = (await res.json()) as any
  const list = json?.Data?.LSJZList
  const total = Number(json?.TotalCount)
  return {
    list: Array.isArray(list) ? list : [],
    total: Number.isFinite(total) ? total : 0,
  }
}

async function fetchFundNav(
  code: string,
  opts: { range?: { start: string; end: string }; limit?: number } = {}
): Promise<Array<{ date: string; price: number }>> {
  const { range, limit } = opts
  const rangeQuery = range ? `&startDate=${range.start}&endDate=${range.end}` : ''

  const first = await fetchFundNavPage(code, 1, rangeQuery)
  if (first.list.length === 0) return []

  // 需要翻几页：以 TotalCount 为准，limit（档位天数）再收窄；
  // 若上游没给 TotalCount 则退回「只取第一页」，保证不会失控翻页。
  const known = first.total > 0 ? first.total : (limit ?? first.list.length)
  const wanted = Math.min(limit ?? Infinity, known)
  const needed = first.list.length < FUND_PAGE_SIZE
    ? 1
    : Math.min(Math.ceil(wanted / FUND_PAGE_SIZE), FUND_MAX_PAGES)

  const pages: any[][] = [first.list]
  for (let from = 2; from <= needed; from += FUND_PAGE_CONCURRENCY) {
    const batch: Promise<any[]>[] = []
    for (let p = from; p < from + FUND_PAGE_CONCURRENCY && p <= needed; p++) {
      batch.push(fetchFundNavPage(code, p, rangeQuery).then(r => r.list))
    }
    pages.push(...(await Promise.all(batch)))
  }

  const rows: Array<{ date: string; price: number }> = [] // 接口按日期降序，翻页拼接后仍整体降序
  for (const list of pages) {
    for (const row of list) {
      const price = parseFloat(row.FSZ || row.DWJZ) // 首选估算值，回退单位净值
      if (isFinite(price)) rows.push({ date: String(row.FSRQ).slice(0, 10), price })
    }
  }
  rows.reverse() // 降序 → 升序
  // 指定 limit 时只保留最新的 N 条（分页可能多取，最多多 19 条）
  return limit !== undefined && rows.length > limit ? rows.slice(rows.length - limit) : rows
}

// 历史走势（基金走东财净值序列；港股/A股走东财 K线；美股走 Yahoo；黄金走 Yahoo GC=F 等比缩放）
export async function fetchHistory(
  symbol: string,
  market: Market,
  period: string
): Promise<Array<{ date: string; price: number }>> {
  const p = parseSymbol(symbol, market)

  // 国内基金：东方财富历史净值接口（必须分页，见 fetchFundNav 注释）
  if (market === 'FUND') {
    const periodDays: Record<string, number> = { '1m': 30, '3m': 90, '1y': 365 }
    const days = periodDays[period] ?? 30
    return fetchFundNav(p.cacheKeySymbol, { limit: days })
  }

  // 黄金（AU9999 现货，元/克）：东方财富 K 线对上金所标的只回日期无价格，
  // 故改用 Yahoo GC=F（COMEX 黄金期货，美元/盎司）取历史走势，再用 AU9999
  // 当前人民币/克实时价做等比缩放，保证走势图形状正确且量纲与详情页一致。
  if (market === 'GOLD') {
    const rangeMap: Record<string, string> = { '1m': '1mo', '3m': '3mo', '1y': '1y' }
    const range = rangeMap[period] ?? '1mo'
    const daysMap: Record<string, number> = { '1m': 30, '3m': 90, '1y': 250 }
    // 1) 当前 AU9999 实时价（元/克）作为缩放基准
    const base = await fetchGold(symbol)
    // 2) 历史收盘价序列（美元/盎司）：Yahoo GC=F 为主、新浪外盘 GC 兜底。
    // 数据量随周期增大、沙箱出网较慢，Yahoo 放宽超时避免 3mo/1y 被中断。
    const fetchYahooGold = async (): Promise<HistPoint[]> => {
      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=${range}&interval=1d`
      const yRes = await fetchWithTimeout(yUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetValuation/1.0)' },
      }, 8000)
      if (!yRes.ok) throw new Error(`goldHist yahoo http ${yRes.status}`)
      const yJson = (await yRes.json()) as any
      const yResult = yJson?.chart?.result?.[0]
      if (!yResult) throw new Error('goldHist yahoo no result')
      const timestamps: number[] = yResult.timestamp ?? []
      const closes: number[] = yResult.indicators?.quote?.[0]?.close ?? []
      const out: HistPoint[] = []
      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i]
        if (typeof c === 'number' && isFinite(c)) {
          out.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), price: c })
        }
      }
      return out
    }
    const days = daysMap[period] ?? 30
    const series = await raceNonEmpty(`GOLD ${symbol} ${period}`, [
      fetchYahooGold,
      () => fetchSinaGoldDaily(ymdDaysAgo(calendarDaysFor(days)), ymdDaysAgo(0)),
    ])
    if (series.length === 0) throw new Error('goldHist empty')
    // 3) 等比缩放：以最近一日收盘价为基准映射到 base 价
    const lastClose = series[series.length - 1].price
    if (!isFinite(lastClose) || lastClose <= 0) throw new Error('goldHist base close invalid')
    return series.map((s) => ({
      date: s.date,
      price: Math.round((base.price * s.price / lastClose) * 100) / 100,
    }))
  }

  // A股历史：新浪 K 线接口（按 period 映射 datalen 天数）
  if (market === 'CN') {
    const datalenMap: Record<string, number> = { '1m': 30, '3m': 90, '1y': 250 }
    const datalen = datalenMap[period] ?? 30
    const symbol = p.sina.startsWith('sh') || p.sina.startsWith('sz') ? p.sina : `sh${p.cacheKeySymbol}`
    const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${datalen}`
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`cnHist http ${res.status}`)
    const arr = (await res.json()) as any[]
    if (!Array.isArray(arr)) throw new Error('cnHist parse empty')
    const out: Array<{ date: string; price: number }> = []
    for (const row of arr) {
      const price = parseFloat(row.close)
      if (isFinite(price) && row.day) out.push({ date: String(row.day).slice(0, 10), price })
    }
    return out
  }

  // 港股历史：东财 K 线。
  // 原先走 Yahoo，但 Yahoo 对 5 位港股代码（如 07266 / 07709）恒 404 / 400，
  // 导致港股历史一直为空数组（曲线整块缺港股浮盈）。
  if (market === 'HK') {
    const datalenMap: Record<string, number> = { '1m': 30, '3m': 90, '1y': 250 }
    const datalen = datalenMap[period] ?? 30
    const beg = ymdDaysAgo(calendarDaysFor(datalen))
    const end = ymdDaysAgo(0)
    const tx = tencentCodeHK(p.cacheKeySymbol)
    const rows = await raceNonEmpty(`HK ${symbol} ${period}`, [
      () => {
        const secid = eastmoneySecidHK(p.cacheKeySymbol)
        if (!secid) throw new Error(`hkHist secid invalid: ${symbol}`)
        return fetchEastmoneyKline(secid, beg, end)
      },
      () => (tx ? fetchTencentKline(tx, beg, end) : Promise.resolve([])),
    ])
    // 只保留最近 datalen 个交易日（接口按自然日窗口取，可能多取）
    return rows.length > datalen ? rows.slice(rows.length - datalen) : rows
  }

  // 美股：Yahoo
  const rangeMap: Record<string, string> = { '1m': '1mo', '3m': '3mo', '1y': '1y' }
  const range = rangeMap[period] ?? '1mo'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${p.yahoo}?range=${range}&interval=1d`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetValuation/1.0)' },
  })
  if (!res.ok) throw new Error(`history http ${res.status}`)
  const json = (await res.json()) as any
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('history no result')
  const timestamps: number[] = result.timestamp ?? []
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? []
  const out: Array<{ date: string; price: number }> = []
  for (let i = 0; i < timestamps.length; i++) {
    const price = closes[i]
    if (typeof price === 'number' && isFinite(price)) {
      out.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), price })
    }
  }
  return out
}

// 6 位 A股代码 → 东财 secid（6/9 开头为沪市 1.，其余为深市 0.）
function eastmoneySecid(code: string): string | null {
  const m = /(?:sh|sz|bj)?(\d{6})/.exec(code.trim())
  if (!m) return null
  const num = m[1]
  return `${/^[69]/.test(num) ? '1' : '0'}.${num}`
}

// 港股代码 → 东财 secid（港股统一用 116. 前缀，代码补足 5 位；例 07266 → 116.07266）
function eastmoneySecidHK(code: string): string | null {
  const m = /(\d{4,5})/.exec(code.trim())
  if (!m) return null
  return `116.${m[1].padStart(5, '0')}`
}

/**
 * 东财日线 K 线（klt=101 日线、fqt=1 前复权）。A股与港股走同一接口，只有 secid 前缀不同。
 * 用 fqt=1 的理由：前复权序列的**最新价与实时行情一致**（曲线末端因此能与顶部卡片对上），
 * 同时避免除权/分红日出现"凭空大跌"的假台阶。
 */
async function fetchEastmoneyKline(
  secid: string,
  beg: string,
  end: string
): Promise<Array<{ date: string; price: number }>> {
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&klt=101&fqt=1&beg=${beg.replace(/-/g, '')}&end=${end.replace(/-/g, '')}` +
    `&fields1=f1,f2,f3&fields2=f51,f52,f53`
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`kline ${secid} http ${res.status}`)
  const json = (await res.json()) as any
  const klines: string[] = json?.data?.klines ?? []
  const out: Array<{ date: string; price: number }> = []
  for (const k of klines) {
    const parts = String(k).split(',')
    const price = parseFloat(parts[2]) // klines 每行：日期,开盘,收盘
    if (parts[0] && isFinite(price)) out.push({ date: parts[0].slice(0, 10), price })
  }
  return out
}

// ---------------------------------------------------------------------------
// 多源兜底
//
// 为什么必须有兜底：**同一个上游在不同网络环境下表现不同**。
// 实测同一份代码：本机访问东财 K 线（push2his）与 Yahoo GC=F 都正常，
// 但从 Cloudflare Workers 里两者都取不到数据（东财返回空 data、Yahoo 无 timestamp），
// 而东财基金净值接口与 Yahoo 美股接口在两边都正常 —— 于是"本地跑通"不等于"线上可用"。
// 这里为同一份数据准备多个来源，**谁先返回非空就用谁**。
// ---------------------------------------------------------------------------

type HistPoint = { date: string; price: number }

/** 并发竞速多个数据源，返回第一个非空结果；全部为空/失败则返回 [] 并打日志。 */
function raceNonEmpty(label: string, sources: Array<() => Promise<HistPoint[]>>): Promise<HistPoint[]> {
  return new Promise((resolve) => {
    let settled = 0
    const onFail = () => {
      if (++settled === sources.length) {
        // 这条日志非常关键：历史上这条链路是"静默返回空数组"，
        // 线上取不到数据时只能看到曲线少一块，查不出原因。
        console.error(`[history] 所有数据源均失败: ${label}`)
        resolve([])
      }
    }
    for (const fn of sources) {
      fn().then(
        (d) => {
          if (d && d.length > 0) resolve(d)
          else onFail()
        },
        () => onFail()
      )
    }
  })
}

/** 港股代码 → 腾讯代码（hk + 补足 5 位，例 07709 → hk07709） */
function tencentCodeHK(code: string): string | null {
  const m = /(\d{4,5})/.exec(code.trim())
  return m ? `hk${m[1].padStart(5, '0')}` : null
}

/** 6 位 A股代码 → 腾讯代码（沪 sh / 深 sz / 北 bj） */
function tencentCodeCN(cacheKeySymbol: string, sina: string): string | null {
  if (/^(sh|sz|bj)\d{6}$/.test(sina)) return sina
  const m = /(\d{6})/.exec(cacheKeySymbol.trim())
  if (!m) return null
  const n = m[1]
  return `${/^[69]/.test(n) ? 'sh' : /^[48]/.test(n) ? 'bj' : 'sz'}${n}`
}

/**
 * 腾讯日 K。**实测与东财逐日完全一致**（港股 07709 各 22 条、偏差 0.00%；
 * A股 600519 末值 1253.800 = 东财 1253.8），且 `qfq` 前复权与东财 `fqt=1` 同口径，
 * 所以两者可以互为备份、不会出现"换了源曲线就变样"。
 * 返回结构：`data[code].qfqday | day | hfqday`，每行 `[日期, 开, 收, 高, 低, 量]` → 取索引 2 收盘。
 */
async function fetchTencentKline(code: string, beg: string, end: string): Promise<HistPoint[]> {
  const url =
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,${beg},${end},640,qfq`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' },
  })
  if (!res.ok) throw new Error(`txKline ${code} http ${res.status}`)
  const json = (await res.json()) as any
  const d = json?.data?.[code] ?? {}
  const rows: any[] = d.qfqday ?? d.day ?? d.hfqday ?? []
  const out: HistPoint[] = []
  for (const r of rows) {
    const price = parseFloat(r?.[2])
    if (r?.[0] && isFinite(price)) out.push({ date: String(r[0]).slice(0, 10), price })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 新浪「外盘期货」日 K（symbol=GC = COMEX 黄金），作为 Yahoo GC=F 的兜底。
 * 同一个标的；实测与本机 Yahoo 的日收盘偏差 ≤2%（两家合约/收盘时点口径略有差异），
 * 而黄金历史本来就只取**形状**（末点会等比缩放到 AU9999 现价），因此偏差可接受，
 * 总比整块黄金从曲线里消失要好。
 * 响应是 JSONP 文本：`var _GC=([{date,close,...},...])`。
 */
async function fetchSinaGoldDaily(start: string, end: string): Promise<HistPoint[]> {
  const url =
    'https://stock.finance.sina.com.cn/futures/api/jsonp.php/var%20_GC=/' +
    'GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=GC'
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' },
  })
  if (!res.ok) throw new Error(`sinaGold http ${res.status}`)
  const text = await res.text()
  const i = text.indexOf('=(')
  const j = text.lastIndexOf(')')
  if (i < 0 || j <= i) throw new Error('sinaGold parse fail')
  const arr = JSON.parse(text.slice(i + 2, j)) as Array<{ date: string; close: string }>
  const out: HistPoint[] = []
  for (const r of arr) {
    const price = parseFloat(r?.close)
    const date = String(r?.date ?? '')
    if (date >= start && date <= end && isFinite(price)) out.push({ date, price })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// 交易日数 → 需要回溯的自然日数（按每周 5 个交易日折算，再留 7 天缓冲覆盖节假日）
function calendarDaysFor(tradingDays: number): number {
  return Math.ceil((tradingDays * 7) / 5) + 7
}

/** n 天前的本地日期（YYYY-MM-DD） */
function ymdDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 按日期区间取历史（start/end 均为 YYYY-MM-DD，含端点）。
 * 各数据源能力不同，这里统一成"给定区间"的入口：
 * - A股 / 港股：东方财富 K线（支持 beg/end；**新浪 K线只能取"最近 N 条"**，无法定位历史区间）
 * - 基金：东方财富历史净值（支持 startDate/endDate）
 * - 美股：Yahoo period1/period2
 * - 黄金：Yahoo GC=F 区间，再按 AU9999 当前价等比缩放（与 fetchHistory 口径一致）
 */
export async function fetchHistoryRange(
  symbol: string,
  market: Market,
  start: string,
  end: string
): Promise<Array<{ date: string; price: number }>> {
  const p = parseSymbol(symbol, market)

  // A股：东财 K线（secid 前缀 1. / 0.）为主，腾讯日K兜底（两者实测数值完全一致）
  if (market === 'CN') {
    const tx = tencentCodeCN(p.cacheKeySymbol, p.sina)
    return raceNonEmpty(`CN ${symbol} ${start}~${end}`, [
      () => {
        const secid = eastmoneySecid(p.sina)
        if (!secid) throw new Error(`cnRange secid invalid: ${symbol}`)
        return fetchEastmoneyKline(secid, start, end)
      },
      () => (tx ? fetchTencentKline(tx, start, end) : Promise.resolve([])),
    ])
  }

  // 港股：东财 K线（secid 前缀 116.）为主，腾讯日K兜底。
  // 原先走 Yahoo，但 Yahoo 对 5 位港股代码（如 07266 / 07709）恒 404 / 400 → 港股历史一直为空。
  // 只留东财也不行：东财 K 线在 Cloudflare Workers 里返回空数据（本机却正常），必须双源。
  if (market === 'HK') {
    const tx = tencentCodeHK(p.cacheKeySymbol)
    return raceNonEmpty(`HK ${symbol} ${start}~${end}`, [
      () => {
        const secid = eastmoneySecidHK(p.cacheKeySymbol)
        if (!secid) throw new Error(`hkRange secid invalid: ${symbol}`)
        return fetchEastmoneyKline(secid, start, end)
      },
      () => (tx ? fetchTencentKline(tx, start, end) : Promise.resolve([])),
    ])
  }

  // 基金：东财历史净值（startDate/endDate；必须分页，见 fetchFundNav 注释）
  if (market === 'FUND') {
    return fetchFundNav(p.cacheKeySymbol, { range: { start, end } })
  }

  // 美股 / 黄金：Yahoo period1/period2
  const isGold = market === 'GOLD'
  const ySym = isGold ? 'GC=F' : p.yahoo
  const t1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000)
  const t2 = Math.floor(new Date(`${end}T23:59:59Z`).getTime() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?period1=${t1}&period2=${t2}&interval=1d`

  const fetchYahooRange = async (): Promise<HistPoint[]> => {
    const yRes = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetValuation/1.0)' } },
      isGold ? 8000 : undefined
    )
    if (!yRes.ok) throw new Error(`rangeHist yahoo http ${yRes.status}`)
    const yJson = (await yRes.json()) as any
    const yResult = yJson?.chart?.result?.[0]
    if (!yResult) throw new Error('rangeHist yahoo no result')
    const timestamps: number[] = yResult.timestamp ?? []
    const closes: number[] = yResult.indicators?.quote?.[0]?.close ?? []
    const out: HistPoint[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i]
      if (typeof c === 'number' && isFinite(c)) {
        out.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), price: c })
      }
    }
    return out
  }

  // 黄金：Yahoo GC=F 为主、新浪外盘 GC 兜底。两者都是美元/盎司，再按当前 AU9999（元/克）
  // 等比缩放，保证量纲与详情页一致 —— 因此只要求形状正确，源之间的微小偏差可接受。
  if (isGold) {
    const series = await raceNonEmpty(`GOLD ${symbol} ${start}~${end}`, [
      fetchYahooRange,
      () => fetchSinaGoldDaily(start, end),
    ])
    if (series.length === 0) return []
    const base = await fetchGold(symbol)
    const lastClose = series[series.length - 1].price
    if (!isFinite(lastClose) || lastClose <= 0) throw new Error('rangeHist gold base close invalid')
    return series.map(s => ({
      date: s.date,
      price: Math.round((base.price * s.price / lastClose) * 100) / 100,
    }))
  }

  // 美股：Yahoo 单源（实测 Cloudflare Workers 可达）
  return fetchYahooRange()
}
