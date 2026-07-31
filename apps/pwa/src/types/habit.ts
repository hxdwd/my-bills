// 魔性打卡 — 数据类型定义

/** 打卡习惯配置 */
export interface HabitConfig {
  enabled: string[]
}

/** 单个习惯的连胜元数据 */
export interface HabitMeta {
  streak: number
  maxStreak: number
  lastDate: string // YYYY-MM-DD
}

/** 某习惯某月的打卡日志（日期 → 是否打卡） */
export type HabitLog = Record<string, boolean>

/** 习惯定义（前端常量，不入库） */
export interface HabitDef {
  id: string
  name: string
  icon: string
  color: string
  /** 手动打卡的按钮文案 */
  actionLabel: string
}

/** 支持的习惯列表 */
export const HABITS: HabitDef[] = [
  { id: 'diet', name: '饮食控制', icon: '🍔', color: '#FB923C', actionLabel: '完成今日饮食控制' },
  { id: 'exercise', name: '运动打卡', icon: '🏃', color: '#4ECDC4', actionLabel: '完成今日运动' },
  { id: 'sleep', name: '早睡早起', icon: '🌙', color: '#A855F7', actionLabel: '完成今日早睡' },
]
