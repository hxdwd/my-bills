import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import ProgressRing from '../components/ui/ProgressRing'
import BottomSheet from '../components/ui/BottomSheet'
import { Plus, AlertTriangle, Edit3 } from 'lucide-react'

export default function BudgetPage() {
  const { theme } = useTheme()
  const { budgets, categories, getBudgetProgress, getCategoryBudgetSpent, addBudget, updateBudget } = useApp()
  const [showAddBudget, setShowAddBudget] = useState(false)
  
  // 编辑弹窗状态
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; amount: number; categoryId?: string } | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [saving, setSaving] = useState(false)

  // 添加预算状态
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [adding, setAdding] = useState(false)

  const budgetProgress = getBudgetProgress()
  const categoryBudgets = budgets.filter(b => b.categoryId)

  // 当前月份
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = daysInMonth - now.getDate() + 1
  const dailyBudget = daysRemaining > 0 ? (budgetProgress.total - budgetProgress.spent) / daysRemaining : 0
  const currentMonthDisplay = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })

  // 总预算对象
  const totalBudget = budgets.find(b => !b.categoryId && b.month === currentMonth)

  // 打开编辑弹窗
  const openEdit = (id: string, name: string, amount: number, categoryId?: string) => {
    setEditTarget({ id, name, amount, categoryId })
    setEditAmount(amount.toString())
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editTarget || saving) return
    const amount = parseFloat(editAmount)
    if (isNaN(amount) || amount <= 0) return
    
    setSaving(true)
    try {
      if (editTarget.id === '__new_total__') {
        // 新建总预算
        await addBudget({
          month: currentMonth,
          categoryId: undefined,
          categoryName: undefined,
          amount,
          spent: budgetProgress.spent,
        })
      } else {
        await updateBudget(editTarget.id, { amount })
      }
      setEditTarget(null)
    } catch (err) {
      console.error('保存预算失败:', err)
    } finally {
      setSaving(false)
    }
  }

  // 添加分类预算
  const handleAddBudget = async () => {
    if (!selectedCategoryId || adding) return
    const amount = parseFloat(addAmount)
    if (isNaN(amount) || amount <= 0) return

    const category = categories.expense.find(c => c.id === selectedCategoryId)
    if (!category) return

    setAdding(true)
    try {
      await addBudget({
        month: currentMonth,
        categoryId: selectedCategoryId,
        categoryName: category.name,
        amount,
      })
      setShowAddBudget(false)
      setSelectedCategoryId(null)
      setAddAmount('')
    } catch (err) {
      console.error('添加预算失败:', err)
    } finally {
      setAdding(false)
    }
  }

  // 关闭添加弹窗
  const closeAddSheet = () => {
    setShowAddBudget(false)
    setSelectedCategoryId(null)
    setAddAmount('')
  }

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
          预算
        </h1>
      </header>

      <main className="px-5 tabbar-safe space-y-4 animate-page-fade">
        {/* Month Selector */}
        <div className={`px-4 py-3 rounded-2xl bg-surface`}>
          <span className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            {currentMonthDisplay}
          </span>
        </div>

        {/* Main Budget Card */}
        <Card className="!p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              总预算
            </h3>
            {totalBudget && (
              <button
                onClick={() => openEdit(totalBudget.id, '总预算', totalBudget.amount)}
                className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-brand-tint' : 'hover:bg-brand-tint'}`}
              >
                <Edit3 size={14} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-center mb-6">
            <ProgressRing
              progress={budgetProgress.percentage}
              size={160}
              strokeWidth={14}
              color={budgetProgress.percentage > 80 ? '#FF6B6B' : budgetProgress.percentage > 60 ? '#E5C45E' : '#4CAF50'}
            >
              <div className="text-center">
                <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                  {budgetProgress.percentage}%
                </div>
                <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                  已使用
                </div>
              </div>
            </ProgressRing>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                已花费
              </div>
              <div className={`text-xl font-bold font-mono text-danger`}>
                ¥{budgetProgress.spent.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                剩余
              </div>
              <div className={`text-xl font-bold font-mono ${budgetProgress.total - budgetProgress.spent >= 0 ? 'text-ok' : 'text-danger'}`}>
                ¥{(budgetProgress.total - budgetProgress.spent).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className={`flex items-center justify-between p-3 rounded-xl ${theme === 'dark' ? 'bg-surface' : 'bg-bg'}`}>
            <div>
              <div className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                剩余 {daysRemaining} 天
              </div>
              <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                日均可用 ¥{dailyBudget.toFixed(0)}
              </div>
            </div>
            <button
              onClick={() => {
                if (totalBudget) {
                  openEdit(totalBudget.id, '总预算', totalBudget.amount)
                } else {
                  // 没有总预算时，先创建
                  setEditTarget({ id: '__new_total__', name: '总预算', amount: 0 })
                  setEditAmount('')
                }
              }}
              className={`text-sm font-medium ${theme === 'dark' ? 'text-ink-2 hover:text-ink' : 'text-ink-2 hover:text-ink'} transition-colors`}
            >
              {totalBudget ? '预算 ¥' + totalBudget.amount.toLocaleString() : '设置总预算'}
            </button>
          </div>
        </Card>

        {/* Over Budget Warning */}
        {(() => {
          const overBudgetCategories = categoryBudgets.filter(b => {
            const spent = getCategoryBudgetSpent(b.categoryId!)
            return spent > b.amount
          })
          if (overBudgetCategories.length === 0) return null
          return (
            <Card className="!p-4 border-danger/30 bg-danger/5">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle size={20} className="text-danger" />
                <span className="font-medium text-danger">超支提醒</span>
              </div>
              <div className="space-y-2">
                {overBudgetCategories.map(b => {
                  const spent = getCategoryBudgetSpent(b.categoryId!)
                  return (
                    <div key={b.id} className="flex items-center justify-between">
                      <span className={`text-sm ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                        {b.categoryName}
                      </span>
                      <span className="text-sm text-danger">
                        超支 ¥{(spent - b.amount).toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })()}

        {/* Category Budgets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              分类预算
            </h3>
            <button
              onClick={() => setShowAddBudget(true)}
              className="text-ink text-sm font-medium"
            >
              + 添加
            </button>
          </div>

          <div className="space-y-3">
            {categoryBudgets.map((budget) => {
              const category = categories.expense.find(c => c.id === budget.categoryId)
              const realSpent = getCategoryBudgetSpent(budget.categoryId!)
              const percentage = budget.amount > 0 ? Math.round((realSpent / budget.amount) * 100) : 0
              const isOver = realSpent > budget.amount
              
              return (
                <Card key={budget.id} className="!p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{ backgroundColor: category ? `${category.color}15` : '#FFF7E6' }}
                    >
                      {category?.icon || '📝'}
                    </div>
                    <div className="flex-1">
                      <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                        {budget.categoryName}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-sm font-mono ${isOver ? 'text-danger' : theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                          ¥{realSpent.toLocaleString()}
                        </span>
                        <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                          / ¥{budget.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isOver ? 'text-danger' : percentage > 80 ? 'text-brand-strong' : 'text-ok'}`}>
                        {isOver ? '超支' : `${percentage}%`}
                      </span>
                      <button
                        onClick={() => openEdit(budget.id, budget.categoryName || '分类', budget.amount, budget.categoryId)}
                        className={`p-1 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-brand-tint' : 'hover:bg-brand-tint'}`}
                      >
                        <Edit3 size={14} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className={`h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-surface' : 'bg-brand-tint'}`}>
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOver ? 'bg-danger' : percentage > 80 ? 'bg-[#E5C45E]' : 'bg-ok'
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  
                  {isOver && (
                    <div className="mt-2 text-xs text-danger">
                      已超支 ¥{(realSpent - budget.amount).toLocaleString()}
                    </div>
                  )}
                </Card>
              )
            })}

            {categoryBudgets.length === 0 && (
              <div className={`text-center py-8 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                <p className="text-sm">暂无分类预算</p>
                <button
                  onClick={() => setShowAddBudget(true)}
                  className="mt-2 text-ink text-sm font-medium"
                >
                  + 添加分类预算
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Budget Sheet */}
      <BottomSheet
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget?.name ? `编辑${editTarget.name}预算` : '编辑预算'}
      >
        <div className="p-4 space-y-4">
          <div>
            <label className={`block text-sm mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              预算金额
            </label>
            <div className="relative">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                ¥
              </span>
              <input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="输入预算金额"
                className={`w-full pl-8 pr-4 py-3 rounded-xl text-lg font-mono
                  ${theme === 'dark' 
                    ? 'bg-surface text-ink placeholder-[#87867f]' 
                    : 'bg-bg text-ink placeholder-[#b0aea5]'
                  } outline-none focus:ring-2 focus:ring-brand/40`}
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setEditTarget(null)}
              className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors
                ${theme === 'dark' ? 'bg-surface text-ink-2 hover:bg-brand-tint' : 'bg-brand-tint text-ink-2 hover:bg-[#dedad0]'}`}
            >
              取消
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editAmount || parseFloat(editAmount) <= 0}
              className="flex-1 py-3 bg-brand text-white rounded-xl font-medium text-sm
                disabled:opacity-50 disabled:cursor-not-allowed active:bg-brand-strong transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Add Category Budget Sheet */}
      <BottomSheet
        isOpen={showAddBudget}
        onClose={closeAddSheet}
        title="添加分类预算"
      >
        <div className="p-4 space-y-4">
          {/* 选择分类 */}
          <div>
            <label className={`block text-sm mb-3 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              选择分类
            </label>
            <div className="grid grid-cols-4 gap-2">
              {categories.expense
                .filter(cat => !categoryBudgets.some(b => b.categoryId === cat.id))
                .map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id)}
                    className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all
                      ${cat.id === selectedCategoryId
                        ? 'bg-brand/15 ring-2 ring-brand'
                        : theme === 'dark' 
                          ? 'bg-surface hover:bg-brand-tint' 
                          : 'bg-bg hover:bg-brand-tint'
                      }`}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className={`text-xs ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                      {cat.name}
                    </span>
                  </button>
                ))}
              {categories.expense.filter(cat => !categoryBudgets.some(b => b.categoryId === cat.id)).length === 0 && (
                <div className="col-span-4 text-center py-4 text-sm text-ink-2">
                  所有分类已设置预算
                </div>
              )}
            </div>
          </div>

          {/* 预算金额 */}
          <div>
            <label className={`block text-sm mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              预算金额
            </label>
            <div className="relative">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                ¥
              </span>
              <input
                type="number"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="输入预算金额"
                className={`w-full pl-8 pr-4 py-3 rounded-xl text-lg font-mono
                  ${theme === 'dark' 
                    ? 'bg-surface text-ink placeholder-[#87867f]' 
                    : 'bg-bg text-ink placeholder-[#b0aea5]'
                  } outline-none focus:ring-2 focus:ring-brand/40`}
              />
            </div>
          </div>

          {/* 保存按钮 */}
          <button
            onClick={handleAddBudget}
            disabled={adding || !selectedCategoryId || !addAmount || parseFloat(addAmount) <= 0}
            className="w-full py-3 bg-brand text-white rounded-xl font-medium
              disabled:opacity-50 disabled:cursor-not-allowed active:bg-brand-strong transition-colors"
          >
            {adding ? '添加中...' : '保存'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
