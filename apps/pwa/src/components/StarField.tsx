import { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  r: number
  a: number
  va: number
  vx: number
  vy: number
}

interface Props {
  count?: number
  className?: string
}

// 金色星空粒子（≤50 点），缓慢漂浮 + 呼吸闪烁。纯装饰，不影响交互。
export default function StarField({ count = 40, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let stars: Star[] = []
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.4,
        a: Math.random() * 0.5 + 0.3,
        va: (Math.random() - 0.5) * 0.01,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
      }))
    }

    const tick = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        s.a += s.va
        if (s.a <= 0.15 || s.a >= 0.85) s.va *= -1
        s.x += s.vx
        s.y += s.vy
        if (s.x < 0) s.x = w
        if (s.x > w) s.x = 0
        if (s.y < 0) s.y = h
        if (s.y > h) s.y = 0
        const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4)
        grd.addColorStop(0, `rgba(255, 214, 120, ${s.a})`)
        grd.addColorStop(1, 'rgba(255, 214, 120, 0)')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }

    resize()
    tick()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [count])

  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%' }} />
}
