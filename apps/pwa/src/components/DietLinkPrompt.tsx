import { useEffect, useState } from 'react'

// 记账流程中「餐饮分类 + 备注命中饮食控制项」时，弹出的轻量级联动提示。
export default function DietLinkPrompt({
  itemName,
  itemIcon,
  onConfirm,
  onIgnore,
}: {
  itemName: string
  itemIcon: string
  onConfirm: () => void
  onIgnore: () => void
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 60)
    return () => clearTimeout(t)
  }, [])

  const confirm = () => {
    setShow(false)
    setTimeout(onConfirm, 200)
  }
  const ignore = () => {
    setShow(false)
    setTimeout(onIgnore, 200)
  }

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-[70] w-[92%] max-w-md transition-all duration-300 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-[#1A1A1A] px-4 py-3 shadow-2xl ring-1 ring-white/10">
        <span className="text-2xl">{itemIcon}</span>
        <span className="flex-1 text-sm text-white/90">
          这杯{itemName}要计入饮食控制吗？
        </span>
        <button
          onClick={confirm}
          className="rounded-full bg-[#F4D77C] px-3 py-1.5 text-xs font-semibold text-black active:scale-95"
        >
          是
        </button>
        <button
          onClick={ignore}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 active:scale-95"
        >
          忽略
        </button>
      </div>
    </div>
  )
}
