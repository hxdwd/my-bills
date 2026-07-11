import type { ApiResponse, SearchResult, Market } from '../../../src/types/api'

const SEARCH_URL = 'https://smartbox.gtimg.cn/s3/?v=2&t=all&q='

// gtimg 搜索接口返回 UTF-8，但中文被编码成 \uXXXX 字面量，需反转义
function decodeUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function prefixToMarket(prefix: string, code: string): Market {
  const p = prefix.trim().toLowerCase()
  if (p === 'hk') return 'HK'
  if (p === 'us') return 'US'
  // 显式交易所前缀(sh/sz) 或 A股代码区间(60/68/00/30 开头) → CN
  if (/^(sh|sz)/i.test(prefix) || ['60', '68', '00', '30'].some((x) => code.startsWith(x))) return 'CN'
  // 其余 6 位代码 → 基金
  if (/^\d{6}$/.test(code)) return 'FUND'
  return 'CN'
}

function normalizeSymbol(market: Market, code: string): string {
  if (market === 'HK') {
    const num = code.replace(/^hk/i, '').replace(/\.hk$/i, '').replace(/^0+/, '')
    return num.padStart(5, '0')
  }
  if (market === 'US') {
    return code.replace(/^us/i, '').replace(/\.us$/i, '').toUpperCase()
  }
  return code.replace(/^(sh|sz|hk)/i, '').replace(/\.hk$/i, '')
}

export const onRequestGet = async (context: any) => {
  const { request } = context
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()

  if (!q) {
    return json({ code: 400, message: 'missing param q' }, 400)
  }

  try {
    const text = await fetchWithRetry(q, 1)
    const m = text.match(/v_hint="([^"]*)"/)
    if (!m || !m[1]) {
      return json({ code: 0, message: 'ok', data: { results: [] } }, 200)
    }
    const candidates = m[1].split('^').filter(Boolean)
    const results: SearchResult[] = []
    for (const cand of candidates) {
      const parts = cand.split('~')
      if (parts.length < 3) continue
      const prefix = parts[0]
      const code = decodeUnicode(parts[1])
      const name = decodeUnicode(parts[2])
      if (!code || !name) continue
      const market = prefixToMarket(prefix, code)
      const symbol = normalizeSymbol(market, code)
      results.push({ symbol, market, name, code })
    }
    const seen = new Set<string>()
    const deduped = results.filter((r) => {
      const key = r.market + ':' + r.symbol
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return json({ code: 0, message: 'ok', data: { results: deduped } }, 200)
  } catch (e: any) {
    console.error('[search] error', e)
    return json({ code: 0, message: 'search unavailable, please retry', data: { results: [] } }, 200)
  }
}

async function fetchWithRetry(q: string, retries: number): Promise<string> {
  let lastErr: any
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetch(SEARCH_URL + encodeURIComponent(q), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('search http ' + res.status)
      return await res.text()
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300))
        continue
      }
      throw lastErr
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

function json(payload: ApiResponse<any>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}