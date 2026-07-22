import { getUserExpandValue, upsertUserExpandValue, callRpc } from '../services/userExpand'
import type { DietControlItem, DietRecord, DietMonthRecords } from '../types/diet'

// —— Key 设计 ——
// 配置型（极少变动，全量 upsert 无压力）：diet_control_items -> { items: DietControlItem[] }
// 记录型（按月切片，首屏只读当月）：diet_control_records_YYYY-MM -> { [itemId]: DietRecord[] }
const ITEMS_KEY = 'diet_control_items'
const recordsKey = (month: string) => `diet_control_records_${month}` // month: YYYY-MM

// —— 轻量内存缓存 ——
// Supabase REST 的冷连接（首次/空闲后）常达 1~2s，但热连接仅 ~0.3s。
// 这里把读取结果缓存到前端：写入即失效、追加即乐观合并，并带短 TTL 兜底多端/多标签的最终一致。
// 这样打开饮食页、记账时匹配控制项等重复读取都不再打冷连接，感知上瞬间返回。
const TTL = 30_000
let itemsCache: { value: DietControlItem[]; ts: number } | null = null
const recordsCache = new Map<string, { value: DietMonthRecords; ts: number }>()

const fresh = (ts: number) => Date.now() - ts < TTL

export async function getDietItems(): Promise<DietControlItem[]> {
  if (itemsCache && fresh(itemsCache.ts)) return itemsCache.value
  const v = await getUserExpandValue(ITEMS_KEY)
  const items = v && Array.isArray(v.items) ? (v.items as DietControlItem[]) : []
  itemsCache = { value: items, ts: Date.now() }
  return items
}

export async function saveDietItems(items: DietControlItem[]): Promise<void> {
  await upsertUserExpandValue(ITEMS_KEY, { items })
  itemsCache = { value: items, ts: Date.now() }
}

export async function getDietMonthRecords(month: string): Promise<DietMonthRecords> {
  const cached = recordsCache.get(month)
  if (cached && fresh(cached.ts)) return cached.value
  const v = await getUserExpandValue(recordsKey(month))
  const recs = v && typeof v === 'object' && !Array.isArray(v) ? (v as DietMonthRecords) : {}
  recordsCache.set(month, { value: recs, ts: Date.now() })
  return recs
}

// 原子追加：只把单条小记录交给后端 RPC，由数据库 jsonb_set + || 原地追加。
// 前端不再「读全量 → JS 改数组 → 整体写回」，多端并发互不覆盖。
export async function appendDietRecord(
  month: string,
  itemId: string,
  rec: DietRecord
): Promise<void> {
  const resp = await callRpc('append_diet_record', {
    p_key: recordsKey(month),
    p_item_id: itemId,
    p_record: rec,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`追加饮食记录失败: ${resp.status} ${text}`)
  }
  // 乐观合并进缓存：下次读取当月记录直接命中，无需再打冷连接重新拉取。
  const cached = recordsCache.get(month)
  if (cached) {
    recordsCache.set(month, {
      value: { ...cached.value, [itemId]: [...(cached.value[itemId] ?? []), rec] },
      ts: Date.now(),
    })
  } else {
    recordsCache.delete(month) // 未知当前态，下次读取重新拉取
  }
}

// 删除控制项：仅从配置数组移除；其各月残留记录变为孤儿数据（item 已不在列表，永不读取），不物理清理。
export async function deleteDietItem(id: string): Promise<void> {
  const items = (await getDietItems()).filter((it) => it.id !== id)
  await saveDietItems(items)
}
