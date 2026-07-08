import { useState, useMemo, useRef, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import { useAuthStore } from '../stores/useAuthStore'
import { recordTagUsage } from '../utils/tagUsage'
import Card from '../components/ui/Card'
import TransactionItem from '../components/ui/TransactionItem'
import { Modal } from '../components/ui/Modal'
import BottomSheet from '../components/ui/BottomSheet'
import { Search, X, Filter, MessageCircle, Trash2, Pencil, Check } from 'lucide-react'

// ============================================================
// 类型定义
// ============================================================

// 搜索建议的分组类型
type SuggestionKind = 'category' | 'subcategory' | 'tag' | 'note' | 'transaction'

// 顶部筛选 Chip
interface FilterChip {
  kind: 'category' | 'subcategory' | 'tag' | 'account' | 'note'
  id: string
  label: string
}

// 筛选抽屉中的条件
type TxnType = 'all' | 'expense' | 'income'
type DateRange = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'
type SortBy = 'newest' | 'oldest' | 'amount_desc' | 'amount_asc'

interface FilterState {
  type: TxnType
  accountId: string // 'all' 或具体 id
  dateRange: DateRange
  amountMin: string
  amountMax: string
  sort: SortBy
}

// 最近搜索记录（带类型标识）
interface RecentSearch {
  term: string
  type: SuggestionKind
}

// 搜索建议项
interface Suggestion {
  kind: SuggestionKind
  id: string
  label: string
  // 交易建议额外展示
  amount?: number
  icon?: string
}

const RECENT_KEY = 'mybills_recent_search'

// 类型 -> 图标 / emoji 映射
const KIND_EMOJI: Record<SuggestionKind, string> = {
  category: '🍜',
  subcategory: '🥤',
  tag: '🏷',
  note: '💬',
  transaction: '🍜',
}

// ============================================================
// 日期工具
// ============================================================

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const day = x.getDay() // 0=周日
  x.setDate(x.getDate() - day)
  return x
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1)
}
function dateInRange(dateStr: string, range: DateRange): boolean {
  if (range === 'all') return true
  const d = new Date(dateStr)
  const now = new Date()
  switch (range) {
    case 'today': return d >= startOfDay(now)
    case 'week': return d >= startOfWeek(now)
    case 'month': return d >= startOfMonth(now)
    case 'year': return d >= startOfYear(now)
    default: return true
  }
}

// ============================================================
// 主组件
// ============================================================

