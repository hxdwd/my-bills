import { useTheme } from '../../context/ThemeContext'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  visible: boolean
  onClose: () => void
}

export default function Toast({ message, type = 'success', visible, onClose }: ToastProps) {
  const { theme } = useTheme()

  if (!visible) return null

  const icons = {
    success: <CheckCircle size={20} className="text-[#2d8a5e]" />,
    error: <AlertCircle size={20} className="text-[#e05555]" />,
    info: <Info size={20} className="text-[#5b8dee]" />,
  }

  const backgrounds = {
    success: theme === 'dark' ? 'bg-[#2d8a5e]/20 border-[#2d8a5e]/30' : 'bg-[#2d8a5e]/10 border-[#2d8a5e]/20',
    error: theme === 'dark' ? 'bg-[#e05555]/20 border-[#e05555]/30' : 'bg-[#e05555]/10 border-[#e05555]/20',
    info: theme === 'dark' ? 'bg-[#5b8dee]/20 border-[#5b8dee]/30' : 'bg-[#5b8dee]/10 border-[#5b8dee]/20',
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-slide-down">
      <div className={`
        flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg
        ${backgrounds[type]}
        ${theme === 'dark' ? 'bg-[#30302e]' : 'bg-white'}
      `}>
        {icons[type]}
        <span className={`font-medium ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
          {message}
        </span>
        <button 
          onClick={onClose}
          className={`ml-2 p-1 rounded-full ${theme === 'dark' ? 'hover:bg-[#4a4a47]' : 'hover:bg-[#f5f4ed]'}`}
        >
          <X size={16} className={theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'} />
        </button>
      </div>
    </div>
  )
}
