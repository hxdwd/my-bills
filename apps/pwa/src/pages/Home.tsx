import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import ProgressRing from '../components/ui/ProgressRing'
import TransactionItem from '../components/ui/TransactionItem'
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  PiggyBank,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react'

interface HomePageProps {
  onAddTransaction?: () => void;
}

export default function HomePage({ onAddTransaction }: HomePageProps = {}) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { 
    getTotalAssets,
    getMonthlyIncome, 
    getMonthlyExpense, 
    getBudgetProgress,
    transactions,
    categories,
  } = useApp()

  const totalAssets = getTotalAssets()
  const monthlyIncome = getMonthlyIncome()
  const monthlyExpense = getMonthlyExpense()
  const balance = monthlyIncome - monthlyExpense
  const budget = getBudgetProgress()

  const currentMonth = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })

  // 首页迷你日历：默认跟随当前日期（当前月）
  const calendarDate = new Date()
  const calYear = calendarDate.getFullYear()
  const calMonth = calendarDate.getMonth()
  const firstDayOfMonth = new Date(calYear, calMonth, 1)
  const lastDayOfMonth = new Date(calYear, calMonth + 1, 0)
  const firstDayWeekday = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()
  const todayDate = new Date()
  const isToday = (day: number) =>
    todayDate.getFullYear() === calYear &&
    todayDate.getMonth() === calMonth &&
    todayDate.getDate() === day
  const hasTransactionsOnDay = (day: number) =>
    transactions.some((t) => {
      const match = t.date.match(/(\d+)月(\d+)日/)
      return match && parseInt(match[1]) === calMonth + 1 && parseInt(match[2]) === day
    })
  const calendarDays: (number | null)[] = []
  for (let i = 0; i < firstDayWeekday; i++) calendarDays.push(null)
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i)

  const quickActions = [
    { icon: '📊', label: '报表', color: '#a855f7', path: '/reports' },
    { icon: '📅', label: '预算', color: '#f59e0b', path: '/budget' },
    { icon: '📆', label: '日历', color: '#5b8dee', path: '/calendar' },
    { icon: '🤖', label: 'AI助手', color: '#c96442', path: '/ai' },
  ]

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'} transition-colors`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 px-4 pt-3 pb-2 ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
              钱盒子
            </h1>
            <p className={`text-xs ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
              {currentMonth}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/search')}
              className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-[#30302e]' : 'hover:bg-[#faf9f5]'}`}
            >
              <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button 
              onClick={toggleTheme}
              className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-[#30302e]' : 'hover:bg-[#faf9f5]'}`}
            >
              {theme === 'dark' ? (
                <Sun size={20} className="text-[#f59e0b]" />
              ) : (
                <Moon size={20} className="text-[#5e5d59]" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pb-4 space-y-4 overflow-x-hidden">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Monthly Income */}
          <Card className="!p-4 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#2d8a5e]/10 flex items-center justify-center shrink-0">
                <TrendingUp size={16} className="text-[#2d8a5e]" />
              </div>
              <span className={`text-xs truncate ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>本月收入</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-[#2d8a5e] font-mono truncate">
              ¥{monthlyIncome.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>

          {/* Monthly Expense */}
          <Card className="!p-4 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#e05555]/10 flex items-center justify-center shrink-0">
                <TrendingDown size={16} className="text-[#e05555]" />
              </div>
              <span className={`text-xs truncate ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>本月支出</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-[#e05555] font-mono truncate">
              ¥{monthlyExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>

          {/* Balance */}
          <Card className="!p-4 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${balance >= 0 ? 'bg-[#5b8dee]/10' : 'bg-[#e05555]/10'} flex items-center justify-center shrink-0`}>
                <PiggyBank size={16} className={balance >= 0 ? 'text-[#5b8dee]' : 'text-[#e05555]'} />
              </div>
              <span className={`text-xs truncate ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>本月结余</span>
            </div>
            <div className={`text-base sm:text-xl font-bold font-mono truncate ${balance >= 0 ? 'text-[#5b8dee]' : 'text-[#e05555]'}`}>
              {balance >= 0 ? '+' : ''}¥{balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>

          {/* Total Assets */}
          <Card className="!p-4 min-w-0" onClick={() => navigate('/assets')}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#c96442]/10 flex items-center justify-center shrink-0">
                <Wallet size={16} className="text-[#c96442]" />
              </div>
              <span className={`text-xs truncate ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>总资产</span>
            </div>
            <div className="text-base sm:text-xl font-bold text-[#c96442] font-mono truncate">
              ¥{totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </div>

        {/* Budget Progress */}
        <Card className="!p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`font-medium mb-1 ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                本月预算
              </h3>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className={`text-xl sm:text-2xl font-bold font-mono truncate ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                  ¥{budget.spent.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-sm shrink-0 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
                  / ¥{budget.total.toLocaleString()}
                </span>
              </div>
              <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
                剩余 ¥{(budget.total - budget.spent).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <ProgressRing 
              progress={budget.percentage} 
              size={80} 
              strokeWidth={8}
              color={budget.percentage > 80 ? '#e05555' : '#c96442'}
            >
              <span className={`text-lg font-bold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                {budget.percentage}%
              </span>
            </ProgressRing>
          </div>
          <button 
            onClick={() => navigate('/budget')}
            className={`w-full mt-3 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-colors
              ${theme === 'dark' ? 'bg-[#3d3d3a] text-[#b0aea5] hover:bg-[#4a4a47]' : 'bg-[#e8e6dc] text-[#4d4c48] hover:bg-[#dedad0]'}
            `}
          >
            查看详情 <ChevronRight size={16} />
          </button>
        </Card>

        {/* Mini Calendar（跟随当前日期） */}
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
              {calendarDate.toLocaleDateString('zh-CN', { month: 'long' })} · 今天 {todayDate.getDate()}日
            </h3>
            <button
              onClick={() => navigate('/calendar')}
              className={`text-xs ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}
            >
              完整日历
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div
                key={d}
                className={`text-center text-xs font-medium py-1 ${
                  theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'
                }`}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => (
              <button
                key={index}
                disabled={!day}
                onClick={() => day && navigate('/calendar')}
                className={`
                  aspect-square flex flex-col items-center justify-center rounded-lg
                  transition-all relative
                  ${!day ? 'cursor-default' : 'cursor-pointer active:scale-95'}
                  ${isToday(day as number)
                    ? 'bg-[#c96442] text-white'
                    : `${theme === 'dark' ? 'hover:bg-[#30302e] text-[#faf9f5]' : 'hover:bg-[#faf9f5] text-[#141413]'}`
                  }
                `}
              >
                {day && (
                  <>
                    <span className="text-sm font-medium">{day}</span>
                    {hasTransactionsOnDay(day) && !isToday(day) && (
                      <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#c96442]" />
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: `${action.color}10` }}
            >
              <span className="text-2xl">{action.icon}</span>
              <span className={`text-xs font-medium ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'}`}>
                {action.label}
              </span>
            </button>
          ))}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
              最近交易
            </h3>
            <button 
              onClick={() => navigate('/transactions')}
              className={`text-sm ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}
            >
              查看全部
            </button>
          </div>
          
          <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
            {transactions.slice(0, 5).map((t) => {
              const category = t.type === 'transfer' 
                ? { icon: '↔️', color: '#5b8dee' }
                : (categories[t.type === 'expense' ? 'expense' : 'income'] as any[]).find(c => c.id === t.categoryId) || { icon: '📝', color: '#87867f' }
              
              return (
                <TransactionItem
                  key={t.id}
                  icon={category.icon}
                  iconBg={`${category.color}15`}
                  title={t.categoryName}
                  subtitle={`${t.date} ${t.time}`}
                  amount={t.amount}
                  type={t.type}
                  account={t.accountName}
                />
              )
            })}
          </Card>
        </div>



      </main>
    </div>
  )
}