export default function SearchPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { transactions, categories, subCategories, tags, accounts, updateTransaction, deleteTransaction } = useApp()
  const authUser = useAuthStore(state => state.user)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [chips, setChips] = useState<FilterChip[]>([])
  const [filters, setFilters] = useState<FilterState>({
    type: 'all',
    accountId: 'all',
    dateRange: 'all',
    amountMin: '',
    amountMax: '',
    sort: 'newest',
  })
  const [showFilterModal, setShowFilterModal] = useState(false)
  // Modal 内的临时状态
  const [draftFilters, setDraftFilters] = useState<FilterState>(filters)

  // 分页（无限滚动）
  const PAGE_SIZE = 20
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // query/chips/filters 变化时重置分页
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [debouncedQuery, chips, filters])
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // 备注建议分组折叠（关键词变化时重置展开）
  const NOTE_COLLAPSE_LIMIT = 5
  const [expandedNotes, setExpandedNotes] = useState(false)
  useEffect(() => { setExpandedNotes(false) }, [query])


  // 交易详情弹窗
  const [selectedTx, setSelectedTx] = useState<typeof transactions[0] | null>(null)
  const openDetail = (t: any) => {
    setSelectedTx(t)
    setEditMode(false)
    setShowDeleteConfirm(false)
  }

  // 详情内编辑状态
  const [editMode, setEditMode] = useState(false)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editSubcategoryId, setEditSubcategoryId] = useState<string | undefined>(undefined)
  const [editAccountId, setEditAccountId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editTagIds, setEditTagIds] = useState<string[]>([])
  const [showTagSelect, setShowTagSelect] = useState(false)
  const [editPicker, setEditPicker] = useState<null | 'category' | 'subcategory' | 'account'>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 进入编辑：用选中交易预填
  const enterEdit = (t: any) => {
    setEditAmount(String(t.amount))
    setEditNote(t.note || '')
    setEditCategoryId(t.categoryId)
    setEditSubcategoryId(t.subcategoryId || undefined)
    setEditAccountId(t.accountId)
    setEditDate(t.date)
    setEditTime(t.time)
    setEditTagIds(t.tags || [])
    setEditMode(true)
  }
  // 当前编辑分类下的子分类列表
  const editSubcats = useMemo(
    () => subCategories.filter(s => s.categoryId === editCategoryId),
    [subCategories, editCategoryId]
  )
  const saveEdit = async () => {
    if (!selectedTx) return
    const newAmount = parseFloat(editAmount)
    if (isNaN(newAmount) || newAmount <= 0) return
    const newCat = categories.expense.concat(categories.income).find(c => c.id === editCategoryId)
    try {
      await updateTransaction(selectedTx.id, {
        amount: newAmount,
        note: editNote || undefined,
        categoryId: editCategoryId,
        subcategoryId: editSubcategoryId,
        accountId: editAccountId,
        date: editDate,
        time: editTime,
        tags: editTagIds,
      })
      // 同步刷新列表中的该条数据
      setSelectedTx(prev => prev ? {
        ...prev,
        amount: newAmount,
        note: editNote || '',
        categoryId: editCategoryId,
        categoryName: newCat?.name || prev.categoryName,
        categoryIcon: newCat?.icon || prev.categoryIcon,
        categoryColor: newCat?.color || prev.categoryColor,
        subcategoryId: editSubcategoryId,
        subcategoryName: editSubcategoryId ? (subCategories.find(s => s.id === editSubcategoryId)?.name || '') : '',
        accountId: editAccountId,
        accountName: accounts.find(a => a.id === editAccountId)?.name || prev.accountName,
        date: editDate,
        time: editTime,
        tags: editTagIds,
      } : prev)
      setEditMode(false)
    } catch (err) {
      console.error('更新失败:', err)
    }
  }
  const confirmDelete = async () => {
    if (!selectedTx) return
    try {
      await deleteTransaction(selectedTx.id)
      setShowDeleteConfirm(false)
      setSelectedTx(null)
    } catch (err) {
      console.error('删除失败:', err)
    }
  }
  const addEditTag = (tagId: string) => {
    if (!editTagIds.includes(tagId)) setEditTagIds(prev => [...prev, tagId])
    if (authUser) recordTagUsage(authUser.id, tagId)
  }
  const removeEditTag = (tagId: string) => setEditTagIds(prev => prev.filter(id => id !== tagId))


  // 最近搜索（localStorage 持久化）
  const [recent, setRecent] = useState<RecentSearch[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (raw) return JSON.parse(raw) as RecentSearch[]
    } catch { /* ignore */ }
    return []
  })

  const inputRef = useRef<HTMLInputElement>(null)

  // ============================================================
  // 建立内存 Map（一次构建，搜索全在内存完成）
  // ============================================================
  const categoryMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; icon: string; color: string }>()
    ;[...categories.expense, ...categories.income].forEach(c => m.set(c.id, c))
    return m
  }, [categories])

  const subCategoryMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>()
    subCategories.forEach(s => m.set(s.id, s))
    return m
  }, [subCategories])

  const tagMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>()
    tags.forEach(t => m.set(t.id, t))
    return m
  }, [tags])

  const accountMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; icon: string }>()
    accounts.forEach(a => m.set(a.id, a))
    return m
  }, [accounts])

  // ============================================================
  // 防抖：输入停止 200ms 后执行搜索
  // ============================================================
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(t)
  }, [query])

  // ============================================================
  // 关键词匹配：交易文本是否包含 q
  // ============================================================
  const matchQuery = (t: any, q: string): boolean => {
    if (!q) return true
    const ql = q.toLowerCase()
    const tagNames = (t.tags || []).map((id: string) => tagMap.get(id)?.name || '').join(' ')
    const fields = [
      categoryMap.get(t.categoryId)?.name || '',
      t.subcategoryId ? (subCategoryMap.get(t.subcategoryId)?.name || '') : '',
      t.note || '',
      t.accountName || '',
      tagNames,
      String(t.amount),
      t.transactionDate,
    ]
    return fields.some(f => f.toLowerCase().includes(ql))
  }

  // ============================================================
  // 筛选条件（filters + chips）应用到交易
  // ============================================================
  const applyFilters = (t: any): boolean => {
    // 类型
    if (filters.type !== 'all' && t.type !== filters.type) return false
    // 账户
    if (filters.accountId !== 'all' && t.accountId !== filters.accountId) return false
    // 日期
    if (!dateInRange(t.transactionDate, filters.dateRange)) return false
    // 金额区间
    const min = filters.amountMin === '' ? null : Number(filters.amountMin)
    const max = filters.amountMax === '' ? null : Number(filters.amountMax)
    if (min !== null && !isNaN(min) && t.amount < min) return false
    if (max !== null && !isNaN(max) && t.amount > max) return false
    // Chips（AND）—— 按名称匹配，规避底层重复 id 导致的漏匹配
    for (const chip of chips) {
      if (chip.kind === 'tag') {
        const names = (t.tags || []).map(id => tagMap.get(id)?.name || '')
        if (!names.includes(chip.label)) return false
      } else if (chip.kind === 'category') {
        if ((categoryMap.get(t.categoryId)?.name || '') !== chip.label) return false
      } else if (chip.kind === 'subcategory') {
        if ((subCategoryMap.get(t.subcategoryId)?.name || '') !== chip.label) return false
      } else if (chip.kind === 'account') {
        if ((accountMap.get(t.accountId)?.name || '') !== chip.label) return false
      } else if (chip.kind === 'note') {
        if (!t.note || !t.note.toLowerCase().includes(chip.label.toLowerCase())) return false
      }
    }
    return true
  }

  const sortTransactions = (list: any[]): any[] => {
    const sorted = [...list]
    switch (filters.sort) {
      case 'newest':
        sorted.sort((a, b) => (a.transactionDate + a.time).localeCompare(b.transactionDate + b.time))
        break
      case 'oldest':
        sorted.sort((a, b) => (b.transactionDate + b.time).localeCompare(a.transactionDate + a.time))
        break
      case 'amount_desc':
        sorted.sort((a, b) => b.amount - a.amount)
        break
      case 'amount_asc':
        sorted.sort((a, b) => a.amount - b.amount)
        break
    }
    return sorted
  }

  // 最终交易结果
  const filteredTransactions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const list = transactions.filter(t => applyFilters(t) && matchQuery(t, q))
    return sortTransactions(list)
  }, [transactions, debouncedQuery, filters, chips, categoryMap, subCategoryMap, tagMap])

  // 无限滚动：哨兵进入视口加载下一页（依赖 filteredTransactions，须在其声明之后）
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(c => Math.min(c + PAGE_SIZE, filteredTransactions.length))
      }
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filteredTransactions.length])


  // ============================================================
  // 搜索建议（按类型分组，输入关键词时显示）
  // ============================================================
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as Suggestion[]
    const result: Suggestion[] = []
    const seenCategory = new Set<string>()
    const seenSub = new Set<string>()
    const seenTag = new Set<string>()
    const seenTx = new Set<string>()

    // 分类（按名称去重，避免底层数据存在重复分类时显示多条）
    ;[...categories.expense, ...categories.income].forEach(c => {
      if (!seenCategory.has(c.name) && c.name.toLowerCase().includes(q)) {
        seenCategory.add(c.name)
        result.push({ kind: 'category', id: c.id, label: c.name, icon: c.icon })
      }
    })
    // 子分类（按名称去重）
    subCategories.forEach(s => {
      if (!seenSub.has(s.name) && s.name.toLowerCase().includes(q)) {
        seenSub.add(s.name)
        result.push({ kind: 'subcategory', id: s.id, label: s.name })
      }
    })
    // 标签（按名称去重，远端唯一标签在本地重复时只显示一条）
    tags.forEach(t => {
      if (!seenTag.has(t.name) && t.name.toLowerCase().includes(q)) {
        seenTag.add(t.name)
        result.push({ kind: 'tag', id: t.id, label: t.name })
      }
    })
    // 备注（取不重复、含关键词的备注，最多 30 条，超出由 UI 折叠）
    const noteSet = new Set<string>()
    let noteCount = 0
    transactions.forEach(t => {
      if (noteCount >= 30) return
      if (t.note && t.note.toLowerCase().includes(q) && !noteSet.has(t.note)) {
        noteSet.add(t.note)
        noteCount++
        result.push({ kind: 'note', id: 'note_' + t.id, label: t.note })
      }
    })
    // 交易（分类名 / 金额匹配，最多 3 条用于建议展示）
    let txCount = 0
    transactions.forEach(t => {
      if (txCount >= 3 || seenTx.has(t.id)) return
      const catName = categoryMap.get(t.categoryId)?.name || ''
      if (catName.toLowerCase().includes(q) || String(t.amount).includes(q)) {
        seenTx.add(t.id)
        result.push({ kind: 'transaction', id: t.id, label: catName, amount: t.amount, icon: categoryMap.get(t.categoryId)?.icon })
        txCount++
      }
    })

    return result
  }, [query, categories, subCategories, tags, transactions, categoryMap])

  // 按类型分组（仅显示有内容的分组）
  const groupedSuggestions = useMemo(() => {
    const order: SuggestionKind[] = ['category', 'subcategory', 'tag', 'note', 'transaction']
    const groups: { kind: SuggestionKind; items: Suggestion[] }[] = []
    order.forEach(kind => {
      const items = suggestions.filter(s => s.kind === kind)
      if (items.length > 0) groups.push({ kind, items })
    })
    return groups
  }, [suggestions])

  // ============================================================
  // 最近搜索持久化
  // ============================================================
  const saveRecent = (term: string, type: SuggestionKind) => {
    if (!term.trim()) return
    setRecent(prev => {
      const next = [{ term, type }, ...prev.filter(r => r.term !== term)].slice(0, 10)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const clearRecent = () => {
    setRecent([])
    try { localStorage.removeItem(RECENT_KEY) } catch { /* ignore */ }
  }
  // 删除单条最近搜索
  const deleteRecent = (r: RecentSearch) => {
    setRecent(prev => {
      const next = prev.filter(x => !(x.term === r.term && x.type === r.type))
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // ============================================================
  // 交互：点击搜索建议 -> 转为筛选 Chip
  // ============================================================
  const addChipFromSuggestion = (s: Suggestion) => {
    const exists = chips.some(c => c.kind === s.kind && c.label === s.label)
    if (exists) return
    const chip: FilterChip = {
      kind: s.kind === 'note' ? 'note' : s.kind,
      id: s.kind === 'note' ? s.label : s.id,
      label: s.label,
    }
    setChips(prev => [...prev, chip])
    // 点击建议后清空输入框，仅保留筛选条件
    setQuery('')
    saveRecent(s.label, s.kind)
  }

  // 点击最近搜索：若是"今天"等日期类型则恢复筛选，否则填入搜索框
  const onRecentClick = (r: RecentSearch) => {
    if (r.type === 'note') {
      setQuery(r.term)
    } else {
      setQuery(r.term)
    }
  }

  // 删除某个 chip
  const removeChip = (chip: FilterChip) => {
    setChips(prev => prev.filter(c => !(c.kind === chip.kind && c.id === chip.id)))
  }

  // ============================================================
  // 关键词高亮
  // ============================================================
  const highlightMatch = (text: string, q: string): ReactNode => {
    const queryTrim = q.trim()
    if (!queryTrim) return text
    try {
      const parts = text.split(new RegExp(`(${queryTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
      return parts.map((part, i) =>
        part.toLowerCase() === queryTrim.toLowerCase()
          ? <mark key={i} className="bg-brand text-ink rounded px-0.5 font-medium">{part}</mark>
          : part
      )
    } catch {
      return text
    }
  }

  const getCategory = (t: any) => {
    if (t.type === 'transfer') return { icon: '↔️', color: '#5b8dee' }
    return categoryMap.get(t.categoryId) || { icon: '📌', color: '#87867f' }
  }

  const tagInfoFor = (t: any) =>
    (t.tags || []).map((id: string) => {
      const tg = tagMap.get(id)
      return tg ? { id, name: tg.name } : null
    }).filter(Boolean) as { id: string; name: string }[]

  const showResults = query.trim().length > 0 || chips.length > 0 || filters.type !== 'all' || filters.accountId !== 'all' || filters.dateRange !== 'all' || filters.amountMin !== '' || filters.amountMax !== ''

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <X size={24} className="text-ink-2" />
          </button>
          <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface shadow-soft`}>
            <Search size={18} className="text-ink-2" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索金额、分类、子分类、标签、备注..."
              autoFocus
              className="flex-1 bg-transparent outline-none text-sm text-ink placeholder-[#b0aea5]"
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X size={16} className="text-ink-2" />
              </button>
            )}
          </div>
          <button
            onClick={() => { setDraftFilters(filters); setShowFilterModal(true) }}
            className={`p-2 rounded-full bg-surface shadow-soft text-ink-2`}
          >
            <Filter size={20} />
          </button>
        </div>

        {/* 筛选 Chips 区 */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {chips.map((chip, i) => (
              <button
                key={`${chip.kind}-${chip.id}-${i}`}
                onClick={() => removeChip(chip)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-brand-tint text-ink border border-brand-soft"
              >
                <span>{KIND_EMOJI[chip.kind as SuggestionKind]}</span>
                <span>{chip.label}</span>
                <X size={14} className="opacity-60" />
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="px-5 pb-6 animate-page-fade">
        {/* ========== 有输入：搜索建议 ========== */}
        {query.trim().length > 0 && groupedSuggestions.length > 0 && (
          <div className="mt-3 space-y-4">
            {groupedSuggestions.map(group => (
              <div key={group.kind}>
                <div className="text-xs text-ink-2 mb-2 px-1">
                  {group.kind === 'category' ? '分类' : group.kind === 'subcategory' ? '子分类' : group.kind === 'tag' ? '标签' : group.kind === 'note' ? '备注' : '交易'}
                </div>
                <div className="space-y-1">
                  {(group.kind === 'note' && !expandedNotes ? group.items.slice(0, NOTE_COLLAPSE_LIMIT) : group.items).map(s => (
                    <button
                      key={s.id}
                      onClick={() => addChipFromSuggestion(s)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-surface shadow-soft hover:bg-brand-tint transition-colors text-left"
                    >
                      <span className="text-lg">{s.kind === 'transaction' ? (s.icon || '🍜') : KIND_EMOJI[s.kind]}</span>
                      <span className="flex-1 text-sm text-ink truncate">{highlightMatch(s.label, query)}</span>
                      {s.amount !== undefined && (
                        <span className="text-sm font-mono font-medium text-ink">¥{s.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                      )}
                    </button>
                  ))}
                </div>
                {group.kind === 'note' && group.items.length > NOTE_COLLAPSE_LIMIT && (
                  <button
                    onClick={() => setExpandedNotes(v => !v)}
                    className="mt-2 text-xs text-ink-2 hover:text-ink px-1"
                  >
                    {expandedNotes ? '收起' : `展开全部 ${group.items.length} 条备注`}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ========== 有输入但无建议：仍展示结果 ========== */}

        {/* ========== 结果区 ========== */}
        {showResults ? (
          <div className="mt-3">
            <div className="text-sm text-ink-2 mb-3">
              找到 {filteredTransactions.length} 条结果
            </div>

            {filteredTransactions.length > 0 ? (
              <>
                <Card className="!p-0 divide-y divide-[#f0eee6]">
                  {filteredTransactions.slice(0, visibleCount).map(t => {
                    const cat = getCategory(t)
                    return (
                      <TransactionItem
                        key={t.id}
                        icon={cat.icon}
                        iconBg={`${cat.color}15`}
                        title={highlightMatch(t.categoryName, query)}
                        subtitle={`${t.date} ${t.time} · ${t.accountName}${t.subcategoryName ? ' · ' + t.subcategoryName : ''}`}
                        amount={t.amount}
                        type={t.type}
                        account={undefined}
                        subcategory={undefined}
                        tags={query.trim() ? tagInfoFor(t).map(tg => ({ id: tg.id, name: highlightMatch(tg.name, query), color: '' })) : tagInfoFor(t).map(tg => ({ id: tg.id, name: tg.name, color: '' }))}
                        onClick={() => openDetail(t)}
                      />
                    )
                  })}
                </Card>
                {/* 无限滚动哨兵 */}
                {visibleCount < filteredTransactions.length && (
                  <div ref={sentinelRef} className="py-6 text-center text-sm text-ink-2">
                    加载更多…
                  </div>
                )}
                {visibleCount >= filteredTransactions.length && filteredTransactions.length > PAGE_SIZE && (
                  <div className="py-6 text-center text-sm text-ink-2">
                    已经到底啦
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-ink-2">
                <div className="text-4xl mb-3">🔍</div>
                <p>没有找到相关交易</p>
                <p className="text-sm mt-1">可以尝试：修改关键词 / 减少筛选条件</p>
              </div>
            )}
          </div>
        ) : (
          /* ========== 无搜索：最近搜索 + 最近交易 ========== */
          <div className="space-y-5 mt-3">
            {recent.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-ink">最近搜索</h3>
                  <button onClick={clearRecent} className="text-xs text-ink-2 hover:text-ink">清空</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r, i) => (
                    <div
                      key={`${r.term}-${i}`}
                      className="flex items-center gap-1.5 pl-3 pr-1.5 py-2 rounded-full text-sm bg-surface shadow-soft text-ink-2 hover:bg-brand-tint"
                    >
                      <button
                        onClick={() => onRecentClick(r)}
                        className="flex items-center gap-1.5"
                      >
                        <span>{r.type === 'note' ? <MessageCircle size={13} /> : <span>{KIND_EMOJI[r.type]}</span>}</span>
                        {r.term}
                      </button>
                      <button
                        onClick={() => deleteRecent(r)}
                        aria-label="删除该搜索记录"
                        className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-ink-2 hover:text-danger hover:bg-[#ffe9e9]"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold text-ink mb-3">最近交易</h3>
              <Card className="!p-0 divide-y divide-[#f0eee6]">
                {transactions.slice(0, 10).map(t => {
                  const cat = getCategory(t)
                  return (
                    <TransactionItem
                      key={t.id}
                      icon={cat.icon}
                      iconBg={`${cat.color}15`}
                      title={t.categoryName}
                      subtitle={`${t.date} ${t.time} · ${t.accountName}`}
                      amount={t.amount}
                      type={t.type}
                      onClick={() => openDetail(t)}
                    />
                  )
                })}
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* ========== 筛选 Modal（居中） ========== */}
      <Modal isOpen={showFilterModal} onClose={() => setShowFilterModal(false)} title="筛选">
        <div className="space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 类型 */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">类型</div>
            <div className="flex gap-2">
              {([['all', '全部'], ['expense', '支出'], ['income', '收入']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDraftFilters(f => ({ ...f, type: val }))}
                  className={`flex-1 py-2 rounded-full text-sm font-medium border transition-colors ${
                    draftFilters.type === val
                      ? 'bg-brand text-ink border-brand-strong'
                      : 'bg-surface text-ink-2 border-[#e6e3da]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 账户 */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">账户</div>
            <select
              value={draftFilters.accountId}
              onChange={(e) => setDraftFilters(f => ({ ...f, accountId: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-surface border border-[#e6e3da] text-sm text-ink outline-none"
            >
              <option value="all">全部</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
          </div>

          {/* 日期 */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">日期</div>
            <div className="grid grid-cols-3 gap-2">
              {([['all', '全部'], ['today', '今天'], ['week', '本周'], ['month', '本月'], ['year', '今年']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDraftFilters(f => ({ ...f, dateRange: val }))}
                  className={`py-2 rounded-full text-sm font-medium border transition-colors ${
                    draftFilters.dateRange === val
                      ? 'bg-brand text-ink border-brand-strong'
                      : 'bg-surface text-ink-2 border-[#e6e3da]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 金额 */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">金额</div>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                placeholder="最小金额"
                value={draftFilters.amountMin}
                onChange={(e) => setDraftFilters(f => ({ ...f, amountMin: e.target.value }))}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-[#e6e3da] text-sm text-ink outline-none"
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder="最大金额"
                value={draftFilters.amountMax}
                onChange={(e) => setDraftFilters(f => ({ ...f, amountMax: e.target.value }))}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-[#e6e3da] text-sm text-ink outline-none"
              />
            </div>
          </div>

          {/* 排序 */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">排序</div>
            <div className="grid grid-cols-2 gap-2">
              {([['newest', '最新'], ['oldest', '最早'], ['amount_desc', '金额最高'], ['amount_asc', '金额最低']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDraftFilters(f => ({ ...f, sort: val }))}
                  className={`py-2 rounded-full text-sm font-medium border transition-colors ${
                    draftFilters.sort === val
                      ? 'bg-brand text-ink border-brand-strong'
                      : 'bg-surface text-ink-2 border-[#e6e3da]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 操作 */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setDraftFilters({ type: 'all', accountId: 'all', dateRange: 'all', amountMin: '', amountMax: '', sort: 'newest' })
                setChips([])
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface text-ink-2 border border-[#e6e3da]"
            >
              重置
            </button>
            <button
              onClick={() => { setFilters(draftFilters); setShowFilterModal(false) }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-brand text-ink hover:bg-brand-strong"
            >
              应用
            </button>
          </div>
        </div>
      </Modal>

      {/* ========== 交易详情（查看 + 编辑） ========== */}
      <BottomSheet
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title={editMode ? '编辑交易' : '交易详情'}
      >
        {selectedTx && (() => {
          const cat = getCategory(selectedTx)
          const txTags = (editMode ? editTagIds : selectedTx.tags || [])
            .map((id: string) => tags.find(t => t.id === id))
            .filter(Boolean) as { id: string; name: string; color: string }[]
          const amountColor = selectedTx.type === 'expense' ? 'text-danger' : selectedTx.type === 'income' ? 'text-ok' : 'text-[#5b8dee]'
          const amountPrefix = selectedTx.type === 'expense' ? '-' : selectedTx.type === 'income' ? '+' : ''
          const typeLabel = selectedTx.type === 'expense' ? '支出' : selectedTx.type === 'income' ? '收入' : '转账'
          return (
            <div className="p-4 space-y-4">
              {/* 金额（编辑模式可输入） */}
              <div className="text-center py-2">
                <div className="text-4xl mb-2">{cat.icon}</div>
                {editMode ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="w-44 text-center text-3xl font-bold font-mono bg-brand-tint border border-[#e6e3da] rounded-xl px-3 py-1.5 outline-none"
                  />
                ) : (
                  <div className={`text-3xl font-bold font-mono ${amountColor}`}>
                    {amountPrefix}¥{selectedTx.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>
                )}
                <div className="text-sm text-ink-2 mt-1">{typeLabel}</div>
              </div>

              {/* 字段 */}
              <div className="rounded-2xl bg-surface shadow-soft divide-y divide-[#f0eee6] overflow-hidden">
                {/* 分类：编辑模式点击打开选择 */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-2 shrink-0">分类</span>
                  {editMode ? (
                    <button
                      onClick={() => setEditPicker('category')}
                      className="flex items-center gap-1 text-sm text-ink"
                    >
                      {categories.expense.concat(categories.income).find(c => c.id === editCategoryId)?.icon} {selectedTx.categoryName}
                      <span className="text-ink-2">›</span>
                    </button>
                  ) : (
                    <span className="text-sm text-ink">{cat.icon} {selectedTx.categoryName}</span>
                  )}
                </div>

                {/* 子分类：编辑模式点击打开选择（非转账） */}
                {(selectedTx.type !== 'transfer') && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm text-ink-2 shrink-0">子分类</span>
                    {editMode ? (
                      <button
                        onClick={() => setEditPicker('subcategory')}
                        className="flex items-center gap-1 text-sm text-ink"
                      >
                        {editSubcategoryId ? (subCategories.find(s => s.id === editSubcategoryId)?.name || '无') : '无'}
                        <span className="text-ink-2">›</span>
                      </button>
                    ) : selectedTx.subcategoryName ? (
                      <span className="text-sm text-ink">{selectedTx.subcategoryName}</span>
                    ) : (
                      <span className="text-sm text-ink-2">—</span>
                    )}
                  </div>
                )}

                {/* 标签：编辑模式可增删 */}
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-2 shrink-0 pt-0.5">标签</span>
                  {editMode ? (
                    <div className="flex gap-1 flex-wrap justify-end">
                      {txTags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => removeEditTag(tag.id)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-ink"
                          style={{ backgroundColor: tag.color ? tag.color + '33' : '#FFF7E6' }}
                        >
                          {tag.name} <X size={11} />
                        </button>
                      ))}
                      <button
                        onClick={() => setShowTagSelect(true)}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-dashed border-[#cfc9ba] text-ink-2"
                      >
                        + 添加
                      </button>
                    </div>
                  ) : txTags.length > 0 ? (
                    <div className="flex gap-1 flex-wrap justify-end">
                      {txTags.map(tag => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-ink"
                          style={{ backgroundColor: tag.color ? tag.color + '33' : '#FFF7E6' }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-ink-2">—</span>
                  )}
                </div>

                {/* 账户：编辑模式点击打开选择 */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-2 shrink-0">账户</span>
                  {editMode ? (
                    <button
                      onClick={() => setEditPicker('account')}
                      className="flex items-center gap-1 text-sm text-ink"
                    >
                      {accounts.find(a => a.id === editAccountId)?.name}
                      <span className="text-ink-2">›</span>
                    </button>
                  ) : (
                    <span className="text-sm text-ink">{selectedTx.accountName}</span>
                  )}
                </div>

                {/* 日期 + 时间：编辑模式可改（统一卡片输入框） */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-2 shrink-0">日期</span>
                  {editMode ? (
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-brand-tint border border-[#e6e3da] text-sm text-ink outline-none"
                      />
                      <input
                        type="time"
                        value={editTime}
                        onChange={e => setEditTime(e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-brand-tint border border-[#e6e3da] text-sm text-ink outline-none"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-ink">{selectedTx.date} {selectedTx.time}</span>
                  )}
                </div>

                {/* 备注：编辑模式可输入（统一卡片输入框） */}
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-2 shrink-0 pt-0.5">备注</span>
                  {editMode ? (
                    <input
                      value={editNote}
                      onChange={e => setEditNote(e.target.value)}
                      placeholder="添加备注"
                      className="flex-1 text-sm text-ink text-right bg-brand-tint border border-[#e6e3da] rounded-xl px-3 py-1.5 outline-none"
                    />
                  ) : selectedTx.note ? (
                    <span className="text-sm text-ink text-right">{selectedTx.note}</span>
                  ) : (
                    <span className="text-sm text-ink-2 text-right">—</span>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              {!editMode ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface text-danger border border-[#e6e3da] flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={15} /> 删除
                  </button>
                  <button
                    onClick={() => enterEdit(selectedTx)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-brand text-ink hover:bg-brand-strong flex items-center justify-center gap-1.5"
                  >
                    <Pencil size={15} /> 编辑
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface text-ink-2 border border-[#e6e3da]"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveEdit}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-brand text-ink hover:bg-brand-strong flex items-center justify-center gap-1.5"
                  >
                    <Check size={15} /> 保存
                  </button>
                </div>
              )}

              {/* 删除确认 */}
              {showDeleteConfirm && (
                <div className="rounded-xl p-4 bg-[#fff1f0] border border-[#ffd6d6] text-center space-y-3">
                  <p className="text-sm text-ink">确定删除这条交易吗？此操作不可撤销。</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-2 rounded-xl text-sm font-medium bg-surface text-ink-2 border border-[#e6e3da]"
                    >
                      取消
                    </button>
                    <button
                      onClick={confirmDelete}
                      className="flex-1 py-2 rounded-xl text-sm font-medium bg-danger text-white"
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </BottomSheet>

      {/* 标签选择（编辑模式下添加标签） */}
      <BottomSheet isOpen={showTagSelect} onClose={() => setShowTagSelect(false)} title="选择标签">
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => {
              const active = editTagIds.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => (active ? removeEditTag(tag.id) : addEditTag(tag.id))}
                  className="px-3 py-1.5 rounded-full text-sm border"
                  style={{
                    backgroundColor: active ? (tag.color ? tag.color + '33' : '#FFF7E6') : 'transparent',
                    borderColor: active ? (tag.color || '#f5c451') : '#e6e3da',
                    color: '#3a3a3a',
                  }}
                >
                  {tag.name}{active ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
        </div>
      </BottomSheet>

      {/* 通用选择（编辑模式下选择分类 / 子分类 / 账户） */}
      <BottomSheet
        isOpen={editPicker !== null}
        onClose={() => setEditPicker(null)}
        title={editPicker === 'category' ? '选择分类' : editPicker === 'subcategory' ? '选择子分类' : '选择账户'}
      >
        <div className="p-4 space-y-2">
          {editPicker === 'category' && categories.expense.concat(categories.income).map(c => (
            <button
              key={c.id}
              onClick={() => { setEditCategoryId(c.id); setEditSubcategoryId(undefined); setEditPicker(null) }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                editCategoryId === c.id ? 'bg-brand text-ink' : 'bg-surface text-ink hover:bg-brand-tint'
              }`}
            >
              <span>{c.icon} {c.name}</span>
              {editCategoryId === c.id && <Check size={16} />}
            </button>
          ))}
          {editPicker === 'subcategory' && (
            <>
              <button
                onClick={() => { setEditSubcategoryId(undefined); setEditPicker(null) }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                  !editSubcategoryId ? 'bg-brand text-ink' : 'bg-surface text-ink hover:bg-brand-tint'
                }`}
              >
                <span>无</span>
                {!editSubcategoryId && <Check size={16} />}
              </button>
              {editSubcats.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setEditSubcategoryId(s.id); setEditPicker(null) }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                    editSubcategoryId === s.id ? 'bg-brand text-ink' : 'bg-surface text-ink hover:bg-brand-tint'
                  }`}
                >
                  <span>{s.name}</span>
                  {editSubcategoryId === s.id && <Check size={16} />}
                </button>
              ))}
            </>
          )}
          {editPicker === 'account' && accounts.map(a => (
            <button
              key={a.id}
              onClick={() => { setEditAccountId(a.id); setEditPicker(null) }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                editAccountId === a.id ? 'bg-brand text-ink' : 'bg-surface text-ink hover:bg-brand-tint'
              }`}
            >
              <span>{a.name}</span>
              {editAccountId === a.id && <Check size={16} />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
