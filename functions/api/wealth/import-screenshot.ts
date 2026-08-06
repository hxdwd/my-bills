// POST /api/wealth/import-screenshot

interface ImportScreenshotRequest { imageBase64?: string; rawText?: string }

interface HoldingItem {
  name: string; market: string; symbol?: string | null
  quantity: number; cost_price: number; current_price: number
  market_value: number; profit_loss: number; profit_rate: number
  date?: string | null
  verified?: boolean // true if symbol confirmed via financial data API
}

let _baiduToken: { token: string; expires: number } | null = null

async function getBaiduToken(env: any): Promise<string> {
  if (_baiduToken && Date.now() < _baiduToken.expires) return _baiduToken.token
  const apiKey = env.BAIDU_OCR_API_KEY
  const secretKey = env.BAIDU_OCR_SECRET_KEY
  if (!apiKey || !secretKey) throw new Error('BAIDU missing')
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`baidu token ${res.status}`)
  const json = await res.json() as any
  if (!json.access_token) throw new Error('baidu token missing')
  _baiduToken = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 2592000) * 1000 }
  return _baiduToken.token
}

async function baiduOCR(imageBase64: string, env: any): Promise<string> {
  const token = await getBaiduToken(env)
  let clean = imageBase64; const ci = clean.indexOf(',')
  if (ci >= 0 && clean.slice(0, ci).includes('base64')) clean = clean.slice(ci + 1)
  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`
  const body = new URLSearchParams({ image: clean })
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
  if (!res.ok) { const e = await res.text().catch(() => ''); throw new Error(`OCR ${res.status}: ${e.slice(0, 200)}`) }
  const json = await res.json() as any
  if (json.error_code) throw new Error(`OCR err ${json.error_code}`)
  const words = json?.words_result?.map((w: any) => w.words).join('\n') || ''
  if (!words) throw new Error('OCR empty')
  return words
}

async function callDeepSeek(text: string, env: any): Promise<HoldingItem[]> {
  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK missing')
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 9000)
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat',
        messages: [{ role: 'system', content:
`Extract holding data from OCR text. Return a JSON object with key "data" containing the holdings array.

Rules: Only extract values present in source text. Fill 0 for missing fields. Do NOT merge duplicates.

Fields:
- name: full descriptive name WITHOUT trailing ticker. If source says "RDHL T-REX 2X LG DRAM DT (RAM)", name="RDHL T-REX 2X LG DRAM DT".
- market: Determine by SYMBOL first: 'US' if symbol has letters, 'HK' if 5 digits, 'CN' if 6 digits starting 60/68/00/30. Only use 'FUND' for Chinese mutual funds identified by 6-digit codes starting with 0 (like 025209). US-listed ETFs with ticker symbols are always market='US'.
- symbol: OFFICIAL TICKER. Priority: (1) If "NAME (CODE)" pattern exists, CODE in parentheses IS the ticker. (2) Otherwise, use the standalone uppercase/digit token that appears as its own word. (3) If no clear standalone ticker, set symbol=null. A ticker is NEVER a single letter extracted from a longer word.
- quantity, cost_price, current_price, market_value, profit_loss, profit_rate: numbers from source (0 if missing).
- date: "YYYY-MM-DD" if present, else null.` },
          { role: 'user', content: text }],
        response_format: { type: 'json_object' }, max_tokens: 4096 }),
      signal: c.signal,
    })
    if (!res.ok) { const e = await res.text().catch(() => ''); throw new Error(`DS ${res.status}: ${e.slice(0, 200)}`) }
    const j = await res.json() as any; const content = j?.choices?.[0]?.message?.content
    if (!content) throw new Error('empty')
    let parsed: any
    try { parsed = JSON.parse(content) } catch { parsed = JSON.parse(content.replace(/```json\s*|```\s*/g, '').trim()) }
    let items: HoldingItem[] = Array.isArray(parsed) ? parsed : (parsed?.data ?? [])

    // Verify symbols against financial data source
    items = await verifySymbols(items)

    return items
  } finally { clearTimeout(t) }
}

const SEARCH_URL = 'https://smartbox.gtimg.cn/s3/?v=2&t=all&q='

async function verifySymbols(items: HoldingItem[]): Promise<HoldingItem[]> {
  const verified = await Promise.all(items.map(async (item) => {
    if (!item.symbol) return { ...item }
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000)
      const r = await fetch(SEARCH_URL + encodeURIComponent(item.symbol), { signal: c.signal })
      clearTimeout(t)
      if (!r.ok) return { ...item }
      const text = await r.text()
      // Look for symbol match (codes may have exchange suffix like ram.am)
      const m = text.match(/v_hint="([^"]*)"/)
      const target = (item.symbol ?? '').toLowerCase()
      const found = m?.[1]?.split('^').some(cand => {
        const parts = cand.split('~')
        if (parts.length < 2) return false
        const code = parts[1].toLowerCase()
        return code === target || code.startsWith(target + '.') || code === target.replace(/\..*/, '')
      })
      return { ...item, verified: !!found }
    } catch { return { ...item } }
  }))
  return verified
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context
  if (!env.DEEPSEEK_API_KEY) return j(500, 'MISSING_KEY')
  let body: ImportScreenshotRequest
  try { body = await request.json() } catch { return j(400, 'Invalid JSON') }
  if (!body.imageBase64 && !body.rawText) return j(400, 'Missing input')
  try {
    let text = body.rawText || ''
    if (body.imageBase64 && !body.rawText) { try { text = await baiduOCR(body.imageBase64, env) } catch (e: any) { return j(502, `OCR: ${e?.message}`) } }
    if (!text.trim()) return j(400, 'No text')
    return j(200, 'ok', { items: await callDeepSeek(text, env) })
  } catch (e: any) { console.error('[import]', e?.message || e); return j(500, `AI: ${e?.message}`) }
}

function j(s: number, m: string, d?: any): Response {
  const b = d ? { code: s === 200 ? 0 : s, message: m, data: d } : { code: s === 200 ? 0 : s, message: m }
  return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
