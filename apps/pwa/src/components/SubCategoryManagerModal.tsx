import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Modal } from './ui/Modal'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, X, Check } from 'lucide-react'

const PRESET_COLORS = [
  '#ff6b6b', '#4ecdc4', '#a855f7', '#f472b6', '#fb923c',
  '#38bdf8', '#84cc16', '#818cf8', '#ec4899', '#14b8a6',
  '#E5C45E', '#22c55e', '#ef4444', '#6366f1', '#10b981', '#1677ff'
]

interface SubCategoryManagerModalProps {
  visible: boolean
  categoryId: string
  categoryName: string
  onClose: () => void
}

export default function SubCategoryManagerModal({
  visible,
  categoryId,
  categoryName,
  onClose,
}: SubCategoryManagerModalProps) {
  const {
    subCategories,
    addSubCategory,
    updateSubCategory,
    deleteSubCategory,
    reorderSubCategories,
  } = useApp()
  const navigate = useNavigate()

  // 当前分类下的子分类（按 order 排序）
  const list = useMemo(
    () =>
      subCategories
        .filter(s => s.categoryId === categoryId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [subCategories, categoryId]
  )

  // 编辑/新建表单状态
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#818cf8')
  const [error, setError] = useState(false)

  // 每次打开重置表单
  useEffect(() => {
    if (visible) {
      setShowForm(false)
      setEditingId(null)
      setName('')
      setColor('#818cf8')
      setError(false)
    }
  }, [visible])

  const openCreate = () => {
    setEditingId(null)
    setName('')
    setColor('#818cf8')
    setError(false)
    setShowForm(true)
  }

  const openEdit = (id: string, n: string, c: string) => {
    setEditingId(id)
    setName(n)
    setColor(c)
    setError(false)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError(true)
      return
    }
    try {
      if (editingId) {
        await updateSubCategory(editingId, { name: name.trim(), color })
      } else {
        await addSubCategory({
          name: name.trim(),
          color,
          categoryId,
          order: list.length,
        })
      }
      setShowForm(false)
      setEditingId(null)
      setName('')
      setColor('#818cf8')
    } catch {
      // 静默失败，保持弹窗
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteSubCategory(id)
    } catch {
      // 静默失败
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const next = [...list]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    await reorderSubCategories(
      categoryId,
      next.map(s => s.id)
    )
  }

  const openTagManager = () => {
    onClose()
    navigate('/categories')
  }

  if (!visible) return null

  return (
    <Modal isOpen={visible} onClose={onClose} title="管理子分类">
      <div className="flex flex-col max-h-[70vh]">
        {/* 新建按钮 */}
        {!showForm && (
          <button
            onClick={openCreate}
            className="w-full flex items-center justify-center gap-2 py-3 mb-3 rounded-xl bg-brand-tint text-ink hover:bg-brand-soft transition-colors"
          >
            <Plus size={18} />
            <span className="font-medium">新建子分类</span>
          </button>
        )}

        {/* 新建/编辑表单 */}
        {showForm && (
          <div className="mb-3 p-3 rounded-xl bg-[var(--bg-secondary)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">
                {editingId ? '编辑子分类' : `新建到「${categoryName}」`}
              </span>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-full hover:bg-black/5">
                <X size={16} className="text-[var(--text-tertiary)]" />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value)
                if (e.target.value.trim()) setError(false)
              }}
              placeholder="输入子分类名称"
              maxLength={6}
              className={`w-full px-3 py-2.5 rounded-lg text-sm text-[var(--text-primary)] bg-surface outline-none focus:ring-2 focus:ring-brand/40 ${error ? 'ring-2 ring-red-500' : ''}`}
            />
            {error && <p className="text-xs text-red-500 -mt-1">名称不能为空</p>}
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-brand' : ''}`}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check size={14} className="text-white mx-auto" />}
                </button>
              ))}
            </div>
            <button
              onClick={handleSave}
              className="w-full py-2.5 bg-brand text-ink rounded-xl font-medium text-sm hover:bg-brand-strong transition-colors"
            >
              {editingId ? '保存修改' : '保存'}
            </button>
          </div>
        )}

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
          {list.length === 0 ? (
            <p className="text-center text-xs text-[var(--text-tertiary)] py-6">
              该分类暂无子分类，点击上方新建
            </p>
          ) : (
            list.map((sub, i) => (
              <div
                key={sub.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)]"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: sub.color }}
                />
                <span className="flex-1 text-[var(--text-primary)] truncate">{sub.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="p-1 rounded-full text-[var(--text-tertiary)] hover:text-ink hover:bg-black/5 disabled:opacity-30"
                    aria-label="上移"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === list.length - 1}
                    className="p-1 rounded-full text-[var(--text-tertiary)] hover:text-ink hover:bg-black/5 disabled:opacity-30"
                    aria-label="下移"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    onClick={() => openEdit(sub.id, sub.name, sub.color)}
                    className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-ink hover:bg-black/5"
                    aria-label="编辑"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(sub.id)}
                    className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-red-500 hover:bg-black/5"
                    aria-label="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 标签管理入口 */}
        <button
          onClick={openTagManager}
          className="w-full mt-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--surface-warm)] transition-colors"
        >
          管理标签
        </button>
      </div>
    </Modal>
  )
}
