import { getSupabaseUserId } from './supabase'

// 通用用户扩展数据读写（user_expand 表，extras JSONB）。
// 复用 sync-engine 的直连模式：anon key + x-user-id 头，配合 RLS 做数据隔离。

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

export interface UserExpandRow {
  user_id: string
  extras: Record<string, any>
  created_at: string
  updated_at: string
}

/** 读取当前用户的 extras（顶层为各彩蛋命名空间，如 life）。无记录时返回 null。 */
export async function getUserExpand(): Promise<Record<string, any> | null> {
  const uid = getSupabaseUserId()
  if (!uid) return null
  const url = `${SUPABASE_URL}/rest/v1/user_expand?user_id=eq.${uid}&select=*`
  const resp = await fetch(url, { headers: headers(), method: 'GET' })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`读取扩展数据失败: ${resp.status} ${t}`)
  }
  const rows: UserExpandRow[] = await resp.json()
  return rows.length ? rows[0].extras : null
}

/** 写回整个 extras（upsert：按 user_id 主键合并）。 */
export async function upsertUserExpand(extras: Record<string, any>): Promise<void> {
  const uid = getSupabaseUserId()
  if (!uid) throw new Error('用户未登录')
  const body = JSON.stringify({ user_id: uid, extras })
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/user_expand`, {
    headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates, return=minimal' },
    method: 'POST',
    body,
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`保存扩展数据失败: ${resp.status} ${t}`)
  }
}
