import { useTheme } from '../../context/ThemeContext'
import { X } from 'lucide-react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  height?: string
}

export default function BottomSheet({ isOpen, onClose, title, children, footer, height = 'auto' }: BottomSheetProps) {
  const { theme } = useTheme()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60]">

      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div 
        className={`
          absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden
          animate-slide-up
          ${theme === 'dark' ? 'bg-[#30302e]' : 'bg-white'}
        `}
        style={{ height, maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className={`w-10 h-1 rounded-full ${theme === 'dark' ? 'bg-[#4a4a47]' : 'bg-[#e8e6dc]'}`} />
        </div>
        
        {/* Header */}
        {title && (
          <div className={`flex items-center justify-between px-4 pb-3 border-b ${theme === 'dark' ? 'border-[#3d3d3a]' : 'border-[#f0eee6]'}`}>
            <span className={`font-semibold ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
              {title}
            </span>
            <button 
              onClick={onClose}
              className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-[#4a4a47]' : 'hover:bg-[#f5f4ed]'}`}
            >
              <X size={20} className={theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'} />
            </button>
          </div>
        )}
        
        {/* Content */}
        <div className="overflow-y-auto" style={{ height: footer ? (title ? 'calc(90vh - 120px)' : 'calc(90vh - 90px)') : (title ? 'calc(90vh - 60px)' : 'calc(90vh - 30px)') }}>
          {children}
        </div>
        
        {/* Footer (fixed at bottom) */}
        {footer && (
          <div className={`border-t px-4 py-3 ${theme === 'dark' ? 'border-[#3d3d3a] bg-[#30302e]' : 'border-[#f0eee6] bg-white'}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
