import { useState, useRef, useEffect, useCallback } from 'react'

export type SyncPhase = 'idle' | 'pulling' | 'release' | 'syncing' | 'done' | 'error'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<number>
  threshold?: number
  maxPull?: number
  minInterval?: number
}

interface PullState {
  pullDistance: number
  syncing: boolean
  progress: number
  phase: SyncPhase
}

export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UsePullToRefreshOptions,
) {
  const { onRefresh, threshold = 60, maxPull = 120, minInterval = 5000 } = options

  const [state, setState] = useState<PullState>({
    pullDistance: 0,
    syncing: false,
    progress: 0,
    phase: 'idle',
  })

  const pullStartY = useRef(0)
  const lastSyncTime = useRef(0)

  const setPullDistance = useCallback((d: number) => {
    setState(prev => ({
      ...prev,
      pullDistance: d,
      phase: d >= threshold ? 'release' : d > 0 ? 'pulling' : 'idle',
    }))
  }, [threshold])

  const reportProgress = useCallback((percent: number) => {
    setState(prev => ({ ...prev, progress: percent }))
  }, [])

  const handleSync = useCallback(async () => {
    if (Date.now() - lastSyncTime.current < minInterval) {
      setPullDistance(0)
      return
    }
    lastSyncTime.current = Date.now()

    // 松手后保持半展位置，进度从 50 开始
    setState(prev => ({
      ...prev,
      syncing: true,
      progress: 50,
      phase: 'syncing',
      pullDistance: maxPull * 0.5,
    }))

    try {
      const totalPulled = await onRefresh()

      // 100% 停留 300ms
      setState(prev => ({ ...prev, progress: 100, phase: 'done' }))
      await new Promise(r => setTimeout(r, 300))

      // 回弹
      setState(prev => ({
        ...prev,
        pullDistance: 0,
        syncing: false,
        progress: 0,
        phase: 'idle',
      }))

      return totalPulled
    } catch {
      // 失败：进度条变红，保持可见
      setState(prev => ({ ...prev, phase: 'error' }))
      await new Promise(r => setTimeout(r, 1500))
      setState(prev => ({
        ...prev,
        pullDistance: 0,
        syncing: false,
        progress: 0,
        phase: 'idle',
      }))
      throw new Error('同步失败')
    }
  }, [onRefresh, minInterval, maxPull, setPullDistance])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (state.syncing) return
      if (el.scrollTop <= 0) {
        pullStartY.current = e.touches[0].clientY
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (state.syncing) return
      const dy = e.touches[0].clientY - pullStartY.current
      if (dy > 0 && el.scrollTop <= 0) {
        const damped = Math.min(dy * 0.5, maxPull)
        setPullDistance(damped)
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (state.syncing) return
      const dy = e.changedTouches[0].clientY - pullStartY.current
      if (dy > 0 && el.scrollTop <= 0) {
        if (dy > threshold) {
          handleSync()
        } else {
          setPullDistance(0)
        }
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [containerRef, state.syncing, threshold, maxPull, handleSync, setPullDistance])

  return {
    pullDistance: state.pullDistance,
    syncing: state.syncing,
    progress: state.progress,
    phase: state.phase,
    isActive: state.pullDistance > 0 || state.syncing,
    reportProgress,
  }
}
