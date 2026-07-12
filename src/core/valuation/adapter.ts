import type { Market, NormalizedQuote, Currency } from '../../types/api'
import { parseSymbol } from './parser'

// 统一超时 fetch：超过 timeoutMs 视为失败抛 AbortError
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 3000
): Promise<Response> {
  const controller = new AbortController()
  const _t0 = Date.now()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    console.log(`[perf] fetch ${res.status} ${Date.now() - _t0}ms ${url.slice(0, 80)}`)
    return res
  } catch (e: any) {
    console.log(`[perf] fetch ERR ${Date.now() - _t0}ms ${url.slice(0, 80)} ${e?.message ?? e}`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// 内部：依次尝试多个源，任一成功即返回；全部失败抛最后一个错误
async function trySources(sources: Array<() => Promise<NormalizedQuote>>): Promise<NormalizedQuote> {
  let lastErr: unknown
  for (const src of sources) {
    try {
      return await src()
    } catch (e) {
      lastErr = e
      // 继续尝试下一个备用源
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
    8000, // 沙箱出网慢，放宽超时避免 AbortError（见 fetchYahoo2）
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
    8000, // 沙箱出网慢，放宽超时避免 AbortError
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
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`gold http ${res.status}`)
  const json = (await res.json()) as any
  const d = json?.data
  if (!d) throw new Error('gold no data')
  const price = parseFloat(d.f43) / 100
  if (!isFinite(price) || price <= 0) throw new Error('gold price NaN')
  const changePercent = parseFloat(d.f170) / 100
  return {
    price,
    name: d.f58 || '黄金',
    changePercent: isFinite(changePercent) ? changePercent : 0,
    currency: 'CNY',
    quoteTime: new Date().toISOString(),
  }
}

// ============ 对外：按市场返回适配器链 ============
export function getAdapters(market: Market): Array<(symbol: string) => Promise<NormalizedQuote>> {
  switch (market) {
    case 'CN':
      return [fetchSinaA]
    case 'HK':
      return [fetchTencentHK, fetchSinaHK]
    case 'US':
      return [fetchYahoo, fetchYahoo2]
    case 'FUND':
      return [fetchSinaFund]
    case 'GOLD':
      return [fetchGold]
  }
}

// 统一入口：带备用源容错
export async function fetchQuote(symbol: string, market: Market): Promise<NormalizedQuote> {
  return trySources(getAdapters(market).map((fn) => () => fn(symbol)))
}

// 历史走势（美股/港股走 Yahoo；A股 Yahoo 近似；基金走东方财富净值序列）
export async function fetchHistory(
  symbol: string,
  market: Market,
  period: string
): Promise<Array<{ date: string; price: number }>> {
  const p = parseSymbol(symbol, market)

  // 国内基金：东方财富历史净值接口
  if (market === 'FUND') {
    const code = p.cacheKeySymbol
    const periodDays: Record<string, number> = { '1m': 30, '3m': 90, '1y': 365 }
    const days = periodDays[period] ?? 30
    const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=${days}`
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://fundf10.eastmoney.com/',
      },
    })
    if (!res.ok) throw new Error(`fundHist http ${res.status}`)
    const json = (await res.json()) as any
    const list: any[] = json?.Data?.LSJZList ?? []
    const out: Array<{ date: string; price: number }> = []
    for (const row of list) {
      const price = parseFloat(row.FSZ || row.DWJZ) // 首选估算值，回退单位净值
      if (isFinite(price)) {
        out.push({ date: String(row.FSRQ).slice(0, 10), price })
      }
    }
    out.reverse() // 接口返回降序，转升序
    return out
  }

  // 黄金（AU9999 现货，元/克）：东方财富 K 线对上金所标的只回日期无价格，
  // 故改用 Yahoo GC=F（COMEX 黄金期货，美元/盎司）取历史走势，再用 AU9999
  // 当前人民币/克实时价做等比缩放，保证走势图形状正确且量纲与详情页一致。
  if (market === 'GOLD') {
    const rangeMap: Record<string, string> = { '1m': '1mo', '3m': '3mo', '1y': '1y' }
    const range = rangeMap[period] ?? '1mo'
    // 1) 当前 AU9999 实时价（元/克）作为缩放基准
    const base = await fetchGold(symbol)
    // 2) Yahoo 历史收盘价序列（美元/盎司）。数据量随周期增大，
    // 沙箱出网较慢，放宽超时避免 3mo/1y 被中断。
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
    // 收集有效 (date, close)
    const series: Array<{ date: string; close: number }> = []
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i]
      if (typeof c === 'number' && isFinite(c)) {
        series.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: c })
      }
    }
    if (series.length === 0) throw new Error('goldHist yahoo empty')
    // 3) 等比缩放：以最近一日收盘价为基准映射到 base 价
    const lastClose = series[series.length - 1].close
    if (!isFinite(lastClose) || lastClose <= 0) throw new Error('goldHist base close invalid')
    const out: Array<{ date: string; price: number }> = series.map((s) => ({
      date: s.date,
      price: Math.round((base.price * s.close / lastClose) * 100) / 100,
    }))
    return out
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

  // 美股/港股：Yahoo（港股 Yahoo 通常无数据，将由调用方兜底返回空）
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
