import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { Modal } from './ui/Modal'
import { Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'
import { PRESET_COLORS, pickUnusedColor } from '../utils/colorPalette'

interface TagManagerModalProps {
  visible: boolean
  onClose: () => void
}

/**
 * 标签管理（就地增删改，不跳路由）。
 *
 * 历史问题：原实现点「管理标签」是 `onClose()` + `navigate('/categories')`，
 * 而「记一笔」是 App 级常驻的全屏覆盖层，路由换了它仍在最上层 —— 用户看到的就是
 * "点了没反应"（其实分类页已经在下面打开了）。而且 `/categories` 页面本身
 * **没有任何标签管理功能**，`updateTag` / `deleteTag` 此前全仓库无人调用。
 * 所以这里改成弹窗就地管理：既不会再被遮挡，也不会把用户从「记一笔」的编辑现场带走。
 */
export default function TagManagerModal({ visible, onClose }: TagManagerModalProps) {
  const { tags, transactions, addTag, updateTag, deleteTag } = useApp()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 待确认删除的标签 id（行内二次确认，避免误删）
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // 每个标签被多少笔交易引用：一次遍历建 Map。
  // 不要在列表里对每行各扫一遍 transactions（那是 N×全表）。
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      for (const id of t.tags ?? []) {
        m.set(id, (m.get(id) ?? 0) + 1)
      }
    }
    return m
  }, [transactions])

  // 常用标签排前面（使用次数倒序），次数相同按名称
  const list = useMemo(
    () =>
      [...tags].sort((a, b) => {
        const diff = (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)
        return diff !== 0 ? diff : a.name.localeCompare(b.name, 'zh')
      }),
    [tags, usage]
  )

  // 每次打开重置表单与确认态
  useEffect(() => {
    if (visible) {
      setShowForm(false)
      setEditingId(null)
      setError(null)
      setConfirmId(null)
    }
  }, [visible])

  const openCreate = () => {
    setEditingId(null)
    setName('')
    setColor(pickUnusedColor(tags.map((t) => t.color)))
    setError(null)
    setConfirmId(null)
    setShowForm(true)
  }

  const openEdit = (id: string, n: string, c: string) => {
    setEditingId(id)
    setName(n)
    setColor(c)
    setError(null)
    setConfirmId(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    const value = name.trim()
    if (!value) {
      setError('名称不能为空')
      return
    }
    // 重名校验：忽略大小写与首尾空格（原实现可以建出多个同名标签）
    const dup = tags.find(
      (t) => t.id !== editingId && t.name.trim().toLowerCase() === value.toLowerCase()
    )
    if (dup) {
      setError(`已存在同名标签「${dup.name}」`)
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await updateTag(editingId, { name: value, color })
      } else {
        await addTag({ name: value, color })
      }
      setShowForm(false)
      setEditingId(null)
      setError(null)
    } catch (e: any) {
      // 不要静默失败：保持弹窗并提示，否则用户以为改完了
      setError(e?.message || '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTag(id)
    } catch {
      // 失败则保持列表原样，用户可重试
    } finally {
      setConfirmId(null)
    }
  }

  if (!visible) return null

  return (
    <Modal isOpen={visible} onClose={onClose} title="管理标签">
      <div className="flex flex-col max-h-[70vh]">
        {/* 新建按钮 */}
        {!showForm && (
          <button
            onClick={openCreate}
            className="w-full flex items-center justify-center gap-2 py-3 mb-3 rounded-xl bg-brand-tint text-ink hover:bg-brand-soft transition-colors"
          >
            <Plus size={18} />
            <span className="font-medium">新建标签</span>
          </button>
        )}

        {/* 新建 / 编辑表单 */}
        {showForm && (
          <div className="mb-3 p-3 rounded-xl bg-[var(--bg-secondary)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">
                {editingId ? '编辑标签' : '新建标签'}
              </span>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded-full hover:bg-black/5"
                aria-label="收起"
              >
                <X size={16} className="text-[var(--text-tertiary)]" />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (e.target.value.trim()) setError(null)
              }}
              placeholder="输入标签名称"
              maxLength={10}
              className={`w-full px-3 py-2.5 rounded-lg text-sm text-[var(--text-primary)] bg-surface outline-none focus:ring-2 focus:ring-brand/40 ${error ? 'ring-2 ring-red-500' : ''}`}
            />
            {error && <p className="text-xs text-red-500 -mt-1">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-brand' : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={`选择颜色 ${c}`}
                >
                  {color === c && <Check size={14} className="text-white mx-auto" />}
                </button>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-brand text-ink rounded-xl font-medium text-sm hover:bg-brand-strong transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {editingId ? '保存修改' : '保存'}
            </button>
          </div>
        )}

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
          {list.length === 0 ? (
            <p className="text-center text-xs text-[var(--text-tertiary)] py-6">
              还没有标签，点击上方新建
            </p>
          ) : (
            list.map((t) => {
              const used = usage.get(t.id) ?? 0
              const confirming = confirmId === t.id
              return (
                <div key={t.id} className="p-3 rounded-xl bg-[var(--bg-elevated)]">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="flex-1 text-[var(--text-primary)] truncate">{t.name}</span>
                    <span className="text-xs text-[var(--text-tertiary)] shrink-0">
                      {used > 0 ? `${used} 笔` : '未使用'}
                    </span>
                    {!confirming && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(t.id, t.name, t.color)}
                          className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-ink hover:bg-black/5"
                          aria-label={`编辑 ${t.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmId(t.id)}
                          className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-red-500 hover:bg-black/5"
                          aria-label={`删除 ${t.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 行内二次确认：删除会影响已引用它的交易 */}
                  {confirming && (
                    <div className="mt-2.5 pt-2.5 border-t border-black/5">
                      <p className="text-xs text-[var(--text-secondary)] mb-2">
                        删除「{t.name}」？
                        {used > 0
                          ? `已有 ${used} 笔交易使用它，删除后这些交易上的该标签会消失。`
                          : '该标签尚未被使用。'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                        >
                          确认删除
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="flex-1 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--surface-warm)] transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
