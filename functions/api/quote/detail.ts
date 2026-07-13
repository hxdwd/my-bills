import type { ApiResponse, QuoteDetailData, Market } from '../../../src/types/api'
import { runQuoteDetail } from '../../../src/core/valuation/index'

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  const url = new URL(request.url)
  const symbol = url.searchParams.get('symbol')
  const market = (url.searchParams.get('market') as Market) || undefined

  if (!symbol) {
    return json({ code: 400, message: '缺少必填参数 symbol' }, 400)
  }

  try {
    const { quote, cached } = await runQuoteDetail(symbol, market, env.QUOTE_CACHE)
    const data = quote as QuoteDetailData
    return json({ code: 0, message: 'ok', data }, 200)
  } catch (e: any) {
    console.error('[detail] error', e)
    return json({ code: 502, message: '行情获取失败' }, 502)
  }
}

function json(payload: ApiResponse<any>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
