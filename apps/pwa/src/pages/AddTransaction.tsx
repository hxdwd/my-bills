import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Check,
  ChevronDown,
  Calendar,
  Clock,
  Wallet,
  FileText,
  Plus,
  Trash2,
  Tag,
  Search,
} from 'lucide-react';
import BottomSheet from '../components/ui/BottomSheet';
import { NumberKeyboard } from '../components/ui/NumberKeyboard';
import { TransactionFormData, Category } from '../types';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../stores/useAuthStore';
import SubCategoryManagerModal from '../components/SubCategoryManagerModal';
import TagSelectModal from '../components/TagSelectModal';
import { recordTagUsage } from '../utils/tagUsage';
import { currencySymbol } from '../utils/format';

// 预设图标
const PRESET_ICONS = ['🏷️', '🎯', '⭐', '❤️', '🌟', '💫', '✨', '🔥', '💖', '🎪', '🎨', '🎭', '🎪', '🎯', '🎲', '🎱', '🛍️', '📦', '🎁', '🎀', '🌈', '⚡', '🌸', '🍀'];

// 预设颜色
const PRESET_COLORS = ['#ff6b6b', '#4ecdc4', '#a855f7', '#f472b6', '#fb923c', '#38bdf8', '#84cc16', '#818cf8', '#ec4899', '#14b8a6', '#22c55e', '#E5C45E', '#6366f1', '#ef4444', '#10b981', '#1677ff'];

interface AddTransactionProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: TransactionFormData) => void;
}

type TransactionType = 'expense' | 'income' | 'transfer';

// Toast 组件
const Toast: React.FC<{ message: string; visible: boolean }> = ({ message, visible }) => {
  if (!visible) return null;
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink text-surface px-4 py-2 rounded-full text-sm font-medium animate-bounce-once">
      {message}
    </div>
  );
};

