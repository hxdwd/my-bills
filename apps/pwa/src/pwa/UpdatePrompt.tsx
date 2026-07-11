import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * PWA 新版本提示。
 * 仅做"检测 + 提示 + 点击刷新"一件事，不触碰任何现有业务/UI/交互逻辑。
 * - registerType 已在 vite.config.ts 设为 'prompt'，SW 检测到新版本时置 needRefresh=true
 * - 用户点击「更新」→ updateSW() 发 skipWaiting 消息让新 SW 激活（prompt 模式下它不会自动刷新页面，
 *   源码中 reload 参数被忽略），故需在其后主动 window.location.reload() 才能立刻生效。
 * - interval 周期检查，保证桌面冷启动后也能拉取到新 SW
 */
export function UpdatePrompt() {
  // 开发环境下 SW 未注册（见 vite.config devOptions.enabled=false），
  // 这里再兜底一层，避免 dev 模式下 useRegisterSW 反复轮询导致页面卡死/重复弹窗。
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: !import.meta.env.DEV,
    interval: 60 * 60 * 1000,
  })

  if (import.meta.env.DEV) return null

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
          onClick={async () => {
            // prompt 模式下 updateServiceWorker 只发 skipWaiting 消息让新 SW 激活，
            // 但不会刷新当前页面（源码里 reload 参数被忽略）。
            // 必须等消息发出后再主动 reload，否则要重新打开 APP 才生效。
            await updateServiceWorker()
            window.location.reload()
          }}
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
