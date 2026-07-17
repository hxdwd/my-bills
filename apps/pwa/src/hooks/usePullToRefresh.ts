import { useState, useRef, useEffect, useCallback } from 'react'

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
  progressVisible: boolean
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
    progressVisible: false,
  })

  const pullStartY = useRef(0)
  const lastSyncTime = useRef(0)

  const setPullDistance = useCallback((d: number) => {
    setState(prev => ({ ...prev, pullDistance: d }))
  }, [])

  const reportProgress = useCallback((percent: number) => {
    setState(prev => ({ ...prev, progress: percent }))
  }, [])

  const handleSync = useCallback(async () => {
    if (Date.now() - lastSyncTime.current < minInterval) {
      setPullDistance(0)
      return
    }
    lastSyncTime.current = Date.now()

    setState(prev => ({ ...prev, syncing: true, progress: 0, progressVisible: true }))

    try {
      await onRefresh()
      setState(prev => ({ ...prev, progress: 100 }))
      await new Promise(r => setTimeout(r, 500))
      setState(prev => ({
        ...prev,
        pullDistance: 0,
        syncing: false,
        progressVisible: false,
        progress: 0,
      }))
    } catch {
      setState(prev => ({
        ...prev,
        pullDistance: 0,
        syncing: false,
        progressVisible: false,
        progress: 0,
      }))
    }
  }, [onRefresh, minInterval, setPullDistance])

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
          setPullDistance(maxPull * 0.5)
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
    progressVisible: state.progressVisible,
    isPulling: state.pullDistance > 0 || state.progressVisible,
    reportProgress,
  }
}
