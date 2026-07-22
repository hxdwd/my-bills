import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar as CalIcon, Plus, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'
import { useHaptic } from '../hooks/useHaptic'
import {
  getDietItems,
  saveDietItems,
  getDietMonthRecords,
  appendDietRecord,
  deleteDietItem,
} from '../db/dietStore'
import type { DietControlData, DietControlItem, DietRecord, DietMonthRecords } from '../types/diet'
import BottomSheet from '../components/ui/BottomSheet'

// —— 设计常量（对齐全局品牌色）——
const BRAND = '#F4D77C'
const DANGER = '#FF6B6B'

const COLORS: { key: string; value: string; name: string }[] = [
  { key: 'gold', value: '#F4D77C', name: '金' },
  { key: 'orange', value: '#FB923C', name: '橙' },
  { key: 'pink', value: '#F472B6', name: '粉' },
  { key: 'purple', value: '#A855F7', name: '紫' },
  { key: 'blue', value: '#38BDF8', name: '蓝' },
  { key: 'green', value: '#4ECDC4', name: '绿' },
]

const EMOJI_GROUPS: { group: string; emojis: string[] }[] = [
  { group: '饮品', emojis: ['🧋', '☕', '🍺', '🥤', '🍷', '🥛', '🧉', '🍹'] },
  { group: '快餐', emojis: ['🍔', '🍟', '🍗', '🍕', '🌭', '🥡', '🍜', '🍝'] },
  { group: '甜品', emojis: ['🍰', '🍩', '🍪', '🍫', '🍬', '🧁', '🍦', '🍡'] },
]

const NAME_SUGGESTIONS = ['奶茶', '炸鸡', '火锅', '可乐', '咖啡', '蛋糕', '烧烤', '啤酒', '奶茶续命', '甜品']

// —— 时间工具 ——
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function periodRange(
  limitType: 'weekly' | 'monthly',
  base: Date = new Date()
): { start: string; end: string } {
  if (limitType === 'weekly') {
    const jsDay = base.getDay() // 0=Sun
    const weekday = (jsDay + 6) % 7 // 0=Mon
    const start = new Date(base)
    start.setDate(base.getDate() - weekday)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return { start: toLocalDateStr(start), end: toLocalDateStr(end) }
  }
  const start = new Date(base.getFullYear(), base.getMonth(), 1)
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1)
  return { start: toLocalDateStr(start), end: toLocalDateStr(end) }
}
function inRange(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr < end
}

// —— 数字翻转 ——
function NumberFlip({ value, className }: { value: number; className?: string }) {
  return (
    <span key={value} className={`inline-block diet-flip ${className ?? ''}`}>
      {value}
    </span>
  )
}

