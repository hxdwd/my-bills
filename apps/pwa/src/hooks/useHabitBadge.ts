import { useState, useEffect } from 'react'
import { HABITS } from '../types/habit'
import { currentMonth, getHabitCheckedMap } from '../db/habitStore'

/**
 * 检查今天是否所有习惯都完成了。
 *
 * 注：原先还返回 `anyHabitEnabled`，但它是用 `results.length > 0` 算出来的，
 * 而 `results` 恒等于 `HABITS` 的长度 → **永远为 true**；且全仓库无任何消费方
 * （Home 只取 `allDone`）。"恒真且没人用"的字段只会误导后来者，故直接移除。
 */
export function useHabitAllDone(): { allDone: boolean | null } {
  const [allDone, setAllDone] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    async function check() {
      try {
        // 一次请求读全部习惯的当月日志（原实现是每个习惯各发一次请求）
        const map = await getHabitCheckedMap(HABITS.map(h => h.id), currentMonth())
        if (active) setAllDone(HABITS.every(h => map[h.id] ?? false))
      } catch {
        if (active) setAllDone(null)
      }
    }
    check()
    return () => { active = false }
  }, [])

  return { allDone }
}
