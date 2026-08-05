// POST /api/wealth/ai-analyze

interface AiAnalyzeRequest {
  symbol: string; market: string; asset_name: string
  current_price: number; cost_price: number; first_buy_date: string
  change_percent?: number | null
}

async function searchNews(req: AiAnalyzeRequest, env: any): Promise<string> {
  const apiKey = env.TAVILY_API_KEY
  if (!apiKey) return ''
  const y = new Date().getFullYear()
  const keyword = (req.market === 'CN' || req.market === 'FUND')
    ? `${req.asset_name} ${req.symbol} A-share ${y}`
    : `${req.asset_name} recent news ${y}`
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000)
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query: keyword, max_results: 5, search_depth: 'basic', include_answer: false }),
      signal: c.signal,
    })
    if (!r.ok) return ''
    const j = await r.json() as any
    return (j?.results ?? []).slice(0, 5).map((x: any) => `${x.title}: ${x.content ?? x.snippet ?? ''}`).join('\n\n')
  } catch { return '' } finally { clearTimeout(t) }
}

// Step 1: extract key facts from raw news
async function extractFacts(raw: string, env: any): Promise<string> {
  if (!raw) return ''
  const key = env.DEEPSEEK_API_KEY
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Extract key facts from the news below. Output as bullet points (- ) with specific numbers, dates, and events. No commentary, just facts. Output in Chinese.' },
        { role: 'user', content: raw },
      ],
      max_tokens: 500, stream: false,
    }),
  })
  if (!r.ok) return ''
  const j = await r.json() as any
  return j?.choices?.[0]?.message?.content?.trim() || ''
}

// Step 2: analysis prompt (short, no restrictive rules)
function buildPrompt(req: AiAnalyzeRequest, facts: string): string {
  const d = Math.max(1, Math.ceil((Date.now() - new Date(req.first_buy_date).getTime()) / 86400000))
  const pr = req.cost_price > 0 ? ((req.current_price - req.cost_price) / req.cost_price * 100).toFixed(2) : '0'
  const s = parseFloat(pr) >= 0 ? '+' : ''
  const ch = req.change_percent != null ? ` 今日${(req.change_percent * 100).toFixed(1)}%` : ''
  const ctx = `持仓${req.asset_name}（${req.symbol}）成本${req.cost_price} 现价${req.current_price} 累计${s}${pr}% 持有${d}天${ch}`

  if (!facts) return `${ctx}\n\n未获取到相关新闻。基于持仓数据做简要分析：当前盈亏状态、需关注的风险、可观察的市场信号。输出中文，2-3段，每段不超过3句。`

  return `${ctx}\n\n行业信息：\n${facts}\n\n基于以上信息和持仓背景，做具体分析。输出中文，使用以下格式：\n\n## 当前位置\n\n## 关键信号\n\n## 关注点\n\n每段2-4句。结合事实中的具体数字和事件。不要复述持仓数据。禁止买卖建议。`
}

// Step 3: streaming
async function streamAnalyze(prompt: string, env: any, signal: AbortSignal): Promise<Response> {
  const key = env.DEEPSEEK_API_KEY
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      stream: true, max_tokens: 800,
    }),
    signal,
  })
  if (!r.ok) throw new Error(`DeepSeek ${r.status}`)
  if (!r.body) throw new Error('No body')

  const { readable, writable } = new TransformStream()
  const w = writable.getWriter(); const rd = r.body.getReader(); const dec = new TextDecoder()
  ;(async () => {
    let b = ''
    try {
      while (true) {
        const { done, value } = await rd.read()
        if (done) { await w.write(new TextEncoder().encode('data: [DONE]\n\n')); break }
        b += dec.decode(value, { stream: true })
        const ls = b.split('\n'); b = ls.pop() ?? ''
        for (const l of ls) {
          const t = l.trim(); if (!t || !t.startsWith('data: ')) continue
          const d = t.slice(6); if (d === '[DONE]') { await w.write(new TextEncoder().encode('data: [DONE]\n\n')); return }
          try { const p = JSON.parse(d); const c = p?.choices?.[0]?.delta?.content; if (c) await w.write(new TextEncoder().encode(`data: ${JSON.stringify({ content: c })}\n\n`)) } catch {}
        }
      }
    } catch { await w.write(new TextEncoder().encode(`data: ${JSON.stringify({ error: 'Interrupted' })}\n\n`)) }
    finally { try { await w.close() } catch {} }
  })()

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })
}

export const onRequestOptions = async () => new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })

export const onRequestPost = async (context: any) => {
  const { request, env } = context
  if (!env.DEEPSEEK_API_KEY) return j(500, 'DEEPSEEK_API_KEY not configured')

  let body: AiAnalyzeRequest
  try { body = await request.json() } catch { return j(400, 'Invalid JSON') }
  if (!body.symbol || !body.market || !body.asset_name) return j(400, 'Missing fields')
  try {
    const raw = await searchNews(body, env)
    const facts = raw ? await extractFacts(raw, env) : ''
    const prompt = buildPrompt(body, facts)
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 30000)
    return await streamAnalyze(prompt, env, c.signal).finally(() => clearTimeout(t))
  } catch (e: any) { console.error('[ai-analyze]', e?.message || e); return j(500, 'Analysis failed') }
}

function j(s: number, msg: string): Response {
  return new Response(JSON.stringify({ code: s, message: msg }), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } })
}
