import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import TransactionItem from '../components/ui/TransactionItem'
import BottomSheet from '../components/ui/BottomSheet'
import { recordTagUsage } from '../utils/tagUsage'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCurrency, formatTransferAmount } from '../utils/format'
import { ArrowLeft, Trash2, X, Pencil, Check } from 'lucide-react'

type FilterMode = 'all' | 'month'

// YYYY-MM-DD -> "X月X日"（与详情展示格式保持一致）
function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  if (isNaN(m) || isNaN(d)) return dateStr
  return `${m}月${d}日`
}

export default function TransactionListPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { 
    transactions, 
    categories, 
    accounts,
    tags,
    subCategories,
    updateTransaction,
    deleteTransaction,
  } = useApp()
  
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  
  // 分页：按日期分组懒加载，首屏只渲染前若干组，避免整表一次性挂载卡顿
  const PAGE_SIZE = 10
  const [visibleGroups, setVisibleGroups] = useState(PAGE_SIZE)
  // 切换筛选条件时重置分页
  useEffect(() => {
    setVisibleGroups(PAGE_SIZE)
  }, [filterMode, selectedMonth])
  
  // 查看/编辑详情（打开 = selectedTransaction 非 null）
  const [selectedTransaction, setSelectedTransaction] = useState<typeof transactions[0] | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // 编辑表单（字段与搜索页详情编辑保持一致）
  const [editAmount, setEditAmount] = useState('')
  const [editAmountError, setEditAmountError] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editType, setEditType] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editSubcategoryId, setEditSubcategoryId] = useState<string | undefined>(undefined)
  const [editAccountId, setEditAccountId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editTagIds, setEditTagIds] = useState<string[]>([])
  const [showTagSelect, setShowTagSelect] = useState(false)
  // 通用选择（编辑模式选择分类 / 账户）
  const [editPicker, setEditPicker] = useState<null | 'category' | 'account'>(null)

  // 筛选交易
  const filteredTransactions = useMemo(() => {
    if (filterMode === 'all') return transactions
    
    return transactions.filter(t => {
      const match = t.date.match(/(\d+)月(\d+)日/)
      if (!match) return false
      const tMonth = parseInt(match[1])
      return tMonth === selectedMonth
    })
  }, [transactions, filterMode, selectedMonth])

  // 按日期分组
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof transactions> = {}
    filteredTransactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = []
      groups[t.date].push(t)
    })
    return groups
  }, [filteredTransactions])

  // 仅取当前分页可见的日期分组（懒加载，避免整表渲染）
  const allGroupEntries = useMemo(
    () => Object.entries(groupedTransactions),
    [groupedTransactions]
  )
  const visibleGroupEntries = allGroupEntries.slice(0, visibleGroups)
  const hasMoreGroups = visibleGroups < allGroupEntries.length

  // 分类字典（O(1) 查找，避免逐条 .find）
  const categoryMap = useMemo(() => {
    const m = new Map<string, any>()
    ;[...(categories.expense as any[]), ...(categories.income as any[])].forEach(c => m.set(c.id, c))
    return m
  }, [categories])

  // 获取分类信息
  const getCategory = (t: typeof transactions[0]) => {
    return categoryMap.get(t.categoryId) || { icon: '📝', color: '#87867f', name: '未分类' }
  }

  // 当前交易分类下的子分类列表
  // 当前编辑分类下的子分类列表（按 order 排序，逻辑与搜索页一致）
  const editSubcats = useMemo(
    () => subCategories
      .filter(s => s.categoryId === editCategoryId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [subCategories, editCategoryId]
  )

  // 标签字典（O(1) 查找，避免逐条 .find）
  const tagMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>()
    ;(tags as any[]).forEach(t => m.set(t.id, t))
    return m
  }, [tags])

  // 点击交易 → 打开详情（查看态）
  const openDetail = (t: typeof transactions[0]) => {
    setSelectedTransaction(t)
    setEditType(t.type)
    setEditMode(false)
    setShowDeleteConfirm(false)
    setEditPicker(null)
  }

  // 进入编辑：用选中交易预填（字段与搜索页完全一致）
  const enterEdit = (t: typeof transactions[0]) => {
    setEditAmount(String(t.amount))
    setEditAmountError('')
    setEditNote(t.note || '')
    setEditType(t.type)
    setEditCategoryId(t.categoryId)
    setEditSubcategoryId(t.subcategoryId || undefined)
    setEditAccountId(t.accountId)
    setEditDate(t.transactionDate || '')
    setEditTime(t.time || '')
    setEditTagIds(t.tags || [])
    setEditMode(true)
    setShowDeleteConfirm(false)
    setEditPicker(null)
  }

  // 取消某个已选标签（仅取消选择，不删库）
  const removeEditTag = (tagId: string) => {
    setEditTagIds(prev => prev.filter(id => id !== tagId))
  }

  // 添加标签并记录最近使用
  const addEditTag = (tagId: string) => {
    if (!editTagIds.includes(tagId)) setEditTagIds(prev => [...prev, tagId])
    const uid = useAuthStore.getState().user?.id
    if (uid) recordTagUsage(uid, tagId)
  }

  // 保存编辑（提交字段与搜索页一致）
  const saveEdit = async () => {
    if (!selectedTransaction) return
    const newAmount = parseFloat(editAmount)
    if (isNaN(newAmount) || newAmount <= 0) {
      setEditAmountError('请输入大于 0 的金额')
      return
    }
    const isTransfer = editType === 'transfer'
    const newCat = !isTransfer ? categories.expense.concat(categories.income).find(c => c.id === editCategoryId) : undefined
    try {
      await updateTransaction(selectedTransaction.id, {
        type: editType,
        amount: newAmount,
        note: editNote || undefined,
        categoryId: isTransfer ? '' : editCategoryId,
        subcategoryId: isTransfer ? undefined : editSubcategoryId,
        accountId: editAccountId,
        toAccountId: isTransfer ? editAccountId : undefined,
        date: editDate,
        time: editTime,
        tags: editTagIds,
      })
      // 同步刷新弹窗内该条数据
      setSelectedTransaction(prev => prev ? {
        ...prev,
        type: editType,
        amount: newAmount,
        note: editNote || '',
        categoryId: isTransfer ? '' : editCategoryId,
        categoryName: isTransfer ? '转账' : (newCat?.name || prev.categoryName),
        categoryIcon: isTransfer ? '🔄' : (newCat?.icon || prev.categoryIcon),
        categoryColor: isTransfer ? '#5b8dee' : (newCat?.color || prev.categoryColor),
        subcategoryId: isTransfer ? undefined : editSubcategoryId,
        subcategoryName: isTransfer ? undefined : (editSubcategoryId ? (subCategories.find(s => s.id === editSubcategoryId)?.name || '') : ''),
        accountId: editAccountId,
        accountName: accounts.find(a => a.id === editAccountId)?.name || prev.accountName,
        date: formatDateDisplay(editDate),
        transactionDate: editDate,
        time: editTime,
        tags: editTagIds,
      } : prev)
      setEditMode(false)
    } catch (err) {
      console.error('更新失败:', err)
    }
  }

  // 确认删除
  const confirmDelete = async () => {
    if (!selectedTransaction) return
    try {
      await deleteTransaction(selectedTransaction.id)
      setShowDeleteConfirm(false)
      setSelectedTransaction(null)
    } catch (err) {
      console.error('删除失败:', err)
    }
  }

  // 计算当日合计
  const getDateTotal = (dateTransactions: typeof transactions) => {
    let income = 0, expense = 0
    dateTransactions.forEach(t => {
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    })
    return { income, expense }
  }

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/', { replace: true })} 
              className={`p-1.5 rounded-full ${theme === 'dark' ? 'hover:bg-surface' : 'hover:bg-white'}`}
            >
              <ArrowLeft size={22} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
            </button>
            <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              交易明细
            </h1>
          </div>
        </div>
      </header>

      {/* 筛选栏 */}
      <div className="px-4 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filterMode === 'all'
                ? 'bg-brand text-white'
                : theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-white text-ink-2'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterMode('month')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filterMode === 'month'
                ? 'bg-brand text-white'
                : theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-white text-ink-2'
            }`}
          >
            按月筛选
          </button>
          {filterMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-white text-ink-2'
              }`}
            >
              {monthNames.map((name, idx) => (
                <option key={idx} value={idx + 1}>{name}</option>
              ))}
            </select>
          )}
        </div>
        <div className={`text-xs mt-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
          共 {filteredTransactions.length} 条交易
        </div>
      </div>

      {/* 交易列表 */}
      <main className="px-5 tabbar-safe animate-page-fade">
        {filteredTransactions.length === 0 ? (
          <div className={`text-center py-16 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            <div className="text-4xl mb-3">📋</div>
            <p>暂无交易记录</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleGroupEntries.map(([date, dateTransactions]) => {
              const { income, expense } = getDateTotal(dateTransactions)
              return (
                <div key={date}>
                  {/* 日期头部 */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                      {date}
                    </span>
                    <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                      {expense > 0 && <span className="text-ink mr-2">支出 {expense.toFixed(2)}</span>}
                      {income > 0 && <span className="text-danger">收入 {income.toFixed(2)}</span>}
                    </span>
                  </div>
                  <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
                    {dateTransactions.map(t => {
                      const cat = getCategory(t)
                      const transactionTags = t.tags
                        ? (t.tags.map(id => tagMap.get(id)).filter(Boolean) as { id: string; name: string; color: string }[])
                        : undefined
                      return (
                        <TransactionItem
                          key={t.id}
                          icon={cat.icon}
                          iconBg={`${cat.color}15`}
                          title={t.categoryName}
                          subcategory={t.subcategoryName}
                          subtitle={`${t.time} · ${t.accountName}`}
                          amount={t.amount}
                          type={t.type}
                          tags={transactionTags}
                          onClick={() => openDetail(t)}
                        />
                      )
                    })}
                  </Card>
                </div>
              )
            })}
          </div>
        )}

        {/* 加载更多 */}
        {hasMoreGroups && (
          <div className="flex justify-center pt-2 pb-6">
            <button
              onClick={() => setVisibleGroups(v => v + PAGE_SIZE)}
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-colors ${
                theme === 'dark' ? 'bg-surface text-ink-2 hover:text-ink' : 'bg-white text-ink-2 hover:text-ink'
              }`}
            >
              加载更多（已显示 {visibleGroupEntries.length} / {allGroupEntries.length} 天）
            </button>
          </div>
        )}
      </main>

      {/* ========== 交易详情（查看 + 编辑）—— 与搜索页完全一致的逻辑 ========== */}
      <BottomSheet
        isOpen={!!selectedTransaction}
        onClose={() => { setSelectedTransaction(null); setEditMode(false); setShowDeleteConfirm(false); setEditPicker(null) }}
        title={editMode ? '编辑交易' : '交易详情'}
      >
        {selectedTransaction && (() => {
          const cat = getCategory(selectedTransaction)
          const txTags = (editMode ? editTagIds : selectedTransaction.tags || [])
            .map((id: string) => tags.find(t => t.id === id))
            .filter(Boolean) as { id: string; name: string; color: string }[]
          const amountColor = selectedTransaction.type === 'income' ? 'text-danger' : selectedTransaction.type === 'expense' ? 'text-ink' : 'text-[#5b8dee]'
          const typeLabel = selectedTransaction.type === 'expense' ? '支出' : selectedTransaction.type === 'income' ? '收入' : '转账'
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
                    onChange={e => { setEditAmount(e.target.value); if (editAmountError) setEditAmountError('') }}
                    className="w-44 text-center text-3xl font-bold font-mono bg-brand-tint border border-[#e6e3da] rounded-xl px-3 py-1.5 outline-none"
                  />
                ) : (
                  <div className={`font-bold font-mono amount-fluid-lg ${amountColor}`}>
                    {selectedTransaction.type === 'transfer'
                      ? formatTransferAmount(selectedTransaction as any)
                      : formatCurrency(
                          selectedTransaction.type === 'expense'
                            ? -Math.abs(selectedTransaction.amount)
                            : Math.abs(selectedTransaction.amount),
                          true,
                          false
                        )}
                  </div>
                )}
                <div className="text-sm text-ink-2 mt-1">{typeLabel}</div>
                {editAmountError && (
                  <div className="text-xs text-danger mt-1">{editAmountError}</div>
                )}
              </div>

              {/* 类型：编辑模式可切换（支出 / 收入 / 转账） */}
              {editMode && (
                <div className="flex gap-2 px-4 pb-1">
                  {([['expense', '支出'], ['income', '收入'], ['transfer', '转账']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setEditType(val)}
                      className={`flex-1 py-2 rounded-full text-sm font-medium border transition-colors ${
                        editType === val
                          ? 'bg-brand text-ink border-brand-strong'
                          : 'bg-surface text-ink-2 border-[#e6e3da]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* 字段 */}
              <div className="rounded-2xl bg-surface shadow-soft divide-y divide-[#f0eee6] overflow-hidden">
                {/* 分类：编辑模式点击打开选择（转账不显示） */}
                {editType !== 'transfer' && (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-2 shrink-0">分类</span>
                  {editMode ? (
                    <button
                      onClick={() => setEditPicker('category')}
                      className="flex items-center gap-1 text-sm text-ink"
                    >
                      {categories.expense.concat(categories.income).find(c => c.id === editCategoryId)?.icon} {categories.expense.concat(categories.income).find(c => c.id === editCategoryId)?.name}
                      <span className="text-ink-2">›</span>
                    </button>
                  ) : (
                    <span className="text-sm text-ink">{cat.icon} {selectedTransaction.categoryName}</span>
                  )}
                </div>
                )}

                {/* 子分类：编辑模式右侧横向胶囊单选（对齐记一笔：点击选中/再点取消，选中带X） */}
                {(editType !== 'transfer') && (
                  editMode ? (
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-ink-2 shrink-0 pt-1.5">子分类</span>
                      <div className="flex-1 min-w-0">
                        {editSubcats.length > 0 ? (
                          <div className="flex flex-wrap gap-2 justify-end">
                            {editSubcats.map(sub => {
                              const isSelected = editSubcategoryId === sub.id
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => setEditSubcategoryId(isSelected ? undefined : sub.id)}
                                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-all active:scale-95 ${
                                    isSelected
                                      ? 'text-white ring-2 ring-offset-1 ring-current'
                                      : 'bg-bg text-ink-2 hover:bg-brand-tint'
                                  }`}
                                  style={isSelected ? { backgroundColor: sub.color || '#818cf8' } : undefined}
                                >
                                  {isSelected && <X size={12} className="hover:bg-white/20 rounded-full" />}
                                  {sub.name}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-2 text-right block pt-1">该分类暂无子分类</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-ink-2 shrink-0">子分类</span>
                      {selectedTransaction.subcategoryName ? (
                        <span className="text-sm text-ink">{selectedTransaction.subcategoryName}</span>
                      ) : (
                        <span className="text-sm text-ink-2">—</span>
                      )}
                    </div>
                  )
                )}

                {/* 标签：转账表无此字段，不展示 */}
                {selectedTransaction.type !== 'transfer' && (
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
                )}

                {/* 账户：转账在查看态展示转出/转入账户、手续费、汇率；编辑态沿用账户选择 */}
                {selectedTransaction.type === 'transfer' && !editMode ? (
                  <>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-ink-2 shrink-0">转出账户</span>
                      <span className="text-sm text-ink">{selectedTransaction.accountName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-ink-2 shrink-0">转入账户</span>
                      <span className="text-sm text-ink">{selectedTransaction.toAccountName}</span>
                    </div>
                    {(selectedTransaction.fee ?? 0) > 0 && (
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm text-ink-2 shrink-0">手续费</span>
                        <span className="text-sm text-ink">{formatCurrency(selectedTransaction.fee ?? 0, false, false)}</span>
                      </div>
                    )}
                    {selectedTransaction.fromCurrency && selectedTransaction.toCurrency && selectedTransaction.fromCurrency !== selectedTransaction.toCurrency && (selectedTransaction as any).exchangeRate != null && (
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm text-ink-2 shrink-0">汇率</span>
                        <span className="text-sm text-ink">{(selectedTransaction as any).exchangeRate}</span>
                      </div>
                    )}
                  </>
                ) : (
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
                      <span className="text-sm text-ink">{selectedTransaction.accountName}</span>
                    )}
                  </div>
                )}

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
                    <span className="text-sm text-ink">{selectedTransaction.date} {selectedTransaction.time}</span>
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
                  ) : selectedTransaction.note ? (
                    <span className="text-sm text-ink text-right">{selectedTransaction.note}</span>
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
                    onClick={() => enterEdit(selectedTransaction)}
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

      {/* 通用选择（编辑模式下选择分类 / 账户；子分类已改为内嵌横向胶囊，不再弹层） */}
      <BottomSheet
        isOpen={editPicker !== null}
        onClose={() => setEditPicker(null)}
        title={editPicker === 'category' ? '选择分类' : '选择账户'}
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
