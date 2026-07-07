import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Pie, Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
)

type TimeRange = 'month' | 'year'

export default function ReportsPage() {
  const { theme } = useTheme()
  const { 
    categories, tags, transactions, bigExpenseThreshold,
    getMonthSummary, getMonthWeekExpense, getYearMonthExpense, getYearMonthDetail,
    getMonthExpenseByCategory, getMonthTopExpenses
  } = useApp()
  const [timeRange, setTimeRange] = useState<TimeRange>('month')
  
  // 当前选择的年月
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  // 长按快速选择年/月
  const [showTimePicker, setShowTimePicker] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeDisplayRef = useRef<HTMLDivElement>(null)

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      setShowTimePicker(true)
    }, 500)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  useEffect(() => {
    return () => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }
  }, [])

  const [selectedCategoryForDrill, setSelectedCategoryForDrill] = useState<{ id: string; name: string; icon: string; color: string } | null>(null)

  // 切换时间
  const goPrev = () => {
    if (timeRange === 'month') {
      if (selectedMonth === 1) {
        setSelectedMonth(12)
        setSelectedYear(selectedYear - 1)
      } else {
        setSelectedMonth(selectedMonth - 1)
      }
    } else {
      setSelectedYear(selectedYear - 1)
    }
  }

  const goNext = () => {
    if (timeRange === 'month') {
      if (selectedMonth === 12) {
        setSelectedMonth(1)
        setSelectedYear(selectedYear + 1)
      } else {
        setSelectedMonth(selectedMonth + 1)
      }
    } else {
      setSelectedYear(selectedYear + 1)
    }
  }

  // 快速选择年月
  const quickSelectYear = (y: number) => {
    setSelectedYear(y)
    setShowTimePicker(false)
  }
  const quickSelectMonth = (m: number) => {
    setSelectedMonth(m)
    setShowTimePicker(false)
  }

  // 获取当前选择时间范围的数据
  const monthSummary = timeRange === 'month' 
    ? getMonthSummary(selectedYear, selectedMonth) 
    : null

  const monthWeekExpense = timeRange === 'month'
    ? getMonthWeekExpense(selectedYear, selectedMonth)
    : null

  const yearMonthExpense = timeRange === 'year'
    ? getYearMonthExpense(selectedYear)
    : null

  const yearMonthDetail = timeRange === 'year'
    ? getYearMonthDetail(selectedYear)
    : null

  // 支出按分类分布
  const expenseByCategory = timeRange === 'month'
    ? getMonthExpenseByCategory(selectedYear, selectedMonth)
    : (() => {
        // 按年：汇总所有月份
        const catMap = new Map<string, { id: string; name: string; icon: string; color: string; total: number }>()
        for (let m = 1; m <= 12; m++) {
          const monthCats = categories.expense.map(cat => {
            const total = transactions
              .filter(t => t.type === 'expense' && t.categoryId === cat.id)
              .filter(t => {
                const match = t.date.match(/(\d+)月(\d+)日/)
                return match && parseInt(match[1]) === m
              })
              .reduce((sum, t) => sum + t.amount, 0)
            return { ...cat, total }
          }).filter(c => c.total > 0)
          
          monthCats.forEach(c => {
            const existing = catMap.get(c.id)
            if (existing) {
              existing.total += c.total
            } else {
              catMap.set(c.id, { ...c })
            }
          })
        }
        return Array.from(catMap.values()).sort((a, b) => b.total - a.total)
      })()

  const totalExpense = expenseByCategory.reduce((sum, c) => sum + c.total, 0)

  // 大额支出（仅按月显示）
  const topExpenses = timeRange === 'month'
    ? getMonthTopExpenses(selectedYear, selectedMonth, bigExpenseThreshold)
    : []

  // 标签下钻
  const tagDistribution = selectedCategoryForDrill ? (() => {
    const categoryTags = tags.filter(t => t.categoryId === selectedCategoryForDrill.id);
    if (categoryTags.length === 0) return null;

    const categoryTransactions = transactions.filter(
      t => t.type === 'expense' && t.categoryId === selectedCategoryForDrill.id
    );

    const tagStats = categoryTags.map(tag => {
      const total = categoryTransactions
        .filter(t => t.tags?.includes(tag.id))
        .reduce((sum, t) => sum + t.amount, 0);
      return { ...tag, total };
    }).filter(t => t.total > 0).sort((a, b) => b.total - a.total);

    const untaggedTotal = categoryTransactions
      .filter(t => !t.tags || t.tags.length === 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const categoryTotal = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);

    return { tagStats, untaggedTotal, categoryTotal };
  })() : null;

  // 饼图数据
  const pieData = {
    labels: expenseByCategory.map(c => c.name),
    datasets: [{
      data: expenseByCategory.map(c => c.total),
      backgroundColor: expenseByCategory.map(c => c.color),
      borderWidth: 0,
      hoverOffset: 8,
    }]
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw as number
            const percent = totalExpense > 0 ? ((value / totalExpense) * 100).toFixed(1) : '0'
            return ` ¥${value.toLocaleString()} (${percent}%)`
          }
        }
      }
    },
    cutout: '55%',
  }

  // 按月：柱状图显示每周支出 / 按年：折线图显示每月收入+支出
  const barChartData = timeRange === 'month' && monthWeekExpense ? {
    labels: monthWeekExpense.labels,
    datasets: [{
      label: '支出',
      data: monthWeekExpense.values,
      backgroundColor: '#F4D77C',
      borderRadius: 6,
    }]
  } : {
    labels: [],
    datasets: [{ label: '支出', data: [], backgroundColor: '#F4D77C', borderRadius: 6 }]
  }

  const lineChartData = timeRange === 'year' && yearMonthExpense ? {
    labels: yearMonthExpense.labels,
    datasets: [
      {
        label: '收入',
        data: yearMonthExpense.income,
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: '支出',
        data: yearMonthExpense.expense,
        borderColor: '#FF6B6B',
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ]
  } : { labels: [], datasets: [] }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#888888' }
      },
      y: {
        grid: { color: theme === 'dark' ? '#3d3d3a' : '#f0eee6' },
        ticks: { 
          color: '#888888',
          callback: (value: any) => `¥${value}`
        }
      }
    }
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 16,
          color: '#888888',
        }
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#888888' }
      },
      y: {
        grid: { color: theme === 'dark' ? '#3d3d3a' : '#f0eee6' },
        ticks: { 
          color: '#888888',
          callback: (value: any) => `¥${value}`
        }
      }
    }
  }

  // 时间显示
  const timeDisplay = timeRange === 'month' 
    ? `${selectedYear}年${selectedMonth}月`
    : `${selectedYear}年`

  // 是否是当前时间（不能往后翻）
  const isCurrent = timeRange === 'month'
    ? selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1
    : selectedYear === now.getFullYear()

  // 快速选择面板里的年份和月份列表
  const currentYear = now.getFullYear()
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i) // 前后5年
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
          报表
        </h1>
      </header>

      <main className="px-5 pb-24 space-y-4 animate-page-fade">
        {/* Time Range Tabs */}
        <div className={`flex p-1 rounded-xl ${theme === 'dark' ? 'bg-surface' : 'bg-brand-tint'}`}>
          {(['month', 'year'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
                ${timeRange === range
                  ? 'bg-brand text-white'
                  : theme === 'dark' ? 'text-ink-2' : 'text-ink-2'
                }`}
            >
              {range === 'month' ? '按月' : '按年'}
            </button>
          ))}
        </div>

        {/* Time Navigator */}
        <div className="flex items-center justify-between">
          <button
            onClick={goPrev}
            className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-surface text-ink-2' : 'hover:bg-brand-tint text-ink-2'}`}
          >
            <ChevronLeft size={22} />
          </button>
          <div
            ref={timeDisplayRef}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            className={`cursor-pointer select-none px-3 py-1 rounded-lg transition-colors ${
              theme === 'dark' ? 'hover:bg-surface' : 'hover:bg-brand-tint'
            }`}
          >
            <h2 className={`text-base font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              {timeDisplay}
            </h2>
          </div>
          <button
            onClick={goNext}
            disabled={isCurrent}
            className={`p-2 rounded-lg transition-colors ${
              isCurrent 
                ? 'opacity-30 cursor-not-allowed'
                : theme === 'dark' ? 'hover:bg-surface text-ink-2' : 'hover:bg-brand-tint text-ink-2'
            }`}
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Income/Expense Summary */}
        {timeRange === 'month' && monthSummary ? (
          <div className="grid grid-cols-3 gap-3">
            <Card className="!p-3 text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>收入</div>
              <div className={`text-lg font-bold font-mono text-ok`}>
                ¥{monthSummary.income.toLocaleString()}
              </div>
            </Card>
            <Card className="!p-3 text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>支出</div>
              <div className={`text-lg font-bold font-mono text-danger`}>
                ¥{monthSummary.expense.toLocaleString()}
              </div>
            </Card>
            <Card className="!p-3 text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>结余</div>
              <div className={`text-lg font-bold font-mono ${(monthSummary.income - monthSummary.expense) >= 0 ? 'text-[#5b8dee]' : 'text-danger'}`}>
                ¥{((monthSummary.income - monthSummary.expense) / 1000).toFixed(1)}k
              </div>
            </Card>
          </div>
        ) : timeRange === 'year' && yearMonthDetail ? (
          (() => {
            const totalIncome = yearMonthDetail.reduce((s, m) => s + m.income, 0)
            const totalExpense2 = yearMonthDetail.reduce((s, m) => s + m.expense, 0)
            const totalBalance = totalIncome - totalExpense2
            return (
              <div className="grid grid-cols-3 gap-3">
                <Card className="!p-3 text-center">
                  <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>年收入</div>
                  <div className={`text-lg font-bold font-mono text-ok`}>
                    ¥{(totalIncome / 10000).toFixed(1)}万
                  </div>
                </Card>
                <Card className="!p-3 text-center">
                  <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>年支出</div>
                  <div className={`text-lg font-bold font-mono text-danger`}>
                    ¥{(totalExpense2 / 10000).toFixed(1)}万
                  </div>
                </Card>
                <Card className="!p-3 text-center">
                  <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>年结余</div>
                  <div className={`text-lg font-bold font-mono ${totalBalance >= 0 ? 'text-[#5b8dee]' : 'text-danger'}`}>
                    ¥{(totalBalance / 10000).toFixed(1)}万
                  </div>
                </Card>
              </div>
            )
          })()
        ) : null}

        {/* Expense Distribution */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            支出分布
          </h3>
          {expenseByCategory.length > 0 ? (
            <div className="flex items-start gap-4">
              <div className="w-36 h-36">
                <Pie data={pieData} options={pieOptions} />
              </div>
              <div className="flex-1 space-y-2 max-h-36 overflow-y-auto hide-scrollbar">
                {expenseByCategory.slice(0, 5).map((cat) => {
                  const percent = totalExpense > 0 ? ((cat.total / totalExpense) * 100).toFixed(1) : '0'
                  const hasTags = tags.some(t => t.categoryId === cat.id)
                  return (
                    <button
                      key={cat.id}
                      onClick={() => hasTags ? setSelectedCategoryForDrill({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color }) : null}
                      className={`w-full flex items-center justify-between hover:bg-[var(--surface-warm)] rounded-lg px-1 py-1 transition-colors ${hasTags ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className={`text-sm ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                          {cat.icon} {cat.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-mono ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                          ¥{cat.total.toLocaleString()}
                        </span>
                        <span className={`text-xs ml-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                          {percent}%
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className={`text-center py-8 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              暂无支出数据
            </div>
          )}
        </Card>

        {/* 收支趋势 - 按月显示周支出柱状图，按年显示收入+支出折线图 */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            {timeRange === 'month' ? '每周支出趋势' : '收支趋势'}
          </h3>
          <div className="h-48">
            {timeRange === 'month' ? (
              <Bar data={barChartData} options={barOptions} />
            ) : (
              <Line data={lineChartData} options={lineOptions} />
            )}
          </div>
        </Card>

        {/* 大额支出 — 仅按月显示 */}
        {timeRange === 'month' && (
          <Card className="!p-4">
            <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              大额支出 (≥¥{bigExpenseThreshold.toLocaleString()})
            </h3>
            {topExpenses.length > 0 ? (
              <div className="space-y-3">
                {topExpenses.map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl
                      ${theme === 'dark' ? 'bg-surface' : 'bg-bg'}`}>
                      {t.categoryIcon}
                    </div>
                    <div className="flex-1">
                      <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                        {t.categoryName}
                        {t.note && <span className={`text-xs ml-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>{t.note}</span>}
                      </div>
                      <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                        {t.date} · {t.accountName}
                      </div>
                    </div>
                    <div className="text-danger font-mono font-medium">
                      -¥{t.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-center py-4 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                无大额支出记录
              </div>
            )}
          </Card>
        )}

        {/* 按年：每月收支明细表 */}
        {timeRange === 'year' && yearMonthDetail && (
          <Card className="!p-4">
            <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              每月收支明细
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${theme === 'dark' ? 'border-brand-tint' : 'border-brand-tint'}`}>
                    <th className={`text-left py-2 px-2 font-medium ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>月份</th>
                    <th className={`text-right py-2 px-2 font-medium text-ok`}>收入</th>
                    <th className={`text-right py-2 px-2 font-medium text-danger`}>支出</th>
                    <th className={`text-right py-2 px-2 font-medium ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>结余</th>
                  </tr>
                </thead>
                <tbody>
                  {yearMonthDetail.map((row) => (
                    <tr
                      key={row.month}
                      className={`border-b ${theme === 'dark' ? 'border-brand-tint hover:bg-surface' : 'border-brand-tint hover:bg-bg'} transition-colors`}
                    >
                      <td className={`py-2.5 px-2 font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>{row.month}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-ok">
                        ¥{row.income.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-danger">
                        ¥{row.expense.toLocaleString()}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-mono font-medium ${row.balance >= 0 ? 'text-[#5b8dee]' : 'text-danger'}`}>
                        ¥{row.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`border-t-2 ${theme === 'dark' ? 'border-ink/10' : 'border-ink/10'}`}>
                    <td className={`py-3 px-2 font-bold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>合计</td>
                    <td className="py-3 px-2 text-right font-mono font-bold text-ok">
                      ¥{yearMonthDetail.reduce((s, r) => s + r.income, 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-right font-mono font-bold text-danger">
                      ¥{yearMonthDetail.reduce((s, r) => s + r.expense, 0).toLocaleString()}
                    </td>
                    <td className={`py-3 px-2 text-right font-mono font-bold ${yearMonthDetail.reduce((s, r) => s + r.balance, 0) >= 0 ? 'text-[#5b8dee]' : 'text-danger'}`}>
                      ¥{yearMonthDetail.reduce((s, r) => s + r.balance, 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}
      </main>

      {/* 快速选择年月弹窗 */}
      {showTimePicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowTimePicker(false)}>
          <div
            className="w-full max-w-lg bg-[var(--bg-primary)] rounded-t-3xl animate-slide-up max-h-[60vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-warm)]">
              <button onClick={() => setShowTimePicker(false)} className="p-2 -ml-2">
                <X size={20} className="text-[var(--text-secondary)]" />
              </button>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                快速选择
              </h2>
              <div className="w-10" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 年份选择 */}
              <div>
                <h3 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>选择年份</h3>
                <div className="grid grid-cols-4 gap-2">
                  {yearOptions.map(y => (
                    <button
                      key={y}
                      onClick={() => quickSelectYear(y)}
                      className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                        selectedYear === y
                          ? 'bg-brand text-white'
                          : theme === 'dark' ? 'bg-surface text-ink hover:bg-surface' : 'bg-bg text-ink hover:bg-brand-tint'
                      }`}
                    >
                      {y}年
                    </button>
                  ))}
                </div>
              </div>
              {/* 月份选择 */}
              {timeRange === 'month' && (
                <div>
                  <h3 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>选择月份</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {monthOptions.map(m => (
                      <button
                        key={m}
                        onClick={() => quickSelectMonth(m)}
                        className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                          selectedMonth === m
                            ? 'bg-brand text-white'
                            : theme === 'dark' ? 'bg-surface text-ink hover:bg-surface' : 'bg-bg text-ink hover:bg-brand-tint'
                        }`}
                      >
                        {m}月
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 标签下钻弹窗 */}
      {selectedCategoryForDrill && tagDistribution && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setSelectedCategoryForDrill(null)}>
          <div
            className="w-full max-w-lg bg-[var(--bg-primary)] rounded-t-3xl animate-slide-up max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-warm)]">
              <button onClick={() => setSelectedCategoryForDrill(null)} className="p-2 -ml-2">
                <X size={20} className="text-[var(--text-secondary)]" />
              </button>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {selectedCategoryForDrill.icon} {selectedCategoryForDrill.name} - 标签分布
              </h2>
              <div className="w-10" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {tagDistribution.tagStats.map((tag) => {
                const percent = tagDistribution.categoryTotal > 0
                  ? ((tag.total / tagDistribution.categoryTotal) * 100).toFixed(1)
                  : '0'
                return (
                  <div key={tag.id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-xl">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-[var(--text-primary)]">{tag.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--text-primary)] font-mono">¥{tag.total.toLocaleString()}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{percent}%</div>
                    </div>
                  </div>
                )
              })}
              {tagDistribution.untaggedTotal > 0 && (
                <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-xl opacity-60">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-[var(--text-tertiary)]" />
                    <span className="text-[var(--text-tertiary)]">未分类标签</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[var(--text-tertiary)] font-mono">¥{tagDistribution.untaggedTotal.toLocaleString()}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {tagDistribution.categoryTotal > 0
                        ? ((tagDistribution.untaggedTotal / tagDistribution.categoryTotal) * 100).toFixed(1)
                        : '0'}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
