import { useRegisterSW } from 'virtual:pwa-register/react'
import { useState, useRef, useCallback } from 'react'

/**
 * PWA 新版本提示。
 * - registerType='prompt'，SW 检测到新版本时置 needRefresh=true
 * - skipWaiting + clientsClaim 已在 vite.config.ts workbox 中启用
 * - 挂载后 8s 主动 update() 对抗 Android 独立模式后台节流
 * - iOS 独立模式更新后 4s 未刷新给出降级引导
 */
export function UpdatePrompt() {
  const [iosFallback, setIosFallback] = useState(false)
  const iosTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleUpdate = useCallback(async () => {
    await updateServiceWorker()
    // iOS standalone 模式下 SW 更新后页面可能不自动刷新，4s 兜底引导
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIOS && window.matchMedia('(display-mode: standalone)').matches) {
      iosTimer.current = setTimeout(() => setIosFallback(true), 4000)
    }
    window.location.reload()
  }, [updateServiceWorker])

  if (import.meta.env.DEV) return null

  if (!needRefresh && !iosFallback) return null

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[60] w-[calc(100%-2rem)] max-w-md
                 rounded-2xl bg-surface shadow-soft border border-[#e6e3da] overflow-hidden"
      role="alert"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-ink font-medium leading-tight">
            {iosFallback ? '更新可能未生效' : '发现新版本'}
          </p>
          <p className="text-ink-2 text-sm leading-tight mt-0.5 truncate">
            {iosFallback
              ? '请先在 Safari 中打开该网站，再切换回桌面 App'
              : '点击立即刷新以获取最新功能'}
          </p>
        </div>
        {iosFallback ? (
          <button
            onClick={() => setIosFallback(false)}
            className="shrink-0 rounded-xl bg-brand-tint px-3 py-2 text-ink-2 active:bg-[#f0eee6]"
          >
            知道了
          </button>
        ) : (
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
        )}
      </div>
    </div>
  )
}
