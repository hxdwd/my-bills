import type { BatchRequest, ApiResponse, BatchResponseData } from '../../../src/types/api'
import { runValuation } from '../../../src/core/valuation/index'

const MAX_ITEMS = 50

export const onRequestPost = async (context: any) => {
  const { request, env } = context
  const _t0 = Date.now()
  let body: BatchRequest
  try {
    body = await request.json()
  } catch {
    return json({ code: 400, message: '请求体不是合法 JSON' }, 400)
  }

  const items = body?.items
  if (!Array.isArray(items) || items.length === 0) {
    return json({ code: 400, message: 'items 必须为非空数组' }, 400)
  }
  if (items.length > MAX_ITEMS) {
    return json({ code: 400, message: `items 最多 ${MAX_ITEMS} 条，当前 ${items.length}` }, 400)
  }

  try {
    const data: BatchResponseData = await runValuation(body, env.QUOTE_CACHE)
    console.log(`[perf] POST /api/valuation/batch total=${Date.now() - _t0}ms items=${items.length}`)
    return json({ code: 0, message: 'ok', data }, 200)
  } catch (e: any) {
    console.error('[batch] error', e)
    return json({ code: 500, message: '服务器内部错误' }, 500)
  }
}

function json(payload: ApiResponse<any>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
