import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { getUserExpandValue, upsertUserExpandValue } from '../services/userExpand'
import {
  type WishlistData,
  type WishlistItem,
  defaultWishlistData,
  DESIRE_LEVELS,
  calcCooledAt,
  calcRemainingDays,
  genWishId,
} from '../data/wishlist'
import BottomSheet from '../components/ui/BottomSheet'

// ==================== 工具函数 ====================

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ==================== 欲望等级星级组件 ====================
function DesireStars({ level, size = 16, interactive = false, onChange, colors }: {
  level: number
  size?: number
  interactive?: boolean
  onChange?: (v: number) => void
  colors?: boolean
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => {
        const active = i <= level
        const filled = colors && active ? DESIRE_LEVELS[i].color : '#D4A853'
        const empty = '#444'
        return (
          <button
            key={i}
            disabled={!interactive}
            onClick={() => onChange?.(i)}
            className={`transition-all ${interactive ? 'cursor-pointer hover:scale-125 active:scale-110' : ''} ${active && interactive ? 'scale-110' : ''}`}
            style={{ padding: 0, background: 'none', border: 'none', lineHeight: 0 }}
          >
            <svg width={size} height={size} viewBox="0 0 20 20">
              <path
                d="M10 1l2.5 5.5 6 .5-4.5 4 1.5 6L10 14.5 4.5 17l1.5-6-4.5-4 6-.5z"
                fill={active ? filled : empty}
                stroke={active ? filled : empty}
                strokeWidth="0.5"
              />
            </svg>
          </button>
        )
      })}
    </div>
  )
}

// ==================== 分类下拉 ====================
const CATEGORY_OPTIONS = [
  { value: '饮食', label: '🍜 饮食' },
  { value: '交通', label: '🚗 交通' },
  { value: '购物', label: '🛍️ 购物' },
  { value: '娱乐', label: '🎮 娱乐' },
  { value: '居家', label: '🏠 居家' },
  { value: '通讯', label: '📱 通讯' },
  { value: '教育', label: '📚 教育' },
  { value: '医疗', label: '💊 医疗' },
  { value: '人情', label: '🎁 人情' },
  { value: '其他', label: '📦 其他' },
]

