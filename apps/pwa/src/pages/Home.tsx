import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuthStore } from '../stores/useAuthStore'
import Card from '../components/ui/Card'
import TransactionItem from '../components/ui/TransactionItem'
import { Modal } from '../components/ui/Modal'
import { formatCurrency } from '../utils/format'
import { VERSION_LOGS, type VersionLog } from '../data/versionLogs'
import { TrendingUp, TrendingDown, PiggyBank, ChevronRight, Sparkles, PieChart, Search } from 'lucide-react'

// 记录用户上次已看到的版本号，用于「更新后首页提示」
const LAST_SEEN_VERSION_KEY = 'mybills:lastSeenVersion'

// 首页日历图标：中间动态显示"今天"日期
const HomeCalendarIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#222222' }) => {
  const today = new Date().getDate()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16.5" rx="5" fill="#FFF7E6" stroke={color} strokeWidth="1.6" />
      <path d="M3 9h18" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 3v3.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 3v3.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <text x="12" y="15" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="700" fill={color} stroke="none">
        {today}
      </text>
    </svg>
  )
}

interface HomePageProps {
  onAddTransaction?: () => void
}

export default function HomePage({ onAddTransaction }: HomePageProps = {}) {
  const navigate = useNavigate()
  const {
    getTotalAssets,
    getMonthlyIncome,
    getMonthlyExpense,
    getBudgetProgress,
    transactions,
    categories,
  } = useApp()
  const user = useAuthStore(state => state.user)

  // 版本更新提示：升级到新版本后，首页弹窗告知本次更新内容（首次安装不弹）
  const [updatedLog, setUpdatedLog] = useState<VersionLog | null>(null)
  useEffect(() => {
    try {
      const current = __APP_VERSION__
      const seen = localStorage.getItem(LAST_SEEN_VERSION_KEY)
      if (seen && seen !== current) {
        const log = VERSION_LOGS.find(l => l.version === current)
        setUpdatedLog(log ?? { version: current, date: '', changes: [] })
      }
      // 无论是否弹窗，都记录当前版本：首次安装静默写入，升级后只提示一次
      localStorage.setItem(LAST_SEEN_VERSION_KEY, current)
    } catch {
      // localStorage 不可用（隐私模式等）时静默跳过
    }
  }, [])

  const totalAssets = getTotalAssets()
  const monthlyIncome = getMonthlyIncome()
  const monthlyExpense = getMonthlyExpense()
  const balance = monthlyIncome - monthlyExpense
  const budget = getBudgetProgress()

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '凌晨好' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  const fmt = (n: number) => formatCurrency(n, false, false)

  const quickActions = [
    { icon: <PieChart size={22} color="#222" />, label: '报表', color: '#FFF7E6', path: '/reports' },
    { icon: <HomeCalendarIcon color="#222" />, label: '日历', color: '#FFF7E6', path: '/calendar' },
    { icon: <Sparkles size={22} color="#222" />, label: 'AI助手', color: '#FFF7E6', path: '/ai' },
    { icon: <Search size={22} color="#222" />, label: '搜索', color: '#FFF7E6', path: '/search' },
  ]

  const recent = transactions.slice(0, 5)

  return (
    <div className="min-h-screen bg-bg">
      <main className="px-5 tabbar-safe space-y-4 overflow-x-hidden animate-page-fade pt-4">
        {/* 顶部大卡：欢迎 + 总资产 + 当月统计 */}
        <Card className="bg-gradient-to-br from-brand to-brand-soft text-ink shadow-soft-brand stagger">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium opacity-70">{greeting}，{user?.username ?? '晓东'} 👋</p>
              <p className="text-xs opacity-60 mt-0.5">总资产</p>
              <p className="font-bold font-amount amount-fluid-lg mt-1">{fmt(totalAssets)}</p>
            </div>
            <button
              onClick={() => navigate('/assets')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/50 text-xs font-medium active:scale-95 transition-all"
            >
              资产 <ChevronRight size={14} />
            </button>
          </div>

          {/* 当月三统计：点击进入预算页 */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-black/5 min-w-0">
            <button
              onClick={() => navigate('/budget')}
              className="text-left active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-1 text-xs opacity-60 mb-1">
                <TrendingUp size={13} /> 收入
              </div>
              <div className="text-base font-bold font-amount amount-fluid">{fmt(monthlyIncome)}</div>
            </button>
            <button
              onClick={() => navigate('/budget')}
              className="text-left active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-1 text-xs opacity-60 mb-1">
                <TrendingDown size={13} /> 支出
              </div>
              <div className="text-base font-bold font-amount amount-fluid">{fmt(monthlyExpense)}</div>
            </button>
            <button
              onClick={() => navigate('/budget')}
              className="text-left active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-1 text-xs opacity-60 mb-1">
                <PiggyBank size={13} /> 结余
              </div>
              <div className={`text-base font-bold font-amount amount-fluid ${balance >= 0 ? '' : 'text-danger'}`}>
                {fmt(balance)}
              </div>
            </button>
          </div>
        </Card>

        {/* 快捷入口：一行四宫格 */}
        <Card className="flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-1 flex-col items-center gap-1.5 py-2.5 rounded-2xl bg-brand-tint active:scale-95 transition-all"
              >
                <span className="flex items-center justify-center">{action.icon}</span>
                <span className="text-[11px] font-medium text-ink">{action.label}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* AI 助手卡 */}
        <Card hoverable onClick={() => navigate('/ai')} className="flex items-center gap-3 bg-gradient-to-r from-brand-tint to-surface">
          <div className="w-11 h-11 rounded-2xl bg-brand flex items-center justify-center shrink-0">
            <Sparkles size={22} color="#222" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink">AI 消费洞察</div>
            <div className="text-xs text-ink-2 mt-0.5 truncate">本月饮食占比偏高，看看分析 →</div>
          </div>
          <ChevronRight size={18} className="text-ink-2 shrink-0" />
        </Card>

        {/* 最近交易 */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-semibold text-ink">最近交易</h3>
            <button onClick={() => navigate('/transactions')} className="text-sm text-ink-2 active:scale-95 transition-all">
              查看全部
            </button>
          </div>
          <Card className="!p-2">
            {recent.length > 0 ? (
              recent.map((t) => {
                const category = (categories[t.type === 'expense' ? 'expense' : 'income'] as any[])?.find(c => c.id === t.categoryId) || { icon: '📝', color: '#888888' }
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
              })
            ) : (
              <div className="py-10 text-center text-ink-2 text-sm">暂无交易记录</div>
            )}
          </Card>
        </div>
      </main>

      {/* 版本更新提示弹窗 */}
      <Modal
        isOpen={!!updatedLog}
        onClose={() => setUpdatedLog(null)}
        title="🎉 已更新到新版本"
      >
        {updatedLog && (
          <div>
            <p className="text-sm text-ink-2">
              当前版本 <span className="font-medium text-ink">v{updatedLog.version}</span>
              {updatedLog.date && <span className="text-ink-3">（{updatedLog.date}）</span>}
            </p>
            {updatedLog.changes.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {updatedLog.changes.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink leading-relaxed">
                    <span className="text-brand-strong shrink-0">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-2">已升级到最新版本，感谢使用～</p>
            )}
            <button
              onClick={() => setUpdatedLog(null)}
              className="mt-6 w-full py-3 rounded-2xl bg-brand text-ink font-medium active:scale-95 transition-all"
            >
              知道了
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
