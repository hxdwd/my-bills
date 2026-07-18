import { useTheme } from '../../context/ThemeContext'

export type SyncToastType = 'success' | 'error' | 'info'

export interface SyncToastData {
  message: string
  type: SyncToastType
}

interface SyncToastProps {
  toast: SyncToastData | null
  onClose: () => void
  onRetry?: () => void
}

const CONFIG: Record<SyncToastType, { bg: string; text: string; border: string }> = {
  success: { bg: 'bg-[#16a34a]/10', text: 'text-[#16a34a]', border: 'border-l-[3px] border-l-[#16a34a]' },
  error: { bg: 'bg-[#ef4444]/10', text: 'text-[#ef4444]', border: 'border-l-[3px] border-l-[#ef4444]' },
  info: { bg: 'bg-brand-tint', text: 'text-ink', border: 'border-l-[3px] border-l-brand' },
}

export function SyncToast({ toast, onClose, onRetry }: SyncToastProps) {
  const { theme } = useTheme()

  if (!toast) return null

  const cfg = CONFIG[toast.type]

  return (
    <div className="fixed top-[56px] left-0 right-0 z-50 px-3 pointer-events-none">
      <div
        className={"max-w-md mx-auto px-4 py-3 rounded-xl shadow-soft pointer-events-auto " + cfg.bg + " " + cfg.border}
        style={{ animation: 'slideDown 300ms ease-out' }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className={"text-sm font-medium flex-1 " + cfg.text}>{toast.message}</p>
          <div className="flex items-center gap-2 shrink-0">
            {toast.type === 'error' && onRetry && (
              <button
                onClick={onRetry}
                className={'text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ' + (theme === 'dark'
                    ? 'bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/30'
                    : 'bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20')}
              >
                重试
              </button>
            )}
            {toast.type !== 'error' && (
              <button
                onClick={onClose}
                className={'text-xs px-1.5 py-0.5 rounded transition-colors ' + (theme === 'dark' ? 'text-ink-2 hover:bg-surface' : 'text-ink-2 hover:bg-bg')}
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
