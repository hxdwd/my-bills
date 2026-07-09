import { useTheme } from '../context/ThemeContext'
import { useApp, Account } from '../context/AppContext'
import Card from '../components/ui/Card'
import BottomSheet from '../components/ui/BottomSheet'
import { useState, useMemo, useCallback } from 'react'
import { TrendingUp, TrendingDown, Plus, ChevronRight, Trash2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const accountTypeOptions = [
  { icon: '💵', label: '现金', type: 'cash', color: '#2d8a5e' },
  { icon: '🏦', label: '银行卡', type: 'bank', color: '#1e88e5' },
  { icon: '💳', label: '信用卡', type: 'credit', color: '#e05555' },
  { icon: '💚', label: '微信', type: 'wechat', color: '#07c160' },
  { icon: '💙', label: '支付宝', type: 'alipay', color: '#1677ff' },
  { icon: '🪙', label: '数字货币', type: 'crypto', color: '#f7931a' },
  { icon: '📈', label: '投资账户', type: 'investment', color: '#9c27b0' },
]

const colorOptions = [
  '#1e88e5', '#43a047', '#e53935', '#fb8c00', '#8e24aa',
  '#00acc1', '#3949ab', '#d81b60', '#6d4c41', '#546e7a',
  '#2d8a5e', '#07c160', '#1677ff', '#f7931a', '#e05555',
]

const accountTypeLabels: Record<string, string> = {
  bank: '银行卡',
  wechat: '微信支付',
  alipay: '支付宝',
  cash: '现金',
  credit: '信用卡',
  crypto: '数字货币',
  investment: '投资账户',
  debt: '负债账户',
}

export default function AssetsPage() {
  const { theme } = useTheme()
  const { accounts, getTotalAssets, getTotalLiabilities, getNetAssets, addAccount, updateAccount, setDefaultAccount, deleteAccount, getAssetTrend } = useApp()
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // 排序状态：'amount-desc' | 'amount-asc' | null
  const [sortOrder, setSortOrder] = useState<'amount-desc' | 'amount-asc' | null>(null)

  // 新增账户表单初始值
  const initNewAccountForm = {
    name: '',
    type: 'bank' as Account['type'],
    icon: '🏦',
    color: '#1e88e5',
    balance: 0,
  }

  // 编辑账户表单初始值
  const initEditForm = {
    name: '',
    type: 'bank' as Account['type'],
    icon: '🏦',
    color: '#1e88e5',
    balance: 0,
  }

  const [newAccountForm, setNewAccountForm] = useState(initNewAccountForm)
  const [editForm, setEditForm] = useState(initEditForm)

  const totalAssets = getTotalAssets()
  const totalLiabilities = getTotalLiabilities()
  const netAssets = getNetAssets()
  const assetTrend = getAssetTrend(6)

  // 资产账户：非负债类型的账户（余额 >= 0）
  const assetAccountsRaw = accounts.filter(a => a.type !== 'credit' && a.type !== 'debt' && a.balance >= 0)
  // 负债账户：负债类型的账户 或 余额为负的账户
  const liabilityAccounts = accounts.filter(a => a.type === 'credit' || a.type === 'debt' || a.balance < 0)

  // 根据排序方式排列资产账户
  const assetAccounts = useMemo(() => {
    const sorted = [...assetAccountsRaw]
    if (sortOrder === 'amount-desc') {
      sorted.sort((a, b) => b.balance - a.balance)
    } else if (sortOrder === 'amount-asc') {
      sorted.sort((a, b) => a.balance - b.balance)
    }
    return sorted
  }, [assetAccountsRaw, sortOrder])

  // 排序按钮点击切换
  const handleSortToggle = () => {
    setSortOrder(prev => {
      if (prev === null) return 'amount-desc'
      if (prev === 'amount-desc') return 'amount-asc'
      return null
    })
  }

  // 获取排序图标
  const getSortIcon = () => {
    if (sortOrder === null) return <ArrowUpDown size={14} />
    if (sortOrder === 'amount-desc') return <ArrowDown size={14} />
    return <ArrowUp size={14} />
  }

  const pieData = {
    labels: assetAccounts.map(a => a.name),
    datasets: [{
      data: assetAccounts.map(a => a.balance),
      backgroundColor: assetAccounts.map(a => a.color),
      borderWidth: 0,
      hoverOffset: 4,
    }]
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => ` ¥${context.raw.toLocaleString()}`
        }
      }
    },
    cutout: '65%',
  }

  // 打开新增账户弹窗
  const handleOpenAdd = () => {
    setNewAccountForm({ ...initNewAccountForm })
    setShowAddAccount(true)
  }

  // 关闭新增账户弹窗
  const handleCloseAdd = () => {
    setShowAddAccount(false)
    setNewAccountForm({ ...initNewAccountForm })
  }

  // 提交新增账户
  const handleAddAccount = async () => {
    if (!newAccountForm.name.trim()) return
    try {
      await addAccount({
        name: newAccountForm.name.trim(),
        type: newAccountForm.type,
        icon: newAccountForm.icon,
        color: newAccountForm.color,
        balance: newAccountForm.balance,
      })
      setShowAddAccount(false)
    } catch (e) {
      console.error('添加账户失败:', e)
    }
  }

  // 打开编辑弹窗
  const handleOpenEdit = (account: Account) => {
    setEditForm({
      name: account.name,
      type: account.type,
      icon: account.icon,
      color: account.color,
      balance: account.balance,
    })
    setEditingAccount(account)
    setShowDeleteConfirm(false)
  }

  // 关闭编辑弹窗
  const handleCloseEdit = () => {
    setEditingAccount(null)
    setEditForm({ ...initEditForm })
    setShowDeleteConfirm(false)
  }

  // 提交编辑
  const handleSaveEdit = async () => {
    if (!editingAccount || !editForm.name.trim()) return
    try {
      await updateAccount(editingAccount.id, {
        name: editForm.name.trim(),
        type: editForm.type,
        icon: editForm.icon,
        color: editForm.color,
        balance: editForm.balance,
      })
      setEditingAccount(null)
      setEditForm({ ...initEditForm })
    } catch (e) {
      console.error('更新账户失败:', e)
    }
  }

  // 删除账户
  const handleDelete = async () => {
    if (!editingAccount) return
    try {
      await deleteAccount(editingAccount.id)
      setEditingAccount(null)
      setEditForm({ ...initEditForm })
      setShowDeleteConfirm(false)
    } catch (e) {
      console.error('删除账户失败:', e)
    }
  }

  // 渲染账户类型选择器（新增和编辑共用）
  const renderTypeSelector = (
    selectedType: string,
    onSelect: (type: string, icon: string, color: string) => void
  ) => (
    <div className="grid grid-cols-4 gap-2">
      {accountTypeOptions.map((opt) => (
        <button
          key={opt.type}
          onClick={() => onSelect(opt.type, opt.icon, opt.color)}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all border-2
            ${selectedType === opt.type
              ? theme === 'dark'
                ? 'border-brand bg-brand/10'
                : 'border-brand bg-brand-tint'
              : theme === 'dark'
                ? 'border-transparent bg-surface hover:bg-surface'
                : 'border-transparent bg-bg hover:bg-brand-tint'
            }`}
        >
          <span className="text-xl">{opt.icon}</span>
          <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            {opt.label}
          </span>
        </button>
      ))}
    </div>
  )

  // 渲染颜色选择器
  const renderColorPicker = (
    selectedColor: string,
    onSelect: (color: string) => void
  ) => (
    <div className="flex flex-wrap gap-2">
      {colorOptions.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          className={`w-8 h-8 rounded-full transition-all border-2
            ${selectedColor === color ? 'border-[#141413] dark:border-[#faf9f5] scale-110' : 'border-transparent hover:scale-105'}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
          资产
        </h1>
      </header>

      <main className="px-5 tabbar-safe space-y-4 animate-page-fade">
        {/* Total Assets Card */}
        <Card className="!p-5">
          <div className="text-center mb-4">
            <p className={`text-sm mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              总资产
            </p>
            <div className={`text-3xl font-bold font-mono ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              ¥{totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-brand-tint dark:border-brand-tint">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp size={14} className="text-ok" />
                <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>净资产</span>
              </div>
              <div className={`text-lg font-bold font-mono ${netAssets >= 0 ? 'text-ok' : 'text-danger'}`}>
                ¥{netAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingDown size={14} className="text-danger" />
                <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>负债</span>
              </div>
              <div className="text-lg font-bold font-mono text-danger">
                -¥{totalLiabilities.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </Card>

        {/* Asset Distribution */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            资产分布
          </h3>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32">
              <Pie data={pieData} options={pieOptions} />
            </div>
            <div className="flex-1 space-y-2">
              {assetAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: acc.color }}
                    />
                    <span className={`text-sm ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                      {acc.name}
                    </span>
                  </div>
                  <span className={`text-sm font-mono ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    ¥{acc.balance.toLocaleString('zh-CN', { minimumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Asset Accounts */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              资产账户
            </h3>
            <button
              onClick={handleSortToggle}
              className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors ${
                sortOrder !== null
                  ? 'bg-brand text-white'
                  : theme === 'dark' ? 'bg-surface text-ink-2 hover:text-ink' : 'bg-brand-tint text-ink-2 hover:text-ink'
              }`}
            >
              {getSortIcon()}
              <span>金额排序</span>
            </button>
          </div>
          <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
            {assetAccounts.length === 0 && (
              <div className="p-6 text-center">
                <span className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                  暂无资产账户，点击下方按钮添加
                </span>
              </div>
            )}
            {assetAccounts.map((acc) => (
              <div 
                key={acc.id}
                onClick={() => handleOpenEdit(acc)}
                className={`flex items-center gap-3 p-4 cursor-pointer transition-colors
                  ${theme === 'dark' ? 'hover:bg-surface' : 'hover:bg-[#faf9f5]'}`}
              >
                <div 
                  className="relative w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: `${acc.color}15` }}
                >
                  {acc.icon}
                  {acc.isDefault && (
                    <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand border-2 flex items-center justify-center text-[8px] leading-none text-white font-bold ${theme === 'dark' ? 'border-[#141413]' : 'border-[#faf9f5]'}`}>
                      ✓
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`font-medium truncate block ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                    {acc.name}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                      {accountTypeLabels[acc.type]}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                    ¥{acc.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <ChevronRight size={18} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
              </div>
            ))}
          </Card>
        </div>

        {/* Liability Accounts */}
        {liabilityAccounts.length > 0 && (
          <div>
            <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              负债账户
            </h3>
            <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
              {liabilityAccounts.map((acc) => (
                <div 
                  key={acc.id}
                  onClick={() => handleOpenEdit(acc)}
                  className={`flex items-center gap-3 p-4 cursor-pointer transition-colors
                    ${theme === 'dark' ? 'hover:bg-surface' : 'hover:bg-[#faf9f5]'}`}
                >
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${acc.color}15` }}
                  >
                    {acc.icon}
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                      {acc.name}
                    </div>
                    <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                      {accountTypeLabels[acc.type]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-medium text-danger">
                      -¥{Math.abs(acc.balance).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <ChevronRight size={18} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Add Account Button */}
        <button
          onClick={handleOpenAdd}
          className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed transition-colors
            ${theme === 'dark' 
              ? 'border-brand-tint text-ink-2 hover:bg-surface' 
              : 'border-brand-tint text-ink-2 hover:bg-[#faf9f5]'
            }`}
        >
          <Plus size={20} />
          <span className="font-medium">添加账户</span>
        </button>

        {/* Assets Trend */}
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              资产趋势
            </h3>
            <span className="text-xs text-ok bg-ok/10 px-2 py-1 rounded-full">
              近6个月
            </span>
          </div>
          <div className="h-40 flex items-end justify-between gap-2">
            {assetTrend.values.length > 0 ? (
              assetTrend.values.map((value, i) => {
                const maxVal = Math.max(...assetTrend.values, 1)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div 
                      className="w-full bg-gradient-to-t from-brand to-brand-strong rounded-t-md"
                      style={{ height: `${(value / maxVal) * 100}%` }}
                    />
                    <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                      {assetTrend.labels[i]}
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="w-full text-center text-sm text-ink-2">
                暂无数据，开始添加交易吧
              </div>
            )}
          </div>
        </Card>
      </main>

      {/* Add Account Sheet */}
      <BottomSheet
        isOpen={showAddAccount}
        onClose={handleCloseAdd}
        title="添加账户"
        footer={
          <div className="flex gap-3">
            <button
              onClick={handleCloseAdd}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors
                ${theme === 'dark'
                  ? 'bg-surface text-ink hover:bg-brand-tint'
                  : 'bg-bg text-ink hover:bg-brand-tint'
                }`}
            >
              取消
            </button>
            <button
              onClick={handleAddAccount}
              disabled={!newAccountForm.name.trim()}
              className={`flex-1 py-3 rounded-xl font-medium transition-all
                ${newAccountForm.name.trim()
                  ? 'bg-brand text-white hover:bg-brand-strong active:scale-[0.98]'
                  : 'bg-brand-tint dark:bg-surface text-ink-2 cursor-not-allowed'
                }`}
            >
              确认添加
            </button>
          </div>
        }
      >
        <div className="p-4 space-y-4">
          {/* 账户名称 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              账户名称
            </label>
            <input
              type="text"
              value={newAccountForm.name}
              onChange={(e) => setNewAccountForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：工资卡"
              className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors
                ${theme === 'dark'
                  ? 'bg-surface border-brand-tint text-ink focus:border-brand'
                  : 'bg-bg border-brand-tint text-ink focus:border-brand'
                }`}
            />
          </div>

          {/* 账户类型 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              账户类型
            </label>
            {renderTypeSelector(newAccountForm.type, (type, icon, color) => {
              setNewAccountForm(prev => ({ ...prev, type: type as Account['type'], icon, color }))
            })}
          </div>

          {/* 颜色 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              标识颜色
            </label>
            {renderColorPicker(newAccountForm.color, (color) => {
              setNewAccountForm(prev => ({ ...prev, color }))
            })}
          </div>

          {/* 初始余额 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              初始余额 (¥)
            </label>
            <input
              type="number"
              value={newAccountForm.balance || ''}
              onChange={(e) => setNewAccountForm(prev => ({ ...prev, balance: e.target.value === '' ? 0 : Number(e.target.value) }))}
              placeholder="0"
              className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors font-mono
                ${theme === 'dark'
                  ? 'bg-surface border-brand-tint text-ink focus:border-brand'
                  : 'bg-bg border-brand-tint text-ink focus:border-brand'
                }`}
            />
          </div>
        </div>
      </BottomSheet>

      {/* Edit Account Sheet */}
      <BottomSheet
        isOpen={!!editingAccount}
        onClose={handleCloseEdit}
        title="编辑账户"
        footer={
          showDeleteConfirm ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors
                  ${theme === 'dark'
                    ? 'bg-surface text-ink hover:bg-brand-tint'
                    : 'bg-bg text-ink hover:bg-brand-tint'
                  }`}
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-xl font-medium bg-danger text-white hover:brightness-95 transition-colors"
              >
                确认删除
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleCloseEdit}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors
                  ${theme === 'dark'
                    ? 'bg-surface text-ink hover:bg-brand-tint'
                    : 'bg-bg text-ink hover:bg-brand-tint'
                  }`}
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editForm.name.trim()}
                className={`flex-1 py-3 rounded-xl font-medium transition-all
                  ${editForm.name.trim()
                    ? 'bg-brand text-white hover:bg-brand-strong active:scale-[0.98]'
                    : 'bg-brand-tint dark:bg-surface text-ink-2 cursor-not-allowed'
                  }`}
              >
                保存修改
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={`px-4 py-3 rounded-xl transition-colors flex items-center justify-center
                  ${theme === 'dark'
                    ? 'bg-surface text-danger hover:bg-brand-tint'
                    : 'bg-bg text-danger hover:bg-brand-tint'
                  }`}
              >
                <Trash2 size={18} />
              </button>
            </div>
          )
        }
      >
        {editingAccount && (
          <div className="p-4 space-y-4">
            {showDeleteConfirm ? (
              <div className={`flex items-start gap-3 p-4 rounded-xl ${theme === 'dark' ? 'bg-danger/10' : 'bg-danger/5'}`}>
                <AlertCircle size={20} className="text-danger mt-0.5 shrink-0" />
                <div>
                  <p className={`text-sm font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                    确定要删除「{editingAccount.name}」吗？
                  </p>
                  <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    删除后账户及其余额将无法恢复，相关的交易记录不受影响。
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* 当前余额 */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    当前余额 (¥)
                  </label>
                  <input
                    type="number"
                    value={editForm.balance || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, balance: e.target.value === '' ? 0 : Number(e.target.value) }))}
                    placeholder="0"
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors font-mono
                      ${editForm.balance < 0 ? 'text-danger' : ''}
                      ${theme === 'dark'
                        ? 'bg-surface border-brand-tint text-ink focus:border-brand'
                        : 'bg-bg border-brand-tint text-ink focus:border-brand'
                      }`}
                  />
                </div>

                {/* 账户名称 */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    账户名称
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors
                      ${theme === 'dark'
                        ? 'bg-surface border-brand-tint text-ink focus:border-brand'
                        : 'bg-bg border-brand-tint text-ink focus:border-brand'
                      }`}
                  />
                </div>

                {/* 账户类型 */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    账户类型
                  </label>
                  {renderTypeSelector(editForm.type, (type, icon, color) => {
                    setEditForm(prev => ({ ...prev, type: type as Account['type'], icon, color }))
                  })}
                </div>

                {/* 图标 */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    图标
                  </label>
                  <div className="grid grid-cols-8 gap-2">
                    {['💵','🏦','💳','💚','💙','🪙','📈','💰','🏠','🚗','🎓','✈️','🏥','🎮','🍔','📱'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setEditForm(prev => ({ ...prev, icon: emoji }))}
                        className={`w-10 h-10 flex items-center justify-center text-lg rounded-lg transition-all border-2
                          ${editForm.icon === emoji
                            ? theme === 'dark'
                              ? 'border-brand bg-brand/10'
                              : 'border-brand bg-brand-tint'
                            : 'border-transparent hover:bg-bg'
                          }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 颜色 */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    标识颜色
                  </label>
                  {renderColorPicker(editForm.color, (color) => {
                    setEditForm(prev => ({ ...prev, color }))
                  })}
                </div>

                {/* 设为默认账户 */}
                <div className="pt-2 border-t border-brand-tint dark:border-brand-tint">
                  <button
                    onClick={async () => {
                      if (!editingAccount) return
                      try {
                        await setDefaultAccount(editingAccount.id)
                        handleCloseEdit()
                      } catch (e) {
                        console.error('设置默认账户失败:', e)
                      }
                    }}
                    disabled={editingAccount?.isDefault}
                    className={`w-full py-3 rounded-xl font-medium text-sm transition-all
                      ${editingAccount?.isDefault
                        ? 'bg-brand/10 text-ink cursor-not-allowed'
                        : 'bg-brand text-white hover:bg-brand-strong active:scale-[0.98]'
                      }`}
                  >
                    {editingAccount?.isDefault ? '✓ 已是默认账户' : '设为默认账户'}
                  </button>
                  {!editingAccount?.isDefault && (
                    <p className={`text-xs text-center mt-1.5 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                      设为默认后，记一笔时将自动选择此账户
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
