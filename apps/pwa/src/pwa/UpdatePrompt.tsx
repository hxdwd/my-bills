import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback } from 'react'

/**
 * PWA 新版本提示。
 * - registerType='prompt'，SW 检测到新版本时置 needRefresh=true
 * - skipWaiting + clientsClaim + cleanupOutdatedCaches 已在 vite.config.ts workbox 中启用
 * - 挂载后 8s 主动 update() 对抗 Android 独立模式后台节流
 * - 点击"更新"后无论 iOS 独立模式是否正常刷新，3s 内强制 reload 兜底，杜绝页面僵死
 */
export function UpdatePrompt() {

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: !import.meta.env.DEV,
    interval: 60 * 60 * 1000,
    // 注册成功后 8s 主动触发一次 update()，对抗 Android 独立模式后台定时器节流
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      const timer = setTimeout(() => {
        registration.update().catch(() => { /* 静默失败 */ })
      }, 8000)
      // 同时保留 interval 轮询
      const interval = setInterval(() => {
        registration.update().catch(() => {})
      }, 60 * 60 * 1000)
      // cleanup 时清除
      return () => {
        clearTimeout(timer)
        clearInterval(interval)
      }
    },
  })

  const handleUpdate = useCallback(() => {
    // 触发 SW skipWaiting，让新版本立即激活
    updateServiceWorker()
    // 无死角兜底：iOS 独立模式下 SW 更新后页面常僵死、不自动刷新，
    // 点击更新后 3 秒内强制 reload，确保新版本必然生效（无需删桌面图标重装）
    setTimeout(() => window.location.reload(), 3000)
  }, [updateServiceWorker])

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
          <p className="text-ink font-medium leading-tight">
            发现新版本
          </p>
          <p className="text-ink-2 text-sm leading-tight mt-0.5 truncate">
            点击立即刷新以获取最新功能
          </p>
        </div>
        <>
          <button
            onClick={handleUpdate}
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
        </>
      </div>
    </div>
  )
}
