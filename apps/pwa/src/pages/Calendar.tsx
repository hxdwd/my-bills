import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import TransactionItem from '../components/ui/TransactionItem'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 px-4 pt-3 pb-2 ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
          日历
        </h1>
      </header>

      <main className="px-4 pb-4 space-y-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-2">
            <ChevronLeft size={24} className={theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'} />
          </button>
          <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
            {monthName}
          </h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-[#3d3d3a] text-[#c96442]' : 'bg-[#c96442]/10 text-[#c96442]'}`}>
            今天 {todayInit.getMonth() + 1}月{todayInit.getDate()}日
          </span>
          <button onClick={nextMonth} className="p-2">
            <ChevronRight size={24} className={theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'} />
          </button>
        </div>

        {/* Calendar Grid */}
        <Card className="!p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
              <div 
                key={day} 
                className={`text-center text-xs font-medium py-2
                  ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => (
              <button
                key={index}
                disabled={!day}
                onClick={() => day && setSelectedDate(day)}
                className={`
                  aspect-square flex flex-col items-center justify-center rounded-xl
                  transition-all relative
                  ${!day ? 'cursor-default' : 'cursor-pointer'}
                  ${selectedDate === day 
                    ? 'bg-[#c96442] text-white' 
                    : isToday(day)
                      ? `ring-2 ring-[#c96442] font-bold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#c96442]'}`
                      : `${theme === 'dark' ? 'hover:bg-[#30302e] text-[#faf9f5]' : 'hover:bg-[#faf9f5] text-[#141413]'}`
                  }
                `}
              >
                {day && (
                  <>
                    <span className="text-sm font-medium">{day}</span>
                    {hasTransactions(day) && !selectedDate && (
                      <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#c96442]" />
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
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                {month + 1}月{selectedDate}日
              </h3>
              <span className="text-xs text-[#87867f]">
                {selectedDayTransactions.length}笔交易
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-[#3d3d3a]' : 'bg-[#f5f4ed]'}`}>
                <div className={`text-xs ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>支出</div>
                <div className="text-[#e05555] font-mono font-medium">
                  ¥{selectedDayTransactions
                    .filter(t => t.type === 'expense')
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toLocaleString()}
                </div>
              </div>
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-[#3d3d3a]' : 'bg-[#f5f4ed]'}`}>
                <div className={`text-xs ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>收入</div>
                <div className="text-[#2d8a5e] font-mono font-medium">
                  ¥{selectedDayTransactions
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
              <div className={`text-center py-6 ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
                暂无交易记录
              </div>
            )}
          </Card>
        )}

        {/* Monthly Summary */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
            月度统计
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>收入</div>
              <div className="text-[#2d8a5e] font-mono font-bold">
                ¥{(monthlyStats.income / 1000).toFixed(1)}k
              </div>
            </div>
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>支出</div>
              <div className="text-[#e05555] font-mono font-bold">
                ¥{(monthlyStats.expense / 1000).toFixed(1)}k
              </div>
            </div>
            <div className="text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>结余</div>
              <div className={`font-mono font-bold ${monthlyStats.income - monthlyStats.expense >= 0 ? 'text-[#5b8dee]' : 'text-[#e05555]'}`}>
                ¥{((monthlyStats.income - monthlyStats.expense) / 1000).toFixed(1)}k
              </div>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
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
