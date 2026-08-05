import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/layout/PageContainer'
import { useHaptic } from '../hooks/useHaptic'
import BottomSheet from '../components/ui/BottomSheet'
import StarField from '../components/StarField'
import { getUserExpandValue, upsertUserExpandValue } from '../services/userExpand'
import {
  GRADIENTS,
  getGradient,
  dailyPoem,
  randomQuote,
  computeLifeRing,
  computeGranularity,
  daysUntil,
  DEFAULT_LIFE_EXPECTANCY,
  type LifeData,
  type LifeGoal,
  type GoalAIData,
  type GoalAILog,
} from '../data/lifeProgress'

// 进度百分比：已走天数 / 总天数
function goalProgress(g: LifeGoal): number {
  const total = new Date(g.date).getTime() - g.createdAt
  if (total <= 0) return 0
  const elapsed = Date.now() - g.createdAt
  return Math.min(100, Math.max(0, (elapsed / total) * 100))
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

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
function GoalCard({ goal, aiData, onClick, onRemove }: {
  goal: LifeGoal
  aiData?: GoalAIData[string]
  onClick: (g: LifeGoal) => void
  onRemove: (id: string) => void
}) {
  const haptic = useHaptic()
  const left = daysUntil(goal.date)
  const g = getGradient(goal.gradient)
  const grad = `linear-gradient(135deg, ${g.from}, ${g.to})`
  const expired = left < 0
  const today = left === 0
  const done = goal.status === 'done'

  // 金色呼吸点：3天后未互动且未完成
  const showDot = !done && aiData?.lastInteractionDate
    && (new Date(todayStr()).getTime() - new Date(aiData.lastInteractionDate).getTime()) >= 3 * 86400000

  return (
    <div
      className={`rounded-3xl p-4 shadow-soft text-white relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform ${done ? 'opacity-50' : ''}`}
      style={{ background: grad }}
      onClick={() => { haptic(); onClick(goal) }}
    >
      {/* 金色呼吸点 */}
      {showDot && (
        <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-[#F4D77C] animate-pulse" />
      )}

      {/* 已完成标记 */}
      {done && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white/30 flex items-center justify-center">
          <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M3 8l4 4 6-8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">{goal.emoji || '🎯'}</span>
          <span className="font-semibold text-lg truncate drop-shadow-sm">{goal.name}</span>
        </div>
        <button
          className="text-white/70 text-xs shrink-0 active:scale-90"
          onClick={(e) => { e.stopPropagation(); haptic(); onRemove(goal.id) }}
        >
          删除
        </button>
      </div>
      <div className="mt-3 flex items-end gap-1">
        <RollNumber value={Math.abs(left)} className="font-mono font-bold text-5xl leading-none tabular-nums" />
        <span className="mb-1 text-sm drop-shadow-sm">
          {done ? '已抵达' : today ? '就是今天' : expired ? '天前' : '天后'}
        </span>
      </div>
      <div className="text-white/80 text-xs mt-1">
        {done ? `🎉 于 ${goal.date} 抵达` : today ? '今天，值得好好记住 🌟' : expired ? `已于 ${goal.date} 抵达` : `约定在 ${goal.date}`}
      </div>
      {/* 源动力锚点 */}
      {goal.vision && (
        <div className="text-white/50 text-[11px] mt-2 italic">"{goal.vision}"</div>
      )}
    </div>
  )
}

/* GoalChat 面板 */
function GoalChatPanel({
  goal, aiData, onClose, onUpdateData,
}: {
  goal: LifeGoal
  aiData: GoalAIData[string]
  onClose: () => void
  onUpdateData: (d: GoalAIData[string]) => void
}) {
  const [msgs, setMsgs] = useState<Array<{ role: 'ai' | 'user'; text: string }>>([])
  const [input, setInput] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [status, setStatus] = useState<'active' | 'done'>((goal as any).status || 'active')
  const [confirmDone, setConfirmDone] = useState(false)
  const loadedRef = useRef(false)

  const progress = goalProgress(goal)
  const recentLogs = (aiData?.logs ?? []).slice(-5)

  // 首次加载触发 AI
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    triggerAI()
  }, [])

  async function triggerAI(userMsg?: string) {
    setWaiting(true)
    try {
      if (userMsg) setMsgs(prev => [...prev, { role: 'user', text: userMsg }])
      const funcUrl = (import.meta.env.VITE_FUNCTIONS_URL || '').replace(/\/$/, '')
      const r = await fetch(`${funcUrl}/api/expend/goal-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: goal.id,
          goalName: goal.name,
          vision: goal.vision || '',
          goalDate: goal.date,
          progressPct: progress,
          lastInteractionDate: aiData?.lastInteractionDate ?? null,
          milestoneFired: aiData?.milestoneFired ?? [],
          userMessage: userMsg || undefined,
          recentLogs,
        }),
      })
      const j = await r.json()
      if (j.aiMessage) {
        setMsgs(prev => [...prev, { role: 'ai', text: j.aiMessage }])
        // 更新数据
        const t = j.type as GoalAILog['type']
        const newLog: GoalAILog = { date: todayStr(), type: t, aiPrompt: j.aiMessage, userReply: userMsg || '' }
        const updated: GoalAIData[string] = {
          lastInteractionDate: todayStr(),
          logs: [...(aiData?.logs ?? []), newLog],
          // 所有非 daily 的状态类型触发后加入去重集合，下次不再重复
          milestoneFired: t !== 'daily'
            ? [...new Set([...(aiData?.milestoneFired ?? []), t])]
            : (aiData?.milestoneFired ?? []),
        }
        onUpdateData(updated)
      }
    } catch { setMsgs(prev => [...prev, { role: 'ai', text: '稍等，我在听...' }]) }
    finally { setWaiting(false) }
  }

  function handleSend() {
    if (!input.trim() || waiting) return
    const msg = input.trim()
    setInput('')
    triggerAI(msg)
  }

  function markDone() {
    if (!confirmDone) { setConfirmDone(true); return }
    setStatus('done')
    setConfirmDone(false)
    onUpdateData({ _done: true } as any)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-3xl px-5 pt-5 pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] animate-slide-up flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="w-10 h-1 rounded-full bg-ink-3/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{goal.emoji}</span>
            <span className="font-semibold text-ink">{goal.name}</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-brand-tint text-ink-2 active:scale-95">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {/* 源动力锚点 */}
        {goal.vision && (
          <div className="text-[11px] text-ink-3 italic mb-3 px-1">"你曾说过，{goal.vision}"</div>
        )}

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto mb-3 space-y-3 min-h-[120px] max-h-[40vh]">
          {msgs.map((m, i) => (
            <div key={i} className={`text-sm leading-relaxed ${m.role === 'ai' ? 'text-ink' : 'text-ink-2 text-right'}`}>
              <span className={m.role === 'ai' ? '' : 'bg-brand-tint/60 rounded-xl px-3 py-1.5 inline-block'}>{m.text}</span>
            </div>
          ))}
          {waiting && <div className="text-ink-3 text-sm">...</div>}
        </div>

        {/* 输入框 */}
        <div className="flex gap-2 mb-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="说点什么..."
            className="flex-1 rounded-xl bg-bg px-3 py-2.5 text-sm text-ink outline-none border border-brand-tint"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || waiting}
            className="rounded-xl bg-brand px-3 py-2.5 text-sm text-ink font-medium disabled:opacity-40 active:scale-95"
          >
            发送
          </button>
        </div>

        {/* 状态切换器 */}
        <div className="flex gap-2">
          <button
            onClick={() => { setStatus('active'); setConfirmDone(false) }}
            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${status === 'active' ? 'bg-brand-tint text-ink' : 'bg-bg text-ink-3'}`}
          >
            💪 正在努力
          </button>
          <button
            onClick={markDone}
            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${status === 'done' ? 'bg-brand-tint text-ink' : 'bg-bg text-ink-3'}`}
          >
            {confirmDone ? '确认抵达？' : '🎉 已抵达'}
          </button>
        </div>
        {confirmDone && (
          <div className="text-center text-[10px] text-ink-3 mt-1">再点一次确认，这一刻会被好好记住</div>
        )}
      </div>
    </>
  )
}

export default function LifeProgress() {
  const navigate = useNavigate()
  const haptic = useHaptic()
  const [life, setLife] = useState<LifeData>({
    birthDate: '',
    lifeExpectancy: DEFAULT_LIFE_EXPECTANCY,
    goals: [],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(new Date())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pullQuote, setPullQuote] = useState<string | null>(null)
  const pullStartY = useRef(0)
  const pulling = useRef(false)
  // GoalChat
  const [chatGoal, setChatGoal] = useState<LifeGoal | null>(null)
  const [aiData, setAiData] = useState<GoalAIData>({})
  // 状态切换回调
  const handleGoalStatusChange = (goalId: string, status: 'active' | 'done') => {
    const updated = (life.goals ?? []).map(g => g.id === goalId ? { ...g, status } : g)
    persist({ ...life, goals: updated })
  }

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
  const [fVision, setFVision] = useState('')

  // 首次引导表单
  const [bBirth, setBBirth] = useState('')
  const [bExp, setBExp] = useState(DEFAULT_LIFE_EXPECTANCY)

  const hasBirth = !!life.birthDate

  const ring = useMemo(
    () => (life.birthDate ? computeLifeRing(life.birthDate, life.lifeExpectancy) : null),
    [life.birthDate, life.lifeExpectancy]
  )
  const gran = useMemo(() => computeGranularity(now), [now])
  const goals = useMemo(
    () => [...(life.goals ?? [])].sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? -1 : 1
      return a.date.localeCompare(b.date)
    }),
    [life.goals]
  )

  useEffect(() => {
    let active = true
    // 首次访问：key='life_data' 无记录时返回 null，兜底为默认空生命数据
    getUserExpandValue('life_data')
      .then((v: any) => {
        if (!active) return
        setLife({
          birthDate: v?.birthDate ?? '',
          lifeExpectancy: v?.lifeExpectancy ?? DEFAULT_LIFE_EXPECTANCY,
          goals: v?.goals ?? [],
        })
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    // 加载 goal_ai_data
    getUserExpandValue('goal_ai_data')
      .then((v: any) => { if (active) setAiData(v ?? {}) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // 「今天」进度条每秒跳动
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  async function persist(newLife: LifeData) {
    setLife(newLife)
    setSaving(true)
    try {
      // 原子 upsert：仅覆盖 key='life_data' 这一行，不影响其它 key
      await upsertUserExpandValue('life_data', newLife)
    } catch (e) {
      // 失败静默保留本地，下次再试
    } finally {
      setSaving(false)
    }
  }

  async function persistAIData(d: GoalAIData) {
    setAiData(d)
    try { await upsertUserExpandValue('goal_ai_data', d) } catch {}
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
    setFVision('')
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
      vision: fVision.trim() || undefined,
      status: 'active',
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
        <div className="px-4 pb-10 space-y-5">
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

          {/* 模块3：目标倒计时 */}
          <div>
            <div className="text-ink/70 text-sm font-medium px-1 mb-2">在等的那些日子</div>
            {goals.length === 0 ? (
              <div className="bg-surface/60 rounded-3xl p-6 text-center text-ink/40 text-sm">
                还没有在等的事。点下面的按钮，加一个吧 🌟
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((g) => (
                  <GoalCard key={g.id} goal={g} aiData={aiData[g.id]} onClick={(g) => setChatGoal(g)} onRemove={removeGoal} />
                ))}
              </div>
            )}
          </div>

          {/* 页面底部添加按钮（非悬浮，随页面滚动） */}
          <div className="flex justify-center pt-1">
            <button
              onClick={() => {
                haptic()
                openSheet()
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 shadow flex items-center justify-center text-white text-2xl active:scale-90"
              aria-label="新增目标"
            >
              +
            </button>
          </div>
        </div>
      )}
      </div>

      {/* 目标录入 BottomSheet */}
      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="在等哪一天">
        <div className="px-5 space-y-4 pb-5">
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
          <div>
            <label className="block text-ink/60 text-sm mb-1">
              如果这一天真的来了，你最想看到的画面是？
            </label>
            <textarea
              value={fVision}
              onChange={(e) => setFVision(e.target.value)}
              placeholder="比如：和家人坐在新家的阳台上看夕阳..."
              maxLength={100}
              rows={2}
              className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-ink text-sm outline-none focus:ring-2 focus:ring-amber-300 resize-none"
            />
            <div className="text-ink-3 text-[10px] mt-0.5 text-right">{fVision.length}/100</div>
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

      {/* GoalChat */}
      {chatGoal && (
        <GoalChatPanel
          goal={chatGoal}
          aiData={aiData[chatGoal.id] || {}}
          onClose={() => { setChatGoal(null) }}
          onUpdateData={(d) => {
            const updated = { ...aiData, [chatGoal.id]: d }
            persistAIData(updated)
            // 如果标记为 done，同时更新 goal
            if ((d as any)._done) handleGoalStatusChange(chatGoal.id, 'done')
          }}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </PageContainer>
  )
}
