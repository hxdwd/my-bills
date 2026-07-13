import type { ApiResponse, HistoryPoint, Market, HistoryPeriod } from '../../../src/types/api'
import { runHistory } from '../../../src/core/valuation/index'

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  const _t0 = Date.now()
  const url = new URL(request.url)
  const symbol = url.searchParams.get('symbol')
  const market = (url.searchParams.get('market') as Market) || undefined
  const period = (url.searchParams.get('period') as HistoryPeriod) || '1m'

  if (!symbol) {
    return json({ code: 400, message: '缺少必填参数 symbol' }, 400)
  }

  try {
    const data: HistoryPoint[] = await runHistory(symbol, market, period, env.QUOTE_CACHE)
    return json({ code: 0, message: 'ok', data }, 200)
  } catch (e: any) {
    console.error('[history] error', e)
    return json({ code: 500, message: '服务器内部错误' }, 500)
  }
}

function json(payload: ApiResponse<any>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
