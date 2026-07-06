import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import TransactionItem from '../components/ui/TransactionItem'
import BottomSheet from '../components/ui/BottomSheet'
import { 
  ArrowLeft, 
  Calendar, 
  ChevronDown, 
  Wallet, 
  FileText, 
  Trash2,
  Clock
} from 'lucide-react'

type FilterMode = 'all' | 'month'

export default function TransactionListPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { 
    transactions, 
    categories, 
    accounts,
    tags,
    updateTransaction,
    deleteTransaction,
  } = useApp()
  
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  
  // 查看/编辑详情
  const [selectedTransaction, setSelectedTransaction] = useState<typeof transactions[0] | null>(null)
  const [showDetailSheet, setShowDetailSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editMode, setEditMode] = useState(false)
  
  // 编辑表单
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')

  // 生成可用月份列表（从交易记录中提取）
  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    const now = new Date()
    // 默认包含最近12个月
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(months).sort().reverse()
  }, [])

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

  // 获取分类信息
  const getCategory = (t: typeof transactions[0]) => {
    if (t.type === 'transfer') return { icon: '↔️', color: '#5b8dee', name: '转账' }
    const list = categories[t.type === 'expense' ? 'expense' : 'income'] as any[]
    return list.find(c => c.id === t.categoryId) || { icon: '📝', color: '#87867f', name: '未分类' }
  }

  // 点击交易
  const handleTransactionClick = (t: typeof transactions[0]) => {
    setSelectedTransaction(t)
    setEditAmount(t.amount.toString())
    setEditNote(t.note || '')
    setEditMode(false)
    setShowDetailSheet(true)
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!selectedTransaction) return
    const newAmount = parseFloat(editAmount)
    if (isNaN(newAmount) || newAmount <= 0) return
    
    try {
      await updateTransaction(selectedTransaction.id, {
        amount: newAmount,
        note: editNote || undefined,
      })
      setShowDetailSheet(false)
      setSelectedTransaction(null)
    } catch (err) {
      console.error('更新失败:', err)
    }
  }

  // 删除交易
  const handleDelete = async () => {
    if (!selectedTransaction) return
    try {
      await deleteTransaction(selectedTransaction.id)
      setShowDeleteConfirm(false)
      setShowDetailSheet(false)
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
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 px-4 pt-3 pb-2 ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/', { replace: true })} 
              className={`p-1.5 rounded-full ${theme === 'dark' ? 'hover:bg-[#30302e]' : 'hover:bg-white'}`}
            >
              <ArrowLeft size={22} className={theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'} />
            </button>
            <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
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
                ? 'bg-[#c96442] text-white'
                : theme === 'dark' ? 'bg-[#30302e] text-[#b0aea5]' : 'bg-white text-[#5e5d59]'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterMode('month')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filterMode === 'month'
                ? 'bg-[#c96442] text-white'
                : theme === 'dark' ? 'bg-[#30302e] text-[#b0aea5]' : 'bg-white text-[#5e5d59]'
            }`}
          >
            按月筛选
          </button>
          {filterMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                theme === 'dark' ? 'bg-[#30302e] text-[#b0aea5]' : 'bg-white text-[#5e5d59]'
              }`}
            >
              {monthNames.map((name, idx) => (
                <option key={idx} value={idx + 1}>{name}</option>
              ))}
            </select>
          )}
        </div>
        <div className={`text-xs mt-2 ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
          共 {filteredTransactions.length} 条交易
        </div>
      </div>

      {/* 交易列表 */}
      <main className="px-4 pb-24">
        {filteredTransactions.length === 0 ? (
          <div className={`text-center py-16 ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
            <div className="text-4xl mb-3">📋</div>
            <p>暂无交易记录</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedTransactions).map(([date, dateTransactions]) => {
              const { income, expense } = getDateTotal(dateTransactions)
              return (
                <div key={date}>
                  {/* 日期头部 */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                      {date}
                    </span>
                    <span className={`text-xs ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
                      {expense > 0 && <span className="text-[#e05555] mr-2">支出 ¥{expense.toFixed(2)}</span>}
                      {income > 0 && <span className="text-[#2d8a5e]">收入 ¥{income.toFixed(2)}</span>}
                    </span>
                  </div>
                  <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
                    {dateTransactions.map(t => {
                      const cat = getCategory(t)
                      const transactionTags = t.tags
                        ? t.tags.map(tagId => tags.find(tg => tg.id === tagId)).filter(Boolean) as { id: string; name: string; color: string }[]
                        : undefined
                      return (
                        <TransactionItem
                          key={t.id}
                          icon={cat.icon}
                          iconBg={`${cat.color}15`}
                          title={t.categoryName}
                          subtitle={`${t.time} · ${t.accountName}`}
                          amount={t.amount}
                          type={t.type}
                          tags={transactionTags}
                          onClick={() => handleTransactionClick(t)}
                        />
                      )
                    })}
                  </Card>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* 交易详情/编辑弹窗 */}
      <BottomSheet
        isOpen={showDetailSheet}
        onClose={() => { setShowDetailSheet(false); setEditMode(false); }}
        title={editMode ? '编辑交易' : '交易详情'}
      >
        {selectedTransaction && (
          <div className="p-4 space-y-4">
            {!editMode ? (
              <>
                {/* 查看模式 */}
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">
                    {getCategory(selectedTransaction).icon}
                  </div>
                  <div className={`text-3xl font-bold font-mono ${
                    selectedTransaction.type === 'expense' ? 'text-[#e05555]' : 
                    selectedTransaction.type === 'income' ? 'text-[#2d8a5e]' : 'text-[#5b8dee]'
                  }`}>
                    {selectedTransaction.type === 'expense' ? '-' : selectedTransaction.type === 'income' ? '+' : ''}
                    ¥{selectedTransaction.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className={`text-sm mt-1 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
                    {selectedTransaction.type === 'expense' ? '支出' : selectedTransaction.type === 'income' ? '收入' : '转账'}
                  </div>
                </div>

                {/* 详情字段 */}
                <div className={`rounded-xl p-4 space-y-3 ${theme === 'dark' ? 'bg-[#30302e]' : 'bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>分类</span>
                    <span className={`text-sm ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                      {getCategory(selectedTransaction).icon} {selectedTransaction.categoryName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>账户</span>
                    <span className={`text-sm ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                      {selectedTransaction.accountName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>日期</span>
                    <span className={`text-sm ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                      {selectedTransaction.date} {selectedTransaction.time}
                    </span>
                  </div>
                  {selectedTransaction.tags && selectedTransaction.tags.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>标签</span>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {selectedTransaction.tags.map(tagId => {
                          const tag = tags.find(t => t.id === tagId);
                          return tag ? (
                            <span
                              key={tagId}
                              className="px-2 py-0.5 rounded-full text-xs text-white"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  {selectedTransaction.note && (
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>备注</span>
                      <span className={`text-sm ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                        {selectedTransaction.note}
                      </span>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setEditMode(true); setShowDeleteConfirm(false); }}
                    className="flex-1 py-3 rounded-xl bg-[#c96442] text-white font-medium hover:bg-[#b55335] transition-colors"
                  >
                    修改
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 py-3 rounded-xl bg-[#e05555]/10 text-[#e05555] font-medium hover:bg-[#e05555]/20 transition-colors"
                  >
                    删除
                  </button>
                </div>

                {/* 删除确认 */}
                {showDeleteConfirm && (
                  <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-[#30302e]' : 'bg-white'}`}>
                    <p className={`text-sm text-center mb-3 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
                      确定要删除这笔交易吗？此操作不可撤销。
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className={`flex-1 py-2 rounded-lg text-sm ${
                          theme === 'dark' ? 'bg-[#4a4a47] text-[#b0aea5]' : 'bg-[#e8e6dc] text-[#5e5d59]'
                        }`}
                      >
                        取消
                      </button>
                      <button
                        onClick={handleDelete}
                        className="flex-1 py-2 rounded-lg bg-[#e05555] text-white text-sm"
                      >
                        确认删除
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 编辑模式 */}
                <div>
                  <label className={`text-sm mb-2 block ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
                    金额
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>¥</span>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className={`flex-1 px-4 py-3 rounded-xl text-lg font-mono ${
                        theme === 'dark' ? 'bg-[#30302e] text-[#faf9f5]' : 'bg-white text-[#141413]'
                      } focus:outline-none focus:ring-2 focus:ring-[#c96442]/50`}
                      step="0.01"
                      min="0.01"
                    />
                  </div>
                </div>

                <div>
                  <label className={`text-sm mb-2 block ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
                    备注
                  </label>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="添加备注..."
                    rows={3}
                    className={`w-full px-4 py-3 rounded-xl resize-none ${
                      theme === 'dark' ? 'bg-[#30302e] text-[#faf9f5] placeholder-[#87867f]' : 'bg-white text-[#141413] placeholder-[#b0aea5]'
                    } focus:outline-none focus:ring-2 focus:ring-[#c96442]/50`}
                  />
                </div>

                {/* 分类和账户信息（只读提示） */}
                <div className={`p-3 rounded-xl text-xs ${theme === 'dark' ? 'bg-[#30302e] text-[#87867f]' : 'bg-[#f5f4ed] text-[#b0aea5]'}`}>
                  分类: {selectedTransaction.categoryName} · 账户: {selectedTransaction.accountName} · 日期: {selectedTransaction.date}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setEditMode(false)}
                    className={`flex-1 py-3 rounded-xl ${
                      theme === 'dark' ? 'bg-[#4a4a47] text-[#b0aea5]' : 'bg-[#e8e6dc] text-[#5e5d59]'
                    }`}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 py-3 rounded-xl bg-[#c96442] text-white font-medium hover:bg-[#b55335] transition-colors"
                  >
                    保存
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
