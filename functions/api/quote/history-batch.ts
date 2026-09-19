import type { ApiResponse, HistoryBatchRequest, HistoryBatchResponseData } from '../../../src/types/api'
import { runHistoryBatch } from '../../../src/core/valuation/index'

// 单次最多标的数：与 batch 估值一致取 60，覆盖常见持仓规模且控制回源压力
const MAX_ITEMS = 60

export const onRequestPost = async (context: any) => {
  const { request, env } = context
  let body: HistoryBatchRequest
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

  const period = typeof body?.period === 'string' && body.period ? body.period : '1m'
  // start/end 同时给出时按日期区间取（优先于 period），用于按月查看/滑动加载
  const start = typeof body?.start === 'string' && body.start ? body.start : undefined
  const end = typeof body?.end === 'string' && body.end ? body.end : undefined
  const range = start && end ? { start, end } : undefined

  try {
    const results = await runHistoryBatch(items, period, env.QUOTE_CACHE, 6, range)
    const data: HistoryBatchResponseData = { results }
    return json({ code: 0, message: 'ok', data }, 200)
  } catch (e: any) {
    console.error('[history-batch] error', e)
    return json({ code: 500, message: '服务器内部错误' }, 500)
  }
}

function json(payload: ApiResponse<any>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
