import type { Market } from '../../types/api'

// 市场推断规则：
// - 显式传入 explicitMarket 时优先使用
// - 否则：6 位纯数字 → 默认 CN（A股或基金，由 caller 进一步区分，这里保守归 CN）
//         为兼容基金，前端建议显式传 market:'FUND'
// - 5 位纯数字 → HK；含字母或 .HK 后缀 → HK；含字母 → US
export function parseMarket(symbol: string, explicitMarket?: Market): Market {
  if (explicitMarket) return explicitMarket
  const s = symbol.trim()
  if (/^\d{5}$/.test(s)) return 'HK'
  // 含字母（含形如 0700.HK 的情况）一律按 US 推断，
  // 但注意：港股代码也可能以 .HK 后缀传入，这里做一层友好兼容。
  if (/\.hk$/i.test(s)) return 'HK'
  if (/[a-z]/i.test(s)) return 'US'
  // 纯数字：6 位可能 A股 或 基金，保守归 CN；基金请显式传 FUND
  return 'CN'
}

// 判断 6 位数字是否像国内基金代码（场内外开放式基金）。
// 规则（非绝对，仅供参考）：以 0/1/5/6 开头的 6 位，且非沪深 A股交易所常规区间。
// 这里仅做启发式：前端显式传 market:'FUND' 最可靠。
export function looksLikeFund(symbol: string): boolean {
  const s = symbol.trim()
  if (!/^\d{6}$/.test(s)) return false
  // 常见基金前缀：00/01/02/03(货币/债券/混合) 11/16/15/50/51/55/56(ETF/LOF) 等
  // 沪深 A股代码：60(sh)/68(科创)/00(sz主板)/30(创业)。为避免与 A股冲突，
  // 这里把 60/68/00/30 开头的仍视为股票，其余 6 位归为基金。
  const prefix = s.slice(0, 2)
  const stockPrefix = ['60', '68', '00', '30']
  return !stockPrefix.includes(prefix)
}

// 符号清洗：把前端传入的 symbol 规整为各数据源适配器期望的形态。
// 返回 { market, raw, sina, tencent, yahoo }，各适配器取自己需要的字段。
export interface ParsedSymbol {
  market: Market
  raw: string // 原始（去空白）
  // 新浪 A股：sh600519 / sz000001
  sina: string
  // 腾讯港股：hk00700（5 位补零）；腾讯 A股：sh600519 / sz000001
  tencent: string
  // Yahoo 美股：AAPL（去掉可能的 .US 后缀）
  yahoo: string
  // 用于 KV key 的归一化 symbol
  cacheKeySymbol: string
}

export function parseSymbol(symbol: string, explicitMarket?: Market): ParsedSymbol {
  const market = parseMarket(symbol, explicitMarket)
  const raw = symbol.trim()

  if (market === 'CN') {
    // 支持 sh600519 / sz000001 / 600519 三种写法，统一规整成带交易所前缀
    let code = raw
    if (/^\d{6}$/.test(raw)) {
      // 无前缀的 6 位数字，默认按上交所（sh）处理；这是常见简化，可在引擎层进一步精确到交易所
      code = `sh${raw}`
    }
    return {
      market,
      raw,
      sina: code,
      tencent: code,
      yahoo: raw,
      cacheKeySymbol: raw.replace(/^[a-z]+/i, '') || raw,
    }
  }

  if (market === 'HK') {
    // 0700 / 00700 / 700 / 0700.HK → 统一补零到 5 位
    let num = raw.replace(/\.hk$/i, '').replace(/^0+/, '') || '0'
    const padded = num.padStart(5, '0')
    return {
      market,
      raw,
      sina: `rt_hk${padded}`,
      tencent: `hk${padded}`,
      yahoo: `${padded}.HK`,
      cacheKeySymbol: padded,
    }
  }

  if (market === 'FUND') {
    // 国内基金：6 位代码（含 sh/sz 前缀时取数字部分）
    const code = raw.replace(/^(sh|sz)/i, '').replace(/\.hk$/i, '')
    return {
      market,
      raw,
      sina: code, // 基金不使用新浪股票接口
      tencent: code,
      yahoo: code,
      cacheKeySymbol: code,
    }
  }
  if (market === 'GOLD') {
    // 黄金统一 symbol：AU9999（克重即 quantity，金价即 current_price，人民币/克）
    const code = raw.trim() || 'AU9999'
    return {
      market,
      raw,
      sina: code,
      tencent: code,
      yahoo: code,
      cacheKeySymbol: code,
    }
  }

  // US
  // 剥掉交易所后缀：Yahoo 只用纯代码（如 QQQ），不认 .OQ/.N/.O/.A/.PK/.US 等。
  // 注意：不能无脑剥所有 "."（港股用 .HK 由 HK 分支处理，这里只处理美股常见后缀）。
  const yahoo = raw
    .replace(/\.(us|oq|n|o|a|pk|l|sa|si)$/i, '')
    .toUpperCase()
  return {
    market,
    raw,
    sina: yahoo,
    tencent: yahoo,
    yahoo,
    cacheKeySymbol: yahoo,
  }
}

// KV key 构造
export function quoteCacheKey(market: Market, symbol: string): string {
  const p = parseSymbol(symbol, market)
  return `quote:${market}:${p.cacheKeySymbol}`
}

// 历史走势 KV key
export function historyCacheKey(market: Market, symbol: string, period: string): string {
  const p = parseSymbol(symbol, market)
  return `history:${market}:${p.cacheKeySymbol}:${period}`
}