const AddTransaction: React.FC<AddTransactionProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const { accounts, categories: appCategories, addCategory, updateCategory, deleteCategory, addTransaction, subCategories, addSubCategory, updateSubCategory, deleteSubCategory, tags } = useApp();

  // 状态管理
  const [transactionType, setTransactionType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('0');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  // 转账多币种：手续费（转出币种）与到账金额（转入币种，跨币种时录入）
  const [fee, setFee] = useState<string>('');
  const [toAmountInput, setToAmountInput] = useState<string>('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showToAccountSheet, setShowToAccountSheet] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);

  // 自定义分类状态
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('🏷️');
  const [newCategoryColor, setNewCategoryColor] = useState('#ff6b6b');
  const [newCategoryError, setNewCategoryError] = useState(false);

  // 备注
  const [note, setNote] = useState('');
  // 子分类（绑一级分类，单选）
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('');
  // 标签（全局自由标签，多选）
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  // 子分类管理弹窗
  const [showSubManager, setShowSubManager] = useState(false);
  // 标签选择弹窗
  const [showTagSelect, setShowTagSelect] = useState(false);

  // 日期时间
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());

  // 获取当前类型的分类（从 AppContext + 自定义分类）
  const baseCategories = appCategories[transactionType === 'income' ? 'income' : 'expense'] || [];
  const filteredCustomCategories = customCategories.filter(c => c.type === transactionType);
  const allCategories = [...baseCategories, ...filteredCustomCategories];

  // 获取选中的分类
  const selectedCategory = allCategories.find((c) => c.id === selectedCategoryId);

  // 当前分类下的子分类（绑一级分类，最末级，按 order 排序）
  const categorySubCategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    return subCategories
      .filter(s => s.categoryId === selectedCategoryId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [subCategories, selectedCategoryId]);

  // 获取选中的账户
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const fromCurrency = selectedAccount?.currency || 'CNY';
  const toCurrency = toAccount?.currency || 'CNY';
  const isCrossCurrency = transactionType === 'transfer' && fromCurrency !== toCurrency;

  // 格式化金额
  const formatAmount = (value: string): string => {
    if (value === '0' || value === '') return '0';
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    return num.toFixed(2);
  };

  // 处理金额输入
  const handleAmountKey = (key: string) => {
    if (key === '.' && amount.includes('.')) return;
    if (amount.includes('.') && amount.split('.')[1]?.length >= 2) return;

    if (amount === '0' && key !== '.') {
      setAmount(key);
    } else {
      setAmount(amount + key);
    }
  };

  // 处理删除
  const handleDelete = () => {
    if (amount.length > 1) {
      setAmount(amount.slice(0, -1));
    } else {
      setAmount('0');
    }
  };

  // 安全获取本地日期字符串 (YYYY-MM-DD)，避免 toISOString 的 UTC 时区偏移问题
  const toLocalDateString = (d: Date): string => {
    if (isNaN(d.getTime())) {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // 格式化日期显示
  const formatDate = (d: Date): string => {
    if (isNaN(d.getTime())) return '今天'
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return '今天';
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  };

  // 格式化时间显示
  const formatTime = (t: Date): string => {
    if (isNaN(t.getTime())) return '00:00'
    return `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
  };

  // 显示 Toast
  const displayToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // 长按触发编辑模式
  const handleCategoryLongPressStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setCategoryEditMode(true);
    }, 500);
  };

  const handleCategoryLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // 删除自定义分类
  const handleDeleteCustomCategory = async (id: string) => {
    await deleteCategory(id);
    if (selectedCategoryId === id) {
      setSelectedCategoryId('');
    }
  };

  // 打开编辑分类弹窗
  const handleOpenEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setEditCatName(cat.name);
    setEditCatIcon(cat.icon);
    setEditCatColor(cat.color);
    setShowEditCategory(true);
  };

  // 保存编辑分类
  const handleSaveEditCategory = async () => {
    if (!editingCategory || !editCatName.trim()) {
      setEditCatNameError(true);
      return;
    }
    setEditCatNameError(false);
    try {
      await updateCategory(editingCategory.id, {
        name: editCatName.trim(),
        icon: editCatIcon,
        color: editCatColor,
      });
      setEditingCategory(null);
      setShowEditCategory(false);
      setEditCatNameError(false);
      // 回到分类弹窗
      setShowCategoryPicker(true);
      displayToast('分类更新成功');
    } catch (err) {
      displayToast('分类更新失败');
    }
  };

  // 创建自定义分类
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setNewCategoryError(true);
      return;
    }
    setNewCategoryError(false);

    try {
      const newCat = await addCategory({
        name: newCategoryName.trim(),
        icon: newCategoryIcon,
        color: newCategoryColor,
        type: transactionType,
        order: 999,
      });
      setNewCategoryName('');
      setNewCategoryIcon('🏷️');
      setNewCategoryColor('#ff6b6b');
      setNewCategoryError(false);
      setShowAddCategory(false);
      // 自动选中新创建的分类
      if (newCat) {
        setSelectedCategoryId(newCat.id);
      }
      displayToast('分类创建成功');
    } catch (err) {
      displayToast('分类创建失败');
    }
  };

  // 分类管理相关状态
  const [categoryEditMode, setCategoryEditMode] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('🏷️');
  const [editCatColor, setEditCatColor] = useState('#ff6b6b');
  const [editCatNameError, setEditCatNameError] = useState(false);
  const [showEditCategory, setShowEditCategory] = useState(false);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保存交易
  const handleSave = async () => {
    const numAmount = parseFloat(amount);

    // 验证
    if (numAmount <= 0) {
      displayToast('请输入金额');
      return;
    }
    if (transactionType !== 'transfer' && !selectedCategoryId) {
      displayToast('请选择分类');
      return;
    }
    if (!selectedAccountId) {
      displayToast('请选择账户');
      return;
    }
    if (transactionType === 'transfer' && !toAccountId) {
      displayToast('请选择转入账户');
      return;
    }
    if (isCrossCurrency && !(parseFloat(toAmountInput) > 0)) {
      displayToast('请输入到账金额');
      return;
    }

    try {
      // 使用本地日期字符串避免 UTC 时区偏移问题
      const localDateStr = toLocalDateString(date)
      const localTimeStr = formatTime(time)
      await addTransaction({
        type: transactionType,
        amount: numAmount,
        fromAmount: transactionType === 'transfer' ? numAmount : undefined,
        toAmount: transactionType === 'transfer'
          ? (isCrossCurrency ? (parseFloat(toAmountInput) || 0) : Math.max(numAmount - (parseFloat(fee) || 0), 0))
          : undefined,
        fee: transactionType === 'transfer' ? (parseFloat(fee) || 0) : undefined,
        categoryId: transactionType === 'transfer' ? 't1' : selectedCategoryId,
        categoryName: transactionType === 'transfer' ? '转账' : (selectedCategory?.name || '未分类'),
        categoryIcon: transactionType === 'transfer' ? '↔️' : (selectedCategory?.icon || '📌'),
        accountId: selectedAccountId,
        accountName: selectedAccount?.name || '未知账户',
        toAccountId: transactionType === 'transfer' ? toAccountId : undefined,
        toAccountName: transactionType === 'transfer' ? (toAccount?.name || '未知账户') : undefined,
        transactionDate: localDateStr,
        date: `${date.getMonth() + 1}月${date.getDate()}日`,
        time: localTimeStr,
        note: note || undefined,
        subcategoryId: selectedSubCategoryId || undefined,
        tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      });

      displayToast('保存成功');

      // 调用回调
      if (onSave) {
        onSave({
          type: transactionType,
          amount: amount,
          categoryId: transactionType === 'transfer' ? 't1' : selectedCategoryId,
          subcategoryId: selectedSubCategoryId || undefined,
          accountId: selectedAccountId,
          toAccountId: transactionType === 'transfer' ? toAccountId : undefined,
          date,
          time,
          note,
          tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        });
      }

      // 关闭页面
      setTimeout(() => {
        resetForm();
        onClose();
      }, 500);
    } catch (err) {
      displayToast('保存失败');
    }
  };

  // 重置表单
  const resetForm = () => {
    setAmount('0');
    setSelectedCategoryId('');
    setToAccountId('');
    setFee('');
    setToAmountInput('');
    setNote('');
    setSelectedSubCategoryId('');
    setSelectedTagIds([]);
    setDate(new Date());
    setTime(new Date());
    // 自动选择默认账户
    if (accounts.length > 0) {
      const defaultAcc = accounts.find(a => a.isDefault)
      setSelectedAccountId(defaultAcc?.id || accounts[0].id);
    }
  };

  // 每次打开页面或账户列表变化时，自动选择默认账户
  useEffect(() => {
    if (isOpen && accounts.length > 0) {
      // 优先选默认账户，没有默认则选第一个
      const defaultAcc = accounts.find(a => a.isDefault)
      const targetId = defaultAcc?.id || accounts[0].id
      // 如果当前选中的账户已不存在（被删除），或还未选择账户，则默认选
      const stillExists = accounts.some(a => a.id === selectedAccountId);
      if (!stillExists) {
        setSelectedAccountId(targetId);
      }
    }
  }, [isOpen, accounts]);

  // 选择/取消标签（多选）
  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  // 选择/取消子分类（单选）
  const selectSubCategory = (subId: string) => {
    setSelectedSubCategoryId(prev => (prev === subId ? '' : subId));
  };

  // 从标签选择弹窗选中标签（点击即选中、记录最近使用、关闭弹窗）
  const handleSelectTagFromModal = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev : [...prev, tagId]
    );
    const uid = useAuthStore.getState().user?.id
    if (uid) recordTagUsage(uid, tagId)
    setShowTagSelect(false);
  };

  // 切换交易类型
  const handleTypeChange = (type: TransactionType) => {
    setTransactionType(type);
    setSelectedCategoryId('');
    setSelectedSubCategoryId('');
    setSelectedTagIds([]);
    if (type === 'transfer') {
      setSelectedCategoryId('t1');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-bg animate-slide-up overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 pt-safe border-b border-brand-tint bg-surface">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={24} />
        </button>
        <h1 className="text-lg font-medium text-[var(--text-primary)]">记一笔</h1>
        <button
          onClick={handleSave}
          className="p-2 -mr-2 text-ink hover:text-brand-secondary transition-colors"
        >
          <Check size={24} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Tab 切换 */}
        <div className="flex justify-center gap-8 py-4">
          {[
            { type: 'expense' as const, label: '支出', color: 'text-expense' },
            { type: 'income' as const, label: '收入', color: 'text-income' },
            { type: 'transfer' as const, label: '转账', color: 'text-transfer' },
          ].map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition-all
                ${transactionType === type
                  ? `${color} bg-current/10`
                  : 'text-[var(--text-tertiary)]'
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 金额显示 */}
        <div
          onClick={() => setShowKeyboard(true)}
          className="flex items-center justify-center py-8 cursor-pointer"
        >
          <span
            className={`text-5xl font-bold font-mono ${
              transactionType === 'expense'
                ? 'text-expense'
                : transactionType === 'income'
                ? 'text-income'
                : 'text-transfer'
            }`}
          >
            {transactionType === 'transfer' ? currencySymbol(fromCurrency) : '¥'} {formatAmount(amount)}
          </span>
        </div>

        {/* 分类选择（转账时隐藏） */}
        {transactionType !== 'transfer' && (
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--text-secondary)]">选择分类</span>
            <button
              onClick={() => setShowCategoryPicker(true)}
              className="text-sm text-ink hover:text-brand-secondary transition-colors"
            >
              展开更多
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto hide-scrollbar py-1">
            {allCategories.slice(0, 8).map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`
                  flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl transition-all
                  ${selectedCategoryId === category.id
                    ? 'bg-brand/10 ring-2 ring-brand'
                    : 'bg-[var(--bg-secondary)] hover:bg-[var(--surface-warm)]'
                  }
                `}
              >
                <span className="text-2xl">{category.icon}</span>
                <span className="text-xs text-[var(--text-secondary)]">{category.name}</span>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* 快捷选择行 */}
        <div className="px-4 space-y-3">
          {/* 账户选择 */}
          <button
            onClick={() => setShowAccountSheet(true)}
            className="w-full flex items-center justify-between py-3 px-4 bg-[var(--bg-secondary)] rounded-xl"
          >
            <div className="flex items-center gap-3">
              <Wallet size={20} className="text-[var(--text-tertiary)]" />
              <span className="text-[var(--text-secondary)]">
                {transactionType === 'transfer' ? '转出账户' : '账户'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedAccount && (
                <>
                  <span className="text-lg">{selectedAccount.icon}</span>
                  <span className="text-[var(--text-primary)]">{selectedAccount.name}</span>
                </>
              )}
              <ChevronDown size={16} className="text-[var(--text-tertiary)]" />
            </div>
          </button>

          {/* 转账目标账户选择 */}
          {transactionType === 'transfer' && (
            <button
              onClick={() => setShowToAccountSheet(true)}
              className="w-full flex items-center justify-between py-3 px-4 bg-[var(--bg-secondary)] rounded-xl"
            >
              <div className="flex items-center gap-3">
                <Wallet size={20} className="text-[var(--text-tertiary)]" />
                <span className="text-[var(--text-secondary)]">转入账户</span>
              </div>
              <div className="flex items-center gap-2">
                {toAccount && (
                  <>
                    <span className="text-lg">{toAccount.icon}</span>
                    <span className="text-[var(--text-primary)]">{toAccount.name}</span>
                  </>
                )}
                <ChevronDown size={16} className="text-[var(--text-tertiary)]" />
              </div>
            </button>
          )}

          {/* 转账：手续费 / 到账金额（多币种） */}
          {transactionType === 'transfer' && (
            <>
              <div className="flex items-center justify-between py-3 px-4 bg-[var(--bg-secondary)] rounded-xl">
                <span className="text-[var(--text-secondary)]">手续费（{currencySymbol(fromCurrency)}）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="0.00"
                  className="w-32 text-right bg-transparent outline-none text-[var(--text-primary)] font-mono"
                />
              </div>
              {isCrossCurrency ? (
                <div className="flex items-center justify-between py-3 px-4 bg-[var(--bg-secondary)] rounded-xl">
                  <span className="text-[var(--text-secondary)]">到账金额（{currencySymbol(toCurrency)}）</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={toAmountInput}
                    onChange={(e) => setToAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-32 text-right bg-transparent outline-none text-[var(--text-primary)] font-mono"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between py-3 px-4 bg-[var(--bg-secondary)] rounded-xl">
                  <span className="text-[var(--text-secondary)]">到账金额（{currencySymbol(toCurrency)}）</span>
                  <span className="text-[var(--text-primary)] font-mono">
                    {currencySymbol(toCurrency)}
                    {(() => {
                      const f = parseFloat(fee) || 0
                      const a = parseFloat(amount) || 0
                      return Math.max(a - f, 0).toFixed(2)
                    })()}
                  </span>
                </div>
              )}
            </>
          )}

          {/* 日期时间选择 */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowDatePicker(true)}
              className="flex-1 flex items-center justify-between py-3 px-3 bg-[var(--bg-secondary)] rounded-xl min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Calendar size={18} className="text-[var(--text-tertiary)] shrink-0" />
                <span className="text-[var(--text-secondary)] shrink-0">日期</span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[var(--text-primary)] truncate">{formatDate(date)}</span>
                <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0" />
              </div>
            </button>
            <button
              onClick={() => setShowDatePicker(true)}
              className="flex-1 flex items-center justify-between py-3 px-3 bg-[var(--bg-secondary)] rounded-xl min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Clock size={18} className="text-[var(--text-tertiary)] shrink-0" />
                <span className="text-[var(--text-secondary)] shrink-0">时间</span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[var(--text-primary)] truncate">{formatTime(time)}</span>
                <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0" />
              </div>
            </button>
          </div>
        </div>

        {/* 子分类（绑一级分类，最末级；转账时隐藏） */}
        {transactionType !== 'transfer' && (
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Tag size={16} />
              子分类
            </label>
            <button
              onClick={() => setShowSubManager(true)}
              disabled={!selectedCategoryId || selectedCategoryId === 't1'}
              className="text-sm text-ink hover:text-brand-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              管理
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCategoryId && selectedCategoryId !== 't1' && categorySubCategories.length > 0 ? (
              categorySubCategories.map((sub: any) => {
                const isSelected = selectedSubCategoryId === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => selectSubCategory(sub.id)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all ${
                      isSelected
                        ? 'text-white ring-2 ring-offset-1 ring-current'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-warm)]'
                    }`}
                    style={isSelected ? { backgroundColor: sub.color || '#818cf8' } : undefined}
                  >
                    {isSelected && (
                      <X size={12} className="hover:bg-white/20 rounded-full" />
                    )}
                    {sub.name}
                  </button>
                );
              })
            ) : selectedCategoryId && selectedCategoryId !== 't1' ? (
              <span className="text-xs text-[var(--text-tertiary)] py-1.5">该分类暂无子分类</span>
            ) : (
              <span className="text-xs text-[var(--text-tertiary)] py-1.5">请先选择分类</span>
            )}
          </div>
        </div>
        )}

        {/* 标签（全局自由标签，多选；仅展示已选，转账时隐藏） */}
        {transactionType !== 'transfer' && (
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Tag size={16} />
              标签
            </label>
            <button
              onClick={() => setShowTagSelect(true)}
              className="text-sm text-ink hover:text-brand-secondary transition-colors"
            >
              + 添加标签
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTagIds.length > 0 ? (
              selectedTagIds.map((tagId) => {
                const tag = tags.find((t: any) => t.id === tagId)
                if (!tag) return null
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-white"
                    style={{ backgroundColor: tag.color || '#818cf8' }}
                  >
                    <Tag size={12} />
                    {tag.name}
                    <button
                      onClick={() => toggleTag(tagId)}
                      className="ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-white/20 transition-colors"
                      aria-label="删除标签"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )
              })
            ) : (
              <span className="text-xs text-[var(--text-tertiary)] py-1.5">点击"添加标签"选择或新建</span>
            )}
          </div>
        </div>
        )}

        {/* 备注 */}
        <div className="px-4 mt-4">
          <div>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-2">
              <FileText size={16} />
              备注
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="添加备注..."
              rows={3}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
            />
          </div>
        </div>

        {/* 底部留白 */}
        <div className="h-24" />
      </div>

      {/* 键盘遮罩：点击键盘上方任意位置即可收起键盘（确认数字） */}
      {showKeyboard && (
        <div
          className="fixed left-0 right-0 top-0 bottom-0 z-30"
          onClick={() => setShowKeyboard(false)}
          aria-hidden="true"
        />
      )}

      {/* 数字键盘 */}
      {showKeyboard && (
        <NumberKeyboard
          onKeyPress={handleAmountKey}
          onDelete={handleDelete}
          onConfirm={() => setShowKeyboard(false)}
          onAmountSet={(val) => setAmount(val)}
          showConfirm={true}
          confirmText="完成"
        />
      )}

      {/* 账户选择弹窗 */}
      <BottomSheet
        isOpen={showAccountSheet}
        onClose={() => setShowAccountSheet(false)}
        title="选择账户"
      >
        <div className="p-4 space-y-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => {
                setSelectedAccountId(account.id);
                setShowAccountSheet(false);
              }}
              className={`
                w-full flex items-center gap-3 p-4 rounded-xl transition-all
                ${selectedAccountId === account.id
                  ? 'bg-brand-tint ring-2 ring-brand'
                  : 'bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)]'
                }
              `}
            >
              <span className="text-2xl">{account.icon}</span>
              <div className="flex-1 text-left">
                <div className="text-[var(--text-primary)] font-medium">{account.name}</div>
                <div className="text-sm text-[var(--text-tertiary)]">
                  余额: ¥{account.balance.toFixed(2)}
                </div>
              </div>
              {selectedAccountId === account.id && (
                <Check size={20} className="text-ink" />
              )}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 转账目标账户选择弹窗 */}
      <BottomSheet
        isOpen={showToAccountSheet}
        onClose={() => setShowToAccountSheet(false)}
        title="选择转入账户"
      >
        <div className="p-4 space-y-2">
          {accounts
            .filter((a) => a.id !== selectedAccountId)
            .map((account) => (
              <button
                key={account.id}
                onClick={() => {
                  setToAccountId(account.id);
                  setShowToAccountSheet(false);
                }}
                className={`
                  w-full flex items-center gap-3 p-4 rounded-xl transition-all
                  ${toAccountId === account.id
                    ? 'bg-transfer/10 ring-2 ring-transfer'
                    : 'bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)]'
                  }
                `}
              >
                <span className="text-2xl">{account.icon}</span>
                <div className="flex-1 text-left">
                  <div className="text-[var(--text-primary)] font-medium">{account.name}</div>
                  <div className="text-sm text-[var(--text-tertiary)]">
                    余额: ¥{account.balance.toFixed(2)}
                  </div>
                </div>
                {toAccountId === account.id && (
                  <Check size={20} className="text-transfer" />
                )}
              </button>
            ))}
        </div>
      </BottomSheet>

      {/* 分类选择弹窗 */}
      <BottomSheet
        isOpen={showCategoryPicker}
        onClose={() => {
          setShowCategoryPicker(false);
          setCategoryEditMode(false);
        }}
        title="选择分类"
      >
        <div className="flex items-center justify-end px-1 mb-2">
          <button
            onClick={() => setCategoryEditMode(!categoryEditMode)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              categoryEditMode
                ? 'bg-brand text-ink'
                : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-ink'
            }`}
          >
            {categoryEditMode ? '完成编辑' : '编辑分类'}
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* 添加自定义分类按钮 */}
          <button
            onClick={() => setShowAddCategory(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-brand-tint text-ink rounded-xl hover:bg-brand-soft transition-colors"
          >
            <Plus size={18} />
            <span>添加自定义分类</span>
          </button>

          {categoryEditMode && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-[var(--text-tertiary)]">点击分类可编辑，点击 <X size={10} className="inline text-red-500" /> 删除</p>
              <button
                onClick={() => setCategoryEditMode(false)}
                className="text-sm text-ink font-medium"
              >
                完成
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {allCategories.map((category) => {
              const isSystemCategory = !category.id.startsWith('custom_');
              return (
                <div key={category.id} className="relative">
                  <button
                    onClick={() => {
                      if (categoryEditMode) {
                        // 编辑模式下点击打开编辑弹窗
                        handleOpenEditCategory(category);
                      } else {
                        setSelectedCategoryId(category.id);
                        setShowCategoryPicker(false);
                      }
                    }}
                    onTouchStart={handleCategoryLongPressStart}
                    onTouchEnd={handleCategoryLongPressEnd}
                    onTouchMove={handleCategoryLongPressEnd}
                    onMouseDown={handleCategoryLongPressStart}
                    onMouseUp={handleCategoryLongPressEnd}
                    onMouseLeave={handleCategoryLongPressEnd}
                    className={`
                      w-full flex flex-col items-center gap-2 p-3 rounded-xl transition-all select-none
                      ${categoryEditMode ? 'animate-shake' : ''}
                      ${!categoryEditMode && selectedCategoryId === category.id
                        ? 'bg-brand-tint ring-2 ring-brand'
                        : !categoryEditMode ? 'bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)]'
                        : 'bg-[var(--bg-elevated)]'
                      }
                    `}
                  >
                    <span className="text-3xl">{category.icon}</span>
                    <span className="text-xs text-[var(--text-secondary)]">{category.name}</span>
                  </button>
                  {/* 编辑模式下显示删除按钮（仅自定义分类） */}
                  {categoryEditMode && !isSystemCategory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCustomCategory(category.id);
                      }}
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-danger text-white rounded-full flex items-center justify-center shadow-lg z-10"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </BottomSheet>

      {/* 添加自定义分类弹窗 */}
      <BottomSheet
        isOpen={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        title="新建分类"
      >
        <div className="p-4 space-y-4">
          {/* 分类名称 */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">分类名称</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="输入分类名称"
              maxLength={6}
              className="w-full px-4 py-3 bg-[var(--bg-elevated)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>

          {/* 选择图标 */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">选择图标</label>
            <div className="grid grid-cols-8 gap-2">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewCategoryIcon(icon)}
                  className={`p-2 text-2xl rounded-lg transition-all ${
                    newCategoryIcon === icon
                      ? 'bg-brand-soft ring-2 ring-brand'
                      : 'bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)]'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* 选择颜色 */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">选择颜色</label>
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewCategoryColor(color)}
                  className={`p-3 rounded-lg transition-all ${
                    newCategoryColor === color ? 'ring-2 ring-offset-2 ring-brand' : ''
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {newCategoryColor === color && <Check size={16} className="text-white mx-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* 预览 */}
          <div className="flex items-center justify-center gap-3 py-4 bg-[var(--bg-elevated)] rounded-xl">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: newCategoryColor + '20' }}
            >
              {newCategoryIcon}
            </div>
            <div>
              <div className="text-[var(--text-primary)] font-medium">
                {newCategoryName || '分类名称'}
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">预览</div>
            </div>
          </div>

          {/* 确认按钮 */}
          <button
            onClick={handleAddCategory}
            className="w-full py-3 bg-brand text-ink rounded-xl font-medium hover:bg-brand-strong transition-colors"
          >
            创建分类
          </button>
        </div>
      </BottomSheet>

      {/* 编辑分类弹窗 */}
      <BottomSheet
        isOpen={showEditCategory}
        onClose={() => {
          setShowEditCategory(false);
          setEditingCategory(null);
          // 编辑弹窗关闭后保持分类弹窗打开
          setShowCategoryPicker(true);
        }}
        title="编辑分类"
      >
        <div className="p-4 space-y-4">
          {/* 分类名称 */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">分类名称</label>
            <input
              type="text"
              value={editCatName}
              onChange={(e) => setEditCatName(e.target.value)}
              placeholder="输入分类名称"
              maxLength={6}
              className="w-full px-4 py-3 bg-[var(--bg-elevated)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>

          {/* 选择图标 */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">选择图标</label>
            <div className="grid grid-cols-8 gap-2">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setEditCatIcon(icon)}
                  className={`p-2 text-2xl rounded-lg transition-all ${
                    editCatIcon === icon
                      ? 'bg-brand-soft ring-2 ring-brand'
                      : 'bg-[var(--bg-elevated)] hover:bg-[var(--surface-warm)]'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* 选择颜色 */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">选择颜色</label>
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setEditCatColor(color)}
                  className={`p-3 rounded-lg transition-all ${
                    editCatColor === color ? 'ring-2 ring-offset-2 ring-brand' : ''
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {editCatColor === color && <Check size={16} className="text-white mx-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* 预览 */}
          <div className="flex items-center justify-center gap-3 py-4 bg-[var(--bg-elevated)] rounded-xl">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: editCatColor + '20' }}
            >
              {editCatIcon}
            </div>
            <div>
              <div className="text-[var(--text-primary)] font-medium">
                {editCatName || '分类名称'}
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">预览</div>
            </div>
          </div>

          {/* 确认按钮 */}
          <button
            onClick={handleSaveEditCategory}
            className="w-full py-3 bg-brand text-ink rounded-xl font-medium hover:bg-brand-strong transition-colors"
          >
            保存修改
          </button>
        </div>
      </BottomSheet>

      {/* 日期选择弹窗 */}
      <BottomSheet
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        title="选择日期和时间"
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">日期</label>
            <input
              type="date"
              value={toLocalDateString(date)}
              onChange={(e) => {
                const val = e.target.value
                if (!val) return // 防止空值导致 Invalid Date
                // 用本地时间解析，避免 UTC 偏移
                const [y, m, d] = val.split('-').map(Number)
                const newDate = new Date(y, m - 1, d)
                if (!isNaN(newDate.getTime())) {
                  setDate(newDate)
                }
              }}
              className="w-full px-4 py-3 bg-[var(--bg-elevated)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">时间</label>
            <input
              type="time"
              value={formatTime(time)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':');
                const newTime = new Date(time);
                newTime.setHours(parseInt(h), parseInt(m));
                setTime(newTime);
              }}
              className="w-full px-4 py-3 bg-[var(--bg-elevated)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <button
            onClick={() => setShowDatePicker(false)}
            className="w-full py-3 bg-brand text-ink rounded-xl font-medium hover:bg-brand-strong transition-colors"
          >
            确定
          </button>
        </div>
      </BottomSheet>

      {/* 子分类管理弹窗（居中 Modal） */}
      <SubCategoryManagerModal
        visible={showSubManager}
        categoryId={selectedCategoryId}
        categoryName={selectedCategory?.name || ''}
        onClose={() => setShowSubManager(false)}
      />

      {/* 标签选择弹窗（居中 Modal） */}
      <TagSelectModal
        visible={showTagSelect}
        onClose={() => setShowTagSelect(false)}
        onSelect={handleSelectTagFromModal}
      />

      {/* Toast */}
      <Toast message={toastMessage} visible={showToast} />
    </div>
  );
};

export default AddTransaction;
