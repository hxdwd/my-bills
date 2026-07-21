import { useTheme } from '../context/ThemeContext'
import { useApp, Account } from '../context/AppContext'
import Card from '../components/ui/Card'
import BottomSheet from '../components/ui/BottomSheet'
import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Plus, ChevronRight, Trash2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { formatCurrency, formatTransferAmount } from '../utils/format'
import { useWealthValuation } from '../hooks/useWealthValuation'
import { toBase } from '../utils/currency'

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

const currencySymbol: Record<string, string> = {
  CNY: '¥', USD: '$', HKD: 'HK$',
}

export default function AssetsPage() {
  const { theme } = useTheme()
  const { accounts, loading, transfers, getTotalLiabilities, addAccount, updateAccount, setDefaultAccount, deleteAccount, getAssetTrend } = useApp()
  // 汇率数据 + 持仓估值（用于投资账户展示持仓市值）
  const { rates, results } = useWealthValuation()
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [sortOrder, setSortOrder] = useState<'amount-desc' | 'amount-asc' | null>(null)

  // 账户信息视图（点击账户行打开，只读）：账户属性 + 相关转账
  const [infoAccount, setInfoAccount] = useState<Account | null>(null)
  const [showAccountInfo, setShowAccountInfo] = useState(false)
  const ACCOUNT_TX_PAGE = 10
  const [infoVisibleTx, setInfoVisibleTx] = useState(ACCOUNT_TX_PAGE)

  const initNewAccountForm = {
    name: '',
    type: 'bank' as Account['type'],
    icon: '🏦',
    color: '#1e88e5',
    balance: 0,
    currency: 'CNY' as string,
  }

  const initEditForm = {
    name: '',
    type: 'bank' as Account['type'],
    icon: '🏦',
    color: '#1e88e5',
    balance: 0,
    currency: 'CNY' as string,
  }

  const [newAccountForm, setNewAccountForm] = useState(initNewAccountForm)
  const [editForm, setEditForm] = useState(initEditForm)

  const totalLiabilities = getTotalLiabilities()
  const assetTrend = getAssetTrend(6)

  // 资产账户：非负债类型的账户（余额 >= 0）
  const assetAccountsRaw = accounts.filter(a => a.type !== 'credit' && a.type !== 'debt' && a.balance >= 0)
  const liabilityAccounts = accounts.filter(a => a.type === 'credit' || a.type === 'debt' || a.balance < 0)

  const assetAccounts = useMemo(() => {
    const sorted = [...assetAccountsRaw]
    if (sortOrder === 'amount-desc') {
      sorted.sort((a, b) => b.balance - a.balance)
    } else if (sortOrder === 'amount-asc') {
      sorted.sort((a, b) => a.balance - b.balance)
    }
    return sorted
  }, [assetAccountsRaw, sortOrder])

  // 将各账户余额折算到 CNY
  const toCNY = (balance: number, currency?: string) => {
    const c = (currency || 'CNY') as 'CNY' | 'USD' | 'HKD'
    return toBase(balance, c, 'CNY', rates)
  }

  // 按投资账户聚合持仓市值（account_id → 该账户下所有持仓的市值汇总，原始币种）
  const holdingsValueByAccount = useMemo(() => {
    const map: Record<string, { value: number; currency: string }> = {}
    for (const r of results) {
      const h = r.holding
      if (!h?.accountId) continue
      const accId = h.accountId
      if (!map[accId]) map[accId] = { value: 0, currency: r.currency || 'CNY' }
      // 港股通用 Worker 折算后的 CNY 值
      map[accId].value += r.converted_value ?? r.market_value ?? 0
    }
    return map
  }, [results])

  // 折算后总资产（所有币种折 CNY 汇总）
  const totalAssetsCNY = useMemo(
    () => assetAccounts.reduce((sum, a) => sum + toCNY(a.balance, a.currency), 0),
    [assetAccounts, rates],
  )

  const netAssetsCNY = totalAssetsCNY - totalLiabilities

  // 账户信息页相关转账：筛选该账户作为转出/转入方的转账，按日期倒序
  const accountTransfers = useMemo(() => {
    if (!infoAccount) return []
    return transfers
      .filter(t => t.accountId === infoAccount.id || t.toAccountId === infoAccount.id)
      .sort((a, b) => {
        if (a.transactionDate !== b.transactionDate) return a.transactionDate < b.transactionDate ? 1 : -1
        return a.time < b.time ? 1 : -1
      })
  }, [transfers, infoAccount])
  const visibleAccountTransfers = accountTransfers.slice(0, infoVisibleTx)
  const hasMoreAccountTx = infoVisibleTx < accountTransfers.length

  // 账户信息页展示用的币种/余额派生
  const infoCcy = infoAccount?.currency || 'CNY'
  const infoSym = currencySymbol[infoCcy] || '¥'
  const infoIsOther = infoCcy !== 'CNY'
  const infoCny = infoAccount ? toCNY(infoAccount.balance, infoCcy) : 0

  // 拆分：日常资金 vs 投资组合
  const dailyAccounts = assetAccounts.filter(a => a.type !== 'investment')
  const investmentAccounts = assetAccounts.filter(a => a.type === 'investment')

  // 饼图数据：按类型聚合（日常资金 vs 投资组合），用折算 CNY
  const dailyTotalCNY = dailyAccounts.reduce((s, a) => s + toCNY(a.balance, a.currency), 0)
  const investTotalCNY = investmentAccounts.reduce((s, a) => {
    const hv = holdingsValueByAccount[a.id]
    return s + toCNY(a.balance + (hv?.value ?? 0), a.currency)
  }, 0)
  const pieData = useMemo(() => ({
    labels: ['日常资金', '投资组合'],
    datasets: [{
      data: [dailyTotalCNY, investTotalCNY],
      backgroundColor: ['#1e88e5', '#9c27b0'],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  }), [dailyTotalCNY, investTotalCNY])

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

  // 排序
  const handleSortToggle = () => {
    setSortOrder(prev => {
      if (prev === null) return 'amount-desc'
      if (prev === 'amount-desc') return 'amount-asc'
      return null
    })
  }

  const getSortIcon = () => {
    if (sortOrder === null) return <ArrowUpDown size={14} />
    if (sortOrder === 'amount-desc') return <ArrowDown size={14} />
    return <ArrowUp size={14} />
  }

  const handleOpenAdd = () => {
    setNewAccountForm({ ...initNewAccountForm })
    setShowAddAccount(true)
  }

  const handleCloseAdd = () => {
    setShowAddAccount(false)
    setNewAccountForm({ ...initNewAccountForm })
  }

  const handleAddAccount = async () => {
    if (!newAccountForm.name.trim()) return
    try {
      await addAccount({
        name: newAccountForm.name.trim(),
        type: newAccountForm.type,
        icon: newAccountForm.icon,
        color: newAccountForm.color,
        balance: newAccountForm.balance,
        currency: newAccountForm.currency,
      } as any)
      setShowAddAccount(false)
    } catch (e) {
      console.error('添加账户失败:', e)
    }
  }

  const handleOpenEdit = (account: Account) => {
    setEditForm({
      name: account.name,
      type: account.type,
      icon: account.icon,
      color: account.color,
      balance: account.balance,
      currency: account.currency || 'CNY',
    })
    setEditingAccount(account)
    setShowDeleteConfirm(false)
  }

  const handleCloseEdit = () => {
    setEditingAccount(null)
    setEditForm({ ...initEditForm })
    setShowDeleteConfirm(false)
  }

  // 点击账户行 -> 只读账户信息（属性 + 相关转账），不再直接打开编辑
  const handleOpenInfo = (account: Account) => {
    setInfoAccount(account)
    setShowAccountInfo(true)
    setInfoVisibleTx(ACCOUNT_TX_PAGE)
  }
  const handleCloseInfo = () => {
    setShowAccountInfo(false)
    setInfoAccount(null)
  }
  // 信息页「编辑账户」：关闭信息后打开编辑
  const handleEditFromInfo = () => {
    if (!infoAccount) return
    const acc = infoAccount
    handleCloseInfo()
    handleOpenEdit(acc)
  }

  const handleSaveEdit = async () => {
    if (!editingAccount || !editForm.name.trim()) return
    try {
      await updateAccount(editingAccount.id, {
        name: editForm.name.trim(),
        type: editForm.type,
        icon: editForm.icon,
        color: editForm.color,
        balance: editForm.balance,
        currency: editForm.currency,
      } as any)
      setEditingAccount(null)
      setEditForm({ ...initEditForm })
    } catch (e) {
      console.error('更新账户失败:', e)
    }
  }

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
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
          资产
        </h1>
      </header>

      <main className="px-5 tabbar-safe space-y-4 animate-page-fade">
        {loading ? (
          <>
            <Card className="!p-5">
              <div className="text-center mb-4">
                <div className="h-4 w-16 bg-brand-tint/60 rounded mx-auto mb-2 animate-pulse" />
                <div className="h-9 w-40 bg-brand-tint/60 rounded mx-auto animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-brand-tint dark:border-brand-tint">
                <div className="text-center space-y-2">
                  <div className="h-3 w-12 bg-brand-tint/60 rounded mx-auto animate-pulse" />
                  <div className="h-6 w-20 bg-brand-tint/60 rounded mx-auto animate-pulse" />
                </div>
                <div className="text-center space-y-2">
                  <div className="h-3 w-12 bg-brand-tint/60 rounded mx-auto animate-pulse" />
                  <div className="h-6 w-20 bg-brand-tint/60 rounded mx-auto animate-pulse" />
                </div>
              </div>
            </Card>
            <Card className="!p-4">
              <div className="h-5 w-20 bg-brand-tint/60 rounded mb-3 animate-pulse" />
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 rounded-full bg-brand-tint/60 animate-pulse" />
                <div className="flex-1 space-y-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="h-4 w-24 bg-brand-tint/60 rounded animate-pulse" />
                      <div className="h-4 w-16 bg-brand-tint/60 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-tint/60 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 bg-brand-tint/60 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-brand-tint/60 rounded animate-pulse" />
                  </div>
                  <div className="h-5 w-20 bg-brand-tint/60 rounded animate-pulse" />
                </div>
              ))}
            </Card>
          </>
        ) : (
          <>
        {/* Total Assets Card — 恢复原有样式，数值用折算 CNY */}
        <Card className="!p-5">
          <div className="text-center mb-4">
            <p className={`text-sm mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              总资产{Object.values(rates).some(v => v !== 1) ? ' (已折合人民币)' : ''}
            </p>
            <div className={`font-bold font-mono amount-fluid-lg ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              ¥{totalAssetsCNY.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-brand-tint dark:border-brand-tint">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp size={14} className="text-ok" />
                <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>净资产</span>
              </div>
              <div className={`text-lg font-bold font-mono amount-fluid ${netAssetsCNY >= 0 ? 'text-ok' : 'text-danger'}`}>
                ¥{Math.abs(netAssetsCNY).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingDown size={14} className="text-danger" />
                <span className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>负债</span>
              </div>
              <div className="text-lg font-bold font-mono amount-fluid text-danger">
                ¥{totalLiabilities.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </Card>

        {/* Asset Distribution — 按类型聚合：日常资金 vs 投资组合 */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            资产分布
          </h3>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32">
              <Pie data={pieData} options={pieOptions} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#1e88e5' }} />
                  <span className={`text-sm ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>日常资金</span>
                </div>
                <span className={`text-sm font-mono ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                  ¥{dailyTotalCNY.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#9c27b0' }} />
                  <span className={`text-sm ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>投资组合</span>
                </div>
                <span className={`text-sm font-mono ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                  ¥{investTotalCNY.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* 日常资金 */}
        {/* 排序按钮 */}
        {assetAccounts.length > 0 && (
          <div className="flex justify-end mb-1">
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
        )}

        {/* 日常资金 */}
        {dailyAccounts.length > 0 && (
          <div>
            <h3 className={`text-sm font-medium mb-2 px-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              日常资金
            </h3>
            <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
              {dailyAccounts.map((acc) => {
                const c = (acc.currency || 'CNY')
                const isOtherCurrency = c !== 'CNY'
                const cny = toCNY(acc.balance, acc.currency)
                const sym = currencySymbol[c] || '¥'
                return (
                  <div
                    key={acc.id}
                    onClick={() => handleOpenInfo(acc)}
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
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium truncate ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                          {acc.name}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-bg text-ink-2'
                        }`}>
                          {c}
                        </span>
                      </div>
                      <div className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                        {accountTypeLabels[acc.type]}
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-0">
                      <div className={`font-mono font-medium amount-fluid break-amount ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                        {sym}{acc.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {isOtherCurrency && (
                        <div className={`text-[11px] font-mono mt-0.5 ${theme === 'dark' ? 'text-ink-3' : 'text-ink-3'}`}>
                          (¥{cny.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </Card>
          </div>
        )}

        {/* 投资组合 */}
        {investmentAccounts.length > 0 && (
          <div>
            <h3 className={`text-sm font-medium mb-2 px-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              投资组合
            </h3>
            <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
              {investmentAccounts.map((acc) => {
                const c = (acc.currency || 'CNY')
                const hv = holdingsValueByAccount[acc.id]
                const holdingsVal = hv?.value ?? 0
                const totalNet = acc.balance + holdingsVal
                const sym = currencySymbol[c] || '¥'
                return (
                  <div
                    key={acc.id}
                    onClick={() => handleOpenInfo(acc)}
                    className={`flex items-center gap-3 p-4 cursor-pointer transition-colors
                      ${theme === 'dark' ? 'hover:bg-surface' : 'hover:bg-[#faf9f5]'}`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: `${acc.color}15` }}
                    >
                      {acc.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium truncate ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                          {acc.name}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-bg text-ink-2'
                        }`}>
                          {c}
                        </span>
                      </div>
                      <div className={`text-[11px] mt-0.5 space-y-0.5 ${theme === 'dark' ? 'text-ink-3' : 'text-ink-3'}`}>
                        <div>可用 {sym}{acc.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div>持仓 {sym}{holdingsVal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-0">
                      <div className={`font-mono font-bold amount-fluid break-amount ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                        {sym}{totalNet.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </Card>
          </div>
        )}

        {/* 空状态 */}
        {assetAccounts.length === 0 && (
          <div className="text-center py-6">
            <span className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              暂无资产账户，点击下方按钮添加
            </span>
          </div>
        )}

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
                  onClick={() => handleOpenInfo(acc)}
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
                    <div className="flex items-center gap-1.5">
                      <span className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                        {acc.name}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                        theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-bg text-ink-2'
                      }`}>
                        {acc.currency || 'CNY'}
                      </span>
                    </div>
                    <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                      {accountTypeLabels[acc.type]}
                    </div>
                  </div>
                  <div className="text-right min-w-0">
                    <div className="font-mono font-medium text-danger amount-fluid break-amount">
                      {formatCurrency(acc.balance, false, false)}
                    </div>
                  </div>
                  <ChevronRight size={18} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
                </div>
              ))}
            </Card>
          </div>
        )}

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
          </>
        )}
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

          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              账户类型
            </label>
            {renderTypeSelector(newAccountForm.type, (type, icon, color) => {
              setNewAccountForm(prev => ({ ...prev, type: type as Account['type'], icon, color }))
            })}
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              账户币种
            </label>
            <div className="flex gap-2">
              {(['CNY', 'USD', 'HKD'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setNewAccountForm(prev => ({ ...prev, currency: c }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    newAccountForm.currency === c
                      ? 'bg-brand border-brand-tint text-ink'
                      : theme === 'dark'
                        ? 'bg-surface border-brand-tint text-ink-2'
                        : 'bg-bg border-brand-tint text-ink-2'
                  }`}
                >
                  {c === 'CNY' ? '¥ 人民币' : c === 'USD' ? '$ 美元' : 'HK$ 港币'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              标识颜色
            </label>
            {renderColorPicker(newAccountForm.color, (color) => {
              setNewAccountForm(prev => ({ ...prev, color }))
            })}
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              初始余额
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
                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    当前余额
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

                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    账户类型
                  </label>
                  {renderTypeSelector(editForm.type, (type, icon, color) => {
                    setEditForm(prev => ({ ...prev, type: type as Account['type'], icon, color }))
                  })}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    账户币种
                  </label>
                  <div className="flex gap-2">
                    {(['CNY', 'USD', 'HKD'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setEditForm(prev => ({ ...prev, currency: c }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                          editForm.currency === c
                            ? 'bg-brand border-brand-tint text-ink'
                            : theme === 'dark'
                              ? 'bg-surface border-brand-tint text-ink-2'
                              : 'bg-bg border-brand-tint text-ink-2'
                        }`}
                      >
                        {c === 'CNY' ? '¥ 人民币' : c === 'USD' ? '$ 美元' : 'HK$ 港币'}
                      </button>
                    ))}
                  </div>
                </div>

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

                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                    标识颜色
                  </label>
                  {renderColorPicker(editForm.color, (color) => {
                    setEditForm(prev => ({ ...prev, color }))
                  })}
                </div>

                {/* 设为默认账户（投资账户不可设为默认） */}
                {editingAccount?.type !== 'investment' && (
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
                )}
              </>
            )}
          </div>
        )}
      </BottomSheet>

      {/* 账户信息 Sheet（点击账户行打开，只读） */}
      <BottomSheet
        isOpen={showAccountInfo}
        onClose={handleCloseInfo}
        title="账户信息"
        footer={
          <div className="flex gap-3">
            <button
              onClick={handleCloseInfo}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-bg text-ink-2'
              }`}
            >
              关闭
            </button>
            <button
              onClick={handleEditFromInfo}
              className="flex-1 py-3 rounded-xl font-medium bg-brand text-ink"
            >
              编辑账户
            </button>
          </div>
        }
      >
        {infoAccount && (
          <div className="p-4 space-y-4">
            {/* 头部 */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${infoAccount.color}15` }}
              >
                {infoAccount.icon}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-base text-ink truncate">{infoAccount.name}</div>
                <div className="text-xs text-ink-2 mt-0.5">
                  {accountTypeLabels[infoAccount.type]}{infoAccount.isDefault ? ' · 默认账户' : ''}
                </div>
              </div>
            </div>

            {/* 属性区 */}
            <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink-2">账户名称</span>
                <span className="text-sm font-medium text-ink">{infoAccount.name}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink-2">账户类型</span>
                <span className="text-sm font-medium text-ink">{accountTypeLabels[infoAccount.type]}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink-2">账户币种</span>
                <span className="text-sm font-medium text-ink">{infoAccount.currency || 'CNY'}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink-2">当前余额</span>
                <span className="text-sm font-medium text-ink text-right">
                  {infoSym}{infoAccount.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {infoIsOther && (
                    <span className="block text-[11px] text-ink-2 font-normal">
                      (¥{infoCny.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink-2">默认账户</span>
                <span className="text-sm font-medium text-ink">{infoAccount.isDefault ? '是' : '否'}</span>
              </div>
            </Card>

            {/* 相关转账区 */}
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <h4 className="text-sm font-medium text-ink-2">相关转账</h4>
                <span className="text-xs text-ink-2">{accountTransfers.length} 笔</span>
              </div>
              {accountTransfers.length === 0 ? (
                <div className="text-center text-sm py-6 text-ink-2">该账户暂无转账记录</div>
              ) : (
                <div className="space-y-2">
                  {visibleAccountTransfers.map((t) => {
                    const isOut = t.accountId === infoAccount.id
                    const counterpart = isOut
                      ? (t.toAccountName || '未知账户')
                      : (t.accountName || '未知账户')
                    return (
                      <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface">
                        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          isOut ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'
                        }`}>
                          {isOut ? '转出' : '转入'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink truncate">
                            {isOut ? '至 ' : '自 '}{counterpart}
                          </div>
                          <div className="text-xs text-ink-2 mt-0.5">{t.date} {t.time}</div>
                        </div>
                        <div className={`shrink-0 font-mono text-sm font-medium ${isOut ? 'text-danger' : 'text-ok'}`}>
                          {formatTransferAmount(t)}
                        </div>
                      </div>
                    )
                  })}
                  {hasMoreAccountTx && (
                    <div className="flex justify-center pt-1 pb-2">
                      <button
                        onClick={() => setInfoVisibleTx(v => v + ACCOUNT_TX_PAGE)}
                        className={`px-6 py-2.5 rounded-full text-sm font-medium transition-colors ${
                          theme === 'dark' ? 'bg-surface text-ink-2 hover:text-ink' : 'bg-white text-ink-2 hover:text-ink'
                        }`}
                      >
                        加载更多（已显示 {visibleAccountTransfers.length} / {accountTransfers.length} 笔）
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
