import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import { useAuthStore } from '../stores/useAuthStore'
import Card from '../components/ui/Card'
import BottomSheet from '../components/ui/BottomSheet'
import Toast from '../components/ui/Toast'
import {
  ChevronRight,
  Moon,
  Sun,
  Download,
  Upload,
  Info,
  Wallet,
  Tag,
  Globe,
  DollarSign,
  Trash2,
  LogOut,
  Crown,
  ScrollText,
} from 'lucide-react'

// ============================================================
// 版本更新说明（CHANGELOG）
// 规则：每次发布(push)在数组【头部】追加一条，版本号递增。
// 内容只面向用户说明"新增/优化/修复了什么功能"，不暴露任何开发细节。
// 数组首条即当前版本，应与 package.json 的 version 保持一致
// （"关于"与页脚的版本号取自 package.json，由构建注入，随发布自动更新）。
// ============================================================
const VERSION_LOGS: { version: string; date: string; changes: string[] }[] = [
  {
    version: '1.1.1',
    date: '2026-07-19',
    changes: [
      '修复搜索页"最近交易"列表未展示子分类与标签的问题，现已与搜索结果一致',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-18',
    changes: [
      '交易时间选择改为更顺手的滚轮式选择器',
      '优化交易编辑页布局',
      '修复交易列表按日期排序不准确的问题',
    ],
  },
  {
    version: '1.0.9',
    date: '2026-07-17',
    changes: [
      '报表页支持下拉刷新，可手动更新数据',
      '修复大量历史账单无法完整同步的问题（此前最多显示约 1000 条）',
      '报表收入/支出配色优化，更直观',
    ],
  },
  {
    version: '1.0.8',
    date: '2026-07-16',
    changes: [
      '财富支持多币种资产，美股、港股可按原币种记录与展示',
      '财富页支持切换本位币，统一查看总资产',
      '投资账户卡片拆分展示可用现金与持仓市值',
    ],
  },
  {
    version: '1.0.7',
    date: '2026-07-14',
    changes: [
      '新增截图识别导入账单（OCR + AI 解析）',
      '支持粘贴文本由 AI 自动识别为账单',
    ],
  },
  {
    version: '1.0.6',
    date: '2026-07-13',
    changes: [
      '财富页新增视角切换',
      '重构资产详情页',
      '新增资产变动日志',
    ],
  },
  {
    version: '1.0.5',
    date: '2026-07-12',
    changes: [
      '财富首页支持多币种计价',
      '资产估值刷新更快更稳定',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-07-09',
    changes: [
      '搜索页支持删除、编辑交易与无限滚动',
      '搜索支持自定义时间段筛选',
      '新增 PWA 桌面端更新可用提示',
    ],
  },
  {
    version: '1.0.3',
    date: '2026-07-08',
    changes: [
      '标签拆分为"子分类"与"全局标签"，分类管理更清晰',
    ],
  },
  {
    version: '1.0.2',
    date: '2026-07-07',
    changes: [
      '底部导航改为悬浮圆角样式',
      '首页问候语显示用户名',
      '日历标注今天日期',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-07-06',
    changes: [
      '钱盒子 PWA 首发：支持安装到桌面与离线使用',
      '设置页新增清除缓存、退出登录',
      '移动端适配与数字键盘交互优化',
    ],
  },
]

// 当前版本号取自 package.json，由 Vite 在构建时注入（import.meta.env.VITE_APP_VERSION）。
// 每次发布(push)只需在 package.json 递增 version，并同步在 VERSION_LOGS 头部追加一条说明，
// "关于"与页脚的版本号便会自动更新，无需手改此处。
const APP_VERSION: string = __APP_VERSION__

interface SettingItemProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  onClick?: () => void
  rightElement?: React.ReactNode
}

function SettingItem({ icon, title, subtitle, onClick, rightElement }: SettingItemProps) {
  const { theme } = useTheme()

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors
        ${theme === 'dark' ? 'hover:bg-surface' : 'hover:bg-[#faf9f5]'}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center
        ${theme === 'dark' ? 'bg-surface' : 'bg-bg'}`}>
        {icon}
      </div>
      <div className="flex-1 text-left">
        <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
          {title}
        </div>
        {subtitle && (
          <div className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            {subtitle}
          </div>
        )}
      </div>
      {rightElement || <ChevronRight size={18} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />}
    </button>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { bigExpenseThreshold, setBigExpenseThreshold, resetAndReload } = useApp()
  const { logout, user } = useAuthStore()
  const role = user?.role ?? 'user'
  const displayName = user?.displayName ?? user?.username ?? '用户'
  const [showExport, setShowExport] = useState(false)
  const [showThresholdEdit, setShowThresholdEdit] = useState(false)
  const [thresholdInput, setThresholdInput] = useState(bigExpenseThreshold.toString())
  const [showClearCache, setShowClearCache] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    message: '',
    type: 'success',
  })

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ visible: true, message, type })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000)
  }

  const handleClearCache = async () => {
    setClearing(true)
    try {
      await resetAndReload()
      setShowClearCache(false)
      showToast('缓存已清除，正在从云端恢复数据', 'success')
    } catch (err) {
      console.error('清除缓存失败:', err)
      showToast('清除缓存失败，请检查网络后重试', 'error')
    } finally {
      setClearing(false)
    }
  }

  const handleLogout = () => {
    logout()
    setShowLogout(false)
    navigate('/login')
  }

  // ============================================================
  // 步骤 1: 顶部会员/VIP 状态卡片（左侧头像+昵称，右侧身份标识）
  // ============================================================
  const isPremium = role === 'premium' || role === 'admin'

  const profileCard = (
    <div
      className={`rounded-2xl p-4 border ${
        isPremium
          ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 dark:from-amber-900/20 dark:to-yellow-900/20 dark:border-amber-700/40'
          : 'bg-surface border-brand-tint'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* 左侧：头像 + 昵称 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg shrink-0 ${
            isPremium
              ? 'bg-amber-400'
              : 'bg-ink-3/10'
          }`}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{isPremium ? '👑' : '👤'}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink text-base truncate">{displayName}</div>
            <div className={`text-xs mt-0.5 ${isPremium ? 'text-amber-600 dark:text-amber-400' : 'text-ink-2'}`}>
              {isPremium
                ? (role === 'admin' ? '系统管理员' : '尊贵 VIP 会员')
                : '当前身份：普通用户'}
            </div>
          </div>
        </div>
        {/* 右侧：操作按钮 */}
        {isPremium ? (
          <div className="shrink-0 w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center">
            <Crown size={18} className="text-white" />
          </div>
        ) : (
          <button className="shrink-0 px-3 py-1.5 rounded-full bg-brand text-ink text-xs font-medium active:scale-95 transition-transform">
            升级至VIP
          </button>
        )}
      </div>
      {/* VIP 权益清单 */}
      {isPremium && (
        <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-700/30">
          <div className="text-[11px] text-ink-2 mb-2">VIP 专属权益</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { icon: '🤖', label: '更频繁的 AI 解析' },
              { icon: '📊', label: '高级图表分析' },
              { icon: '📸', label: '无限次截图导入' },
              { icon: '⚡', label: '优先数据刷新' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-ink-2">
                <span className="text-sm">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ============================================================
  // 步骤 2-4: 重构 settingGroups 布局
  // 顺序: 基本信息 → 数据与备份 → 账户与安全 → 其他
  // 移除: 云同步、安全设置、通知组
  // ============================================================
  const settingGroups = [
    {
      title: '基本信息',
      items: [
        {
          icon: <Tag size={20} className="text-[#a855f7]" />,
          title: '分类管理',
          subtitle: '自定义收支分类',
          onClick: () => navigate('/categories'),
        },
        {
          icon: <DollarSign size={20} className="text-danger" />,
          title: '大额支出阈值',
          subtitle: `当前 ${bigExpenseThreshold}`,
          onClick: () => {
            setThresholdInput(bigExpenseThreshold.toString())
            setShowThresholdEdit(true)
          },
        },
        {
          icon: theme === 'dark'
            ? <Moon size={20} className="text-[#818cf8]" />
            : <Sun size={20} className="text-brand-strong" />,
          title: '主题设置',
          subtitle: theme === 'dark' ? '深色模式' : '浅色模式',
          onClick: toggleTheme,
          rightElement: (
            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${theme === 'dark' ? 'bg-brand' : 'bg-brand-tint'}`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          ),
        },
        {
          icon: <Globe size={20} className="text-ok" />,
          title: '多币种资产',
          subtitle: '美股/港股按原币种展示，可在财富页切换本位币',
          onClick: () => navigate('/wealth'),
        },
      ],
    },
    {
      title: '数据与备份',
      items: [
        {
          icon: <Download size={20} className="text-[#5b8dee]" />,
          title: '导出数据',
          subtitle: '导出为 Excel/JSON',
          onClick: () => setShowExport(true),
        },
        {
          icon: <Upload size={20} className="text-[#10b981]" />,
          title: '导入数据',
          subtitle: '从其他应用导入',
          onClick: () => {},
        },
        {
          icon: <Trash2 size={20} className="text-danger" />,
          title: '清除缓存',
          subtitle: '清除本地缓存数据',
          onClick: () => setShowClearCache(true),
        },
      ],
    },
    {
      title: '账户与安全',
      items: [
        {
          icon: <Wallet size={20} className="text-[#1e88e5]" />,
          title: '账户管理',
          subtitle: '管理你的账户',
          onClick: () => navigate('/assets'),
        },
        {
          icon: <LogOut size={20} className="text-danger" />,
          title: '退出登录',
          subtitle: '退出当前账号',
          onClick: () => setShowLogout(true),
        },
      ],
    },
    {
      title: '其他',
          items: [
        {
          icon: <Info size={20} className="text-ink-2" />,
          title: '关于',
          subtitle: `版本 ${APP_VERSION}`,
          onClick: () => setShowChangelog(true),
        },
        {
          icon: <ScrollText size={20} className="text-[#5b8dee]" />,
          title: '版本更新',
          subtitle: '查看历史更新内容',
          onClick: () => setShowChangelog(true),
        },
      ],
    },
  ]

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
          设置
        </h1>
      </header>

      <main className="px-5 tabbar-safe space-y-4 animate-page-fade">
        {/* 步骤 1: 顶部会员/VIP 状态卡片 */}
        {profileCard}

        {/* 步骤 2-4: 重构后的分组 */}
        {settingGroups.map((group, i) => (
          <div key={i}>
            <h3 className={`text-sm font-medium mb-2 px-1 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              {group.title}
            </h3>
            <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
              {group.items.map((item, j) => (
                <SettingItem key={j} {...item} />
              ))}
            </Card>
          </div>
        ))}

        {/* Footer */}
        <div className={`text-center py-6 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
          <p className="text-sm">钱盒子 v{APP_VERSION}</p>
          <p className="text-xs mt-1">温暖的个人财务管家</p>
        </div>
      </main>

      {/* Threshold Edit Sheet */}
      <BottomSheet
        isOpen={showThresholdEdit}
        onClose={() => setShowThresholdEdit(false)}
        title="大额支出阈值"
      >
        <div className="p-4 space-y-4">
          <div>
            <label className={`text-sm mb-2 block ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              设置大额支出最低金额（元）
            </label>
            <input
              type="number"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              placeholder="输入金额阈值"
              min="0"
              step="10"
              className={`w-full px-4 py-3 rounded-xl outline-none
                ${theme === 'dark'
                  ? 'bg-surface text-ink placeholder-[#87867f] focus:ring-2 focus:ring-brand/40'
                  : 'bg-bg text-ink placeholder-[#b0aea5] focus:ring-2 focus:ring-brand/40'
                }`}
            />
          </div>
          <p className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            报表页面的"大额支出"将只显示大于等于此金额的支出记录
          </p>
          <button
            onClick={() => {
              const val = parseInt(thresholdInput)
              if (!isNaN(val) && val >= 0) {
                setBigExpenseThreshold(val)
                setShowThresholdEdit(false)
              }
            }}
            className="w-full py-3 bg-brand text-white rounded-xl font-medium"
          >
            保存
          </button>
        </div>
      </BottomSheet>

      {/* Export Sheet */}
      <BottomSheet
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        title="导出数据"
      >
        <div className="p-4 space-y-3">
          <button className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${theme === 'dark' ? 'bg-surface hover:bg-brand-tint' : 'bg-bg hover:bg-brand-tint'}`}>
            <div className="w-12 h-12 rounded-xl bg-ok/10 flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>导出为 Excel</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>包含所有交易记录</div>
            </div>
          </button>

          <button className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${theme === 'dark' ? 'bg-surface hover:bg-brand-tint' : 'bg-bg hover:bg-brand-tint'}`}>
            <div className="w-12 h-12 rounded-xl bg-[#5b8dee]/10 flex items-center justify-center">
              <span className="text-xl">📋</span>
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>导出为 JSON</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>可用于数据备份</div>
            </div>
          </button>

          <button className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${theme === 'dark' ? 'bg-surface hover:bg-brand-tint' : 'bg-bg hover:bg-brand-tint'}`}>
            <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center">
              <span className="text-xl">🖼️</span>
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>导出月报图片</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>生成分享图片</div>
            </div>
          </button>
        </div>
      </BottomSheet>

      {/* Clear Cache Confirm Sheet */}
      <BottomSheet
        isOpen={showClearCache}
        onClose={() => setShowClearCache(false)}
        title="清除缓存"
      >
        <div className="p-4 space-y-4">
          <p className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            将清除本地缓存的所有数据（账户、分类、交易等）。此操作不会删除云端数据，下次同步时会重新拉取。确定要继续吗？
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowClearCache(false)}
              className={`flex-1 py-3 rounded-xl font-medium ${theme === 'dark' ? 'bg-surface text-ink' : 'bg-bg text-ink'}`}
            >
              取消
            </button>
            <button
              onClick={handleClearCache}
              disabled={clearing}
              className="flex-1 py-3 bg-danger text-white rounded-xl font-medium disabled:opacity-50"
            >
              {clearing ? '清除中...' : '确认清除'}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Logout Confirm Sheet */}
      <BottomSheet
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
        title="退出登录"
      >
        <div className="p-4 space-y-4">
          <p className={`text-sm ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
            确定要退出当前账号吗？本地缓存数据将一并清除。
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowLogout(false)}
              className={`flex-1 py-3 rounded-xl font-medium ${theme === 'dark' ? 'bg-surface text-ink' : 'bg-bg text-ink'}`}
            >
              取消
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 py-3 bg-danger text-white rounded-xl font-medium"
            >
              确认退出
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={showChangelog}
        onClose={() => setShowChangelog(false)}
        title="版本更新"
      >
        <div className="px-4 pb-6 pt-2 space-y-6">
          {VERSION_LOGS.map((log) => (
            <div key={log.version}>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-md bg-brand/10 text-brand text-xs font-medium">
                  v{log.version}
                </span>
                <span className="text-xs text-ink-2">{log.date}</span>
              </div>
              <ul className="space-y-1.5">
                {log.changes.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink leading-relaxed">
                    <span className="text-brand mt-0.5 shrink-0">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </BottomSheet>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  )
}
