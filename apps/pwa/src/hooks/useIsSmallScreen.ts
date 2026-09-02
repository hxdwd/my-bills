import { useState, useEffect } from 'react'

// 检测窄屏（默认 ≤375px，典型小屏手机）。
// 用于金额等长文本在小屏下切换紧凑格式（如隐藏小数位），配合 amount-fluid 类缩放字号。
export function useIsSmallScreen(breakpoint = 375): boolean {
  const [isSmall, setIsSmall] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = () => setIsSmall(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isSmall
}
