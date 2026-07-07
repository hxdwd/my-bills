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
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden bg-surface shadow-soft-lg animate-slide-up"
        style={{ height, maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-brand-soft" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 pb-3 border-b border-brand-tint">
            <span className="font-semibold text-ink">
              {title}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-brand-tint transition-colors"
            >
              <X size={20} className="text-ink-2" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto" style={{ height: footer ? (title ? 'calc(90vh - 120px)' : 'calc(90vh - 90px)') : (title ? 'calc(90vh - 60px)' : 'calc(90vh - 30px)') }}>
          {children}
        </div>

        {/* Footer (fixed at bottom) */}
        {footer && (
          <div className="border-t border-brand-tint px-5 py-3 bg-surface">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
