/**
 * Pages → 共享 Worker 的同源转发层
 *
 * 背景：
 *   本仓库已不再包含任何业务后端（原 functions/api/** 的行情、估值、财富 AI 逻辑
 *   全部迁到独立 Worker `my-bills-api`）。那个 Worker 设置了 workers_dev = false，
 *   不能也不应该暴露在公网，只允许被 Pages 通过 Service binding 调用。
 *
 * 作用：
 *   把本站 /api/* 的请求原样转交给 Worker（env.API），前端因此可以继续用
 *   同源相对路径 fetch('/api/...')，浏览器视角完全没有跨域，也不需要 CORS。
 *
 * 约束：
 *   - 这里只做转发，不写任何业务逻辑；新增接口请改 Worker。
 *   - 依赖 wrangler.toml 里的 [[services]] binding = "API"。
 *   - 故意不 import 任何类型包，保持零依赖，不参与 vite 构建。
 */

interface Env {
  /** Service binding，指向 Worker my-bills-api */
  API?: { fetch: (input: Request) => Promise<Response> }
}

interface Ctx {
  request: Request
  env: Env
}

function json(status: number, message: string): Response {
  return new Response(JSON.stringify({ code: status, message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/**
 * 过渡期兜底：Dashboard 里可能还没配上 Service binding（Pages 的 wrangler.toml
 * binding 在 Git 集成构建中是否生效，官方文档没有明确承诺）。
 * 绑定缺失时退化到 Worker 的公网地址，避免切换瞬间全站接口 502。
 *
 * 这条兜底是自限的：一旦 Worker 侧把 workers_dev 关掉（本来就应该关），
 * 公网地址失效，兜底自然不再可用，流量只能走 binding。
 * 命中兜底时会带上 x-api-proxy: public-fallback 响应头，便于识别。
 */
const PUBLIC_FALLBACK = 'https://my-bills-api.huangxiaodong7271.workers.dev'

export const onRequest = async ({ request, env }: Ctx): Promise<Response> => {
  const url = new URL(request.url)
  // host 仅用于拼出合法 URL，实际不会出网——Service binding 直接进 Worker
  const target = new URL(url.pathname + url.search, 'https://my-bills-api.internal')

  if (env?.API && typeof env.API.fetch === 'function') {
    try {
      return await env.API.fetch(new Request(target.toString(), request))
    } catch (e) {
      return json(502, `Worker 调用失败: ${(e as Error)?.message ?? 'unknown'}`)
    }
  }

  if (PUBLIC_FALLBACK) {
    console.warn('[api-proxy] API service binding 缺失，临时走公网地址，请尽快在 Pages 控制台配置 binding')
    try {
      const upstream = await fetch(new Request(PUBLIC_FALLBACK + target.pathname + target.search, request))
      const resp = new Response(upstream.body, upstream)
      resp.headers.set('x-api-proxy', 'public-fallback')
      return resp
    } catch (e) {
      return json(502, `Worker 调用失败（公网兜底）: ${(e as Error)?.message ?? 'unknown'}`)
    }
  }

  // 绑定没配上时给出可行动的报错，而不是让前端收到框架默认的 500 页面
  return json(502, 'Pages 未绑定 API service binding，请检查 wrangler.toml 的 [[services]]')
}
