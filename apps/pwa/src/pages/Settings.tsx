import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import { useAuthStore } from '../stores/useAuthStore'
import { syncEngine } from '../db/sync-engine'
import Card from '../components/ui/Card'
import BottomSheet from '../components/ui/BottomSheet'
import { 
  ChevronRight, 
  Moon, 
  Sun,
  Download,
  Upload,
  Bell,
  Shield,
  Info,
  Palette,
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
        ${theme === 'dark' ? 'hover:bg-[#30302e]' : 'hover:bg-[#faf9f5]'}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center
        ${theme === 'dark' ? 'bg-[#3d3d3a]' : 'bg-[#f5f4ed]'}`}>
        {icon}
      </div>
      <div className="flex-1 text-left">
        <div className={`font-medium ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
          {title}
        </div>
        {subtitle && (
          <div className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
            {subtitle}
          </div>
        )}
      </div>
      {rightElement || <ChevronRight size={18} className={theme === 'dark' ? 'text-[#4a4a47]' : 'text-[#d1cfc5]'} />}
    </button>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { bigExpenseThreshold, setBigExpenseThreshold } = useApp()
  const { logout } = useAuthStore()
  const [showExport, setShowExport] = useState(false)
  const [showThresholdEdit, setShowThresholdEdit] = useState(false)
  const [thresholdInput, setThresholdInput] = useState(bigExpenseThreshold.toString())
  const [showClearCache, setShowClearCache] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [clearing, setClearing] = useState(false)

  const handleClearCache = async () => {
    setClearing(true)
    try {
      await syncEngine.clearAllData()
      localStorage.removeItem('mybills_user')
      setShowClearCache(false)
    } catch (err) {
      console.error('清除缓存失败:', err)
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
          icon: theme === 'dark' ? <Moon size={20} className="text-[#818cf8]" /> : <Sun size={20} className="text-[#f59e0b]" />, 
          title: '主题设置', 
          subtitle: theme === 'dark' ? '深色模式' : '浅色模式',
          onClick: toggleTheme,
          rightElement: (
            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${theme === 'dark' ? 'bg-[#c96442]' : 'bg-[#e8e6dc]'}`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          )
        },
        { icon: <Globe size={20} className="text-[#2d8a5e]" />, title: '多币种', subtitle: '人民币', onClick: () => {} },
        { 
          icon: <DollarSign size={20} className="text-[#e05555]" />, 
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
        { icon: <Bell size={20} className="text-[#f59e0b]" />, title: '提醒设置', subtitle: '账单到期提醒', onClick: () => {} },
      ]
    },
    {
      title: '数据',
      items: [
        { icon: <Download size={20} className="text-[#5b8dee]" />, title: '导出数据', subtitle: '导出为 Excel/JSON', onClick: () => setShowExport(true) },
        { icon: <Upload size={20} className="text-[#10b981]" />, title: '导入数据', subtitle: '从其他应用导入', onClick: () => {} },
        { icon: <Cloud size={20} className="text-[#818cf8]" />, title: '云同步', subtitle: '未开启', onClick: () => {} },
        { icon: <Trash2 size={20} className="text-[#e05555]" />, title: '清除缓存', subtitle: '清除本地缓存数据', onClick: () => setShowClearCache(true) },
      ]
    },
    {
      title: '安全',
      items: [
        { icon: <Shield size={20} className="text-[#c96442]" />, title: '安全设置', subtitle: '密码/生物识别', onClick: () => {} },
        { icon: <LogOut size={20} className="text-[#e05555]" />, title: '退出登录', subtitle: '退出当前账号', onClick: () => setShowLogout(true) },
      ]
    },
    {
      title: '其他',
      items: [
        { icon: <Info size={20} className="text-[#87867f]" />, title: '关于', subtitle: '版本 1.0.0', onClick: () => {} },
      ]
    },
  ]

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 px-4 pt-3 pb-2 ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
        <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
          设置
        </h1>
      </header>

      <main className="px-4 pb-4 space-y-4">
        {settingGroups.map((group, i) => (
          <div key={i}>
            <h3 className={`text-sm font-medium mb-2 px-1 ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
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
        <div className={`text-center py-6 ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
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
            <label className={`text-sm mb-2 block ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'}`}>
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
                  ? 'bg-[#3d3d3a] text-[#faf9f5] placeholder-[#87867f] focus:ring-2 focus:ring-[#c96442]/50'
                  : 'bg-[#f5f4ed] text-[#141413] placeholder-[#b0aea5] focus:ring-2 focus:ring-[#c96442]/50'
                }`}
            />
          </div>
          <p className={`text-xs ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
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
            className="w-full py-3 bg-[#c96442] text-white rounded-xl font-medium"
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
          <button className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${theme === 'dark' ? 'bg-[#3d3d3a] hover:bg-[#4a4a47]' : 'bg-[#f5f4ed] hover:bg-[#e8e6dc]'}`}>
            <div className="w-12 h-12 rounded-xl bg-[#2d8a5e]/10 flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>导出为 Excel</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>包含所有交易记录</div>
            </div>
          </button>
          
          <button className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${theme === 'dark' ? 'bg-[#3d3d3a] hover:bg-[#4a4a47]' : 'bg-[#f5f4ed] hover:bg-[#e8e6dc]'}`}>
            <div className="w-12 h-12 rounded-xl bg-[#5b8dee]/10 flex items-center justify-center">
              <span className="text-xl">📋</span>
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>导出为 JSON</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>可用于数据备份</div>
            </div>
          </button>
          
          <button className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${theme === 'dark' ? 'bg-[#3d3d3a] hover:bg-[#4a4a47]' : 'bg-[#f5f4ed] hover:bg-[#e8e6dc]'}`}>
            <div className="w-12 h-12 rounded-xl bg-[#c96442]/10 flex items-center justify-center">
              <span className="text-xl">🖼️</span>
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>导出月报图片</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>生成分享图片</div>
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
          <p className={`text-sm ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'}`}>
            将清除本地缓存的所有数据（账户、分类、交易等）。此操作不会删除云端数据，下次同步时会重新拉取。确定要继续吗？
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowClearCache(false)}
              className={`flex-1 py-3 rounded-xl font-medium ${theme === 'dark' ? 'bg-[#3d3d3a] text-[#faf9f5]' : 'bg-[#f5f4ed] text-[#141413]'}`}
            >
              取消
            </button>
            <button
              onClick={handleClearCache}
              disabled={clearing}
              className="flex-1 py-3 bg-[#e05555] text-white rounded-xl font-medium disabled:opacity-50"
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
          <p className={`text-sm ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'}`}>
            确定要退出当前账号吗？本地缓存数据将一并清除。
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowLogout(false)}
              className={`flex-1 py-3 rounded-xl font-medium ${theme === 'dark' ? 'bg-[#3d3d3a] text-[#faf9f5]' : 'bg-[#f5f4ed] text-[#141413]'}`}
            >
              取消
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 py-3 bg-[#e05555] text-white rounded-xl font-medium"
            >
              确认退出
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
