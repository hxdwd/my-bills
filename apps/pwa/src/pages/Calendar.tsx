import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import TransactionItem from '../components/ui/TransactionItem'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency } from '../utils/format'

export default function CalendarPage() {
  const { theme } = useTheme()
  const { transactions, categories, accounts } = useApp()
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const todayInit = new Date()
  const [selectedDate, setSelectedDate] = useState<number | null>(
    todayInit.getFullYear() === currentDate.getFullYear() &&
    todayInit.getMonth() === currentDate.getMonth()
      ? todayInit.getDate()
      : null
  )
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const firstDayWeekday = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()
  
  const monthName = currentDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
  
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDate(null)
  }
  
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }

  // Get transactions for selected date
  const getTransactionsForDate = (day: number) => {
    const dateStr = `${month + 1}月${day}日`
    return transactions.filter(t => t.date.includes(`${month + 1}月`))
  }

  // Check if a day has transactions
  const hasTransactions = (day: number) => {
    return transactions.some(t => {
      const match = t.date.match(/(\d+)月(\d+)日/)
      if (match && parseInt(match[1]) === month + 1) {
        return parseInt(match[2]) === day
      }
      return false
    })
  }

  // Selected date transactions
  const selectedDayTransactions = selectedDate 
    ? transactions.filter(t => {
        const match = t.date.match(/(\d+)月(\d+)日/)
        if (match && parseInt(match[1]) === month + 1) {
          return parseInt(match[2]) === selectedDate
        }
        return false
      })
    : []

  // Monthly stats — 按当前选中月份过滤
  const monthlyStats = {
    income: transactions
      .filter(t => {
        if (t.type !== 'income') return false
        const match = t.date.match(/(\d+)月(\d+)日/)
        return match && parseInt(match[1]) === month + 1
      })
      .reduce((sum, t) => sum + t.amount, 0),
    expense: transactions
      .filter(t => {
        if (t.type !== 'expense') return false
        const match = t.date.match(/(\d+)月(\d+)日/)
        return match && parseInt(match[1]) === month + 1
      })
      .reduce((sum, t) => sum + t.amount, 0),
  }

  const today = new Date()
  const isToday = (day: number) => 
    today.getFullYear() === year && 
    today.getMonth() === month && 
    today.getDate() === day

  // Generate calendar grid
  const calendarDays: (number | null)[] = []
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarDays.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i)
  }

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
          日历
        </h1>
      </header>

      <main className="px-5 tabbar-safe space-y-4 animate-page-fade">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-1.5">
            <ChevronLeft size={20} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
          </button>
          <h2 className={`text-base font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            {monthName}
          </h2>
          <button onClick={nextMonth} className="p-1.5">
            <ChevronRight size={20} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
          </button>
        </div>

        {/* Calendar Grid */}
        <Card className="!p-3">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1.5">
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
              <div 
                key={day} 
                className={`text-center text-xs font-medium py-1.5
                  ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((day, index) => (
              <button
                key={index}
                disabled={!day}
                onClick={() => day && setSelectedDate(day)}
                className={`
                  aspect-square flex flex-col items-center justify-center rounded-lg
                  transition-all relative
                  ${!day ? 'cursor-default' : 'cursor-pointer'}
                  ${selectedDate === day 
                    ? 'bg-brand text-white' 
                    : isToday(day)
                      ? `ring-2 ring-brand font-bold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`
                      : `${theme === 'dark' ? 'hover:bg-surface text-ink' : 'hover:bg-[#faf9f5] text-ink'}`
                  }
                `}
              >
                {day && (
                  <>
                    <span className="text-[13px] leading-none font-medium">{day}</span>
                    {hasTransactions(day) && (
                      <div className={`absolute bottom-1 w-1 h-1 rounded-full ${selectedDate === day ? 'bg-white' : 'bg-brand-strong'}`} />
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Selected Date Info */}
        {selectedDate && (
          <Card className="!p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                {month + 1}月{selectedDate}日
              </h3>
              <span className="text-xs text-ink-2">
                {selectedDayTransactions.length}笔交易
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-surface' : 'bg-bg'}`}>
                <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>支出</div>
                <div className="text-danger font-mono font-medium">
                  {selectedDayTransactions
                    .filter(t => t.type === 'expense')
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toLocaleString()}
                </div>
              </div>
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-surface' : 'bg-bg'}`}>
                <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>收入</div>
                <div className="text-ok font-mono font-medium">
                  {selectedDayTransactions
                    .filter(t => t.type === 'income')
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toLocaleString()}
                </div>
              </div>
            </div>

            {selectedDayTransactions.length > 0 ? (
              <div className="space-y-1">
                {selectedDayTransactions.map((t) => {
                  const category = t.type === 'transfer'
                    ? { icon: '↔️', color: '#5b8dee' }
                    : (categories[t.type === 'expense' ? 'expense' : 'income'] as any[]).find(c => c.id === t.categoryId) || { icon: '📝', color: '#87867f' }
                  return (
                    <TransactionItem
                      key={t.id}
                      icon={category.icon}
                      iconBg={`${category.color}15`}
                      title={t.categoryName}
                      subtitle={`${t.time} · ${t.accountName}`}
                      amount={t.amount}
                      type={t.type}
                    />
                  )
                })}
              </div>
            ) : (
              <div className={`text-center py-6 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                暂无交易记录
              </div>
            )}
          </Card>
        )}

        {/* Monthly Summary */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            月度统计
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>收入</div>
              <div className="text-ok font-mono font-bold">
                {formatCurrency(monthlyStats.income, false, true)}
              </div>
            </div>
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>支出</div>
              <div className="text-danger font-mono font-bold">
                {formatCurrency(monthlyStats.expense, false, true)}
              </div>
            </div>
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>结余</div>
              <div className={`font-mono font-bold ${monthlyStats.income - monthlyStats.expense >= 0 ? 'text-[#5b8dee]' : 'text-danger'}`}>
                {formatCurrency(monthlyStats.income - monthlyStats.expense, false, true)}
              </div>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            近期活动
          </h3>
          <div className="space-y-2">
            {transactions.slice(0, 5).map((t, i) => {
              const category = t.type === 'transfer'
                ? { icon: '↔️', color: '#5b8dee' }
                : (categories[t.type === 'expense' ? 'expense' : 'income'] as any[]).find(c => c.id === t.categoryId) || { icon: '📝', color: '#87867f' }
              return (
                <TransactionItem
                  key={t.id}
                  icon={category.icon}
                  iconBg={`${category.color}15`}
                  title={t.categoryName}
                  subtitle={t.date}
                  amount={t.amount}
                  type={t.type}
                />
              )
            })}
          </div>
        </Card>
      </main>
    </div>
  )
}
