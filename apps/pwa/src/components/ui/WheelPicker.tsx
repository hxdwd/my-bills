import { useRef, useState, useEffect, useCallback } from 'react'

interface WheelPickerProps {
  items: (string | number)[]
  value: number
  onChange: (index: number) => void
  itemHeight?: number
  visibleCount?: number
}

export default function WheelPicker({
  items,
  value,
  onChange,
  itemHeight = 32,
  visibleCount = 5,
}: WheelPickerProps) {
  if (items.length === 0) return null

  const containerRef = useRef<HTMLDivElement>(null)

  const scrollRef = useRef(value * itemHeight)
  const [renderOffset, setRenderOffset] = useState(value * itemHeight)
  // 是否正在做吸附动画（此时用 CSS transition，拖动时不用）
  const [animating, setAnimating] = useState(false)

  const touchStart = useRef<{ y: number; time: number } | null>(null)
  const lastTouch = useRef<{ y: number; time: number } | null>(null)

  const momentumVel = useRef(0)
  const rafId = useRef<number | null>(null)
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const halfVisible = Math.floor(visibleCount / 2) * itemHeight
  const maxScroll = Math.max(0, (items.length - 1) * itemHeight)
  const BOUNDARY_BOUNCE = itemHeight * 0.4 // 越过边界时允许的弹性量

  // 外部 value 变化 → 动画吸附到新位置
  useEffect(() => {
    cancelMomentum()
    const target = value * itemHeight
    scrollRef.current = Math.max(0, Math.min(maxScroll, target))
    setRenderOffset(target)
    // 若 target 超出范围，动画弹回
    if (target < 0 || target > maxScroll) {
      setAnimating(true)
      if (snapTimer.current) clearTimeout(snapTimer.current)
      snapTimer.current = setTimeout(() => {
        scrollRef.current = Math.max(0, Math.min(maxScroll, target))
        setRenderOffset(scrollRef.current)
        setAnimating(false)
      }, 16)
    }
  }, [value, itemHeight, maxScroll])

  const cancelMomentum = useCallback(() => {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
    momentumVel.current = 0
  }, [])

  const setScroll = useCallback((v: number) => {
    scrollRef.current = v
    setRenderOffset(v)
  }, [])

  const snapTo = useCallback(
    (current: number, withAnim = true) => {
      // 边界内的正常吸附
      const clamped = Math.max(0, Math.min(maxScroll, current))
      const idx = Math.round(clamped / itemHeight)
      const target = idx * itemHeight
      const final = Math.max(0, Math.min(maxScroll, target))

      if (withAnim && final !== scrollRef.current) {
        setAnimating(true)
      }
      scrollRef.current = final
      setRenderOffset(final)
      onChange(idx)

      if (withAnim) {
        if (snapTimer.current) clearTimeout(snapTimer.current)
        snapTimer.current = setTimeout(() => setAnimating(false), 350)
      }
    },
    [maxScroll, itemHeight, onChange],
  )

  // ── Touch ────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    cancelMomentum()
    setAnimating(false)
    if (snapTimer.current) { clearTimeout(snapTimer.current); snapTimer.current = null }
    const y = e.touches[0].clientY
    const t = Date.now()
    touchStart.current = { y, time: t }
    lastTouch.current = { y, time: t }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!lastTouch.current) return
    const currentY = e.touches[0].clientY
    const currentTime = Date.now()
    const dy = lastTouch.current.y - currentY
    const dt = Math.max(currentTime - lastTouch.current.time, 1)

    momentumVel.current = (dy / dt) * 16

    let next = scrollRef.current + dy

    // 边界弹性阻力：越过边界时 0.3 倍系数，允许 overscroll
    if (next < -BOUNDARY_BOUNCE) next = -BOUNDARY_BOUNCE
    else if (next < 0) next = scrollRef.current + dy * 0.3
    else if (next > maxScroll + BOUNDARY_BOUNCE) next = maxScroll + BOUNDARY_BOUNCE
    else if (next > maxScroll) next = scrollRef.current + dy * 0.3

    setScroll(next)
    lastTouch.current = { y: currentY, time: currentTime }
  }

  const onTouchEnd = () => {
    touchStart.current = null
    lastTouch.current = null

    // 如果当前在边界外，弹回
    if (scrollRef.current < 0 || scrollRef.current > maxScroll) {
      setAnimating(true)
      const target = Math.max(0, Math.min(maxScroll, scrollRef.current))
      scrollRef.current = target
      setRenderOffset(target)
      if (snapTimer.current) clearTimeout(snapTimer.current)
      snapTimer.current = setTimeout(() => setAnimating(false), 350)
      return
    }

    if (Math.abs(momentumVel.current) > 1) {
      startMomentum()
    } else {
      snapTo(scrollRef.current)
    }
  }

  // ── Wheel ────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    cancelMomentum()
    setAnimating(false)
    if (snapTimer.current) { clearTimeout(snapTimer.current); snapTimer.current = null }

    let next = scrollRef.current + e.deltaY * 0.5
    // wheel 也支持弹性越界
    if (next < -BOUNDARY_BOUNCE) next = -BOUNDARY_BOUNCE
    else if (next > maxScroll + BOUNDARY_BOUNCE) next = maxScroll + BOUNDARY_BOUNCE
    setScroll(next)

    if (wheelTimer.current) clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(() => {
      // 弹回或吸附
      const clamped = Math.max(0, Math.min(maxScroll, scrollRef.current))
      snapTo(clamped)
    }, 220)
  }

  // ── Momentum ─────────────────────────────────
  const startMomentum = useCallback(() => {
    const animate = () => {
      momentumVel.current *= 0.95

      if (Math.abs(momentumVel.current) < 0.5) {
        rafId.current = null
        snapTo(scrollRef.current)
        return
      }

      let next = scrollRef.current + momentumVel.current

      // 触边界 → 弹回
      if (next < -BOUNDARY_BOUNCE || next > maxScroll + BOUNDARY_BOUNCE) {
        momentumVel.current = 0
        rafId.current = null
        setAnimating(true)
        const target = Math.max(0, Math.min(maxScroll, next))
        scrollRef.current = target
        setRenderOffset(target)
        if (snapTimer.current) clearTimeout(snapTimer.current)
        snapTimer.current = setTimeout(() => setAnimating(false), 350)
        return
      }

      scrollRef.current = next
      setRenderOffset(next)
      rafId.current = requestAnimationFrame(animate)
    }
    rafId.current = requestAnimationFrame(animate)
  }, [maxScroll, snapTo])

  // ── Cleanup ──────────────────────────────────
  useEffect(() => {
    return () => {
      cancelMomentum()
      if (wheelTimer.current) clearTimeout(wheelTimer.current)
      if (snapTimer.current) clearTimeout(snapTimer.current)
    }
  }, [cancelMomentum])

  // ── 视觉效果 ──────────────────────────────
  // translateY = halfVisible - renderOffset 把 scroll 位置 renderOffset 的 item
  // 映射到容器视觉中心，因此视觉中心在 item 坐标中就是 renderOffset
  const getItemVisual = (index: number) => {
    const centerPos = renderOffset
    const itemPos = index * itemHeight
    const dist = Math.abs(centerPos - itemPos) / halfVisible
    const t = Math.min(dist, 1)
    return {
      scale: 1 - t * 0.28,
      opacity: 1 - t * 0.75,
    }
  }

  const isOverscrolling = scrollRef.current < 0 || scrollRef.current > maxScroll
  const translateY = halfVisible - renderOffset
  const transitionStyle = animating && !isOverscrolling
    ? 'transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)'
    : 'none'

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden select-none touch-none"
      style={{ height: visibleCount * itemHeight }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      {/* 中心高亮条 - 椭圆胶囊 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-3/4 rounded-full pointer-events-none bg-gray-100/60 transition-all duration-200"
        style={{ height: itemHeight + 4 }}
      />

      {/* 列表 */}
      <div
        className="relative w-full"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: transitionStyle,
        }}
      >
        {items.map((item, index) => {
          const { scale, opacity } = getItemVisual(index)
          const isCenter = Math.abs(
            renderOffset - index * itemHeight
          ) < itemHeight * 0.5
          return (
            <div
              key={index}
              className="flex items-center justify-center w-full"
              style={{ height: itemHeight }}
            >
              <div className="flex items-center justify-center w-full h-full">
                <span
                  className="tabular-nums"
                  style={{
                    transform: `scale(${scale})`,
                    opacity,
                    fontWeight: isCenter ? 600 : 400,
                    fontSize: isCenter ? '18px' : '14px',
                    color: isCenter ? '#1f2937' : '#9ca3af',
                    transition: animating ? 'color 0.25s, font-weight 0.25s' : 'none',
                  }}
                >
                  {item}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
