import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/layout/PageContainer'
import { useHaptic } from '../hooks/useHaptic'
import BottomSheet from '../components/ui/BottomSheet'
import StarField from '../components/StarField'
import { getUserExpand, upsertUserExpand } from '../services/userExpand'
import {
  GRADIENTS,
  getGradient,
  dailyPoem,
  randomQuote,
  computeLifeRing,
  computeGranularity,
  buildWeekGrid,
  daysUntil,
  DEFAULT_LIFE_EXPECTANCY,
  type LifeData,
  type LifeGoal,
} from '../data/lifeProgress'

/* 数字滚动（老虎机效果） */
function RollNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const dur = 900
    const from = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className={className}>{display}</span>
}

/* 生命大环 */
function LifeRing({ percent, age }: { percent: number; age: number }) {
  const size = 224
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - percent / 100)
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="lifeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD56B" />
            <stop offset="100%" stopColor="#FF8A5B" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#lifeGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="font-mono font-bold text-ink text-4xl tabular-nums">{percent.toFixed(1)}%</div>
        <div className="text-ink/45 text-xs mt-1">已走过的人生</div>
        <div className="text-ink/55 text-xs mt-1">
          约 <span className="font-mono">{age.toFixed(1)}</span> 岁
        </div>
      </div>
    </div>
  )
}

/* 单条时间粒度进度条 */
function GranBar({ label, value, gradient }: { label: string; value: number; gradient: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 text-ink/55 text-xs shrink-0">{label}</div>
      <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: gradient, transition: 'width 0.8s ease-out' }}
        />
      </div>
      <div className="w-11 text-right font-mono text-xs text-ink/60 tabular-nums">{value.toFixed(0)}%</div>
    </div>
  )
}

