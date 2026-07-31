import { useState, useEffect } from 'react'
import { HABITS } from '../types/habit'
import { isHabitChecked } from '../db/habitStore'

/** 检查今天是否所有习惯都完成了 */
export function useHabitAllDone(): { allDone: boolean | null; anyHabitEnabled: boolean } {
  const [allDone, setAllDone] = useState<boolean | null>(null)
  const [anyHabitEnabled, setAnyHabitEnabled] = useState(false)

  useEffect(() => {
    let active = true
    async function check() {
      try {
        const results: boolean[] = []
        for (const h of HABITS) {
          results.push(await isHabitChecked(h.id))
        }
        if (active) {
          setAnyHabitEnabled(results.length > 0)
          setAllDone(results.every(Boolean))
        }
      } catch {
        if (active) setAllDone(null)
      }
    }
    check()
    return () => { active = false }
  }, [])

  return { allDone, anyHabitEnabled }
}
