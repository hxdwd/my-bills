// 魔性打卡 — 主页面
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useHaptic } from '../hooks/useHaptic'
import { getHabitMeta, getHabitLog, recordHabit, isHabitChecked } from '../db/habitStore'
import { HABITS, type HabitDef, type HabitMeta } from '../types/habit'

// —— 常量 ——
const BRAND = '#F4D77C'
const TODAY_BORDER = '#F43F5E'

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function monthStr(d: Date): string {
  return toLocalDateStr(d).slice(0, 7)
}

// —— 打卡成功动画 ——
function CelebrationOverlay({ streak, habitName }: { streak: number; habitName: string }) {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 2500)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="celebration-box">
        <div className="text-6xl mb-3">🔥</div>
        <div className="text-2xl font-extrabold text-white">
          连续 {streak} 天！
        </div>
        <div className="text-sm text-white/70 mt-1">
          {habitName}，你比昨天更棒了！
        </div>
      </div>
      <style>{`
        .celebration-box {
          background: rgba(34,34,34,0.92);
          border: 2px solid ${BRAND};
          border-radius: 24px;
          padding: 32px 40px;
          text-align: center;
          animation: celebrationIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          box-shadow: 0 0 40px rgba(244, 215, 124, 0.3);
        }
        @keyframes celebrationIn {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// —— 月度热力图 ——
function MonthHeatmap({ habitId, refreshKey }: { habitId: string; refreshKey: number }) {
  const [log, setLog] = useState<Record<string, boolean>>({})
  const today = toLocalDateStr(new Date())
  const month = monthStr(new Date())

  useEffect(() => {
    getHabitLog(habitId, month).then(setLog).catch(() => {})
  }, [habitId, month, refreshKey])

  const now = new Date()
  const year = now.getFullYear()
  const mon = now.getMonth()
  const firstDay = new Date(year, mon, 1).getDay()
  const daysInMonth = new Date(year, mon + 1, 0).getDate()

  const cells: (null | number)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-ink-2">本月打卡</span>
        <span className="text-xs text-ink-2">{year}年{mon + 1}月</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
          <div key={w} className="text-center text-[10px] text-ink-2/50 py-0.5">{w}</div>
        ))}
        {cells.map((d, idx) => {
          if (d === null) return <div key={`e${idx}`} />
          const ds = toLocalDateStr(new Date(year, mon, d))
          const checked = !!log[ds]
          const isToday = ds === today
          return (
            <div
              key={ds}
              className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-mono ${
                checked ? 'text-ink font-bold' : 'text-ink-2/40'
              }`}
              style={{
                background: checked ? BRAND : undefined,
                border: isToday && !checked ? `1px solid ${TODAY_BORDER}` : 'none',
                animation: isToday && !checked ? 'pulseBorder 1.5s ease-in-out infinite' : 'none',
              }}
            >
              {checked ? '✓' : d}
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes pulseBorder {
          0%, 100% { border-color: ${TODAY_BORDER}; }
          50% { border-color: rgba(244, 63, 94, 0.3); }
        }
      `}</style>
    </div>
  )
}

// —— 习惯卡片 ——
function HabitCard({
  habit,
  meta,
  checked,
  onCheck,
}: {
  habit: HabitDef
  meta: HabitMeta | null
  checked: boolean
  onCheck: (habit: HabitDef) => void
}) {
  const haptic = useHaptic()
  const streak = meta?.streak ?? 0
  const milestone7 = streak >= 7
  const milestone30 = streak >= 30

  const handleClick = () => {
    if (checked) return
    haptic()
    onCheck(habit)
  }

  return (
    <div
      className={`rounded-2xl p-5 mb-3 bg-surface shadow-soft ${milestone30 ? 'habit-gold-glow' : ''}`}
      style={{
        background: milestone30 ? `linear-gradient(135deg, ${BRAND}15, var(--tw-bg-surface, #FFFFFF))` : undefined,
        border: milestone7 ? `1.5px solid ${BRAND}60` : '1.5px solid transparent',
      }}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl">{habit.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink text-lg">{habit.name}</div>
          <div className="text-sm font-mono" style={{ color: BRAND }}>
            {streak > 0 ? `🔥 ${streak} 天` : '还没开始'}
          </div>
        </div>

        {/* 打卡状态 */}
        {checked ? (
          <div className="flex items-center justify-center w-14 h-12 shrink-0">
            <span className="text-2xl" style={{ color: BRAND }}>✅</span>
          </div>
        ) : (
          <button
            onClick={handleClick}
            className="flex flex-col items-center gap-1 shrink-0 w-14"
            aria-label={habit.actionLabel}
          >
            <div className="w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center breathing-circle"
              style={{ borderColor: `${habit.color}80` }}
            >
              <span className="text-xl text-ink-2/40">◯</span>
            </div>
            <span className="text-[10px] text-ink-2 leading-tight text-center">{habit.actionLabel}</span>
          </button>
        )}
      </div>

      {/* 7天+ 里程碑 */}
      {milestone7 && (
        <div className="mt-3 text-xs" style={{ color: BRAND }}>
          👑 {streak >= 30 ? '👑 超越 99% 的用户！' : streak >= 14 ? '连续两周！势不可挡' : '连续一周！渐入佳境'}
        </div>
      )}
    </div>
  )
}

