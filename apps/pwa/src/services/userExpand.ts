import { getSupabaseUserId } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function headers(): Record<string, string> {
  const uid = getSupabaseUserId()
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'x-user-id': uid ?? '',
    'Content-Type': 'application/json',
  }
}

interface UserExpandKVRow {
  user_id: string
  key: string
  value: any
  created_at: string
  updated_at: string
}

/**
 * 读取指定 key 的 value。
 * 该 key 无记录时返回 null（代表用户从未使用过该功能），由调用方兜底默认数据。
 * —— 严格限定在单个 key 之下，不读取/解构任何全局 JSON 字段。
 */
export async function getUserExpandValue(key: string): Promise<any | null> {
  const uid = getSupabaseUserId()
  if (!uid) return null
  const url = `${SUPABASE_URL}/rest/v1/user_expand?user_id=eq.${uid}&key=eq.${encodeURIComponent(
    key
  )}&select=value`
  const resp = await fetch(url, { headers: headers(), method: 'GET' })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`读取扩展数据失败: ${resp.status} ${t}`)
  }
  const rows: UserExpandKVRow[] = await resp.json()
  return rows.length ? rows[0].value : null
}

/**
 * 一次性读取多个 key 的 value（PostgREST `key=in.(...)`）。
 * 用于消除「一个 key 一次请求」的碎片化调用（例如 3 个习惯日志原本要发 3 次请求）。
 * 返回 key → value 映射；无记录的 key 不会出现在结果里，由调用方按 null 兜底。
 */
export async function getUserExpandValues(keys: string[]): Promise<Record<string, any>> {
  const uid = getSupabaseUserId()
  if (!uid || keys.length === 0) return {}
  // 每个 key 用双引号包裹，避免 key 里的特殊字符破坏 in 列表语法
  const list = keys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(',')
  const url = `${SUPABASE_URL}/rest/v1/user_expand?user_id=eq.${uid}&key=in.(${encodeURIComponent(
    list
  )})&select=key,value`
  const resp = await fetch(url, { headers: headers(), method: 'GET' })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`批量读取扩展数据失败: ${resp.status} ${t}`)
  }
  const rows: UserExpandKVRow[] = await resp.json()
  const map: Record<string, any> = {}
  for (const r of rows) map[r.key] = r.value
  return map
}

/**
 * 原子写入指定 key 的 value。
 * 利用 Supabase REST 的 upsert（按 (user_id, key) 复合主键 ON CONFLICT DO UPDATE），
 * 只覆盖该 key 这一行，绝不影响其它 key 的数据。
 * —— 取代「先读全量 extras、改完再整包覆盖」的反模式。
 */
export async function upsertUserExpandValue(key: string, value: any): Promise<void> {
  const uid = getSupabaseUserId()
  if (!uid) throw new Error('用户未登录')
  const body = JSON.stringify({ user_id: uid, key, value })
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/user_expand`, {
    headers: {
      ...headers(),
      Prefer: 'resolution=merge-duplicates, return=minimal',
    },
    method: 'POST',
    body,
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`保存扩展数据失败: ${resp.status} ${t}`)
  }
}

/**
 * 调用 Supabase PostgREST RPC（数据库函数）。
 * 沿用统一的 x-user-id 头，函数内通过 get_current_user_id() 拿到调用者身份。
 */
export async function callRpc(fn: string, params: Record<string, unknown>): Promise<Response> {
  const uid = getSupabaseUserId()
  if (!uid) throw new Error('用户未登录')
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return resp
}