// ==================== 主页面 ====================
export default function Wishlist() {
  const navigate = useNavigate()
  const [data, setData] = useState<WishlistData>(defaultWishlistData())
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  // 加载
  useEffect(() => {
    getUserExpandValue('wishlist_data')
      .then((v: any) => { if (v?.items) setData(v as WishlistData) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 持久化
  async function persist(d: WishlistData) {
    setData(d)
    await upsertUserExpandValue('wishlist_data', d).catch(() => {})
  }

  // 检查到期：cooling 且 cooledAt <= 今天的改为 ready
  const items = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return data.items.map(it => {
      if (it.status === 'cooling' && it.cooledAt <= today) {
        return { ...it, status: 'ready' as const }
      }
      return it
    })
  }, [data])

  // 分组
  const cooling = items.filter(i => i.status === 'cooling')
  const ready = items.filter(i => i.status === 'ready')
  const bought = items.filter(i => i.status === 'bought')
  const abandoned = items.filter(i => i.status === 'abandoned')

  // 统计
  const savedAmount = abandoned.reduce((s, i) => s + i.price, 0)
  const totalAdded = data.items.length
  const abandonedCount = abandoned.length
  const successRate = totalAdded > 0 ? Math.round((abandonedCount / totalAdded) * 100) : 0

  // 更新某条
  function updateItem(id: string, patch: Partial<WishlistItem>) {
    const next: WishlistData = {
      items: data.items.map(i => i.id === id ? { ...i, ...patch } as WishlistItem : i),
    }
    persist(next)
  }

  // 标记已购买
  function markBought(id: string) {
    const now = new Date().toISOString().slice(0, 10)
    updateItem(id, { status: 'bought', boughtAt: now })
  }

  // 放弃
  function markAbandon(id: string) {
    updateItem(id, { status: 'abandoned' })
  }

  // 删除
  function deleteItem(id: string) {
    persist({ items: data.items.filter(i => i.id !== id) })
  }

  // 再冷静 N 天
  function reCool(id: string, extraDays: number) {
    const it = data.items.find(i => i.id === id)
    if (!it) return
    const newCooledAt = calcCooledAt(new Date().toISOString().slice(0, 10), extraDays)
    updateItem(id, { status: 'cooling', cooledAt: newCooledAt, coolingDays: extraDays })
  }

  // === 添加物品表单状态 ===
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategory, setNewCategory] = useState('购物')
  const [newDesire, setNewDesire] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [newNote, setNewNote] = useState('')
  const [newCooling, setNewCooling] = useState(DESIRE_LEVELS[3].days)

  function resetAddForm() {
    setNewName('')
    setNewPrice('')
    setNewCategory('购物')
    setNewDesire(3)
    setNewNote('')
    setNewCooling(DESIRE_LEVELS[3].days)
  }

  async function handleAdd() {
    if (!newName.trim()) { alert('请输入物品名称'); return }
    const price = parseFloat(newPrice)
    if (isNaN(price) || price <= 0) { alert('请输入有效价格'); return }
    const today = new Date().toISOString().slice(0, 10)
    const item: WishlistItem = {
      id: genWishId(),
      name: newName.trim(),
      price,
      category: newCategory,
      icon: CATEGORY_OPTIONS.find(c => c.value === newCategory)?.label?.slice(0, 2) || '📦',
      desireLevel: newDesire,
      coolingDays: newCooling,
      addedAt: today,
      cooledAt: calcCooledAt(today, newCooling),
      status: 'cooling',
      note: newNote.trim(),
      createdAt: new Date().toISOString(),
    }
    await persist({ items: [...data.items, item] })
    resetAddForm()
    setShowAdd(false)
  }

  // 计算冷静期进度百分比
  function coolingProgress(item: WishlistItem): number {
    const total = item.coolingDays
    const remaining = calcRemainingDays(item.cooledAt)
    if (total <= 0) return 100
    return Math.min(100, Math.max(0, ((total - remaining) / total) * 100))
  }

  return (
    <div className="min-h-screen pb-8 bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-bg/85 backdrop-blur-sm">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-xl hover:bg-brand-tint transition-colors">
          <ArrowLeft size={20} className="text-ink" />
        </button>
        <h1 className="text-base font-semibold flex-1 text-ink">购物清单</h1>
        <button
          onClick={() => { resetAddForm(); setShowAdd(true) }}
          className="w-8 h-8 rounded-xl bg-surface border border-brand-tint flex items-center justify-center active:scale-95"
        >
          <Plus size={16} className="text-ink-2" />
        </button>
      </div>

      <div className="px-4 pt-2 space-y-3">
        {/* ===== 骨架屏加载 ===== */}
        {loading && (
          <>
            <div className="rounded-2xl bg-surface border border-brand-tint p-5 flex gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex-1 space-y-2">
                  <div className="h-3 w-10 rounded-full bg-brand-tint animate-pulse" />
                  <div className="h-5 w-14 rounded-md bg-brand-tint animate-pulse" />
                </div>
              ))}
            </div>
            {[1, 2].map(i => (
              <div key={i} className="rounded-2xl bg-surface border border-brand-tint p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 w-24 rounded-md bg-brand-tint animate-pulse" />
                  <div className="h-4 w-16 rounded-md bg-brand-tint animate-pulse" />
                </div>
                <div className="h-2 w-full rounded-full bg-brand-tint animate-pulse" />
              </div>
            ))}
          </>
        )}

        {/* ===== 空状态 ===== */}
        {!loading && data.items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface border border-brand-tint flex items-center justify-center mb-4">
              <ShoppingCart size={32} className="text-ink-3" />
            </div>
            <div className="text-base font-medium text-ink-2 mb-1">你的冷静区是空的</div>
            <div className="text-sm text-ink-3 mb-4">有些东西，值得等一等</div>
            <button
              onClick={() => { resetAddForm(); setShowAdd(true) }}
              className="px-5 py-2.5 rounded-xl bg-brand text-ink text-sm font-medium active:scale-95"
            >
              + 添加购物
            </button>
          </div>
        )}

        {/* ===== 有数据 ===== */}
        {!loading && data.items.length > 0 && (
          <>
            {/* 统计卡片 */}
            <div className="rounded-2xl bg-surface border border-brand-tint p-5 space-y-3">
              <div className="flex gap-3 text-center">
                <div className="flex-1">
                  <div className="text-[10px] text-ink-3 mb-1">正在冷静</div>
                  <div className="font-mono text-xl font-bold text-[#F4D77C]">{cooling.length}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5">件</div>
                </div>
                <div className="w-px bg-brand-tint" />
                <div className="flex-1">
                  <div className="text-[10px] text-ink-3 mb-1">已到期</div>
                  <div className="font-mono text-xl font-bold text-[#10B981]">{ready.length}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5">件</div>
                </div>
                <div className="w-px bg-brand-tint" />
                <div className="flex-1">
                  <div className="text-[10px] text-ink-3 mb-1">已省下</div>
                  <div className="font-mono text-xl font-bold text-danger">¥{fmtInt(savedAmount)}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5">放弃金额</div>
                </div>
              </div>
              {/* 冷静成功率进度条 */}
              <div>
                <div className="flex justify-between text-[10px] text-ink-3 mb-1">
                  <span>冷静成功率</span>
                  <span>{successRate}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-brand-tint overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${successRate}%`, background: 'linear-gradient(90deg, #F4D77C, #D4A853)' }}
                  />
                </div>
              </div>
            </div>

            {/* ===== 已到期 Ready ===== */}
            {ready.length > 0 && (
              <Section title="已到期" count={ready.length} emoji="✅">
                {ready.map(it => (
                  <WishCard key={it.id} item={it} coolingProgress={coolingProgress} onDelete={() => deleteItem(it.id)}>
                    <div className="text-xs text-ink-3 mb-2">
                      已冷静 {it.coolingDays} 天 · 它还在你的清单里，你还想要吗？
                    </div>
                    <div className="flex gap-2">
                      <ActionBtn label="记账购买" onClick={() => markBought(it.id)} primary />
                      <ActionBtn label="放弃" onClick={() => markAbandon(it.id)} />
                      <ActionBtn label="再冷静 7 天" onClick={() => reCool(it.id, 7)} />
                    </div>
                  </WishCard>
                ))}
              </Section>
            )}

            {/* ===== 正在冷却 Cooling ===== */}
            {cooling.length > 0 && (
              <Section title="正在冷却" count={cooling.length} emoji="🧊">
                {cooling.map(it => {
                  const rem = calcRemainingDays(it.cooledAt)
                  const pct = coolingProgress(it)
                  return (
                    <WishCard key={it.id} item={it} coolingProgress={coolingProgress} onDelete={() => deleteItem(it.id)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[#F4D77C] text-sm tabular-nums">{rem} 天</span>
                        <span className="text-[10px] text-ink-3">剩余冷静期</span>
                      </div>
                      <div className="h-1 rounded-full bg-brand-tint overflow-hidden mb-2">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#F4D77C' }} />
                      </div>
                      <div className="flex gap-2">
                        <ActionBtn label="提前购买" onClick={() => markBought(it.id)} />
                        <ActionBtn label="放弃" onClick={() => markAbandon(it.id)} />
                      </div>
                    </WishCard>
                  )
                })}
              </Section>
            )}

            {/* ===== 已购买 Bought ===== */}
            {bought.length > 0 && (
              <Section title="已购买" count={bought.length} emoji="🎉">
                {bought.map(it => (
                  <WishCard key={it.id} item={it} coolingProgress={coolingProgress} dim onDelete={() => deleteItem(it.id)}>
                    <div className="text-xs text-ink-3 mb-1">
                      购买于 {it.boughtAt}
                      {it.boughtPrice && it.boughtPrice < it.price && (
                        <span className="ml-2 text-ok">省了 ¥{fmt(it.price - it.boughtPrice)}</span>
                      )}
                    </div>
                  </WishCard>
                ))}
              </Section>
            )}

            {/* ===== 已放弃 Abandoned ===== */}
            {abandoned.length > 0 && (
              <Section title="已放弃" count={abandoned.length} emoji="🗑️">
                {abandoned.map(it => (
                  <WishCard key={it.id} item={it} coolingProgress={coolingProgress} dim onDelete={() => deleteItem(it.id)}>
                    <div className="text-xs text-ok">已省下 ¥{fmt(it.price)}</div>
                  </WishCard>
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {/* ===== 添加物品 BottomSheet ===== */}
      <BottomSheet isOpen={showAdd} title="加入冷静区" onClose={() => setShowAdd(false)}>
        <div className="p-4 space-y-4">
            {/* 物品名称 */}
            <div>
              <div className="text-xs text-ink-3 mb-1.5">物品名称</div>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="例如：AirPods Pro"
                className="w-full bg-bg rounded-xl px-3 py-2.5 border border-brand-tint text-ink text-sm"
                autoFocus
              />
            </div>

            {/* 价格 */}
            <div>
              <div className="text-xs text-ink-3 mb-1.5">预估价格</div>
              <input
                type="number"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-bg rounded-xl px-3 py-2.5 border border-brand-tint text-ink text-sm"
              />
            </div>

            {/* 分类 */}
            <div>
              <div className="text-xs text-ink-3 mb-1.5">分类</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setNewCategory(c.value)}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-colors ${
                      newCategory === c.value
                        ? 'bg-brand border-brand-tint text-ink font-medium'
                        : 'bg-surface border-brand-tint text-ink-3'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 欲望等级 */}
            <div>
              <div className="text-xs text-ink-3 mb-2">欲望等级</div>
              <div className="flex items-center justify-between mb-2">
                <DesireStars level={newDesire} size={28} interactive onChange={v => {
                  setNewDesire(v as any)
                  setNewCooling(DESIRE_LEVELS[v].days)
                }} colors />
                <span className="text-xs font-medium" style={{ color: DESIRE_LEVELS[newDesire].color }}>
                  {DESIRE_LEVELS[newDesire].label}
                </span>
              </div>
              <div className="flex gap-1 text-[10px] text-ink-3 justify-between">
                {[1, 2, 3, 4, 5].map(i => (
                  <span key={i} className="text-center" style={{ color: i === newDesire ? DESIRE_LEVELS[i].color : undefined }}>
                    {DESIRE_LEVELS[i].days}天
                  </span>
                ))}
              </div>
            </div>

            {/* 冷静天数 */}
            <div>
              <div className="text-xs text-ink-3 mb-1.5">冷静天数</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewCooling(Math.max(1, newCooling - 7))}
                  className="w-8 h-8 rounded-lg bg-surface border border-brand-tint flex items-center justify-center text-ink-2"
                >-7</button>
                <div className="flex-1 text-center font-mono text-sm text-ink font-medium">{newCooling} 天</div>
                <button
                  onClick={() => setNewCooling(Math.min(365, newCooling + 7))}
                  className="w-8 h-8 rounded-lg bg-surface border border-brand-tint flex items-center justify-center text-ink-2"
                >+7</button>
              </div>
            </div>

            {/* 备注 */}
            <div>
              <div className="text-xs text-ink-3 mb-1.5">为什么想买？（可选）</div>
              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="帮助冷静期后回顾..."
                className="w-full bg-bg rounded-xl px-3 py-2.5 border border-brand-tint text-ink text-sm"
              />
            </div>

            {/* 完成 */}
            <button
              onClick={handleAdd}
              className="w-full py-3 rounded-xl text-sm font-bold text-[#0F0F0F] active:scale-[0.98] transition-transform"
              style={{ backgroundColor: '#F4D77C' }}
            >
              加入冷静区
            </button>
          </div>
        </BottomSheet>
    </div>
  )
}

// ==================== 子组件 ====================

/** 分区块标题 */
function Section({ title, count, emoji, children }: { title: string; count: number; emoji: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-medium text-ink-2">{title}</span>
        <span className="text-[10px] text-ink-3">({count})</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

/** 物品卡片 */
function WishCard({ item, children, coolingProgress, dim, onDelete }: {
  item: WishlistItem
  children: React.ReactNode
  coolingProgress?: (i: WishlistItem) => number
  dim?: boolean
  onDelete?: () => void
}) {
  const lvl = DESIRE_LEVELS[item.desireLevel]
  const isReady = item.status === 'ready'
  return (
    <div
      className={`rounded-2xl border bg-surface p-4 relative ${dim ? 'opacity-50' : ''} ${
        isReady ? 'border-[#F4D77C]/50' : 'border-brand-tint'
      }`}
    >
      {/* 顶行：图标 + 名称 + 价格 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{item.icon}</span>
          <div className="min-w-0">
            <div className={`text-sm font-medium truncate text-ink ${item.status === 'abandoned' ? 'line-through' : ''}`}>
              {item.name}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <DesireStars level={item.desireLevel} size={10} colors />
              <span className="text-[10px] text-ink-3">{lvl.label}</span>
            </div>
          </div>
        </div>
        <div className="font-mono text-sm font-semibold text-ink shrink-0 ml-2">
          ¥{fmt(item.price)}
        </div>
      </div>

      {/* 冷静天数 */}
      <div className="text-[10px] text-ink-3 mb-2">
        冷静期 {item.coolingDays} 天 · {item.addedAt} 加入
      </div>

      {/* 子内容（进度条/到期提示/操作按钮） */}
      {children}

      {/* 删除 — 右下角小图标 */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute bottom-3 right-3 w-6 h-6 rounded-full flex items-center justify-center hover:bg-danger/10 transition-colors"
        >
          <Trash2 size={12} className="text-ink-3" />
        </button>
      )}
    </div>
  )
}

/** 操作小按钮 */
function ActionBtn({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors active:scale-95 ${
        primary
          ? 'text-[#0F0F0F] font-bold'
          : 'bg-surface border border-brand-tint text-ink-2'
      }`}
      style={primary ? { backgroundColor: '#F4D77C' } : undefined}
    >
      {label}
    </button>
  )
}