// —— 主页面 ——
export default function HabitCheckin() {
  const navigate = useNavigate()
  const haptic = useHaptic()
  const [metas, setMetas] = useState<Record<string, HabitMeta | null>>({})
  const [checkedToday, setCheckedToday] = useState<Record<string, boolean>>({})
  const [celebration, setCelebration] = useState<{ streak: number; habitName: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const m: Record<string, HabitMeta | null> = {}
    const c: Record<string, boolean> = {}
    try {
      for (const h of HABITS) {
        m[h.id] = await getHabitMeta(h.id)
        c[h.id] = await isHabitChecked(h.id)
      }
    } catch {
      // Supabase 调用失败时仍正常渲染，数据为空
    }
    setMetas(m)
    setCheckedToday(c)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  // 手动打卡
  const handleCheck = useCallback(async (habit: HabitDef) => {
    const isFirst = await recordHabit(habit.id)
    if (isFirst) {
      const meta = await getHabitMeta(habit.id)
      setCelebration({ streak: meta?.streak ?? 1, habitName: habit.name })
      setRefreshKey((k) => k + 1)
    }
  }, [])

  // 最强连胜
  const bestStreak = Math.max(0, ...Object.values(metas).map((m) => m?.streak ?? 0))
  const bestHabit = HABITS.find((h) => (metas[h.id]?.streak ?? 0) === bestStreak)
  const maxEver = Math.max(0, ...Object.values(metas).map((m) => m?.maxStreak ?? 0))

  // 今日是否全部��成（用于红点提示）
  const allDone = HABITS.every((h) => checkedToday[h.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-ink-2">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3 sticky top-0 z-40 bg-bg/80 backdrop-blur-xl">
        <button
          onClick={() => { haptic(); navigate(-1) }}
          className="w-9 h-9 -ml-1 flex items-center justify-center rounded-full bg-brand-tint text-ink-2 active:scale-95"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-lg font-semibold text-ink">魔性打卡</span>
        <div className="w-9" />
      </div>

      <div className="px-4 pb-10 space-y-5">

        {/* 顶部总览卡片 */}
        <div className="rounded-3xl p-6 text-center bg-surface shadow-soft">
          <div className="text-sm text-ink-2 mb-1">🔥 最强习惯</div>
          <div className="text-5xl font-extrabold font-mono" style={{ color: BRAND }}>
            {bestStreak > 0 ? bestStreak : '—'}
          </div>
          <div className="text-sm text-ink-2 mt-1">
            {bestStreak > 0 && bestHabit ? `${bestHabit.icon} ${bestHabit.name}` : '开始打卡吧'}
          </div>
          {maxEver > 0 && (
            <div className="text-xs text-ink-2/50 mt-2">💪 历史最高纪录：{maxEver} 天</div>
          )}
        </div>

        {/* 今日状态提示 */}
        {!allDone && (
          <div className="rounded-2xl px-4 py-3 text-sm bg-brand-tint" style={{ color: BRAND }}>
            ⚡ 今天还有习惯未完成，小精灵在线等～
          </div>
        )}

        {/* 习惯卡片 */}
        <div>
          {HABITS.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              meta={metas[habit.id]}
              checked={checkedToday[habit.id]}
              onCheck={handleCheck}
            />
          ))}
        </div>

        {/* 月度热力图 */}
        <div className="rounded-2xl p-4 bg-surface shadow-soft">
          <MonthHeatmap habitId="diet" refreshKey={refreshKey} />
        </div>

      </div>

      {/* 打卡成功动画 */}
      {celebration && (
        <CelebrationOverlay
          streak={celebration.streak}
          habitName={celebration.habitName}
        />
      )}

      {/* 全局样式 */}
      <style>{`
        .breathing-circle {
          animation: breathe 2s ease-in-out infinite;
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        .habit-gold-glow {
          animation: goldGlow 3s ease-in-out infinite;
        }
        @keyframes goldGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(244, 215, 124, 0.1); }
          50% { box-shadow: 0 0 30px rgba(244, 215, 124, 0.25); }
        }
      `}</style>
    </div>
  )
}