// —— 控制项卡片 ——
function DietItemCard({
  item,
  used,
  remaining,
  over,
  flash,
  onRecord,
  onCalendar,
  onEdit,
}: {
  item: DietControlItem
  used: number
  remaining: number
  over: number
  flash: boolean
  onRecord: () => void
  onCalendar: () => void
  onEdit: () => void
}) {
  const limit = item.limitCount
  const pct = limit > 0 ? Math.min(used, limit) / limit * 100 : 0
  const isOver = used > limit
  const severe = over > 5

  const tag =
    remaining > 0
      ? { bg: 'bg-brand-tint', text: `还剩 ${remaining} 次`, cls: 'text-brand-strong' }
      : remaining === 0
      ? { bg: 'bg-brand-tint', text: '已用完', cls: 'text-ink-2' }
      : { bg: 'bg-danger/10', text: `已超 ${over} 次`, cls: 'text-danger' }

  return (
    <div
      className={`bg-surface rounded-3xl shadow-soft p-5 mb-4 ${
        severe ? '!bg-danger/5' : ''
      }`}
    >
      {/* 中重度横幅 */}
      {over >= 3 && !severe && (
        <div className="mb-3 rounded-xl bg-brand-tint px-3 py-2 text-sm text-brand-strong">
          本月{item.name}已超 {over} 次，要适度哦～
        </div>
      )}
      {severe && (
        <div className="mb-3 rounded-xl bg-danger/10 px-3 py-2">
          <span className="text-sm text-danger">{item.name}自由不是真的自由 😅</span>
        </div>
      )}

      {/* 信息区 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl">{item.icon}</span>
          <span className="font-semibold text-ink truncate">{item.name}</span>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${tag.bg} ${tag.cls}`}>
          {tag.text}
        </span>
      </div>

      {/* 进度条 */}
      <div className="mt-4">
        <div className="mb-1.5 text-xs text-ink-2">
          已用 <NumberFlip value={used} className="text-ink" /> / {limit} 次
        </div>
        <div className="h-1.5 w-full rounded-full bg-brand-tint overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isOver ? 'animate-pulse' : ''
            } ${flash ? 'diet-flash' : ''}`}
            style={{
              width: `${pct}%`,
              background: isOver ? DANGER : item.color,
            }}
          />
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onRecord}
          className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-ink active:scale-[0.98] bg-brand"
        >
          + 记一次
        </button>
        <button
          onClick={onCalendar}
          className="rounded-2xl px-3 py-2.5 text-sm text-ink-2 bg-brand-tint active:scale-95"
        >
          📅 日历
        </button>
        <button
          onClick={onEdit}
          className="rounded-2xl px-3 py-2.5 text-ink-2 bg-brand-tint active:scale-95"
          aria-label="更多"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  )
}

// —— 记一次 Sheet ——
function RecordSheet({
  item,
  onConfirm,
  onClose,
}: {
  item: DietControlItem
  onConfirm: (date: string, name: string) => void
  onClose: () => void
}) {
  const [date, setDate] = useState(toLocalDateStr(new Date()))
  const [name, setName] = useState(item.name)
  return (
    <BottomSheet isOpen onClose={onClose} title={`记一次 · ${item.name}`}>
      <div className="px-5 space-y-5 pb-5">
        <div>
          <label className="block text-ink-2 text-sm mb-1">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-2xl bg-bg px-4 py-3 text-ink outline-none border border-transparent focus:ring-2 focus:ring-brand/40"
          />
        </div>
        <div>
          <label className="block text-ink-2 text-sm mb-1">吃了什么</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={item.name}
            className="w-full rounded-2xl bg-bg px-4 py-3 text-ink outline-none border border-transparent focus:ring-2 focus:ring-brand/40"
          />
        </div>
        <button
          onClick={() => onConfirm(date, name.trim() || item.name)}
          className="w-full rounded-2xl py-3 font-semibold text-ink active:scale-[0.99] bg-brand"
        >
          记下了
        </button>
      </div>
    </BottomSheet>
  )
}

// —— 日历 / 本月总览 Sheet ——
function CalendarSheet({
  items,
  loadMonth,
  onClose,
}: {
  items: DietControlItem[]
  loadMonth: (month: string) => Promise<DietMonthRecords>
  onClose: () => void
}) {
  const now = new Date()
  const [viewY, setViewY] = useState(now.getFullYear())
  const [viewM, setViewM] = useState(now.getMonth())
  const todayStr = toLocalDateStr(now)

  const colorOfItem = useCallback(
    (id: string) => items.find((i) => i.id === id)?.color ?? BRAND,
    [items]
  )

  const firstDay = new Date(viewY, viewM, 1).getDay() // 0=Sun
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const cells: (null | number)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const monthStr = `${viewY}-${String(viewM + 1).padStart(2, '0')}`
  const [monthCache, setMonthCache] = useState<Record<string, DietMonthRecords>>({})
  useEffect(() => {
    let active = true
    if (!monthCache[monthStr]) {
      loadMonth(monthStr)
        .then((recs) => {
          if (active) setMonthCache((c) => ({ ...c, [monthStr]: recs }))
        })
        .catch(() => {})
    }
    return () => {
      active = false
    }
  }, [monthStr, monthCache, loadMonth])
  const monthRecords = monthCache[monthStr] || {}
  const allRecs = useMemo(
    () => Object.entries(monthRecords).flatMap(([itemId, recs]) => recs.map((r) => ({ ...r, itemId }))),
    [monthRecords]
  )
  const totalMonth = allRecs.length
  const overTotal = items.reduce((sum, it) => {
    const recs = monthRecords[it.id] || []
    const { start, end } = periodRange(it.limitType)
    const u = it.limitType === 'monthly' ? recs.length : recs.filter((r) => inRange(r.date, start, end)).length
    return sum + Math.max(0, u - it.limitCount)
  }, 0)

  const prev = () => {
    if (viewM === 0) {
      setViewM(11)
      setViewY((y) => y - 1)
    } else setViewM((m) => m - 1)
  }
  const next = () => {
    if (viewM === 11) {
      setViewM(0)
      setViewY((y) => y + 1)
    } else setViewM((m) => m + 1)
  }

  return (
    <BottomSheet isOpen onClose={onClose} title="本月总览">
      <div className="px-5 pb-5 space-y-4">
        {/* 月份切换 */}
        <div className="flex items-center justify-between">
          <button onClick={prev} className="p-2 text-ink-2 active:scale-95 hover:bg-brand-tint rounded-full" aria-label="上个月">
            <ChevronLeft size={20} />
          </button>
          <span className="font-semibold text-ink">
            {viewY}年{viewM + 1}月
          </span>
          <button onClick={next} className="p-2 text-ink-2 active:scale-95 hover:bg-brand-tint rounded-full" aria-label="下个月">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 星期 */}
        <div className="grid grid-cols-7 text-center text-xs text-ink-2">
          {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        {/* 日期格 */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {cells.map((d, idx) => {
            if (d === null) return <div key={`e${idx}`} />
            const ds = toLocalDateStr(new Date(viewY, viewM, d))
            const isToday = ds === todayStr
            const recs = allRecs.filter((r) => r.date === ds)
            const dotColor = recs.length ? colorOfItem(recs[0].itemId) : null
            return (
              <div key={ds} className="flex flex-col items-center py-1.5">
                <span
                  className={`text-sm ${
                    isToday ? 'flex h-7 w-7 items-center justify-center rounded-full bg-brand text-ink font-semibold' : 'text-ink'
                  }`}
                >
                  {d}
                </span>
                {dotColor && (
                  <span
                    className="mt-1 rounded-full"
                    style={{
                      width: recs.length > 1 ? 8 : 5,
                      height: recs.length > 1 ? 8 : 5,
                      background: dotColor,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* 当月统计 */}
        <div className="grid grid-cols-3 gap-2 pt-2 text-center">
          <div className="rounded-xl bg-bg py-3">
            <div className="text-lg font-semibold text-ink">{totalMonth}</div>
            <div className="text-xs text-ink-2">本月共记录</div>
          </div>
          <div className="rounded-xl bg-bg py-3">
            <div className="text-lg font-semibold text-ink">{overTotal}</div>
            <div className="text-xs text-ink-2">超出额度</div>
          </div>
          <div className="rounded-xl bg-bg py-3">
            <div className="text-lg font-semibold text-ink">{Object.keys(monthRecords).length}</div>
            <div className="text-xs text-ink-2">涉及控制项</div>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}

// —— 添加 / 编辑 Sheet ——
function EditSheet({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial: DietControlItem | null
  onSave: (item: DietControlItem) => void
  onDelete?: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '🧋')
  const [iconTab, setIconTab] = useState(EMOJI_GROUPS[0].group)
  const [limitType, setLimitType] = useState<'weekly' | 'monthly'>(initial?.limitType ?? 'monthly')
  const [limitCount, setLimitCount] = useState(initial?.limitCount ?? 3)
  const [color, setColor] = useState(initial?.color ?? COLORS[0].value)
  const [showSuggest, setShowSuggest] = useState(false)

  const suggestions = NAME_SUGGESTIONS.filter((s) => s.includes(name.trim()) && name.trim())

  const save = () => {
    if (!name.trim()) return
    const item: DietControlItem = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      icon,
      limitType,
      limitCount: Math.max(1, limitCount),
      color,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }
    onSave(item)
  }

  return (
    <BottomSheet isOpen onClose={onClose} title={initial ? '编辑控制项' : '添加控制项'}>
      <div className="px-5 space-y-5 pb-5">
        {/* 名称 + 联想 */}
        <div className="relative">
          <label className="block text-ink-2 text-sm mb-1">名称</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setShowSuggest(true)
            }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            placeholder="比如：奶茶"
            className="w-full rounded-2xl bg-bg px-4 py-3 text-ink outline-none border border-transparent focus:ring-2 focus:ring-brand/40"
          />
          {showSuggest && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl bg-surface shadow-soft-lg overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setName(s)
                    setShowSuggest(false)
                  }}
                  className="block w-full px-4 py-2 text-left text-ink hover:bg-brand-tint"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 图标 */}
        <div>
          <label className="block text-ink-2 text-sm mb-2">图标</label>
          <div className="flex gap-1 mb-2">
            {EMOJI_GROUPS.map((g) => (
              <button
                key={g.group}
                onClick={() => setIconTab(g.group)}
                className={`px-3 py-1 rounded-full text-sm ${
                  iconTab === g.group ? 'bg-brand text-ink' : 'bg-bg text-ink-2'
                }`}
              >
                {g.group}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_GROUPS.find((g) => g.group === iconTab)!.emojis.map((e) => (
              <button
                key={e}
                onClick={() => setIcon(e)}
                className={`text-2xl rounded-xl py-1.5 ${
                  icon === e ? 'bg-brand/20 ring-1 ring-brand' : 'hover:bg-bg'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 周期分段 */}
        <div>
          <label className="block text-ink-2 text-sm mb-2">周期</label>
          <div className="flex rounded-2xl bg-bg p-1">
            {(['weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setLimitType(t)}
                className={`flex-1 rounded-xl py-2 text-sm ${
                  limitType === t ? 'bg-brand text-ink font-medium' : 'text-ink-2'
                }`}
              >
                {t === 'weekly' ? '每周' : '每月'}
              </button>
            ))}
          </div>
        </div>

        {/* 次数步进 */}
        <div>
          <label className="block text-ink-2 text-sm mb-2">次数</label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLimitCount((c) => Math.max(1, c - 1))}
              className="w-10 h-10 rounded-full bg-bg text-ink text-xl active:scale-90 border border-brand-tint"
            >
              −
            </button>
            <span className="text-2xl font-semibold text-ink w-8 text-center">{limitCount}</span>
            <button
              onClick={() => setLimitCount((c) => c + 1)}
              className="w-10 h-10 rounded-full bg-bg text-ink text-xl active:scale-90 border border-brand-tint"
            >
              +
            </button>
            <span className="text-ink-2 text-sm">次 / {limitType === 'weekly' ? '周' : '月'}</span>
          </div>
        </div>

        {/* 颜色 */}
        <div>
          <label className="block text-ink-2 text-sm mb-2">颜色</label>
          <div className="flex gap-3">
            {COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setColor(c.value)}
                className={`w-9 h-9 rounded-full active:scale-90 ${
                  color === c.value ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
                }`}
                style={{ background: c.value }}
                aria-label={c.name}
              />
            ))}
          </div>
        </div>

        {/* 完成 */}
        <button
          onClick={save}
          disabled={!name.trim()}
          className="w-full rounded-2xl py-3 font-semibold text-ink active:scale-[0.99] disabled:opacity-40 bg-brand"
        >
          {initial ? '保存' : '添加'}
        </button>
        {initial && onDelete && (
          <button
            onClick={() => onDelete(initial.id)}
            className="w-full rounded-2xl py-3 text-sm text-ink-2 active:scale-[0.99]"
          >
            删除这个控制项
          </button>
        )}
      </div>
    </BottomSheet>
  )
}

