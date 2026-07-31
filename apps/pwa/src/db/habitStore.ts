// 魔性打卡 — 数据层
// 严格按 "多 Key 隔离 + 按月归档" 设计：
//   habit_config           -> { enabled: ['diet', 'exercise'] }
//   habit_meta_{habitId}   -> { streak, maxStreak, lastDate }
//   habit_log_{habitId}_{YYYY-MM} -> { "2026-07-01": true, ... }

import { getUserExpandValue, upsertUserExpandValue } from '../services/userExpand'
import type { HabitConfig, HabitMeta, HabitLog } from '../types/habit'

const CONFIG_KEY = 'habit_config'
const metaKey = (habitId: string) => `habit_meta_${habitId}`
const logKey = (habitId: string, month: string) => `habit_log_${habitId}_${month}`

// —— 读取 ——

export async function getHabitConfig(): Promise<HabitConfig> {
  const v = await getUserExpandValue(CONFIG_KEY)
  return v && Array.isArray(v.enabled) ? v : { enabled: [] }
}

export async function saveHabitConfig(cfg: HabitConfig): Promise<void> {
  await upsertUserExpandValue(CONFIG_KEY, cfg)
}

export async function getHabitMeta(habitId: string): Promise<HabitMeta | null> {
  return await getUserExpandValue(metaKey(habitId))
}

export async function getHabitLog(habitId: string, month: string): Promise<HabitLog> {
  const v = await getUserExpandValue(logKey(habitId, month))
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

// —— 打卡核心逻辑 ——

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 打卡记录：自动触发（饮食等）或手动点击调用。
 * 返回是否首次打卡（用于动画触发）。
 */
export async function recordHabit(habitId: string): Promise<boolean> {
  const today = todayStr()
  const month = today.slice(0, 7)

  // 读当月日志
  const log = await getHabitLog(habitId, month)
  if (log[today]) return false // 今天已打过

  // 读连胜
  const meta = (await getHabitMeta(habitId)) ?? { streak: 0, maxStreak: 0, lastDate: '' }

  const yesterday = yesterdayStr()
  const isNewStreak = meta.lastDate === yesterday
  const streak = isNewStreak ? meta.streak + 1 : 1
  const maxStreak = Math.max(streak, meta.maxStreak)

  // 更新日志（只 upsert 当前月份这个小 key）
  const newLog = { ...log, [today]: true }
  await upsertUserExpandValue(logKey(habitId, month), newLog)

  // 更新连胜元数据（极小体积）
  await upsertUserExpandValue(metaKey(habitId), {
    streak,
    maxStreak,
    lastDate: today,
  })

  return true
}

/** 读取某个习惯今天是否已打卡 */
export async function isHabitChecked(habitId: string): Promise<boolean> {
  const today = todayStr()
  const month = today.slice(0, 7)
  const log = await getHabitLog(habitId, month)
  return !!log[today]
}
