import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp, Category } from '../context/AppContext'
import Card from '../components/ui/Card'
import BottomSheet from '../components/ui/BottomSheet'
import { Plus, GripVertical, Trash2, X, Check } from 'lucide-react'

const PRESET_ICONS = ['🍜', '🚗', '🛒', '🎮', '💊', '📚', '🏠', '📱', '👔', '🧴', '☕', '🎬', '✈️', '💰', '🎁', '📈', '💼', '🎊', '🏷️', '🎯', '⭐', '❤️', '🌟', '💫', '✨', '🔥', '💖', '🎪', '🎨', '🎭'];

const PRESET_COLORS = [
  '#ff6b6b', '#4ecdc4', '#a855f7', '#f472b6', '#fb923c',
  '#38bdf8', '#84cc16', '#818cf8', '#ec4899', '#14b8a6',
  '#E5C45E', '#22c55e', '#ef4444', '#6366f1', '#10b981', '#1677ff'
];

export default function CategoriesPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { categories, addCategory, updateCategory, deleteCategory } = useApp()
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 新建分类状态
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('🏷️')
  const [newCatColor, setNewCatColor] = useState('#ff6b6b')
  const [newCatError, setNewCatError] = useState(false)

  // 编辑分类状态
  const [showEditCategory, setShowEditCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatIcon, setEditCatIcon] = useState('🏷️')
  const [editCatColor, setEditCatColor] = useState('#ff6b6b')
  const [editCatError, setEditCatError] = useState(false)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [showToast, setShowToast] = useState(false)
  const displayToast = (msg: string) => {
    setToastMsg(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  // 长按触发编辑模式
  const handleLongPressStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setEditMode(true)
    }, 500)
  }

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  // 添加分类
  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      setNewCatError(true)
      return
    }
    setNewCatError(false)
    try {
      await addCategory({
        name: newCatName.trim(),
        icon: newCatIcon,
        color: newCatColor,
        type: activeTab,
        order: 999,
      })
      setNewCatName('')
      setNewCatIcon('🏷️')
      setNewCatColor('#ff6b6b')
      setNewCatError(false)
      setShowAddCategory(false)
      displayToast('分类创建成功')
    } catch {
      displayToast('分类创建失败')
    }
  }

  // 打开编辑弹窗
  const handleOpenEdit = (cat: Category) => {
    setEditingCategory(cat)
    setEditCatName(cat.name)
    setEditCatIcon(cat.icon)
    setEditCatColor(cat.color)
    setEditCatError(false)
    setShowEditCategory(true)
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingCategory || !editCatName.trim()) {
      setEditCatError(true)
      return
    }
    setEditCatError(false)
    try {
      await updateCategory(editingCategory.id, {
        name: editCatName.trim(),
        icon: editCatIcon,
        color: editCatColor,
      })
      setEditingCategory(null)
      setShowEditCategory(false)
      setEditCatError(false)
      displayToast('分类更新成功')
    } catch {
      displayToast('分类更新失败')
    }
  }

  // 删除分类
  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id)
      displayToast('分类已删除')
    } catch {
      displayToast('删除失败')
    }
  }

  const isDark = theme === 'dark'
  const currentCategories = categories[activeTab]

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#141413]' : 'bg-bg'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 ${isDark ? 'bg-[#141413]' : 'bg-bg'}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/settings')} className="p-1">
            <svg className={`w-6 h-6 ${isDark ? 'text-ink-2' : 'text-ink-2'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className={`text-lg font-semibold flex-1 ${isDark ? 'text-ink' : 'text-ink'}`}>
            分类管理
          </h1>
          {editMode && (
            <button
              onClick={() => setEditMode(false)}
              className="px-3 py-1.5 text-sm bg-brand text-white rounded-lg font-medium"
            >
              完成
            </button>
          )}
        </div>
      </header>

      <main className="px-5 pb-6 animate-page-fade">
        {/* Tabs */}
        <div className={`flex p-1 rounded-xl mb-4 ${isDark ? 'bg-surface' : 'bg-brand-tint'}`}>
          <button
            onClick={() => { setActiveTab('expense'); setEditMode(false); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all
              ${activeTab === 'expense' ? 'bg-danger text-white' : isDark ? 'text-ink-2' : 'text-ink-2'}`}
          >
            支出分类
          </button>
          <button
            onClick={() => { setActiveTab('income'); setEditMode(false); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all
              ${activeTab === 'income' ? 'bg-ok text-white' : isDark ? 'text-ink-2' : 'text-ink-2'}`}
          >
            收入分类
          </button>
        </div>

        {/* Hint */}
        {currentCategories.length > 0 && (
          <p className={`text-xs mb-2 px-1 ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
            {editMode ? '点击分类编辑，点击 ✕ 删除' : '长按分类进入编辑模式'}
          </p>
        )}

        {/* Categories */}
        <div className="space-y-2">
          {currentCategories.map((cat) => {
            const isSystemCategory = !cat.id.startsWith('custom_')
            return (
              <Card key={cat.id} className="!p-0">
                <div
                  onClick={() => {
                    if (editMode) {
                      handleOpenEdit(cat)
                    }
                  }}
                  onTouchStart={handleLongPressStart}
                  onTouchEnd={handleLongPressEnd}
                  onTouchMove={handleLongPressEnd}
                  onMouseDown={handleLongPressStart}
                  onMouseUp={handleLongPressEnd}
                  onMouseLeave={handleLongPressEnd}
                  className={`flex items-center gap-3 p-4 select-none transition-colors
                    ${editMode ? 'animate-shake cursor-pointer' : ''}
                    ${!editMode && (isDark ? 'hover:bg-surface' : 'hover:bg-[#faf9f5]')}
                  `}
                >
                  <div className="cursor-grab">
                    <GripVertical size={18} className={isDark ? 'text-ink-2' : 'text-ink-2'} />
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${cat.color}15` }}
                  >
                    {cat.icon}
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${isDark ? 'text-ink' : 'text-ink'}`}>
                      {cat.name}
                    </div>
                  </div>
                  {editMode && !isSystemCategory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(cat.id)
                      }}
                      className={`p-2 rounded-lg ${isDark ? 'hover:bg-brand-tint' : 'hover:bg-bg'}`}
                    >
                      <Trash2 size={18} className="text-danger" />
                    </button>
                  )}
                  {editMode && isSystemCategory && (
                    <span className={`text-xs ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
                      系统分类
                    </span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>

        {/* Add Button */}
        <button
          onClick={() => setShowAddCategory(true)}
          className={`w-full flex items-center justify-center gap-2 py-4 mt-4 rounded-xl border border-dashed transition-colors
            ${isDark ? 'border-brand-tint text-ink-2 hover:bg-surface' : 'border-brand-tint text-ink-2 hover:bg-[#faf9f5]'}`}
        >
          <Plus size={20} />
          <span className="font-medium">添加分类</span>
        </button>
      </main>

      {/* Add Category Sheet */}
      <BottomSheet
        isOpen={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        title="添加分类"
      >
        <div className="p-4 space-y-4">
          {/* Icon Selection */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
              选择图标
            </label>
            <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewCatIcon(icon)}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all
                    ${newCatIcon === icon
                      ? 'bg-brand/20 ring-2 ring-brand-primary'
                      : isDark ? 'bg-surface hover:bg-brand-tint' : 'bg-bg hover:bg-brand-tint'
                    }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
              选择颜色
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewCatColor(color)}
                  className={`w-10 h-10 rounded-xl transition-transform hover:scale-110 ${
                    newCatColor === color ? 'ring-2 ring-offset-2 ring-brand-primary' : ''
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {newCatColor === color && <Check size={16} className="text-white mx-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className={`flex items-center justify-center gap-3 py-4 rounded-xl ${isDark ? 'bg-surface' : 'bg-bg'}`}>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${newCatColor}15` }}
            >
              {newCatIcon}
            </div>
            <div>
              <div className={`font-medium ${isDark ? 'text-ink' : 'text-ink'}`}>
                {newCatName || '分类名称'}
              </div>
              <div className={`text-xs ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
                预览
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div>
            <label className={`block text-sm mb-2 ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
              分类名称
            </label>
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="输入分类名称"
              maxLength={6}
              className={`w-full px-4 py-3 rounded-xl
                ${isDark
                  ? 'bg-surface text-ink placeholder-[#87867f]'
                  : 'bg-bg text-ink placeholder-[#b0aea5]'
                } outline-none focus:ring-2 focus:ring-brand/40`}
            />
          </div>

          <button
            onClick={handleAddCategory}
            className="w-full py-3 bg-brand text-white rounded-xl font-medium"
          >
            保存
          </button>
        </div>
      </BottomSheet>

      {/* Edit Category Sheet */}
      <BottomSheet
        isOpen={showEditCategory}
        onClose={() => { setShowEditCategory(false); setEditingCategory(null); setEditCatError(false); }}
        title="编辑分类"
      >
        <div className="p-4 flex flex-col" style={{ minHeight: 'calc(90vh - 60px)' }}>
          {/* 可滚动区域 */}
          <div className="flex-1 space-y-4 overflow-y-auto">
            {/* Name Input — 放在最上面 */}
            <div>
              <label className={`block text-sm mb-2 ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
                分类名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editCatName}
                onChange={(e) => {
                  setEditCatName(e.target.value)
                  if (e.target.value.trim()) setEditCatError(false)
                }}
                placeholder="请输入分类名称（必填）"
                maxLength={6}
                className={`w-full px-4 py-3 rounded-xl outline-none transition-all ${
                  editCatError
                    ? 'bg-red-500/10 ring-2 ring-red-500'
                    : isDark
                    ? 'bg-surface text-ink placeholder-[#87867f] focus:ring-2 focus:ring-brand/40'
                    : 'bg-bg text-ink placeholder-[#b0aea5] focus:ring-2 focus:ring-brand/40'
                }`}
              />
              {editCatError && (
                <p className="text-xs text-red-500 mt-1.5 ml-1">分类名称不能为空</p>
              )}
            </div>

            {/* Icon Selection */}
            <div>
              <label className={`block text-sm mb-2 ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
                选择图标
              </label>
              <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto">
                {PRESET_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setEditCatIcon(icon)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all flex-shrink-0
                      ${editCatIcon === icon
                        ? 'bg-brand/20 ring-2 ring-brand-primary'
                        : isDark ? 'bg-surface hover:bg-brand-tint' : 'bg-bg hover:bg-brand-tint'
                      }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Selection */}
            <div>
              <label className={`block text-sm mb-2 ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
                选择颜色
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditCatColor(color)}
                    className={`w-10 h-10 rounded-xl transition-transform hover:scale-110 ${
                      editCatColor === color ? 'ring-2 ring-offset-2 ring-brand-primary' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {editCatColor === color && <Check size={16} className="text-white mx-auto" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className={`flex items-center justify-center gap-3 py-4 rounded-xl ${isDark ? 'bg-surface' : 'bg-bg'}`}>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${editCatColor}15` }}
              >
                {editCatIcon}
              </div>
              <div>
                <div className={`font-medium ${isDark ? 'text-ink' : 'text-ink'}`}>
                  {editCatName || '分类名称'}
                </div>
                <div className={`text-xs ${isDark ? 'text-ink-2' : 'text-ink-2'}`}>
                  预览
                </div>
              </div>
            </div>
          </div>

          {/* 底部固定按钮 */}
          <div className={`pt-3 border-t ${isDark ? 'border-brand-tint' : 'border-brand-tint'}`}>
            <button
              onClick={handleSaveEdit}
              className="w-full py-3 bg-brand text-white rounded-xl font-medium"
            >
              保存修改
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Toast */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink text-surface px-4 py-2 rounded-full text-sm font-medium animate-bounce-once">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
