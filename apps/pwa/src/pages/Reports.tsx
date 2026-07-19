import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import CategoryDistributionSheet from '../components/CategoryDistributionSheet'
import CategoryDetailSheet from '../components/CategoryDetailSheet'
import { SyncToast, SyncToastData } from '../components/ui/SyncToast'
import { DonutChart } from '../components/charts/DonutChart'
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react'
import WheelPicker from '../components/ui/WheelPicker'
import { Bar, Line } from 'react-chartjs-2'
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
import { formatCurrency } from '../utils/format'
import { syncEngine } from '../db/sync-engine'

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
    categories, subCategories, transactions, bigExpenseThreshold,
    getMonthSummary, getMonthWeekExpense, getYearMonthExpense, getYearMonthDetail,
    getMonthExpenseByCategory, getMonthTopExpenses, refreshData,
  } = useApp()
  const [timeRange, setTimeRange] = useState<TimeRange>('month')

  // 右上角同步胶囊按钮的状态机
  const [syncState, setSyncState] = useState<'idle' | 'checking' | 'syncing' | 'success' | 'error'>('idle')
  const [successText, setSuccessText] = useState('')
  const [syncToast, setSyncToast] = useState<SyncToastData | null>(null)
  // 上次已知远程总行数（用于后台 COUNT 增量判断）
  const lastCountRef = useRef<number | null>(null)
  // 拉取锁：防止并发 / 连点
  const pullingRef = useRef(false)

  // 主动拉取全量并刷新
  const runPull = useCallback(async () => {
    if (pullingRef.current) return
    pullingRef.current = true
    setSyncState('syncing')
    try {
      const uid = (await import('../stores/useAuthStore')).useAuthStore.getState().user?.id
      if (!uid) throw new Error('未登录')
      const total = await syncEngine.pullAll(uid)
      if (refreshData) await refreshData()
      lastCountRef.current = total
      setSuccessText(total > 0 ? `已同步 ${total} 条` : '已是最新数据')
      setSyncState('success')
    } catch {
      setSyncState('error')
      setSyncToast({ message: '同步失败，请检查网络', type: 'error' })
    } finally {
      pullingRef.current = false
    }
  }, [refreshData])

  // 用户点击：加锁防连点
  const handleSync = useCallback(() => {
    if (pullingRef.current) return
    void runPull()
  }, [runPull])

  // 后台轻量 COUNT 检查：有增量则自动同步
  const checkUpdates = useCallback(async () => {
    if (pullingRef.current) return
    setSyncState('checking')
    try {
      const uid = (await import('../stores/useAuthStore')).useAuthStore.getState().user?.id
      if (!uid) { setSyncState('idle'); return }
      const total = await syncEngine.checkForUpdates(uid)
      if (lastCountRef.current === null) {
        lastCountRef.current = total
        setSuccessText('已是最新数据')
        setSyncState('success')
      } else if (total > lastCountRef.current) {
        await runPull()
      } else {
        lastCountRef.current = total
        setSuccessText('已是最新数据')
        setSyncState('success')
      }
    } catch {
      setSyncState('idle')
    }
  }, [runPull])

  // 成功 1.5s / 失败 2s 后回到空闲
  useEffect(() => {
    if (syncState === 'success') {
      const t = setTimeout(() => setSyncState('idle'), 1500)
      return () => clearTimeout(t)
    }
    if (syncState === 'error') {
      const t = setTimeout(() => setSyncState('idle'), 2000)
      return () => clearTimeout(t)
    }
  }, [syncState])

  // 首次挂载静默检查 + 60 秒可见性轮询
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let cleanupIdle: (() => void) | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => { void checkUpdates() }, 60000)
    }
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkUpdates()
        start()
      } else {
        stop()
      }
    }
    // 挂载时的计数检查延迟到浏览器空闲时执行，避免阻塞首屏渲染；
    // 若用户在空闲前离开报表页，取消本次请求（节省一次 RPC）
    const w = window as any
    if (typeof w.requestIdleCallback === 'function') {
      const idleId = w.requestIdleCallback(() => { void checkUpdates() }, { timeout: 2000 })
      cleanupIdle = () => w.cancelIdleCallback(idleId)
    } else {
      const t = window.setTimeout(() => { void checkUpdates() }, 500)
      cleanupIdle = () => clearTimeout(t)
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cleanupIdle?.()
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkUpdates])
  
  // 当前选择的年月
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  // 点击或长按中间时间快速选择年/月
  const [showTimePicker, setShowTimePicker] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeDisplayRef = useRef<HTMLButtonElement>(null)

  const openTimePicker = () => setShowTimePicker(true)
  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => setShowTimePicker(true), 500)
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

  const [drillCategoryId, setDrillCategoryId] = useState<string | null>(null)
  const [distExpanded, setDistExpanded] = useState(false)

  // 明细抽屉：点击子类行时携带的分类+子类信息
  const [detailSheet, setDetailSheet] = useState<{
    categoryId: string
    subcategoryId: string | null
    name: string
  } | null>(null)

  // 当前报表时间范围（与报表统计口径一致）
  const { startStr: rangeStartStr, endStr: rangeEndStr } = (() => {
    if (timeRange === 'month') {
      const start = new Date(selectedYear, selectedMonth - 1, 1)
      const end = new Date(selectedYear, selectedMonth, 0) // 当月最后一天
      return { startStr: start, endStr: end }
    } else {
      const start = new Date(selectedYear, 0, 1)
      const end = new Date(selectedYear, 11, 31)
      return { startStr: start, endStr: end }
    }
  })()

  // Map: categoryId -> SubCategory[]，避免重复遍历 subCategories
  const subCategoryByCategory = (() => {
    const m = new Map<string, typeof subCategories>()
    for (const s of subCategories) {
      const arr = m.get(s.categoryId)
      if (arr) arr.push(s)
      else m.set(s.categoryId, [s])
    }
    return m
  })()

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
  const expenseByCategory = useMemo(() => {
    if (timeRange === 'month') {
      return getMonthExpenseByCategory(selectedYear, selectedMonth)
    }
    // 按年：汇总 selectedYear 全年各分类支出
    const catMap = new Map<string, { id: string; name: string; icon: string; color: string; total: number }>()
    for (const cat of categories.expense) {
      catMap.set(cat.id, { ...cat, total: 0 })
    }
    for (const t of transactions) {
      if (t.type !== 'expense' || !t.transactionDate) continue
      const d = new Date(t.transactionDate.replace(/-/g, '/'))
      if (isNaN(d.getTime())) continue
      if (d.getFullYear() !== selectedYear) continue
      const entry = catMap.get(t.categoryId)
      if (entry) entry.total += t.amount
    }
    return Array.from(catMap.values()).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
  }, [timeRange, transactions, categories.expense, selectedYear, selectedMonth, getMonthExpenseByCategory])

  const totalExpense = expenseByCategory.reduce((sum, c) => sum + c.total, 0)

  // 大额支出（仅按月显示）
  const topExpenses = timeRange === 'month'
    ? getMonthTopExpenses(selectedYear, selectedMonth, bigExpenseThreshold)
    : []

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
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: '支出',
        data: yearMonthExpense.expense,
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.1)',
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
          callback: (value: any) => `${value}`
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
          callback: (value: any) => `${value}`
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
  // 年份上限为当前年（不显示未来），下限 2015 起
  const currentYear = now.getFullYear()
  const yearStart = 2015
  const years = useMemo(() => Array.from({ length: currentYear - yearStart + 1 }, (_, i) => yearStart + i), [currentYear])
  const months = useMemo(() => ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'], [])

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-ink">报表</h1>
          <button
            onClick={handleSync}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${theme === 'dark' ? 'bg-surface' : 'bg-brand-tint'}
              ${syncState === 'success' ? 'text-[#16a34a]' : syncState === 'error' ? 'text-[#ef4444]' : 'text-ink-2'}
              ${(syncState === 'syncing' || syncState === 'checking') ? 'opacity-60 pointer-events-none' : ''}
            `}
          >
            {syncState === 'idle' && (<><RefreshCw size={13} /> 同步</>)}
            {syncState === 'checking' && (<><RefreshCw size={13} className="animate-spin" /> 检查中...</>)}
            {syncState === 'syncing' && (<><RefreshCw size={13} className="animate-spin" /> 同步中...</>)}
            {syncState === 'success' && (<><RefreshCw size={13} /> {successText}</>)}
            {syncState === 'error' && (<><AlertCircle size={13} /> 同步失败</>)}
          </button>
        </div>
      </header>

      <main className="px-5 tabbar-safe space-y-4 animate-page-fade">
        {/* Time Range Tabs */}
        <div className={`flex p-1 rounded-xl ${theme === 'dark' ? 'bg-surface' : 'bg-brand-tint'}`}>
          {(['month', 'year'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
                ${timeRange === range
                  ? 'bg-white border border-gray-200 text-ink'
                  : theme === 'dark' ? 'text-ink-2' : 'text-ink-2'
                }`}
            >
              {range === 'month' ? '按月' : '按年'}
            </button>
          ))}
        </div>

        {/* Time Navigator */}
        <div className="relative flex items-center justify-between">
          <button
            onClick={goPrev}
            className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-surface text-ink-2' : 'hover:bg-brand-tint text-ink-2'}`}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            ref={timeDisplayRef}
            onClick={openTimePicker}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            className={`cursor-pointer select-none flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
              theme === 'dark' ? 'hover:bg-surface text-ink' : 'hover:bg-brand-tint text-ink'
            }`}
          >
            <h2 className="text-base font-semibold">
              {timeDisplay}
            </h2>
            <ChevronDown size={18} className={`opacity-60 transition-transform ${showTimePicker ? 'rotate-180' : ''}`} />
          </button>
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

          {/* 滚轮选择器 */}
          {showTimePicker && (
            <>
              {/* 透明遮罩：点击外部关闭 */}
              <div className="fixed inset-0 z-40" onClick={() => setShowTimePicker(false)} />
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 rounded-3xl bg-white shadow-lg border border-gray-100 p-4 pb-5 animate-drop-down min-w-[140px] w-auto"
                onClick={e => e.stopPropagation()}
              >
                {timeRange === 'month' ? (
                  <div className="flex gap-6 justify-center items-start">
                    <div className="w-[80px]">
                      <WheelPicker
                        items={years}
                        value={years.indexOf(selectedYear)}
                        onChange={(i) => setSelectedYear(years[i])}
                        itemHeight={32}
                        visibleCount={3}
                      />
                    </div>
                    <div className="w-[80px]">
                      <WheelPicker
                        items={months}
                        value={selectedMonth - 1}
                        onChange={(i) => setSelectedMonth(i + 1)}
                        itemHeight={32}
                        visibleCount={3}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center w-[80px] mx-auto">
                    <WheelPicker
                      items={years}
                      value={years.indexOf(selectedYear)}
                      onChange={(i) => setSelectedYear(years[i])}
                      itemHeight={32}
                      visibleCount={3}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Income/Expense Summary */}
        {timeRange === 'month' && monthSummary ? (
          <div className="grid grid-cols-3 gap-3">
            <Card className="!p-3 text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>收入</div>
              <div className="font-bold font-mono truncate text-[#dc2626]" style={{ fontSize: 'clamp(14px, 3.5vw, 20px)' }}>
                {formatCurrency(monthSummary.income)}
              </div>
            </Card>
            <Card className="!p-3 text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>支出</div>
              <div className="font-bold font-mono truncate text-[#16a34a]" style={{ fontSize: 'clamp(14px, 3.5vw, 20px)' }}>
                {formatCurrency(monthSummary.expense)}
              </div>
            </Card>
            <Card className="!p-3 text-center">
              <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>结余</div>
              <div className={`font-bold font-mono truncate ${(monthSummary.income - monthSummary.expense) >= 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`} style={{ fontSize: 'clamp(14px, 3.5vw, 20px)' }}>
                {formatCurrency(monthSummary.income - monthSummary.expense, false, true)}
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
                  <div className="font-bold font-mono truncate text-[#dc2626]" style={{ fontSize: 'clamp(14px, 3.5vw, 20px)' }}>
                    {formatCurrency(totalIncome, false, true)}
                  </div>
                </Card>
                <Card className="!p-3 text-center">
                  <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>年支出</div>
                  <div className="font-bold font-mono truncate text-[#16a34a]" style={{ fontSize: 'clamp(14px, 3.5vw, 20px)' }}>
                    {formatCurrency(totalExpense2, false, true)}
                  </div>
                </Card>
                <Card className="!p-3 text-center">
                  <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>年结余</div>
                  <div className={`font-bold font-mono truncate ${totalBalance >= 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`} style={{ fontSize: 'clamp(14px, 3.5vw, 20px)' }}>
                    {formatCurrency(totalBalance, false, true)}
                  </div>
                </Card>
              </div>
            )
          })()
        ) : null}

        {/* Expense Distribution —— 上下布局 */}
        <Card className="!p-4">
          <h3 className={`font-semibold mb-6 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
            支出分布
          </h3>
          {expenseByCategory.length > 0 ? (
            <div className="flex flex-col">
              {/* ① 图表区域：Donut 居中 + 总支出 */}
              <div className="flex flex-col items-center mb-6">
                <div className="w-44 h-44">
                  <DonutChart
                    data={{
                      labels: expenseByCategory.map(c => c.name),
                      values: expenseByCategory.map(c => c.total),
                      colors: expenseByCategory.map(c => c.color),
                    }}
                    size={176}
                    centerText={{
                      main: formatCurrency(totalExpense, false, false),
                      sub: '总支出',
                    }}
                    onClick={(_e: any, elements: any[]) => {
                      if (elements.length === 0) return
                      const cat = expenseByCategory[elements[0].index]
                      if (cat && subCategoryByCategory.has(cat.id)) setDrillCategoryId(cat.id)
                    }}
                  />
                </div>
              </div>

              {/* ② 分类列表区域 */}
              <div className="overflow-hidden">
                {expenseByCategory
                  .slice(0, distExpanded ? expenseByCategory.length : 5)
                  .map((cat) => {
                    const percent = totalExpense > 0 ? ((cat.total / totalExpense) * 100).toFixed(1) : '0'
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setDetailSheet({ categoryId: cat.id, subcategoryId: null, name: cat.name })}
                        className="w-full text-left block py-4 cursor-pointer first:pt-0"
                      >
                        {/* 第一行：图标+名称 | 百分比 */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-base font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                            {cat.icon} {cat.name}
                          </span>
                          <span className={`text-[15px] font-medium ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                            {percent}%
                          </span>
                        </div>
                        {/* 第二行：彩色进度条 */}
                        <div className="w-full h-1.5 rounded-[999px] bg-[#F5F5F5] overflow-hidden">
                          <div
                            className="h-full rounded-[999px]"
                            style={{
                              width: `${percent}%`,
                              backgroundColor: cat.color,
                            }}
                          />
                        </div>
                        {/* 第三行：金额 */}
                        <div className={`mt-2 text-[18px] font-semibold font-mono amount-fluid text-[#16a34a]`}>
                          {formatCurrency(cat.total, false, false)}
                        </div>
                      </button>
                    )
                  })}

                {/* 展开更多（高度动画） */}
                {expenseByCategory.length > 5 && (
                  <button
                    onClick={() => setDistExpanded(v => !v)}
                    className="w-full text-center pt-4 text-sm font-medium text-[var(--brand)] hover:opacity-80 transition-opacity"
                  >
                    {distExpanded
                      ? '收起'
                      : `展开更多（${expenseByCategory.length - 5}）`}
                  </button>
                )}
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
              大额支出 (≥{formatCurrency(bigExpenseThreshold)})
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
                    <div className="text-[#16a34a] font-mono font-medium">
                      {formatCurrency(-Math.abs(t.amount), true, false)}
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
                    <th className={`text-right py-2 px-2 font-medium text-[#dc2626]`}>收入</th>
                    <th className={`text-right py-2 px-2 font-medium text-[#16a34a]`}>支出</th>
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
                      <td className="py-2.5 px-2 text-right font-mono text-[#dc2626]">
                        {formatCurrency(row.income)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-[#16a34a]">
                        {formatCurrency(row.expense)}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-mono font-medium ${row.balance >= 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                        {formatCurrency(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`border-t-2 ${theme === 'dark' ? 'border-ink/10' : 'border-ink/10'}`}>
                    <td className={`py-3 px-2 font-bold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>合计</td>
                    <td className="py-3 px-2 text-right font-mono font-bold amount-fluid break-amount text-[#dc2626]">
                      {formatCurrency(yearMonthDetail.reduce((s, r) => s + r.income, 0))}
                    </td>
                    <td className="py-3 px-2 text-right font-mono font-bold amount-fluid break-amount text-[#16a34a]">
                      {formatCurrency(yearMonthDetail.reduce((s, r) => s + r.expense, 0))}
                    </td>
                    <td className={`py-3 px-2 text-right font-mono font-bold amount-fluid break-amount ${yearMonthDetail.reduce((s, r) => s + r.balance, 0) >= 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                      {formatCurrency(yearMonthDetail.reduce((s, r) => s + r.balance, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}
      </main>

      {/* 子分类分布下钻 */}
      {drillCategoryId && (
        <CategoryDistributionSheet
          visible={true}
          categoryId={drillCategoryId}
          startDate={rangeStartStr}
          endDate={rangeEndStr}
          type="expense"
          onClose={() => setDrillCategoryId(null)}
          onSubcategoryClick={(sub) =>
            setDetailSheet({ categoryId: drillCategoryId, subcategoryId: sub.id, name: sub.name })
          }
        />
      )}

      {/* 子类账单明细抽屉 */}
      {detailSheet && (
        <CategoryDetailSheet
          visible={true}
          title={`【${detailSheet.name}】· 账单明细`}
          categoryId={detailSheet.categoryId}
          subcategoryId={detailSheet.subcategoryId}
          subcategories={subCategoryByCategory.get(detailSheet.categoryId)?.map(s => ({ id: s.id, name: s.name }))}
          startDate={rangeStartStr}
          endDate={rangeEndStr}
          onClose={() => setDetailSheet(null)}
        />
      )}

      {/* 同步反馈 Toast（仅失败时弹出） */}
      <SyncToast
        toast={syncToast}
        onClose={() => setSyncToast(null)}
        onRetry={() => {
          setSyncToast(null)
          void runPull()
        }}
      />
    </div>
  )
}
