import { useRef, useState, useEffect, useCallback } from 'react'

interface WheelPickerProps {
  /** 可选项列表 */
  items: (string | number)[]
  /** 当前选中值的索引 */
  value: number
  /** 选中变化回调 */
  onChange: (index: number) => void
  /** 单行高度 px */
  itemHeight?: number
  /** 可见行数（须为奇数，默认5） */
  visibleCount?: number
}

export default function WheelPicker({
  items,
  value,
  onChange,
  itemHeight = 40,
  visibleCount = 5,
}: WheelPickerProps) {
  if (items.length === 0) return null

  const containerRef = useRef<HTMLDivElement>(null)

  // 滚动偏移量 px（0 = 第一个 item 在中间行）
  const scrollRef = useRef(value * itemHeight)
  const [renderOffset, setRenderOffset] = useState(value * itemHeight)

  // 触摸跟踪
  const touchStart = useRef<{ y: number; time: number } | null>(null)
  const lastTouch = useRef<{ y: number; time: number } | null>(null)

  // 动量动画
  const momentumVel = useRef(0)
  const rafId = useRef<number | null>(null)
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const halfVisible = Math.floor(visibleCount / 2) * itemHeight
  const maxScroll = Math.max(0, (items.length - 1) * itemHeight)

  // 外部 value 变化时同步
  useEffect(() => {
    const target = value * itemHeight
    scrollRef.current = target
    setRenderOffset(target)
    cancelMomentum()
  }, [value, itemHeight])

  const cancelMomentum = useCallback(() => {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
    momentumVel.current = 0
  }, [])

  const snap = useCallback(
    (current: number) => {
      const clamped = Math.max(0, Math.min(maxScroll, current))
      const idx = Math.round(clamped / itemHeight)
      const target = idx * itemHeight
      const final = Math.max(0, Math.min(maxScroll, target))
      scrollRef.current = final
      setRenderOffset(final)
      onChange(idx)
    },
    [maxScroll, itemHeight, onChange],
  )

  const clamp = (v: number) => Math.max(0, Math.min(maxScroll, v))

  // ── Touch ────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    cancelMomentum()
    const y = e.touches[0].clientY
    const t = Date.now()
    touchStart.current = { y, time: t }
    lastTouch.current = { y, time: t }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!lastTouch.current) return
    const currentY = e.touches[0].clientY
    const currentTime = Date.now()
    const dy = lastTouch.current.y - currentY       // 上滑 → 正
    const dt = Math.max(currentTime - lastTouch.current.time, 1)

    momentumVel.current = (dy / dt) * 16            // px/frame

    let next = scrollRef.current + dy
    next = clamp(next)                              // 硬边界，无回弹
    scrollRef.current = next
    setRenderOffset(next)
    lastTouch.current = { y: currentY, time: currentTime }
  }

  const onTouchEnd = () => {
    touchStart.current = null
    lastTouch.current = null

    if (Math.abs(momentumVel.current) > 1) {
      startMomentum()
    } else {
      snap(scrollRef.current)
    }
  }

  // ── Wheel ────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    cancelMomentum()

    let next = scrollRef.current + e.deltaY * 0.5
    next = clamp(next)
    scrollRef.current = next
    setRenderOffset(next)

    if (wheelTimer.current) clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(() => snap(scrollRef.current), 200)
  }

  // ── Momentum ─────────────────────────────────
  const startMomentum = useCallback(() => {
    const animate = () => {
      momentumVel.current *= 0.95                    // 摩擦系数

      if (Math.abs(momentumVel.current) < 0.5) {
        rafId.current = null
        snap(scrollRef.current)
        return
      }

      let next = scrollRef.current + momentumVel.current
      if (next < 0) { next = 0; momentumVel.current = 0 }
      if (next > maxScroll) { next = maxScroll; momentumVel.current = 0 }

      scrollRef.current = next
      setRenderOffset(next)
      rafId.current = requestAnimationFrame(animate)
    }
    rafId.current = requestAnimationFrame(animate)
  }, [maxScroll, snap])

  // ── Cleanup ──────────────────────────────────
  useEffect(() => {
    return () => {
      cancelMomentum()
      if (wheelTimer.current) clearTimeout(wheelTimer.current)
    }
  }, [cancelMomentum])

  // ── 3D 视觉效果 ──────────────────────────────
  const getItemVisual = (index: number) => {
    const centerPos = renderOffset + halfVisible
    const itemPos = index * itemHeight
    const dist = Math.abs(centerPos - itemPos) / halfVisible
    const t = Math.min(dist, 1)
    return {
      scale: 1 - t * 0.28,
      opacity: 1 - t * 0.75,
    }
  }

  const translateY = halfVisible - renderOffset

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
      {/* 中心高亮条 - iOS 风格椭圆胶囊 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-3/4 rounded-full pointer-events-none bg-gray-100/60 transition-all duration-200"
        style={{
          height: itemHeight + 4,
        }}
      />

      {/* 列表 */}
      <div
        className="relative w-full"
        style={{ transform: `translateY(${translateY}px)` }}
      >
        {items.map((item, index) => {
          const { scale, opacity } = getItemVisual(index)
          const isCenter = Math.abs(
            renderOffset + halfVisible - index * itemHeight
          ) < itemHeight * 0.5
          return (
            <div
              key={index}
              className="flex items-center justify-center w-full"
              style={{
                height: itemHeight,
              }}
            >
              <div className="flex items-center justify-center w-full h-full">
                <span
                  className="tabular-nums transition-all duration-200"
                  style={{
                    transform: `scale(${scale})`,
                    opacity,
                    fontWeight: isCenter ? 600 : 400,
                    fontSize: isCenter ? '18px' : '14px',
                    color: isCenter ? '#1f2937' : '#9ca3af',
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
