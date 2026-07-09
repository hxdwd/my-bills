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
  Bell,
  Shield,
  Info,
  Wallet,
  Tag,
  Globe,
  Cloud,
  DollarSign,
  Trash2,
  LogOut,
} from 'lucide-react'

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
  const { logout } = useAuthStore()
  const [showExport, setShowExport] = useState(false)
  const [showThresholdEdit, setShowThresholdEdit] = useState(false)
  const [thresholdInput, setThresholdInput] = useState(bigExpenseThreshold.toString())
  const [showClearCache, setShowClearCache] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
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
      // 方案B: 走可靠路径 —— 先清空内存 state 再清 IndexedDB 并重载，
      // 任何一步失败都会进入 catch 并明确提示，不再"静默无效"。
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

  const settingGroups = [
    {
      title: '账户',
      items: [
        { icon: <Wallet size={20} className="text-[#1e88e5]" />, title: '账户管理', subtitle: '管理你的账户', onClick: () => navigate('/assets') },
        { icon: <Tag size={20} className="text-[#a855f7]" />, title: '分类管理', subtitle: '自定义收支分类', onClick: () => navigate('/categories') },
      ]
    },
    {
      title: '偏好',
      items: [
        { 
          icon: theme === 'dark' ? <Moon size={20} className="text-[#818cf8]" /> : <Sun size={20} className="text-brand-strong" />, 
          title: '主题设置', 
          subtitle: theme === 'dark' ? '深色模式' : '浅色模式',
          onClick: toggleTheme,
          rightElement: (
            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${theme === 'dark' ? 'bg-brand' : 'bg-brand-tint'}`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          )
        },
        { icon: <Globe size={20} className="text-ok" />, title: '多币种', subtitle: '人民币', onClick: () => {} },
        { 
          icon: <DollarSign size={20} className="text-danger" />, 
          title: '大额支出阈值', 
          subtitle: `当前 ¥${bigExpenseThreshold}`,
          onClick: () => {
            setThresholdInput(bigExpenseThreshold.toString())
            setShowThresholdEdit(true)
          }
        },
      ]
    },
    {
      title: '通知',
      items: [
        { icon: <Bell size={20} className="text-brand-strong" />, title: '提醒设置', subtitle: '账单到期提醒', onClick: () => {} },
      ]
    },
    {
      title: '数据',
      items: [
        { icon: <Download size={20} className="text-[#5b8dee]" />, title: '导出数据', subtitle: '导出为 Excel/JSON', onClick: () => setShowExport(true) },
        { icon: <Upload size={20} className="text-[#10b981]" />, title: '导入数据', subtitle: '从其他应用导入', onClick: () => {} },
        { icon: <Cloud size={20} className="text-[#818cf8]" />, title: '云同步', subtitle: '未开启', onClick: () => {} },
        { icon: <Trash2 size={20} className="text-danger" />, title: '清除缓存', subtitle: '清除本地缓存数据', onClick: () => setShowClearCache(true) },
      ]
    },
    {
      title: '安全',
      items: [
        { icon: <Shield size={20} className="text-ink" />, title: '安全设置', subtitle: '密码/生物识别', onClick: () => {} },
        { icon: <LogOut size={20} className="text-danger" />, title: '退出登录', subtitle: '退出当前账号', onClick: () => setShowLogout(true) },
      ]
    },
    {
      title: '其他',
      items: [
        { icon: <Info size={20} className="text-ink-2" />, title: '关于', subtitle: '版本 1.0.0', onClick: () => {} },
      ]
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
          <p className="text-sm">钱盒子 v1.0.0</p>
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

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  )
}
