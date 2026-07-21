import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/layout/PageContainer'
import { useHaptic } from '../hooks/useHaptic'

interface EasterEggItem {
  key: string
  title: string
  desc: string
  emoji: string
  to: string
  soon?: boolean
}

const EASTER_EGGS: EasterEggItem[] = [
  {
    key: 'life',
    title: '人生进度',
    desc: '看一看，你在这趟旅程里，走到了哪里。',
    emoji: '🌅',
    to: '/easterEgg/life',
  },
]

export default function EasterEgg() {
  const navigate = useNavigate()
  const haptic = useHaptic()
  const [mounted, setMounted] = useState(false)

  // 入场滑入
  setTimeout(() => setMounted(true), 10)

  return (
    <PageContainer className="max-w-md mx-auto">
      <div className="flex items-center gap-3 px-1 pt-2 pb-3">
        <button
          className="w-9 h-9 -ml-1 flex items-center justify-center rounded-full bg-surface text-ink/70 active:scale-95"
          onClick={() => {
            haptic()
            navigate(-1)
          }}
          aria-label="返回"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="text-xl font-semibold text-ink">彩蛋</div>
      </div>
      <div
        className="transition-all duration-500 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(16px)',
        }}
      >
        <p className="text-ink/50 text-sm mb-4 px-1">
          一些藏在角落里的小温柔，愿你偶尔遇见，会心一笑。
        </p>

        <div className="space-y-3">
          {EASTER_EGGS.map((item, i) => (
            <button
              key={item.key}
              onClick={() => {
                haptic()
                navigate(item.to)
              }}
              className="w-full text-left bg-surface rounded-3xl shadow-soft p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
              style={{
                transitionDelay: `${i * 60}ms`,
                animation: mounted ? `easterEggIn 0.5s ${i * 60}ms both` : 'none',
              }}
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 flex items-center justify-center text-3xl shrink-0">
                {item.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-ink">{item.title}</span>
                  {item.soon && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50">
                      筹备中
                    </span>
                  )}
                </div>
                <p className="text-ink/50 text-sm mt-0.5 truncate">{item.desc}</p>
              </div>
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-ink/30 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes easterEggIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </PageContainer>
  )
}
