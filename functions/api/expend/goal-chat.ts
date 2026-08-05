// POST /api/expend/goal-chat

interface GoalChatRequest {
  goalId: string; goalName: string; vision: string
  goalDate: string; progressPct: number
  lastInteractionDate: string | null; milestoneFired: string[]
  userMessage?: string
  userStatusSummary?: string
  recentLogs?: Array<{ aiPrompt: string; userReply: string }>
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}

function buildPrompt(req: GoalChatRequest): string {
  const remaining = daysUntil(req.goalDate)
  const urgency = remaining < 15 ? '紧迫' : remaining < 60 ? '中等' : '充裕'

  // Recent logs as context
  const logsText = (req.recentLogs && req.recentLogs.length > 0)
    ? req.recentLogs.slice(-4).map((l, i) => `${i + 1}. AI: ${l.aiPrompt}\n   用户: ${l.userReply}`).join('\n')
    : '无历史记录'

  const summaryText = req.userStatusSummary
    ? `用户自我总结: ${req.userStatusSummary}`
    : '用户未提供自我总结，请从对话日志中推断真实状态。'

  const userMsgText = req.userMessage
    ? `用户刚才说: "${req.userMessage}"\n先回应这句话，不要忽略它。`
    : ''

  return `你是用户的进度监督员，风格：直白、犀利、带幽默感。

根据以下信息，判断用户处于什么状态，然后提出一个有针对性的问题。

## 目标信息
- 目标: ${req.goalName}
- 愿景: ${req.vision || '无'}
- 截止日期: ${req.goalDate}（还剩 ${remaining} 天，时间 ${urgency}）
- 时间进度: ${req.progressPct.toFixed(0)}% 已过

## 近期互动记录
${logsText}

## 用户状态
${summaryText}

${userMsgText}

## 你的两步任务

第一步：��据互动记录和自我总结，将用户归类为以下之一：
- **拖延**: 反复说自己没行动、太忙、找不到时间，但没有任何实质性推进
- **迷茫**: 想行动但不知道从哪里下手，或者尝试了但方法不对
- **推进**: 有具体行动描述，在稳步前进，可能需要突破某个细节
- **危机**: 时间所剩无几，日志中出现焦虑、放弃等信号

第二步：根据你判定的状态，按以下要求回复：

如果是**拖延**: 直接开怼。用反问点破矛盾，比如"你上次说太忙是什么时候？——哦，3天前，也就是你刷了3天手机？"
如果是**迷茫**: 帮他把目标拆成可操作的小步。"如果把这件事拆成三小步，今天能走哪一步？"
如果是**推进**: 问一个具体的细节问题，"最让你纠结的一个细节是什么？"
如果是**危机**: 用幽默的方式降低压迫感，但直面核心，"现在直接放弃 vs 拼死一搏，哪个更让你后悔？"

## 输出格式
用一行方括号标注你判定的状态，然后空格后跟消息正文。
格式: [STATUS] 消息内容
STATUS 只能是: DELAY, START, PROGRESS, CRISIS 之一。

示例输出（如果你判定为拖延）:
[DELAY] 上次你说太忙，那是4天前。这4天里你刷了几部剧？
`
}

async function chat(prompt: string, env: any): Promise<{ aiMessage: string; type: string }> {
  const key = env.DEEPSEEK_API_KEY
  if (!key) throw new Error('MISSING_KEY')
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 200, stream: false }),
  })
  if (!r.ok) throw new Error(`DS ${r.status}`)
  const j = await r.json() as any
  const raw = j?.choices?.[0]?.message?.content?.trim() || ''

  // Parse [STATUS] prefix
  const m = raw.match(/^\[(DELAY|START|PROGRESS|CRISIS)\]\s*(.*)/)
  if (m) {
    return { aiMessage: m[2].trim(), type: m[1].toLowerCase() }
  }
  // Fallback: no prefix, treat as daily
  return { aiMessage: raw, type: 'daily' }
}

export const onRequestOptions = async () => new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })

export const onRequestPost = async (context: any) => {
  const { request, env } = context
  if (!env.DEEPSEEK_API_KEY) return j(500, 'MISSING_KEY')
  let body: GoalChatRequest
  try { body = await request.json() } catch { return j(400, 'Invalid JSON') }
  if (!body.goalId || !body.goalName) return j(400, 'Missing fields')
  try {
    const prompt = buildPrompt(body)
    const { aiMessage, type } = await chat(prompt, env)
    return new Response(JSON.stringify({ aiMessage, type }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } })
  } catch (e: any) { console.error('[goal-chat]', e?.message || e); return j(500, 'ERR') }
}

function j(s: number, msg: string): Response {
  return new Response(JSON.stringify({ code: s, message: msg }), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } })
}
