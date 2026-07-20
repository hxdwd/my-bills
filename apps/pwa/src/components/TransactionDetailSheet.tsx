import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuthStore } from '../stores/useAuthStore'
import { recordTagUsage } from '../utils/tagUsage'
import BottomSheet from './ui/BottomSheet'
import { X, Trash2, Pencil, Check } from 'lucide-react'
import { formatCurrency, formatTransferAmount } from '../utils/format'

// YYYY-MM-DD -> "X月X日"
function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  if (isNaN(m) || isNaN(d)) return dateStr
  return `${m}月${d}日`
}

export interface TransactionDetailSheetProps {
  /** 当前查看/编辑的交易；null 表示关闭 */
  transaction: any | null
  onClose: () => void
  /** 保存成功后回调（可用于刷新外层列表） */
  onSaved?: (updated: any) => void
  /** 删除成功后回调 */
  onDeleted?: (id: string) => void
}

/**
 * 交易详情弹窗（查看 + 编辑 + 删除），可在多个页面复用。
 * 编辑逻辑与搜索页一致：支持修改类型/金额/分类/子分类/账户/日期时间/标签/备注。
 */
export default function TransactionDetailSheet({
  transaction,
  onClose,
  onSaved,
  onDeleted,
}: TransactionDetailSheetProps) {
  const { categories, subCategories, tags, accounts, updateTransaction, deleteTransaction } = useApp()
  const authUser = useAuthStore(state => state.user)

  // 弹窗内部维护一份可实时刷新的选中交易，保存后同步显示
  const [selectedTx, setSelectedTx] = useState<any | null>(transaction)

  const [editMode, setEditMode] = useState(false)
  const [editAmount, setEditAmount] = useState('')
  const [editAmountError, setEditAmountError] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editType, setEditType] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [editSubcategoryId, setEditSubcategoryId] = useState<string | undefined>(undefined)
  const [editAccountId, setEditAccountId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editTagIds, setEditTagIds] = useState<string[]>([])
  const [showTagSelect, setShowTagSelect] = useState(false)
  const [editPicker, setEditPicker] = useState<null | 'category' | 'subcategory' | 'account'>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 外部切换到新交易时，重置为查看态
  useEffect(() => {
    setSelectedTx(transaction)
    setEditMode(false)
    setShowDeleteConfirm(false)
    setEditAmountError('')
  }, [transaction])

  const categoryMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; icon: string; color: string }>()
    ;[...categories.expense, ...categories.income].forEach(c => m.set(c.id, c))
    return m
  }, [categories])

  const getCategory = (t: any) => {
    if (t.type === 'transfer') return { icon: '↔️', color: '#5b8dee' }
    return categoryMap.get(t.categoryId) || { icon: '📌', color: '#87867f' }
  }

  // 进入编辑：用选中交易预填
  const enterEdit = (t: any) => {
    setEditAmount(String(t.amount))
    setEditNote(t.note || '')
    setEditType(t.type)
    setEditCategoryId(t.categoryId)
    setEditSubcategoryId(t.subcategoryId || undefined)
    setEditAccountId(t.accountId)
    setEditDate(t.transactionDate || t.date)
    setEditTime(t.time)
    setEditTagIds(t.tags || [])
    setEditMode(true)
  }

  // 当前类型对应的分类列表
  const categoryListKey = editType === 'income' ? 'income' : 'expense'
  const categoryList = categories[categoryListKey]

  const editSubcats = useMemo(
    () => subCategories.filter(s => s.categoryId === editCategoryId),
    [subCategories, editCategoryId]
  )

  const saveEdit = async () => {
    if (!selectedTx) return
    const newAmount = parseFloat(editAmount)
    if (isNaN(newAmount) || newAmount <= 0) {
      setEditAmountError('请输入大于 0 的金额')
      return
    }
    const isTransfer = editType === 'transfer'
    const newCat = !isTransfer ? categories.expense.concat(categories.income).find(c => c.id === editCategoryId) : undefined
    try {
      await updateTransaction(selectedTx.id, {
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
      const updated = {
        ...selectedTx,
        type: editType,
        amount: newAmount,
        note: editNote || '',
        categoryId: isTransfer ? '' : editCategoryId,
        categoryName: isTransfer ? '转账' : (newCat?.name || selectedTx.categoryName),
        categoryIcon: isTransfer ? '🔄' : (newCat?.icon || selectedTx.categoryIcon),
        categoryColor: isTransfer ? '#5b8dee' : (newCat?.color || selectedTx.categoryColor),
        subcategoryId: isTransfer ? undefined : editSubcategoryId,
        subcategoryName: isTransfer ? undefined : (editSubcategoryId ? (subCategories.find(s => s.id === editSubcategoryId)?.name || '') : ''),
        accountId: editAccountId,
        accountName: accounts.find(a => a.id === editAccountId)?.name || selectedTx.accountName,
        date: formatDateDisplay(editDate),
        transactionDate: editDate,
        time: editTime,
        tags: editTagIds,
      }
      setSelectedTx(updated)
      setEditMode(false)
      onSaved?.(updated)
    } catch (err) {
      console.error('更新失败:', err)
    }
  }

  const confirmDelete = async () => {
    if (!selectedTx) return
    try {
      const deletedId = selectedTx.id
      await deleteTransaction(deletedId)
      setShowDeleteConfirm(false)
      onDeleted?.(deletedId)
      onClose()
    } catch (err) {
      console.error('删除失败:', err)
    }
  }

  const addEditTag = (tagId: string) => {
    if (!editTagIds.includes(tagId)) setEditTagIds(prev => [...prev, tagId])
    if (authUser) recordTagUsage(authUser.id, tagId)
  }
  const removeEditTag = (tagId: string) => setEditTagIds(prev => prev.filter(id => id !== tagId))

  return (
    <>
      <BottomSheet
        isOpen={!!selectedTx}
        onClose={onClose}
        title={editMode ? '编辑交易' : '交易详情'}
      >
        {selectedTx && (() => {
          const cat = getCategory(selectedTx)
          const txTags = (editMode ? editTagIds : selectedTx.tags || [])
            .map((id: string) => tags.find(t => t.id === id))
            .filter(Boolean) as { id: string; name: string; color: string }[]
          const amountColor = selectedTx.type === 'income' ? 'text-danger' : selectedTx.type === 'expense' ? 'text-ink' : 'text-[#5b8dee]'
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
                    onChange={e => { setEditAmount(e.target.value); if (editAmountError) setEditAmountError('') }}
                    className="w-44 text-center text-3xl font-bold font-mono bg-brand-tint border border-[#e6e3da] rounded-xl px-3 py-1.5 outline-none"
                  />
                ) : (
                  <div className={`font-bold font-mono amount-fluid-lg ${amountColor}`}>
                    {selectedTx.type === 'transfer'
                      ? formatTransferAmount(selectedTx)
                      : formatCurrency(
                          selectedTx.type === 'expense'
                            ? -Math.abs(selectedTx.amount)
                            : Math.abs(selectedTx.amount),
                          selectedTx.type !== 'transfer',
                          false
                        )}
                  </div>
                )}
                <div className="text-sm text-ink-2 mt-1">{typeLabel}</div>
                {editAmountError && (
                  <div className="text-xs text-danger mt-1">{editAmountError}</div>
                )}
              </div>

              {/* 类型：编辑模式可切换 */}
              {editMode && (
                <div className="flex gap-2 px-4 pb-1">
                  {([['expense', '支出'], ['income', '收入'], ['transfer', '转账']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => {
                        setEditType(val)
                        // 切换类型后，如果当前分类不在新类型中，重置为第一个
                        const newList = val === 'income' ? categories.income : categories.expense
                        if (!newList.find(c => c.id === editCategoryId)) {
                          setEditCategoryId(newList[0]?.id || '')
                          setEditSubcategoryId(undefined)
                        }
                      }}
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
                {/* 分类（只显示当前类型对应的分类） */}
                {editType !== 'transfer' && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm text-ink-2 shrink-0">分类</span>
                    {editMode ? (
                      <button
                        onClick={() => setEditPicker('category')}
                        className="flex items-center gap-1 text-sm text-ink"
                      >
                        {categories[categoryListKey].find(c => c.id === editCategoryId)?.icon} {categories[categoryListKey].find(c => c.id === editCategoryId)?.name}
                        <span className="text-ink-2">›</span>
                      </button>
                    ) : (
                      <span className="text-sm text-ink">{cat.icon} {selectedTx.categoryName}</span>
                    )}
                  </div>
                )}

                {/* 子分类（标签形式，单选/不选） */}
                {editType !== 'transfer' && editMode && editSubcats.length > 0 && (
                  <div className="px-4 py-3">
                    <span className="text-sm text-ink-2 block mb-2">子分类</span>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => setEditSubcategoryId(undefined)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          !editSubcategoryId
                            ? 'bg-brand text-ink'
                            : 'bg-surface text-ink-2 border border-[#e6e3da] hover:bg-brand-tint'
                        }`}
                      >
                        无
                      </button>
                      {editSubcats.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setEditSubcategoryId(s.id)}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            editSubcategoryId === s.id
                              ? 'bg-brand text-ink'
                              : 'bg-surface text-ink-2 border border-[#e6e3da] hover:bg-brand-tint'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {editType !== 'transfer' && !editMode && selectedTx.subcategoryName && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm text-ink-2 shrink-0">子分类</span>
                    <span className="text-sm text-ink">{selectedTx.subcategoryName}</span>
                  </div>
                )}

                {/* 标签 */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-ink-2">标签</span>
                    {editMode && (
                      <button
                        onClick={() => setShowTagSelect(true)}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-dashed border-[#cfc9ba] text-ink-2 shrink-0"
                      >
                        + 添加
                      </button>
                    )}
                  </div>
                  {editMode ? (
                    txTags.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
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
                      </div>
                    ) : (
                      <span className="text-xs text-ink-2">—</span>
                    )
                  ) : txTags.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
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
                    <span className="text-xs text-ink-2">—</span>
                  )}
                </div>

                {/* 账户 */}
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
                    <span className="text-sm text-ink">
                      {selectedTx.type === 'transfer' && selectedTx.toAccountName
                        ? `${selectedTx.accountName} → ${selectedTx.toAccountName}`
                        : selectedTx.accountName}
                    </span>
                  )}
                </div>

                {/* 日期 + 时间 */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-2 shrink-0">日期</span>
                  {editMode ? (
                    <div className="flex gap-2 min-w-0 flex-1 justify-end">
                      <input
                        type="date"
                        value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-xl bg-brand-tint border border-[#e6e3da] text-sm text-ink outline-none"
                      />
                      <input
                        type="time"
                        value={editTime}
                        onChange={e => setEditTime(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-xl bg-brand-tint border border-[#e6e3da] text-sm text-ink outline-none"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-ink">{selectedTx.date} {selectedTx.time}</span>
                  )}
                </div>

                {/* 备注 */}
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

      {/* 标签选择 */}
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

      {/* 通用选择：分类 / 子分类 / 账户 */}
      <BottomSheet
        isOpen={editPicker !== null}
        onClose={() => setEditPicker(null)}
        title={editPicker === 'category' ? '选择分类' : '选择账户'}
      >
        <div className="p-4 space-y-2">
          {editPicker === 'category' && categoryList.map(c => (
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
    </>
  )
}