/* 单次倒计时卡片 */
function GoalCard({ goal, onRemove }: { goal: LifeGoal; onRemove: (id: string) => void }) {
  const haptic = useHaptic()
  const left = daysUntil(goal.date)
  const g = getGradient(goal.gradient)
  const grad = `linear-gradient(135deg, ${g.from}, ${g.to})`
  const expired = left < 0
  const today = left === 0

  return (
    <div
      className="rounded-3xl p-4 shadow-soft text-white relative overflow-hidden"
      style={{ background: grad }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">{goal.emoji || '🎯'}</span>
          <span className="font-semibold text-lg truncate drop-shadow-sm">{goal.name}</span>
        </div>
        <button
          className="text-white/70 text-xs shrink-0 active:scale-90"
          onClick={() => {
            haptic()
            onRemove(goal.id)
          }}
        >
          删除
        </button>
      </div>
      <div className="mt-3 flex items-end gap-1">
        <RollNumber value={Math.abs(left)} className="font-mono font-bold text-5xl leading-none tabular-nums" />
        <span className="mb-1 text-sm drop-shadow-sm">
          {today ? '就是今天' : expired ? '天前' : '天后'}
        </span>
      </div>
      <div className="text-white/80 text-xs mt-1">
        {today ? '今天，值得好好记住 🌟' : expired ? `已于 ${goal.date} 抵达` : `约定在 ${goal.date}`}
      </div>
    </div>
  )
}

export default function LifeProgress() {
  const navigate = useNavigate()
  const haptic = useHaptic()
  const [extras, setExtras] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(new Date())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pullQuote, setPullQuote] = useState<string | null>(null)
  const pullStartY = useRef(0)
  const pulling = useRef(false)

  // 下拉彩蛋：在页面顶部继续下拉时，浮现一句随机名言（不做刷新同步）
  function onPullStart(e: TouchEvent) {
    if (window.scrollY <= 0) {
      pullStartY.current = e.touches[0].clientY
      pulling.current = true
    } else {
      pulling.current = false
    }
  }
  function onPullMove(e: TouchEvent) {
    if (!pulling.current || pullQuote) return
    const dy = e.touches[0].clientY - pullStartY.current
    if (dy > 80) {
      setPullQuote(randomQuote())
      pulling.current = false
    }
  }
  function onPullEnd() {
    pulling.current = false
    if (pullQuote) setTimeout(() => setPullQuote(null), 2600)
  }

  // 目标录入表单
  const [fName, setFName] = useState('')
  const [fEmoji, setFEmoji] = useState('🎯')
  const [fDate, setFDate] = useState('')
  const [fGrad, setFGrad] = useState(GRADIENTS[0].key)

  // 首次引导表单
  const [bBirth, setBBirth] = useState('')
  const [bExp, setBExp] = useState(DEFAULT_LIFE_EXPECTANCY)

  const life: LifeData = extras.life ?? {}
  const hasBirth = !!life.birthDate

  const ring = useMemo(
    () => (life.birthDate ? computeLifeRing(life.birthDate, life.lifeExpectancy) : null),
    [life.birthDate, life.lifeExpectancy]
  )
  const gran = useMemo(() => computeGranularity(now), [now])
  const weekCells = useMemo(
    () =>
      life.birthDate
        ? buildWeekGrid(
            life.birthDate,
            life.lifeExpectancy,
            (life.goals ?? []).map((g) => g.date)
          )
        : [],
    [life.birthDate, life.lifeExpectancy, life.goals]
  )
  const goals = useMemo(
    () => [...(life.goals ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [life.goals]
  )

  useEffect(() => {
    let active = true
    getUserExpand()
      .then((ex) => {
        if (active) setExtras(ex ?? {})
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // 「今天」进度条每秒跳动
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  async function persist(newLife: LifeData) {
    const next = { ...extras, life: newLife }
    setExtras(next)
    setSaving(true)
    try {
      await upsertUserExpand(next)
    } catch (e) {
      // 失败静默保留本地，下次再试
    } finally {
      setSaving(false)
    }
  }

  function startLife() {
    if (!bBirth) return
    haptic()
    persist({ birthDate: bBirth, lifeExpectancy: bExp, goals: [] })
  }

  function openSheet() {
    setFName('')
    setFEmoji('🎯')
    setFDate('')
    setFGrad(GRADIENTS[0].key)
    setSheetOpen(true)
  }

  function saveGoal() {
    if (!fName.trim() || !fDate) return
    haptic()
    const goal: LifeGoal = {
      id: crypto.randomUUID(),
      name: fName.trim(),
      emoji: fEmoji.trim() || '🎯',
      date: fDate,
      gradient: fGrad,
      createdAt: Date.now(),
    }
    persist({ ...life, goals: [...(life.goals ?? []), goal] })
    setSheetOpen(false)
  }

  function removeGoal(id: string) {
    persist({ ...life, goals: (life.goals ?? []).filter((g) => g.id !== id) })
  }

  if (loading) {
    return (
      <PageContainer className="max-w-md mx-auto">
        <div className="h-[60vh] flex items-center justify-center text-ink/40 text-sm">正在读取…</div>
      </PageContainer>
    )
  }

  return (
    <PageContainer className="max-w-md mx-auto">
      <div className="flex items-center gap-3 px-1 pt-2 pb-2">
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
        <div className="text-xl font-semibold text-ink">人生进度</div>
      </div>
      <div onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd}>
        {/* 星空背景 */}
        <div className="fixed inset-0 -z-10 pointer-events-none">
          <StarField count={42} />
        </div>

        {/* 下拉名言彩蛋（非刷新同步） */}
        {pullQuote && (
          <div className="mx-4 mb-2 rounded-2xl bg-white/10 backdrop-blur px-4 py-3 text-center text-ink/70 text-sm animate-[fadeIn_0.4s_ease-out]">
            ✨ {pullQuote}
          </div>
        )}

        {!hasBirth ? (
        /* 首次引导 */
        <div className="bg-surface rounded-3xl shadow-soft p-6 m-4">
          <div className="text-2xl mb-2">🌅</div>
          <h2 className="text-lg font-semibold text-ink">先记住你来到这天的日子</h2>
          <p className="text-ink/50 text-sm mt-1 mb-5">
            填好之后，这里会慢慢长出属于你的进度。数据只存在你自己的账户里。
          </p>
          <label className="block text-ink/60 text-sm mb-1">生日</label>
          <input
            type="date"
            value={bBirth}
            onChange={(e) => setBBirth(e.target.value)}
            className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-ink outline-none focus:ring-2 focus:ring-amber-300"
          />
          <label className="block text-ink/60 text-sm mb-1 mt-4">
            期望旅程长度（年，默认 {DEFAULT_LIFE_EXPECTANCY}）
          </label>
          <input
            type="number"
            min={1}
            max={120}
            value={bExp}
            onChange={(e) => setBExp(Number(e.target.value) || DEFAULT_LIFE_EXPECTANCY)}
            className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-ink outline-none focus:ring-2 focus:ring-amber-300"
          />
          <button
            disabled={!bBirth || saving}
            onClick={startLife}
            className="w-full mt-6 rounded-2xl bg-gradient-to-r from-amber-400 to-rose-400 text-white font-semibold py-3 active:scale-[0.99] disabled:opacity-40"
          >
            {saving ? '保存中…' : '开始这段旅程'}
          </button>
        </div>
      ) : (
        <div className="px-4 pb-28 space-y-5">
          {/* 模块1：生命大环 */}
          <div className="bg-surface rounded-3xl shadow-soft p-6 text-center">
            {ring ? (
              <>
                <LifeRing percent={ring.percent} age={ring.age} />
                <p className="text-ink/55 text-sm mt-4 px-2 leading-relaxed">{dailyPoem()}</p>
                <p className="text-ink/35 text-xs mt-2">
                  一生约 {ring.totalDays.toLocaleString('zh-CN')} 天，已走过 {ring.livedDays.toLocaleString('zh-CN')} 天
                </p>
              </>
            ) : (
              <p className="text-ink/40 text-sm py-8">生日信息有些小问题，去重新填一下吧～</p>
            )}
          </div>

          {/* 模块2：时间粒度进度条 */}
          <div className="bg-surface rounded-3xl shadow-soft p-5 space-y-3">
            <div className="text-ink/70 text-sm font-medium mb-1">时间的刻度</div>
            <GranBar label="今年" value={gran.year} gradient="linear-gradient(90deg,#FFD56B,#FF9F45)" />
            <GranBar label="本月" value={gran.month} gradient="linear-gradient(90deg,#FFB347,#FF6A88)" />
            <GranBar label="本周" value={gran.week} gradient="linear-gradient(90deg,#43E97B,#38F9D9)" />
            <GranBar label="今天" value={gran.day} gradient="linear-gradient(90deg,#A1C4FD,#C2E9FB)" />
          </div>

          {/* 模块3：生命刻度 */}
          <div className="bg-surface rounded-3xl shadow-soft p-5">
            <div className="text-ink/70 text-sm font-medium mb-1">生命刻度</div>
            <p className="text-ink/40 text-xs mb-3">每一格是一周。金色的是已经走过的路。</p>
            <div className="overflow-x-auto" style={{ overscrollBehavior: 'contain' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(52, 9px)',
                  gap: '3px',
                  width: 'max-content',
                }}
              >
                {weekCells.map((cell) => (
                  <div
                    key={cell.index}
                    title={`第 ${cell.index + 1} 周`}
                    className="rounded-[2px]"
                    style={{
                      width: 9,
                      height: 9,
                      background: cell.lived
                        ? 'linear-gradient(135deg,#FFD56B,#FF8A5B)'
                        : 'rgba(255,255,255,0.10)',
                      outline: cell.isGoal ? '1.5px solid #fff' : 'none',
                      outlineOffset: '1px',
                    }}
                  />
                ))}
              </div>
            </div>
            <p className="text-ink/35 text-[11px] mt-3">左右滑动，看看这一生有多长 🌿</p>
          </div>

          {/* 模块4：目标倒计时 */}
          <div>
            <div className="text-ink/70 text-sm font-medium px-1 mb-2">在等的那些日子</div>
            {goals.length === 0 ? (
              <div className="bg-surface/60 rounded-3xl p-6 text-center text-ink/40 text-sm">
                还没有在等的事。点右下角的金色按钮，加一个吧 🌟
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((g) => (
                  <GoalCard key={g.id} goal={g} onRemove={removeGoal} />
                ))}
              </div>
            )}
          </div>

          {/* 悬浮金色圆按钮 */}
          <button
            onClick={() => {
              haptic()
              openSheet()
            }}
            className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+84px)] w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 shadow-lg flex items-center justify-center text-white text-3xl active:scale-90 z-20"
            aria-label="新增目标"
          >
            +
          </button>
        </div>
      )}
      </div>

      {/* 目标录入 BottomSheet */}
      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="在等哪一天">
        <div className="space-y-4 pb-2">
          <div>
            <label className="block text-ink/60 text-sm mb-1">名字</label>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="比如：去看海"
              className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-ink outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-ink/60 text-sm mb-1">图标</label>
              <input
                value={fEmoji}
                onChange={(e) => setFEmoji(e.target.value)}
                placeholder="🎯"
                className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-ink outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div className="w-32">
              <label className="block text-ink/60 text-sm mb-1">日期</label>
              <input
                type="date"
                value={fDate}
                onChange={(e) => setFDate(e.target.value)}
                className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-ink outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>
          <div>
            <label className="block text-ink/60 text-sm mb-2">颜色</label>
            <div className="flex gap-2">
              {GRADIENTS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setFGrad(g.key)}
                  className="w-9 h-9 rounded-full active:scale-90"
                  style={{
                    background: `linear-gradient(135deg, ${g.from}, ${g.to})`,
                    outline: fGrad === g.key ? '2px solid #fff' : 'none',
                    outlineOffset: '2px',
                    boxShadow: fGrad === g.key ? '0 0 0 2px rgba(0,0,0,0.15)' : 'none',
                  }}
                  aria-label={g.name}
                />
              ))}
            </div>
          </div>
          <button
            disabled={!fName.trim() || !fDate}
            onClick={saveGoal}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-rose-400 text-white font-semibold py-3 active:scale-[0.99] disabled:opacity-40"
          >
            记下这一天
          </button>
        </div>
      </BottomSheet>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </PageContainer>
  )
}
