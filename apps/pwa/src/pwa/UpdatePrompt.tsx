import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * PWA 新版本提示。
 * 仅做"检测 + 提示 + 点击刷新"一件事，不触碰任何现有业务/UI/交互逻辑。
 * - registerType 已在 vite.config.ts 设为 'prompt'，SW 检测到新版本时置 needRefresh=true
 * - 用户点击「更新」→ updateSW() 内部执行强制刷新并激活新 SW
 * - interval 周期检查，保证桌面冷启动后也能拉取到新 SW
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateSW,
  } = useRegisterSW({
    immediate: true,
    interval: 60 * 60 * 1000,
  })

  if (!needRefresh) return null

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[60] w-[calc(100%-2rem)] max-w-md
                 rounded-2xl bg-surface shadow-soft border border-[#e6e3da] overflow-hidden"
      role="alert"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-ink font-medium leading-tight">发现新版本</p>
          <p className="text-ink-2 text-sm leading-tight mt-0.5 truncate">
            点击立即刷新以获取最新功能
          </p>
        </div>
        <button
          onClick={() => updateSW()}
          className="shrink-0 rounded-xl bg-brand px-4 py-2 text-ink font-medium active:bg-brand-strong"
        >
          更新
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="shrink-0 rounded-xl bg-brand-tint px-3 py-2 text-ink-2 active:bg-[#f0eee6]"
        >
          稍后
        </button>
      </div>
    </div>
  )
}
