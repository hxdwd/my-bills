import { useState, useMemo, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useAuthStore } from '../stores/useAuthStore'
import { Modal } from './ui/Modal'
import { Search, Plus, Tag as TagIcon } from 'lucide-react'
import { getRecentTagIds } from '../utils/tagUsage'
import { pickUnusedColor } from '../utils/colorPalette'

interface TagSelectModalProps {
  visible: boolean
  onClose: () => void
  /** 选中某个标签（点击即选中并关闭） */
  onSelect: (tagId: string) => void
  /**
   * 打开「管理标签」。
   * 注意：**不要跳路由**——「记一笔」是 App 级常驻的全屏覆盖层，路由切走后它仍在最上层，
   * 目标页面会被挡住，用户看到的就是"点了没反应"。就地弹窗即可。
   */
  onManageTags: () => void
}

const MAX_RECENT = 6

export default function TagSelectModal({ visible, onClose, onSelect, onManageTags }: TagSelectModalProps) {
  const { tags, addTag } = useApp()
  const userId = useAuthStore(state => state.user?.id) || ''

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 防抖 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(rawSearch), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [rawSearch])

  // 每次打开重置搜索
  useEffect(() => {
    if (visible) {
      setRawSearch('')
      setSearch('')
    }
  }, [visible])

  const kw = search.trim().toLowerCase()

  // 搜索结果（模糊包含匹配），从本地 tags 缓存查询，不请求 Supabase
  const filtered = useMemo(() => {
    if (!kw) return []
    return tags.filter((t: any) => t.name.toLowerCase().includes(kw))
  }, [tags, kw])

  // 最近使用（按时间倒序，最多 6 个，且需存在于当前 tags）
  const recent = useMemo(() => {
    if (kw) return []
    const uid = userId
    if (!uid) return []
    const recentIds = getRecentTagIds(uid).slice(0, MAX_RECENT)
    const tagMap = new Map((tags as any[]).map(t => [t.id, t]))
    return recentIds.map(id => tagMap.get(id)).filter(Boolean)
  }, [tags, kw, userId])

  // 全部标签（排除已在「最近使用」里出现过的，避免重复展示）。
  // 原实现非搜索态只展示最近 6 个，没被最近用过的标签只能靠搜索才能选到。
  const restTags = useMemo(() => {
    if (kw) return []
    const recentIds = new Set(recent.map((t: any) => t.id))
    return (tags as any[])
      .filter(t => !recentIds.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [tags, recent, kw])

  const handleCreate = async () => {
    if (!kw) return
    // 已存在同名标签就直接选中它，不要再造一个重名的
    const existing = (tags as any[]).find(t => t.name.trim().toLowerCase() === kw)
    if (existing) {
      onSelect(existing.id)
      return
    }
    try {
      // 颜色按调色板轮换（原实现恒为 #818cf8，新建几个标签颜色全都一样）
      const newTag = await addTag({
        name: kw,
        color: pickUnusedColor((tags as any[]).map(t => t.color)),
      })
      if (newTag) {
        onSelect(newTag.id)
      }
    } catch {
      // 静默失败
    }
  }

  if (!visible) return null

  return (
    <Modal isOpen={visible} onClose={onClose} title="选择标签">
      <div className="flex flex-col max-h-[70vh]">
        {/* 搜索框 */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            autoFocus
            value={rawSearch}
            onChange={e => setRawSearch(e.target.value)}
            placeholder="搜索标签..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-brand/40"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {/* 搜索态：结果列表 */}
          {kw ? (
            filtered.length > 0 ? (
              <div className="space-y-1.5">
                {filtered.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)] transition-colors text-left"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-[var(--text-primary)]">{t.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-2 p-3 rounded-xl bg-brand text-white hover:bg-brand-strong transition-colors"
              >
                <Plus size={16} />
                <span>创建标签「{kw}」</span>
              </button>
            )
          ) : tags.length === 0 ? (
            <p className="text-center text-xs text-[var(--text-tertiary)] py-6">
              还没有标签，搜索名称即可创建，或到下方「管理标签」里新建
            </p>
          ) : (
            /* 非搜索态：最近使用 + 全部标签 */
            <div className="space-y-4">
              {recent.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-2 px-1">最近使用</p>
                  <div className="space-y-1.5">
                    {recent.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)] transition-colors text-left"
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="text-[var(--text-primary)]">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {restTags.length > 0 && (
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-2 px-1">全部标签</p>
                  <div className="space-y-1.5">
                    {restTags.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)] transition-colors text-left"
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="text-[var(--text-primary)]">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 标签管理入口（就地弹窗，不跳路由） */}
        <button
          onClick={onManageTags}
          className="w-full mt-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--surface-warm)] transition-colors flex items-center justify-center gap-2"
        >
          <TagIcon size={15} />
          <span>管理标签</span>
        </button>
      </div>
    </Modal>
  )
}
