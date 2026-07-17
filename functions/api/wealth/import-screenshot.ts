// POST /api/wealth/import-screenshot
// 接收 imageBase64 或 rawText，经 OCR + DeepSeek 提取结构化持仓 JSON

interface ImportScreenshotRequest {
  imageBase64?: string
  rawText?: string
}

interface HoldingItem {
  name: string
  market: string
  /** 证券代码/交易代码，优先用 symbol 搜索；没有则为 null */
  symbol?: string | null
  quantity: number
  cost_price: number
  current_price: number
  market_value: number
  profit_loss: number
  profit_rate: number
  /** 交易日期 YYYY-MM-DD，原文有就提取，没有则为 null */
  date?: string | null
}

// 百度 OCR：获取 access_token（缓存 30 天）
let _baiduToken: { token: string; expires: number } | null = null

async function getBaiduToken(env: any): Promise<string> {
  if (_baiduToken && Date.now() < _baiduToken.expires) return _baiduToken.token
  const apiKey = env.BAIDU_OCR_API_KEY
  const secretKey = env.BAIDU_OCR_SECRET_KEY
  if (!apiKey || !secretKey) throw new Error('BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 未配置')
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`baidu token http ${res.status}`)
  const json = await res.json() as any
  if (!json.access_token) throw new Error('baidu token missing')
  _baiduToken = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 2592000) * 1000 }
  return _baiduToken.token
}

async function baiduOCR(imageBase64: string, env: any): Promise<string> {
  const token = await getBaiduToken(env)

  // 去掉可能的前缀 data:image/...;base64,
  let cleanBase64 = imageBase64
  const commaIdx = cleanBase64.indexOf(',')
  if (commaIdx >= 0 && cleanBase64.slice(0, commaIdx).includes('base64')) {
    cleanBase64 = cleanBase64.slice(commaIdx + 1)
  }

  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`
  const body = new URLSearchParams({ image: cleanBase64 })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`baidu ocr http ${res.status}: ${errText.slice(0, 200)}`)
  }
  const json = await res.json() as any
  console.log(`[import-screenshot] baidu OCR raw: error_code=${json.error_code} words_num=${json.words_result_num} log_id=${json.log_id}`)
  if (json.error_code) {
    throw new Error(`baidu OCR error ${json.error_code}: ${json.error_msg || 'unknown'}`)
  }
  const words = json?.words_result?.map((w: any) => w.words).join('\n') || ''
  if (!words) throw new Error('OCR 未识别到文字')
  // 打印完整 OCR 文本（测试阶段）
  console.log(`[import-screenshot] === OCR FULL TEXT (${words.length} chars) ===\n${words}\n=== END OCR ===`)
  return words
}

async function callDeepSeek(text: string, env: any): Promise<HoldingItem[]> {
  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是金融持仓数据提取助手。从OCR文本中提取持仓JSON数组。

**规则**：
1. 只输出纯JSON数组，无Markdown、无解释。
2. 所有数字字段为Number，不带单位。
3. 只从原文提取，绝不编造。原文没有的字段填0。
4. **严禁合并同名记录**：如果原文中出现多次相同的资产名称，必须输出对应数量的独立JSON对象，分别保留各自的数量、成本价等信息。

**字段**：
- name: 名称
- market: 'CN'|'FUND'|'HK'|'US'|'GOLD'。股票代码6位且60/68/00/30开头→CN；5位→HK；含字母→US；基金名称含"混合/债券/指数/ETF联接"→FUND
- symbol: 证券代码/交易代码。股票类资产优先提取简短的交易代码（如美股 AAPL，港股 00700，A股 600519）。如果文本中没有代码，设为 null。
- quantity: 持仓份额。原文有"股"或"份"或"克"且带数量就填；无则填0
- cost_price: 成本价。原文有"成本"或"均价"相关数字就填；无则填0
- current_price: 现价/净值。原文有就填；无则填0
- market_value: 总市值/持有金额（通常最大的数字）
- profit_loss: 盈亏金额。正=盈利，负=亏损。原文带"+"就是盈利，带"-"或绿色就是亏损
- profit_rate: 收益率。百分比÷100转小数（如51.71%→0.5171，-10.93%→-0.1093）
- date: 交易日期。原文有明确日期(YYYY-MM-DD/YYYY年MM月DD日等)就提取为"YYYY-MM-DD"格式；无则填null。**绝对禁止编造日期**。

**常见OCR布局识别**：
- 支付宝/天天基金格式：名称 → 持有金额(市值) → 日收益 → 持有收益 → 累计收益/收益率
- 券商格式：代码 名称 持仓 现价 成本价 市值 盈亏 收益率`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`deepseek http ${res.status}: ${errText.slice(0, 300)}`)
    }

    const json = await res.json() as any
    const content = json?.choices?.[0]?.message?.content
    console.log(`[import-screenshot] === DeepSeek RAW RESPONSE ===\n${content}\n=== END DeepSeek ===`)
    if (!content) throw new Error('deepseek empty response')

    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      const cleaned = content.replace(/```json\s*|```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    }

    const items: HoldingItem[] = Array.isArray(parsed) ? parsed : (parsed?.data ?? [])
    return items
  } finally {
    clearTimeout(timer)
  }
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context
  const _t0 = Date.now()

  let body: ImportScreenshotRequest
  try {
    body = await request.json()
  } catch {
    return json({ code: 400, message: '请求体不是合法 JSON' }, 400)
  }

  console.log(`[import-screenshot] mode=${body.imageBase64 ? 'ocr' : 'text'} imageSize=${body.imageBase64?.length || 0}`)

  if (!body.imageBase64 && !body.rawText) {
    return json({ code: 400, message: '缺少 imageBase64 或 rawText' }, 400)
  }

  try {
    let text = body.rawText || ''

    if (body.imageBase64 && !body.rawText) {
      const _ocr0 = Date.now()
      try {
        text = await baiduOCR(body.imageBase64, env)
        console.log(`[import-screenshot] OCR OK ${Date.now() - _ocr0}ms`)
      } catch (e: any) {
        console.error(`[import-screenshot] OCR FAIL ${Date.now() - _ocr0}ms`, e?.message || e)
        return json({ code: 502, message: `OCR 识别失败: ${e?.message || '未知错误'}` }, 502)
      }
    }

    if (!text.trim()) {
      return json({ code: 400, message: '未识别到有效文字' }, 400)
    }

    const _ai0 = Date.now()
    const items = await callDeepSeek(text, env)
    console.log(`[import-screenshot] AI OK ${Date.now() - _ai0}ms items=${items.length}`)

    items.forEach((item, i) => {
      console.log(`[import-screenshot]   [${i}] ${item.name} | symbol=${item.symbol ?? '-'} market=${item.market} qty=${item.quantity} cost=${item.cost_price} cur=${item.current_price} mv=${item.market_value} pl=${item.profit_loss} rate=${item.profit_rate} date=${item.date ?? '-'}`)
    })

    console.log(`[import-screenshot] TOTAL ${Date.now() - _t0}ms`)
    return json({ code: 0, message: 'ok', data: { items } }, 200)
  } catch (e: any) {
    console.error(`[import-screenshot] TOTAL FAIL ${Date.now() - _t0}ms`, e?.message || e)
    return json({ code: 500, message: `AI 提取失败: ${e?.message || '未知错误'}` }, 500)
  }
}

function json(payload: any, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
