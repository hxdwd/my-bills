import { useCallback } from 'react'

// 轻量触觉反馈：在支持的移动设备上触发一次短震动。无设备则静默。
export function useHaptic() {
  return useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10)
      }
    } catch {
      // 忽略不支持的环境
    }
  }, [])
}
