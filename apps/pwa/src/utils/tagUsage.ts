// 记录/读取「最近使用」标签（按用户隔离，存 localStorage，不请求 Supabase）
// 仅用于记账页标签选择 Modal 的「最近使用」展示，不影响实际标签数据。

const KEY_PREFIX = 'mybills_recent_tags_'

const MAX_RECENT = 20

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/** 读取某用户最近使用的标签 id 列表（按时间倒序） */
export function getRecentTagIds(userId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((x: unknown) => typeof x === 'string')
  } catch {
    return []
  }
}

/** 记录一次标签使用（置顶并去重，最多保留 MAX_RECENT 个） */
export function recordTagUsage(userId: string, tagId: string): void {
  try {
    const current = getRecentTagIds(userId).filter(id => id !== tagId)
    const next = [tagId, ...current].slice(0, MAX_RECENT)
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    // localStorage 不可用时静默忽略
  }
}

/** 当标签被删除时，从最近使用列表移除 */
export function removeRecentTag(userId: string, tagId: string): void {
  try {
    const current = getRecentTagIds(userId).filter(id => id !== tagId)
    localStorage.setItem(keyFor(userId), JSON.stringify(current))
  } catch {
    // 忽略
  }
}
