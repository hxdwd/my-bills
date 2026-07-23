/** 购物清单 — 数据类型与常量 */

export interface WishlistItem {
  id: string
  name: string
  price: number
  category: string
  icon: string
  desireLevel: 1 | 2 | 3 | 4 | 5
  coolingDays: number
  addedAt: string           // 'YYYY-MM-DD'
  cooledAt: string          // 冷静期结束日期 'YYYY-MM-DD' (addedAt + coolingDays)
  status: 'cooling' | 'ready' | 'bought' | 'abandoned'
  transactionId?: string
  boughtAt?: string
  boughtPrice?: number
  note: string
  createdAt: string         // ISO 时间戳
}

export interface WishlistData {
  items: WishlistItem[]
}

/** 默认空数据 */
export function defaultWishlistData(): WishlistData {
  return { items: [] }
}

/** 欲望等级配置表 */
export const DESIRE_LEVELS: Record<number, { label: string; color: string; days: number }> = {
  1: { label: '可有可无', color: '#888888', days: 3 },
  2: { label: '有点想要', color: '#A0A0A0', days: 7 },
  3: { label: '比较想要', color: '#F4D77C', days: 14 },
  4: { label: '非常想要', color: '#E8A838', days: 30 },
  5: { label: '非买不可', color: '#F43F5E', days: 60 },
}

/** 根据加入日期和冷静天数计算冷静期结束日期 */
export function calcCooledAt(addedAt: string, coolingDays: number): string {
  const d = new Date(addedAt)
  d.setDate(d.getDate() + coolingDays)
  return d.toISOString().slice(0, 10)
}

/** 计算剩余冷静天数（已过期返回 0） */
export function calcRemainingDays(cooledAt: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(cooledAt)
  target.setHours(0, 0, 0, 0)
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

/** 生成唯一 ID */
export function genWishId(): string {
  return `wish_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
