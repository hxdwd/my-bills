// ============================================================
// 开发者工具：解锁状态 + 网络响应录制
//
// 为什么需要：页面拿到的接口响应是「剥过壳」的（Worker 统一返回
// { code, message, data }，utils/quoteApi.ts 只把 data 交给页面），
// 出问题时就看不到 code/message 和原始报文。这里在 fetch 层做一层录制，
// 把「请求 + 原始响应」都留在内存里，供 /devtools 页面查看与导出。
//
// 约束：
//   - 只在启用时挂钩 window.fetch，关闭即还原；
//   - 读响应体一律走 Response.clone()，绝不消耗原 body，
//     否则 supabase-js 之类的库会拿不到数据；
//   - header 不落盘（apikey / Authorization 一律不记录），避免工具页泄露凭据；
//   - 环形缓冲 + 单条响应体截断，防止长时间使用把内存吃满。
// ============================================================

const ENABLED_KEY = 'mybills.devtools.enabled'
const MAX_ENTRIES = 200
const MAX_BODY_BYTES = 128 * 1024

export type NetKind = 'api' | 'db' | 'other'

export interface NetEntry {
  id: string
  at: number
  method: string
  url: string
  /** 归类：api = 本站 /api/*；db = /api/supabase/*；other = 其它同源请求 */
  kind: NetKind
  status: number | null
  ok: boolean
  duration: number
  requestBody?: string
  /** 原始响应文本（未剥壳），可能被截断 */
  responseBody?: string
  truncated?: boolean
  /** 业务外壳：仅 /api/* 会解析出 code / message */
  envelope?: { code?: number; message?: string }
  error?: string
  /** 响应体仍在读取中 */
  pending?: boolean
}

// ---------------- 状态与订阅 ----------------

let enabled = readEnabled()
let entries: NetEntry[] = []
let installed = false
let originalFetch: typeof window.fetch | null = null
const listeners = new Set<() => void>()

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* 单个订阅方异常不影响其它 */
    }
  })
}

export function subscribeDevTools(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isDevToolsEnabled(): boolean {
  return enabled
}

export function getNetEntries(): NetEntry[] {
  return entries
}

export function clearNetEntries() {
  entries = []
  emit()
}

export function setDevToolsEnabled(next: boolean) {
  enabled = next
  try {
    if (next) localStorage.setItem(ENABLED_KEY, '1')
    else localStorage.removeItem(ENABLED_KEY)
  } catch {
    /* 隐私模式下写不了 localStorage，只影响持久化 */
  }
  if (next) installRecorder()
  else uninstallRecorder()
  emit()
}

// ---------------- 录制器 ----------------

function classify(url: string): NetKind | null {
  if (url.includes('/api/supabase')) return 'db'
  if (url.includes('/api/')) return 'api'
  // 其它请求只记同源的，第三方位图/字体不记，避免噪音把缓冲冲掉
  try {
    const u = new URL(url, window.location.origin)
    return u.origin === window.location.origin ? 'other' : null
  } catch {
    return null
  }
}

function truncate(text: string): { body: string; truncated: boolean } {
  if (text.length <= MAX_BODY_BYTES) return { body: text, truncated: false }
  return { body: text.slice(0, MAX_BODY_BYTES), truncated: true }
}

function pickBody(body: unknown): string | undefined {
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  return undefined
}

function parseEnvelope(kind: NetKind, body?: string) {
  if (kind !== 'api' || !body) return undefined
  try {
    const json = JSON.parse(body)
    if (json && typeof json === 'object' && ('code' in json || 'message' in json)) {
      return { code: json.code, message: json.message }
    }
  } catch {
    /* 非 JSON 响应（网关错误页等）不解析 */
  }
  return undefined
}

function push(entry: NetEntry) {
  entries = [entry, ...entries].slice(0, MAX_ENTRIES)
  emit()
}

export function installRecorder() {
  if (installed || typeof window === 'undefined' || !window.fetch) return
  installed = true
  originalFetch = window.fetch

  const patched = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const started = performance.now()
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    const method = (
      init?.method ??
      (typeof input === 'object' && input && 'method' in (input as Request)
        ? (input as Request).method
        : 'GET')
    ).toUpperCase()
    const kind = classify(url)

    const entry: NetEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      method,
      url,
      kind: kind ?? 'other',
      status: null,
      ok: false,
      duration: 0,
      requestBody: pickBody(init?.body),
    }

    // 不是我们关心的请求：直接放行，不做任何记录
    if (!kind) return originalFetch!(input as RequestInfo, init)

    try {
      const res = await originalFetch!(input as RequestInfo, init)
      entry.status = res.status
      entry.ok = res.ok
      entry.duration = Math.round(performance.now() - started)
      entry.pending = true
      push(entry)

      // 用 clone 读文本：不影响调用方对原 response 的消费
      res
        .clone()
        .text()
        .then((text) => {
          const { body, truncated } = truncate(text)
          entry.responseBody = body
          entry.truncated = truncated
          entry.envelope = parseEnvelope(kind, body)
          entry.pending = false
          // 同时打到控制台，方便手机连调试时直接抓
          console.log(
            `[devtools] ${entry.method} ${shortPath(url)} → ${entry.status} (${entry.duration}ms)`,
            { request: entry.requestBody, response: body },
          )
          emit()
        })
        .catch(() => {
          entry.pending = false
          emit()
        })

      return res
    } catch (e: any) {
      entry.duration = Math.round(performance.now() - started)
      entry.error = e?.message || String(e)
      entry.pending = false
      push(entry)
      console.warn(`[devtools] ${entry.method} ${shortPath(url)} → 网络异常: ${entry.error}`)
      throw e
    }
  }

  window.fetch = patched as typeof window.fetch
}

export function uninstallRecorder() {
  if (!installed) return
  if (originalFetch) window.fetch = originalFetch
  originalFetch = null
  installed = false
}

/** 应用启动时调用：启用过就恢复录制（刷新后仍然生效） */
export function bootstrapDevTools() {
  if (enabled) installRecorder()
}

// ---------------- 展示用工具函数 ----------------

/** 去掉 origin，只留 path+query，列表更好读 */
export function shortPath(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    return u.pathname + u.search
  } catch {
    return url
  }
}

/** 表格里进一步压缩：只留最后两段，配合详情看完整 URL */
export function compactPath(url: string): string {
  const p = shortPath(url)
  const [base, query] = p.split('?')
  const seg = base.split('/').filter(Boolean)
  const tail = seg.slice(-2).join('/')
  return '/' + tail + (query ? '?' + query.slice(0, 24) + (query.length > 24 ? '…' : '') : '')
}

export function timeLabel(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function prettyJSON(text?: string): string {
  if (!text) return ''
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