// —— 主页面 ——
export default function DietControl() {
  const navigate = useNavigate()
  const haptic = useHaptic()
  const [data, setData] = useState<DietControlData>({ items: [], monthRecords: {} })
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState<null | 'record' | 'calendar' | 'edit'>(null)
  const [activeItem, setActiveItem] = useState<DietControlItem | null>(null)

  const currentMonth = toLocalDateStr(new Date()).slice(0, 7)
  useEffect(() => {
    let active = true
    Promise.all([getDietItems(), getDietMonthRecords(currentMonth)])
      .then(([items, monthRecords]) => {
        if (active) setData({ items, monthRecords })
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [currentMonth])

  const addRecord = useCallback(
    (item: DietControlItem, date: string, name: string) => {
      const rec: DietRecord = { date, name: name.trim() || item.name, transactionId: null }
      const recMonth = date.slice(0, 7)
      appendDietRecord(recMonth, item.id, rec).catch(() => {})
      if (recMonth === currentMonth) {
        setData((prev) => ({
          ...prev,
          monthRecords: {
            ...prev.monthRecords,
            [item.id]: [...(prev.monthRecords[item.id] || []), rec],
          },
        }))
      }
      haptic()
      setSheet(null)
    },
    [currentMonth]
  )

  const saveItem = useCallback(
    (item: DietControlItem) => {
      setData((prev) => {
        const exists = prev.items.some((i) => i.id === item.id)
        return { ...prev, items: exists ? prev.items.map((i) => (i.id === item.id ? item : i)) : [...prev.items, item] }
      })
      setSheet(null)
      getDietItems().then((cur) => {
        const exists = cur.some((i) => i.id === item.id)
        return saveDietItems(exists ? cur.map((i) => (i.id === item.id ? item : i)) : [...cur, item])
      }).catch(() => {})
    },
    []
  )

  const deleteItem = useCallback(
    (id: string) => {
      setData((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }))
      setSheet(null)
      deleteDietItem(id).catch(() => {})
    },
    []
  )

  const cards = useMemo(
    () =>
      data.items.map((item) => {
        const { start, end } = periodRange(item.limitType)
        const recs = data.monthRecords[item.id] || []
        const used = item.limitType === 'monthly' ? recs.length : recs.filter((r) => inRange(r.date, start, end)).length
        const remaining = item.limitCount - used
        const over = Math.max(0, used - item.limitCount)
        const flash = used === item.limitCount && item.limitCount > 0
        return (
          <DietItemCard
            key={item.id}
            item={item}
            used={used}
            remaining={remaining}
            over={over}
            flash={flash}
            onRecord={() => {
              haptic()
              setActiveItem(item)
              setSheet('record')
            }}
            onCalendar={() => {
              haptic()
              setSheet('calendar')
            }}
            onEdit={() => {
              setActiveItem(item)
              setSheet('edit')
            }}
          />
        )
      }),
    [data, haptic]
  )

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3 sticky top-0 bg-bg/80 backdrop-blur-md z-40">
        <button
          onClick={() => {
            haptic()
            navigate(-1)
          }}
          className="w-9 h-9 -ml-1 flex items-center justify-center rounded-full bg-brand-tint text-ink-2 active:scale-95"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-lg font-semibold text-ink">
          饮食控制
        </span>
        <button
          onClick={() => {
            haptic()
            setSheet('calendar')
          }}
          className="flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1.5 text-sm text-ink-2 active:scale-95"
        >
          <CalIcon size={16} />
          本月总览
        </button>
      </div>

      <div className="px-4 pb-10">
        {loading ? (
          <div className="text-center text-ink-2 py-20">加载中…</div>
        ) : data.items.length === 0 ? (
          <EmptyState onAdd={() => { setActiveItem(null); setSheet('edit') }} />
        ) : (
          <>
            {cards}
            <button
              onClick={() => {
                haptic()
                setActiveItem(null)
                setSheet('edit')
              }}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-2/30 py-4 text-ink-2 active:scale-[0.99]"
            >
              <Plus size={18} /> 添加控制项
            </button>
          </>
        )}
      </div>

      {sheet === 'record' && activeItem && (
        <RecordSheet
          item={activeItem}
          onConfirm={(date, name) => addRecord(activeItem, date, name)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'calendar' && (
        <CalendarSheet items={data.items} loadMonth={getDietMonthRecords} onClose={() => setSheet(null)} />
      )}
      {sheet === 'edit' && (
        <EditSheet
          initial={activeItem}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={() => setSheet(null)}
        />
      )}

      <style>{`
        @keyframes dietFlip {
          0% { transform: rotateX(90deg); opacity: 0; }
          100% { transform: rotateX(0); opacity: 1; }
        }
        .diet-flip { animation: dietFlip 0.4s ease-out; transform-origin: center; }
        @keyframes dietFlash {
          0% { box-shadow: 0 0 0 0 rgba(244,215,124,0); }
          50% { box-shadow: 0 0 12px 3px rgba(244,215,124,0.9); }
          100% { box-shadow: 0 0 0 0 rgba(244,215,124,0); }
        }
        .diet-flash { animation: dietFlash 0.8s ease-out; }
      `}</style>
    </div>
  )
}

// —— 空状态 ——
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <svg viewBox="0 0 64 80" className="w-20 h-24 mb-6 opacity-40 text-brand" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M20 12h24l-2 8c8 4 12 12 12 22a16 16 0 0 1-32 0c0-10 4-18 12-22l-2-8z" strokeLinejoin="round" />
        <path d="M32 4v8M24 56h16" strokeLinecap="round" />
      </svg>
      <p className="text-ink-2 mb-6">还没有控制项，添加一个吧～</p>
      <button
        onClick={onAdd}
        className="rounded-2xl px-6 py-3 font-semibold text-ink active:scale-95 bg-brand"
      >
        添加控制项
      </button>
    </div>
  )
}
