import { useState, useMemo } from 'react'
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

  // 本月交易按「日」一次性分组，供日期格 / 选中日 / 月度统计共用。
  // 原实现是每个日期格都做一次全表 some() + 正则匹配：
  // 31 格 × 402x 条 ≈ 每次渲染 12.6 万次正则；月统计还额外全表扫 2 次。
  const { monthTxByDay, monthStats } = useMemo(() => {
    const byDay = new Map<number, typeof transactions>()
    let income = 0
    let expense = 0
    const targetMonth = month + 1
    const thisYear = year
    for (const t of transactions) {
      // 必须连**年份**一起匹配：展示用的 t.date 对非本年交易是「2025年9月1日」，
      // 原来只比对「M月」会把往年同月的交易并进本月（日历圆点与月收支统计全错）。
      let y: number
      let m: number
      let day: number
      if (t.transactionDate) {
        // 原始日期恒为 YYYY-MM-DD，最可靠
        const [ys, ms, ds] = t.transactionDate.split('-')
        y = Number(ys)
        m = Number(ms)
        day = Number(ds)
      } else {
        const match = t.date.match(/(?:(\d{4})年)?(\d+)月(\d+)日/)
        if (!match) continue
        y = match[1] ? Number(match[1]) : thisYear
        m = Number(match[2])
        day = Number(match[3])
      }
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) continue
      if (y !== thisYear || m !== targetMonth) continue
      const list = byDay.get(day)
      if (list) list.push(t)
      else byDay.set(day, [t])
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    }
    return { monthTxByDay: byDay, monthStats: { income, expense } }
    // year 必须进依赖：从 2025-09 切到 2026-09 时 month 不变，
    // 少了它 memo 不会重算 → 日历格与月统计会停留在上一年。
  }, [transactions, year, month])

  // Check if a day has transactions
  const hasTransactions = (day: number) => monthTxByDay.has(day)

  // Selected date transactions
  const selectedDayTransactions = selectedDate ? (monthTxByDay.get(selectedDate) ?? []) : []

  // Monthly stats — 按当前选中月份过滤
  const monthlyStats = monthStats

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
                  const category = (categories[t.type === 'expense' ? 'expense' : 'income'] as any[]).find(c => c.id === t.categoryId) || { icon: '📝', color: '#87867f' }
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
