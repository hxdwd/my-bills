/** 同步进度指示器 — 细线进度条 + 状态文案 */
import { useTheme } from '../../context/ThemeContext'

export interface SyncIndicatorProps {
  /** 进度 0-100 */
  progress: number
  /** 当前阶段 */
  phase: 'idle' | 'pulling' | 'release' | 'syncing' | 'done' | 'error'
  /** 是否可见 */
  visible: boolean
}

const PHASE_TEXT: Record<SyncIndicatorProps['phase'], string> = {
  idle: '',
  pulling: '下拉以同步',
  release: '释放以同步',
  syncing: '正在同步数据...',
  done: '',
  error: '同步失败',
}

export function SyncIndicator({ progress, phase, visible }: SyncIndicatorProps) {
  const { theme } = useTheme()
  const isError = phase === 'error'
  const barColor = isError ? '#ef4444' : undefined

  return (
    <div className={`transition-all duration-300 ease-out overflow-hidden ${visible ? 'max-h-16 opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0'}`}>
      {/* 进度条 */}
      <div className="h-[2px] rounded-full bg-ink-3/10">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${Math.min(progress, 100)}%`,
            backgroundColor: barColor || undefined,
          }}
        />
      </div>
      {/* 状态文案 */}
      {phase !== 'idle' && phase !== 'done' && (
        <div className={`text-center mt-1.5 text-xs ${isError ? 'text-[#ef4444]' : theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
          {PHASE_TEXT[phase]}
        </div>
      )}
    </div>
  )
}
