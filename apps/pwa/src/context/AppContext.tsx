import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react'
import { supabase, setSupabaseUserId } from '../services/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import type { AccountRecord, CategoryRecord, TransactionRecord, BudgetRecord, SubCategoryRecord, TagRecord } from '../db/database'
import { syncEngine } from '../db/sync-engine'
import {
  localAccounts,
  localCategories,
  localTransactions,
  localBudgets,
  localSubCategories,
  localTags,
  localProfiles,
} from '../db/local-operations'

// ============================================================
// 前端 UI 类型定义 (保持不变)
// ============================================================

export interface Account {
  id: string
  name: string
  type: 'cash' | 'bank' | 'credit' | 'wechat' | 'alipay' | 'crypto' | 'investment' | 'debt'
  balance: number
  currency?: string
  icon: string
  color: string
  isDefault: boolean
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income'
  order: number
}

export interface Transaction {
  id: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  categoryId: string
  categoryName: string
  categoryIcon: string
  accountId: string
  accountName: string
  toAccountId?: string
  toAccountName?: string
  date: string           // 显示格式 "X月X日"
  transactionDate: string // 原始日期 YYYY-MM-DD
  time: string
  subcategoryId?: string
  subcategoryName?: string
  tags?: string[]
  note?: string
  images?: string[]
  location?: { lat: number; lng: number; name: string }
}

export interface SubCategory {
  id: string
  name: string
  color: string
  categoryId: string
  order?: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Budget {
  id: string
  month: string
  categoryId?: string
  categoryName?: string
  amount: number
  spent: number
}

interface AppContextType {
  accounts: Account[]
  categories: { expense: Category[]; income: Category[] }
  transactions: Transaction[]
  budgets: Budget[]

  subCategories: SubCategory[]
  tags: Tag[]
  loading: boolean
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  addAccount: (a: Omit<Account, 'id'>) => Promise<void>
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>
  setDefaultAccount: (id: string) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  addBudget: (b: Omit<Budget, 'id'>) => Promise<void>
  updateBudget: (id: string, data: Partial<Budget>) => Promise<void>
  addCategory: (c: Omit<Category, 'id'>) => Promise<Category | undefined>
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  deleteBill: (id: string) => Promise<void>
  addSubCategory: (s: Omit<SubCategory, 'id'>) => Promise<void>
  updateSubCategory: (id: string, data: Partial<SubCategory>) => Promise<void>
  deleteSubCategory: (id: string) => Promise<void>
  reorderSubCategories: (categoryId: string, orderedIds: string[]) => Promise<void>
  addTag: (t: Omit<Tag, 'id'>) => Promise<Tag | undefined>
  updateTag: (id: string, data: Partial<Tag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
  getTotalAssets: () => number
  getTotalLiabilities: () => number
  getNetAssets: () => number
  getMonthlyIncome: () => number
  getMonthlyExpense: () => number
  getBudgetProgress: () => { total: number; spent: number; percentage: number }
  getCategoryBudgetSpent: (categoryId: string) => number
  getAssetTrend: (months?: number) => { labels: string[]; values: number[] }
  getMonthlyTrend: (months?: number) => { labels: string[]; income: number[]; expense: number[] }
  getWeekExpense: () => { labels: string[]; values: number[] }
  getMonthSummary: (year: number, month: number) => { income: number; expense: number }
  getMonthWeekExpense: (year: number, month: number) => { labels: string[]; values: number[] }
  getYearMonthExpense: (year: number) => { labels: string[]; income: number[]; expense: number[] }
  getYearMonthDetail: (year: number) => { month: string; income: number; expense: number; balance: number }[]
  getMonthExpenseByCategory: (year: number, month: number) => (Category & { total: number })[]
  getMonthTopExpenses: (year: number, month: number, threshold?: number) => Transaction[]
  loading: boolean
  bigExpenseThreshold: number
  setBigExpenseThreshold: (threshold: number) => Promise<void>
  refreshData: () => Promise<void>
  resetAndReload: () => Promise<void>
}

const AppContext = createContext<AppContextType | undefined>(undefined)

// ============================================================
// 数据映射函数: IndexedDB Record → UI Type
// ============================================================

function mapAccount(record: AccountRecord): Account {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    balance: Number(record.balance),
    currency: record.currency || 'CNY',
    icon: record.icon || '💳',
    color: record.color || '#1e88e5',
    isDefault: record.is_default ?? false,
  }
}

function mapCategory(record: CategoryRecord): Category {
  return {
    id: record.id,
    name: record.name,
    icon: record.icon,
    color: record.color,
    type: record.type,
    order: record.sort_order ?? 0,
  }
}

function mapTransaction(
  record: TransactionRecord,
  accountNameMap: Map<string, string>,
  categoryMap: Map<string, { name: string; icon: string }>,
  subCategoryMap: Map<string, string>
): Transaction {
  // 使用本地时间解析 transaction_date (YYYY-MM-DD 格式)
  const currentYear = new Date().getFullYear()
  let dateDisplay = '未知日期'
  if (record.transaction_date) {
    const parts = record.transaction_date.split('-')
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const d = parseInt(parts[2], 10)
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        // 非今年显示完整年月日，今年只显示月日
        dateDisplay = y !== currentYear ? `${y}年${m}月${d}日` : `${m}月${d}日`
      }
    }
  }
  return {
    id: record.id,
    type: record.to_account_id ? 'transfer' : record.type,
    amount: Number(record.amount),
    categoryId: record.category_id || '',
    categoryName: record.category_id ? (categoryMap.get(record.category_id)?.name || '未分类') : '转账',
    categoryIcon: record.category_id ? (categoryMap.get(record.category_id)?.icon || '📌') : '🔄',
    accountId: record.account_id,
    accountName: accountNameMap.get(record.account_id) || '未知账户',
    toAccountId: record.to_account_id || undefined,
    toAccountName: record.to_account_id ? (accountNameMap.get(record.to_account_id) || '未知账户') : undefined,
    date: dateDisplay,
    transactionDate: record.transaction_date,
    time: record.transaction_time?.slice(0, 5) || '00:00',
    tags: record.tags || undefined,
    subcategoryId: record.subcategory_id || undefined,
    subcategoryName: record.subcategory_id ? (subCategoryMap?.get(record.subcategory_id) || undefined) : undefined,
    note: record.note || undefined,
    images: record.images || undefined,
    location: record.location || undefined,
  }
}

function mapBudget(record: BudgetRecord, categoryMap: Map<string, string>): Budget {
  return {
    id: record.id,
    month: record.month?.slice(0, 7) || '',
    categoryId: record.category_id || undefined,
    categoryName: record.category_id ? (categoryMap.get(record.category_id) || undefined) : undefined,
    amount: Number(record.amount),
    spent: 0, // 由计算函数实时计算
  }
}

function mapSubCategory(record: SubCategoryRecord): SubCategory {
  return {
    id: record.id,
    name: record.name,
    color: record.color || '#818cf8',
    categoryId: record.category_id,
    order: record.sort_order ?? 0,
  }
}

function mapTag(record: TagRecord): Tag {
  return {
    id: record.id,
    name: record.name,
    color: record.color || '#818cf8',
  }
}

// ============================================================
// 账户余额动态计算 (从 transactions 实时汇总)
// ============================================================

// 保留两位小数的浮点数修正
function round2(num: number): number {
  return Math.round(num * 100) / 100
}

function calculateAccountBalances(
  accounts: Account[],
  transactions: Transaction[]
): Account[] {
  // 以账户自身 balance 作为初始余额（开户时的初始金额），在此之上叠加交易
  const balanceMap = new Map<string, number>()
  accounts.forEach(a => balanceMap.set(a.id, a.balance))

  // 遍历所有交易计算余额
  transactions.forEach(t => {
    const accountId = t.accountId
    if (!balanceMap.has(accountId)) return

    if (t.type === 'income') {
      balanceMap.set(accountId, (balanceMap.get(accountId) || 0) + t.amount)
    } else if (t.type === 'expense') {
      balanceMap.set(accountId, (balanceMap.get(accountId) || 0) - t.amount)
    } else if (t.type === 'transfer') {
      // 转出
      balanceMap.set(accountId, (balanceMap.get(accountId) || 0) - t.amount)
      // 转入
      if (t.toAccountId && balanceMap.has(t.toAccountId)) {
        balanceMap.set(t.toAccountId, (balanceMap.get(t.toAccountId) || 0) + t.amount)
      }
    }
  })

  return accounts.map(a => ({
    ...a,
    balance: round2(balanceMap.get(a.id) || 0),
  }))
}

// ============================================================
// AppProvider
// ============================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore(state => state.user)
  const initialized = useAuthStore(state => state.initialized)
  const userId = user?.id || null

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<{ expense: Category[]; income: Category[] }>({ expense: [], income: [] })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [subCategories, setSubCategories] = useState<SubCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [bigExpenseThreshold, setBigExpenseThresholdState] = useState<number>(3000)

  // 持有最新 transactions 的引用，供 recomputeTransactions 在不显式传入 base 时使用，
  // 避免把 transactions 放进其依赖数组而导致 effect 无限循环。
  const transactionsRef = useRef<Transaction[]>([])
  transactionsRef.current = transactions

  // ============================================================
  // 从 IndexedDB 加载所有数据
  // ============================================================

  // 账户余额动态计算需放在 loadData / buildDerivationMaps 之前初始化，
  // 否则它们闭包引用 accountsWithBalance 会触发暂时性死区(TDZ)崩溃。
  const accountsWithBalance = useMemo(() => {
    return calculateAccountBalances(accounts, transactions)
  }, [accounts, transactions])

  const loadData = useCallback(async () => {
    if (!userId) {
      setAccounts([])
      setCategories({ expense: [], income: [] })
      setTransactions([])
      setBudgets([])
      setSubCategories([])
      setTags([])
      setLoading(false)
      return
    }

    try {
      // 确保 Supabase RLS 上下文已设置
      setSupabaseUserId(userId)

      // 1. 从 IndexedDB 加载账户 (优先本地缓存，秒开)
      const accRecords = await localAccounts.getAll(userId)
      const rawAccounts = accRecords.map(mapAccount)

      // 2. 从 IndexedDB 加载分类
      const catRecords = await localCategories.getAll(userId)
      const rawCategories = catRecords.map(mapCategory)

      // 构建查找 Map
      const accountNameMap = new Map<string, string>()
      rawAccounts.forEach(a => accountNameMap.set(a.id, a.name))

      const categoryMap = new Map<string, { name: string; icon: string }>()
      rawCategories.forEach(c => categoryMap.set(c.id, { name: c.name, icon: c.icon }))

      // 2.5 从 IndexedDB 加载子分类
      const subCatRecords = await localSubCategories.getAll(userId)
      const rawSubCategories = subCatRecords.map(mapSubCategory)
      const subCategoryMap = new Map<string, string>()
      rawSubCategories.forEach(s => subCategoryMap.set(s.id, s.name))

      // 3. 从 IndexedDB 加载交易
      const txnRecords = await localTransactions.getAll(userId)
      const rawTransactions = txnRecords.map(r => mapTransaction(r, accountNameMap, categoryMap, subCategoryMap))

      // 4. 从 IndexedDB 加载预算
      const bgtRecords = await localBudgets.getAll(userId)
      const catNameMap = new Map<string, string>()
      rawCategories.forEach(c => catNameMap.set(c.id, c.name))
      const rawBudgets = bgtRecords.map(r => mapBudget(r, catNameMap))

      // 5. 从 IndexedDB 加载标签
      const tagRecords = await localTags.getAll(userId)
      const rawTags = tagRecords.map(mapTag)

      // 6. 加载用户设置
      const profile = await localProfiles.get(userId)
      if (profile) {
        setBigExpenseThresholdState(profile.big_expense_threshold)
      }

      // 7. 设置 state (本地缓存秒开)
      setAccounts(rawAccounts)
      setCategories({
        expense: rawCategories.filter(c => c.type === 'expense'),
        income: rawCategories.filter(c => c.type === 'income'),
      })
      setTransactions(rawTransactions)
      setBudgets(rawBudgets)
      setSubCategories(rawSubCategories)
      setTags(rawTags)
      // 注：交易的派生显示字段（分类名/账户名等）由下方字典变更 effect 统一重算，
      // 保证 accounts/categories/subCategories 一变化即实时刷新，无需此处手动处理。

      // 8. 后台同步 (先推送本地变更，再拉取远程数据，完成后刷新 UI)
      syncEngine.syncOnStartup(userId).then(async () => {
        const refreshedAcc = (await localAccounts.getAll(userId)).map(mapAccount)
        const refreshedCat = (await localCategories.getAll(userId)).map(mapCategory)
        const refreshedNameMap = new Map<string, string>()
        refreshedAcc.forEach(a => refreshedNameMap.set(a.id, a.name))
        const refreshedCatMap = new Map<string, { name: string; icon: string }>()
        refreshedCat.forEach(c => refreshedCatMap.set(c.id, { name: c.name, icon: c.icon }))
        const refreshedSub = (await localSubCategories.getAll(userId)).map(mapSubCategory)
        const refreshedSubMap = new Map<string, string>()
        refreshedSub.forEach(s => refreshedSubMap.set(s.id, s.name))
        const refreshedTxn = (await localTransactions.getAll(userId)).map(r => mapTransaction(r, refreshedNameMap, refreshedCatMap, refreshedSubMap))
        const refreshedBgt = (await localBudgets.getAll(userId)).map(r => mapBudget(r, catNameMap))
        const refreshedTag = (await localTags.getAll(userId)).map(mapTag)
        const refreshedProfile = await localProfiles.get(userId)

        setAccounts(refreshedAcc)
        setCategories({
          expense: refreshedCat.filter(c => c.type === 'expense'),
          income: refreshedCat.filter(c => c.type === 'income'),
        })
        setTransactions(refreshedTxn)
        setBudgets(refreshedBgt)
        setSubCategories(refreshedSub)
        setTags(refreshedTag)
        if (refreshedProfile) {
          setBigExpenseThresholdState(refreshedProfile.big_expense_threshold)
        }
      }).catch(err => {
        console.error('同步后刷新失败:', err)
      })
    } catch (err) {
      console.error('数据加载失败:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  // 等待 auth 初始化完成后加载数据
  useEffect(() => {
    if (initialized) {
      loadData()
    }
  }, [initialized, loadData])

  // 设置网络监听和定时同步
  useEffect(() => {
    if (!userId) return

    syncEngine.setupNetworkListener(userId)
    syncEngine.startPeriodicSync(userId, 5 * 60 * 1000)

    return () => {
      syncEngine.removeNetworkListener()
      syncEngine.stopPeriodicSync()
    }
  }, [userId])

  // ============================================================
  // 派生字段重算 (方案A治本)
  // 交易的 categoryName/Icon/Color、accountName、subcategoryName 等
  // 显示字段，统一从字典实时重算，避免加载快照与"提交数据库但缓存未更新"不同步。
  // ============================================================

  // 构建 account/category/subCategory 的查找 Map
  // 注意：账户名只用 accounts state（名称不随余额变化），不要用 accountsWithBalance，
  // 否则 transactions 变化 → accountsWithBalance 引用变 → 本回调引用变 →
  // recomputeTransactions 引用变 → 自动重算 effect 自我触发陷入无限循环。
  const buildDerivationMaps = useCallback(() => {
    const accountNameMap = new Map<string, string>()
    accounts.forEach(a => accountNameMap.set(a.id, a.name))

    const categoryMap = new Map<string, { name: string; icon: string; color: string }>()
    categories.expense.forEach(c => categoryMap.set(c.id, { name: c.name, icon: c.icon, color: c.color }))
    categories.income.forEach(c => categoryMap.set(c.id, { name: c.name, icon: c.icon, color: c.color }))

    const subCategoryMap = new Map<string, string>()
    subCategories.forEach(s => subCategoryMap.set(s.id, s.name))

    return { accountNameMap, categoryMap, subCategoryMap }
  }, [accounts, categories, subCategories])

  // 根据字典重算所有交易的显示字段；不传 base 时基于最新 transactions state (通过 ref，避免依赖循环)
  const recomputeTransactions = useCallback((base?: Transaction[]): Transaction[] => {
    const { accountNameMap, categoryMap, subCategoryMap } = buildDerivationMaps()
    const source = base ?? transactionsRef.current
    return source.map(t => {
      const next: Transaction = { ...t }
      if (t.type === 'transfer') {
        next.categoryName = '转账'
        next.categoryIcon = '🔄'
        next.categoryColor = '#5b8dee'
        next.accountName = accountNameMap.get(t.accountId) || '未知账户'
        next.toAccountName = t.toAccountId ? (accountNameMap.get(t.toAccountId) || '未知账户') : undefined
        next.subcategoryName = undefined
        return next
      }
      const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined
      next.categoryName = cat?.name || '未分类'
      next.categoryIcon = cat?.icon || '📌'
      next.categoryColor = cat?.color || '#94a3b8'
      next.accountName = accountNameMap.get(t.accountId) || '未知账户'
      next.subcategoryName = t.subcategoryId ? (subCategoryMap.get(t.subcategoryId) || '') : undefined
      return next
    })
  }, [buildDerivationMaps])

  const refreshData = useCallback(async () => {
    setLoading(true)
    await loadData()
  }, [loadData])

  // 方案B: 清除缓存可靠路径
  // 1) 显式置空所有 React state（clearAllData 只清 IndexedDB，不会重置内存快照，
  //    旧数据残留会导致重拉后 UI 仍显示缓存前的旧值）
  // 2) 清空 IndexedDB（含 syncMeta，确保走首次全量同步）
  // 3) 重新 loadData（秒开空态 → 后台全量拉取远程 → 刷新 UI）
  const resetAndReload = useCallback(async () => {
    // 1. 先清空内存 state，避免旧快照干扰
    setAccounts([])
    setCategories({ expense: [], income: [] })
    setTransactions([])
    setBudgets([])
    setSubCategories([])
    setTags([])
    setLoading(true)

    // 2. 清空本地缓存（IndexedDB + syncMeta）
    await syncEngine.clearAllData()

    // 3. 重新加载（clearAllData 已清 syncMeta，loadData 内 syncOnStartup 走全量分支）
    await loadData()
  }, [loadData])

  // ============================================================
  // 字典变更自动重算交易派生字段 (方案A)
  // 账户/分类/子分类任一变化 → 立即重算所有交易的显示字段，
  // 彻底解决"提交数据库但本地缓存(UI)未更新"的派生字段不同步问题。
  // 仅当已有交易时才重算，避免无谓写入与初始空态波动。
  // ============================================================
  useEffect(() => {
    if (transactions.length === 0) return
    setTransactions(prev => {
      const recomputed = recomputeTransactions(prev)
      // 逐条比较派生字段值；全部相等则原样返回，避免无意义更新引发额外渲染
      let changed = recomputed.length !== prev.length
      if (!changed) {
        for (let i = 0; i < recomputed.length; i++) {
          const a = prev[i]
          const b = recomputed[i]
          if (
            a.categoryName !== b.categoryName ||
            a.categoryIcon !== b.categoryIcon ||
            a.categoryColor !== b.categoryColor ||
            a.accountName !== b.accountName ||
            a.toAccountName !== b.toAccountName ||
            a.subcategoryName !== b.subcategoryName
          ) {
            changed = true
            break
          }
        }
      }
      return changed ? recomputed : prev
    })
  }, [accounts, categories, subCategories, recomputeTransactions])

  // ============================================================
  // 大额支出阈值
  // ============================================================
  const setBigExpenseThreshold = useCallback(async (threshold: number) => {
    setBigExpenseThresholdState(threshold)
    if (userId) {
      try {
        await localProfiles.upsert(userId, { big_expense_threshold: threshold })
        // 后台同步
        syncEngine.syncAfterWrite('profiles', userId).catch(err => {
          console.error('同步大额支出阈值失败:', err)
        })
      } catch (err) {
        console.error('保存大额支出阈值失败:', err)
      }
    }
  }, [userId])

  // ============================================================
  // CRUD: 添加交易 (本地优先 + 后台同步)
  // ============================================================

  const addTransaction = useCallback(async (t: Omit<Transaction, 'id'>) => {
    if (!userId) throw new Error('未登录')

    const [h, m] = (t.time || '00:00').split(':')
    const transactionDate = t.transactionDate || t.date || new Date().toISOString().split('T')[0]
    const transactionTime = `${h || '00'}:${m || '00'}:00`

    // 1. 立即写入 IndexedDB
    const record = await localTransactions.insert(userId, {
      type: t.type === 'transfer' ? 'expense' : t.type,
      amount: t.amount,
      category_id: t.type === 'transfer' ? null : t.categoryId,
      subcategory_id: t.type === 'transfer' ? null : (t.subcategoryId || null),
      account_id: t.accountId,
      to_account_id: t.toAccountId || null,
      transaction_date: transactionDate,
      transaction_time: transactionTime,
      tags: t.tags?.length ? t.tags : null,
      note: t.note || null,
      images: null,
      location: null,
    })

    // 2. 构建 UI 数据并立即更新 state
    // 注意：本地写入已成功（record 已落库），UI 映射层即使异常也只影响展示，
    // 绝不能因此让 addTransaction 抛错导致上层误报「保存失败」。
    try {
      const accountNameMap = new Map<string, string>()
      accountsWithBalance.forEach(a => accountNameMap.set(a.id, a.name))
      const categoryMap = new Map<string, { name: string; icon: string }>()
      categories.expense.forEach(c => categoryMap.set(c.id, { name: c.name, icon: c.icon }))
      categories.income.forEach(c => categoryMap.set(c.id, { name: c.name, icon: c.icon }))
      const subCategoryMap = new Map<string, string>()
      subCategories.forEach(s => subCategoryMap.set(s.id, s.name))

      const newTransaction = mapTransaction(record, accountNameMap, categoryMap, subCategoryMap)

      setTransactions(prev => [newTransaction, ...prev])
    } catch (mapErr) {
      console.error('构建交易 UI 数据失败（不影响已保存）:', mapErr)
    }

    // 3. 后台异步同步到 Supabase（fire-and-forget，失败不影响保存结果）
    syncEngine.syncAfterWrite('transactions', userId).catch(err => {
      console.error('后台同步交易失败:', err)
    })
  }, [userId, accountsWithBalance, categories, subCategories])


  // ============================================================
  // CRUD: 删除交易
  // ============================================================

  const deleteTransaction = useCallback(async (id: string) => {
    if (!userId) throw new Error('未登录')

    // 1. 立即从 IndexedDB 标记删除
    await localTransactions.remove(id)

    // 2. 更新本地 state
    setTransactions(prev => prev.filter(t => t.id !== id))

    // 3. 后台同步
    syncEngine.syncAfterWrite('transactions', userId).catch(err => {
      console.error('后台同步删除交易失败:', err)
    })
  }, [userId])

  // ============================================================
  // CRUD: 更新交易
  // ============================================================

  const updateTransaction = useCallback(async (id: string, data: Partial<Transaction>) => {
    if (!userId) throw new Error('未登录')

    // 1. 构建 IndexedDB 更新字段
    const dbUpdates: Partial<TransactionRecord> = {}
    if (data.type !== undefined) {
      dbUpdates.type = data.type === 'transfer' ? 'expense' : data.type
    }
    if (data.amount !== undefined) dbUpdates.amount = data.amount
    if (data.categoryId !== undefined) {
      dbUpdates.category_id = data.type === 'transfer' ? null : data.categoryId
    }
    if (data.subcategoryId !== undefined) {
      dbUpdates.subcategory_id = data.type === 'transfer' ? null : (data.subcategoryId || null)
    }
    if (data.accountId !== undefined) dbUpdates.account_id = data.accountId
    if (data.toAccountId !== undefined) dbUpdates.to_account_id = data.toAccountId || null
    if (data.note !== undefined) dbUpdates.note = data.note || null
    if (data.tags !== undefined) dbUpdates.tags = data.tags.length ? data.tags : null
    if (data.date !== undefined) dbUpdates.transaction_date = data.date
    if (data.time !== undefined) dbUpdates.transaction_time = data.time.length <= 5 ? data.time + ':00' : data.time

    // 2. 更新 IndexedDB
    await localTransactions.update(id, dbUpdates)

    // 3. 更新本地 state：先合入 data，再用最新字典重算全部派生显示字段
    setTransactions(prev => {
      const merged = prev.map(t => t.id === id ? { ...t, ...data } : t)
      return recomputeTransactions(merged)
    })

    // 4. 后台同步
    syncEngine.syncAfterWrite('transactions', userId).catch(err => {
      console.error('后台同步更新交易失败:', err)
    })
  }, [userId, recomputeTransactions])

  // ============================================================
  // CRUD: 账户
  // ============================================================

  const addAccount = useCallback(async (a: Omit<Account, 'id'>) => {
    if (!userId) throw new Error('未登录')

    const isFirstAccount = accounts.length === 0

    const record = await localAccounts.insert(userId, {
      name: a.name,
      type: a.type,
      balance: a.balance,
      currency: (a as any).currency || 'CNY',
      icon: a.icon,
      color: a.color,
      sort_order: accounts.length,
      is_default: isFirstAccount,
      is_active: true,
    })

    setAccounts(prev => [...prev, mapAccount(record)])

    syncEngine.syncAfterWrite('accounts', userId).catch(err => {
      console.error('后台同步账户失败:', err)
    })
  }, [userId, accounts.length])

  const updateAccount = useCallback(async (id: string, data: Partial<Account>) => {
    if (!userId) throw new Error('未登录')

    const dbUpdates: Partial<AccountRecord> = {}
    if (data.name !== undefined) dbUpdates.name = data.name
    if (data.type !== undefined) dbUpdates.type = data.type
    if (data.balance !== undefined) dbUpdates.balance = data.balance
    if (data.icon !== undefined) dbUpdates.icon = data.icon
    if (data.color !== undefined) dbUpdates.color = data.color
    if ((data as any).currency !== undefined) dbUpdates.currency = (data as any).currency

    await localAccounts.update(id, dbUpdates)

    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...data } : a))

    syncEngine.syncAfterWrite('accounts', userId).catch(err => {
      console.error('后台同步更新账户失败:', err)
    })
  }, [userId])

  const deleteAccount = useCallback(async (id: string) => {
    if (!userId) throw new Error('未登录')

    await localAccounts.remove(id)

    setAccounts(prev => prev.filter(a => a.id !== id))

    syncEngine.syncAfterWrite('accounts', userId).catch(err => {
      console.error('后台同步删除账户失败:', err)
    })
  }, [userId])

  const setDefaultAccount = useCallback(async (id: string) => {
    if (!userId) return

    // 投资账户不可设为默认账户
    const target = accounts.find(a => a.id === id)
    if (target?.type === 'investment') return

    // 1. 找到当前默认账户，取消其默认标识
    const currentDefault = accounts.find(a => a.isDefault)
    if (currentDefault && currentDefault.id !== id) {
      await localAccounts.update(currentDefault.id, { is_default: false } as any)
    }

    // 2. 设置目标账户为默认
    await localAccounts.update(id, { is_default: true } as any)

    // 3. 更新本地 state
    setAccounts(prev => prev.map(a => ({
      ...a,
      isDefault: a.id === id,
    })))

    // 4. 后台同步
    syncEngine.syncAfterWrite('accounts', userId).catch(err => {
      console.error('后台同步默认账户失败:', err)
    })
  }, [userId, accounts])

  // ============================================================
  // CRUD: 分类
  // ============================================================

  const addCategory = useCallback(async (c: Omit<Category, 'id'>): Promise<Category | undefined> => {
    if (!userId) throw new Error('未登录')

    const record = await localCategories.insert(userId, {
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: c.type,
      sort_order: c.order ?? 0,
      is_system: false,
    })

    const newCategory = mapCategory(record)
    setCategories(prev => ({
      ...prev,
      [c.type]: [...prev[c.type], newCategory],
    }))

    syncEngine.syncAfterWrite('categories', userId).catch(err => {
      console.error('后台同步分类失败:', err)
    })

    return newCategory
  }, [userId])

  const updateCategory = useCallback(async (id: string, data: Partial<Category>) => {
    if (!userId) throw new Error('未登录')

    const dbUpdates: Partial<CategoryRecord> = {}
    if (data.name !== undefined) dbUpdates.name = data.name
    if (data.icon !== undefined) dbUpdates.icon = data.icon
    if (data.color !== undefined) dbUpdates.color = data.color
    if (data.type !== undefined) dbUpdates.type = data.type
    if (data.order !== undefined) dbUpdates.sort_order = data.order

    await localCategories.update(id, dbUpdates)

    setCategories(prev => ({
      expense: prev.expense.map(c => c.id === id ? { ...c, ...data } : c),
      income: prev.income.map(c => c.id === id ? { ...c, ...data } : c),
    }))

    syncEngine.syncAfterWrite('categories', userId).catch(err => {
      console.error('后台同步更新分类失败:', err)
    })
  }, [userId])

  const deleteCategory = useCallback(async (id: string) => {
    if (!userId) throw new Error('未登录')

    await localCategories.remove(id)

    setCategories(prev => ({
      expense: prev.expense.filter(c => c.id !== id),
      income: prev.income.filter(c => c.id !== id),
    }))

    syncEngine.syncAfterWrite('categories', userId).catch(err => {
      console.error('后台同步删除分类失败:', err)
    })
  }, [userId])

  // ============================================================
  // CRUD: 预算
  // ============================================================

  const addBudget = useCallback(async (b: Omit<Budget, 'id'>) => {
    if (!userId) throw new Error('未登录')

    const record = await localBudgets.insert(userId, {
      month: `${b.month}-01`,
      category_id: b.categoryId || null,
      amount: b.amount,
    })

    const newBudget = mapBudget(record, new Map())
    newBudget.categoryName = b.categoryName
    newBudget.spent = b.spent

    setBudgets(prev => [...prev, newBudget])

    syncEngine.syncAfterWrite('budgets', userId).catch(err => {
      console.error('后台同步预算失败:', err)
    })
  }, [userId])

  const updateBudget = useCallback(async (id: string, data: Partial<Budget>) => {
    if (!userId) throw new Error('未登录')

    const dbUpdates: Partial<BudgetRecord> = {}
    if (data.amount !== undefined) dbUpdates.amount = data.amount

    await localBudgets.update(id, dbUpdates)

    setBudgets(prev => prev.map(b => b.id === id ? { ...b, ...data } : b))

    syncEngine.syncAfterWrite('budgets', userId).catch(err => {
      console.error('后台同步更新预算失败:', err)
    })
  }, [userId])

  // ============================================================
  // CRUD: 标签
  // ============================================================

  // ============================================================
  // CRUD: 子分类（绑一级分类）
  // ============================================================

  const addSubCategory = useCallback(async (s: Omit<SubCategory, 'id'>) => {
    if (!userId) throw new Error('未登录')

    const record = await localSubCategories.insert(userId, {
      name: s.name,
      color: s.color,
      category_id: s.categoryId,
      sort_order: s.order ?? 0,
    })

    setSubCategories(prev => [...prev, mapSubCategory(record)])

    syncEngine.syncAfterWrite('subCategories', userId).catch(err => {
      console.error('后台同步子分类失败:', err)
    })
  }, [userId])

  const updateSubCategory = useCallback(async (id: string, data: Partial<SubCategory>) => {
    if (!userId) throw new Error('未登录')

    const dbUpdates: Partial<SubCategoryRecord> = {}
    if (data.name !== undefined) dbUpdates.name = data.name
    if (data.color !== undefined) dbUpdates.color = data.color
    if (data.categoryId !== undefined) dbUpdates.category_id = data.categoryId
    if (data.order !== undefined) dbUpdates.sort_order = data.order

    await localSubCategories.update(id, dbUpdates)

    setSubCategories(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))

    syncEngine.syncAfterWrite('subCategories', userId).catch(err => {
      console.error('后台同步更新子分类失败:', err)
    })
  }, [userId])

  const reorderSubCategories = useCallback(async (categoryId: string, orderedIds: string[]) => {
    if (!userId) throw new Error('未登录')

    // 1. 立即更新本地 state（仅当前分类下的顺序生效）
    setSubCategories(prev => {
      const inCat = prev.filter(s => s.categoryId === categoryId)
      const others = prev.filter(s => s.categoryId !== categoryId)
      const byId = new Map(inCat.map(s => [s.id, s]))
      const sorted = orderedIds
        .map((id, i) => {
          const item = byId.get(id)
          return item ? { ...item, order: i } : undefined
        })
        .filter((s): s is NonNullable<typeof s> => s !== undefined)
      return [...others, ...sorted]
    })

    // 2. 持久化到 IndexedDB
    await localSubCategories.reorder(userId, orderedIds)

    syncEngine.syncAfterWrite('subCategories', userId).catch(err => {
      console.error('后台同步子分类排序失败:', err)
    })
  }, [userId])

  const deleteSubCategory = useCallback(async (id: string) => {
    if (!userId) throw new Error('未登录')

    await localSubCategories.remove(id)

    setSubCategories(prev => prev.filter(s => s.id !== id))

    syncEngine.syncAfterWrite('subCategories', userId).catch(err => {
      console.error('后台同步删除子分类失败:', err)
    })
  }, [userId])

  // ============================================================
  // CRUD: 标签（全局自由标签，跨分类）
  // ============================================================

  const addTag = useCallback(async (t: Omit<Tag, 'id'>): Promise<Tag | undefined> => {
    if (!userId) throw new Error('未登录')

    const record = await localTags.insert(userId, {
      name: t.name,
      color: t.color,
    })

    const newTag = mapTag(record)
    setTags(prev => [...prev, newTag])

    syncEngine.syncAfterWrite('tags', userId).catch(err => {
      console.error('后台同步标签失败:', err)
    })

    return newTag
  }, [userId])

  const updateTag = useCallback(async (id: string, data: Partial<Tag>) => {
    if (!userId) throw new Error('未登录')

    const dbUpdates: Partial<TagRecord> = {}
    if (data.name !== undefined) dbUpdates.name = data.name
    if (data.color !== undefined) dbUpdates.color = data.color

    await localTags.update(id, dbUpdates)

    setTags(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))

    syncEngine.syncAfterWrite('tags', userId).catch(err => {
      console.error('后台同步更新标签失败:', err)
    })
  }, [userId])

  const deleteTag = useCallback(async (id: string) => {
    if (!userId) throw new Error('未登录')

    await localTags.remove(id)

    setTags(prev => prev.filter(t => t.id !== id))

    syncEngine.syncAfterWrite('tags', userId).catch(err => {
      console.error('后台同步删除标签失败:', err)
    })
  }, [userId])

  // ============================================================
  // 计算属性 (使用 accountsWithBalance 替代 accounts)
  // ============================================================

  const getTotalAssets = useCallback(() => {
    // 总资产 = 所有非负债账户的余额总和（正负都算）
    return accountsWithBalance
      .filter(a => a.type !== 'credit' && a.type !== 'debt')
      .reduce((sum, a) => sum + a.balance, 0)
  }, [accountsWithBalance])

  const getTotalLiabilities = useCallback(() => {
    return Math.abs(accountsWithBalance.filter(a => a.balance < 0).reduce((sum, a) => sum + a.balance, 0))
  }, [accountsWithBalance])

  const getNetAssets = useCallback(() => {
    return getTotalAssets() - getTotalLiabilities()
  }, [getTotalAssets, getTotalLiabilities])

  const getMonthlyIncome = useCallback(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    return transactions
      .filter(t => {
        if (t.type !== 'income') return false
        if (!t.transactionDate) return false
        const d = new Date(t.transactionDate.replace(/-/g, '/'))
        return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth
      })
      .reduce((sum, t) => sum + t.amount, 0)
  }, [transactions])

  const getMonthlyExpense = useCallback(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    return transactions
      .filter(t => {
        if (t.type !== 'expense') return false
        if (!t.transactionDate) return false
        const d = new Date(t.transactionDate.replace(/-/g, '/'))
        return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth
      })
      .reduce((sum, t) => sum + t.amount, 0)
  }, [transactions])

  const getBudgetProgress = useCallback(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentMonthStr = now.toISOString().slice(0, 7)

    let totalSpentThisMonth = 0
    transactions
      .filter(t => t.type === 'expense' && t.transactionDate)
      .forEach(t => {
        const d = new Date(t.transactionDate!)
        if (d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth) {
          totalSpentThisMonth += t.amount
        }
      })

    const totalBudget = budgets.find(b => !b.categoryId && b.month === currentMonthStr)
    if (!totalBudget) return { total: 0, spent: totalSpentThisMonth, percentage: 0 }
    const percentage = totalBudget.amount > 0 ? Math.round((totalSpentThisMonth / totalBudget.amount) * 100) : 0
    return { total: totalBudget.amount, spent: totalSpentThisMonth, percentage }
  }, [budgets, transactions])

  const getCategoryBudgetSpent = useCallback((categoryId: string): number => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    return transactions
      .filter(t => t.type === 'expense' && t.categoryId === categoryId && t.transactionDate)
      .filter(t => {
        const d = new Date(t.transactionDate!)
        return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth
      })
      .reduce((sum, t) => sum + t.amount, 0)
  }, [transactions])

  const getAssetTrend = useCallback((months: number = 6): { labels: string[]; values: number[] } => {
    const now = new Date()
    const labels: string[] = []
    const values: number[] = []
    const currentTotal = accountsWithBalance.filter(a => a.balance > 0).reduce((sum, a) => sum + a.balance, 0)

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const targetMonth = d.getMonth() + 1
      const targetYear = d.getFullYear()
      labels.push(`${d.getMonth() + 1}月`)

      let netChange = 0
      transactions.forEach(t => {
        if (!t.transactionDate) return
        const tDate = new Date(t.transactionDate.replace(/-/g, '/'))
        if (tDate.getFullYear() < targetYear || (tDate.getFullYear() === targetYear && tDate.getMonth() + 1 < targetMonth)) {
          return
        }
        if (t.type === 'income') netChange += t.amount
        else if (t.type === 'expense') netChange -= t.amount
      })
      values.push(Math.max(0, currentTotal - netChange))
    }
    return { labels, values }
  }, [accountsWithBalance, transactions])

  const getMonthlyTrend = useCallback((months: number = 7): { labels: string[]; income: number[]; expense: number[] } => {
    const now = new Date()
    const labels: string[] = []
    const income: number[] = []
    const expense: number[] = []

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const targetYear = d.getFullYear()
      const targetMonth = d.getMonth() + 1
      labels.push(`${targetMonth}月`)

      let monthIncome = 0
      let monthExpense = 0
      transactions.forEach(t => {
        if (!t.transactionDate) return
        const tDate = new Date(t.transactionDate.replace(/-/g, '/'))
        if (tDate.getFullYear() !== targetYear || tDate.getMonth() + 1 !== targetMonth) return
        if (t.type === 'income') monthIncome += t.amount
        else if (t.type === 'expense') monthExpense += t.amount
      })
      income.push(monthIncome)
      expense.push(monthExpense)
    }
    return { labels, income, expense }
  }, [transactions])

  const getWeekExpense = useCallback((): { labels: string[]; values: number[] } => {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const labels: string[] = []
    const values: number[] = []
    const now = new Date()

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      labels.push(dayNames[d.getDay()])
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      const dayTotal = transactions
        .filter(t => t.type === 'expense' && t.transactionDate === dateStr)
        .reduce((sum, t) => sum + t.amount, 0)
      values.push(dayTotal)
    }
    return { labels, values }
  }, [transactions])

  const getMonthSummary = useCallback((year: number, month: number) => {
    let income = 0
    let expense = 0

    transactions.forEach(t => {
      if (!t.transactionDate) return
      const d = new Date(t.transactionDate.replace(/-/g, '/'))
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return

      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    })

    return { income, expense }
  }, [transactions])

  const getMonthWeekExpense = useCallback((year: number, month: number): { labels: string[]; values: number[] } => {
    const daysInMonth = new Date(year, month, 0).getDate()
    const targetMonthStr = String(month).padStart(2, '0')

    const weeks: { label: string; days: number[] }[] = []
    let weekStart = 1
    let weekNum = 1
    while (weekStart <= daysInMonth) {
      const weekEnd = Math.min(weekStart + 6, daysInMonth)
      weeks.push({ label: `第${weekNum}周`, days: [] })
      for (let d = weekStart; d <= weekEnd; d++) {
        weeks[weeks.length - 1].days.push(d)
      }
      weekStart = weekEnd + 1
      weekNum++
    }

    const labels = weeks.map(w => w.label)
    const values = weeks.map(w => {
      let total = 0
      w.days.forEach(day => {
        const dateStr = `${year}-${targetMonthStr}-${String(day).padStart(2, '0')}`
        transactions
          .filter(t => t.type === 'expense' && t.transactionDate === dateStr)
          .forEach(t => { total += t.amount })
      })
      return total
    })

    return { labels, values }
  }, [transactions])

  const getYearMonthExpense = useCallback((year: number): { labels: string[]; income: number[]; expense: number[] } => {
    const labels: string[] = []
    const income: number[] = []
    const expense: number[] = []

    for (let m = 1; m <= 12; m++) {
      labels.push(`${m}月`)
      let incTotal = 0
      let expTotal = 0
      transactions.forEach(t => {
        if (!t.transactionDate) return
        const d = new Date(t.transactionDate.replace(/-/g, '/'))
        if (d.getFullYear() !== year || d.getMonth() + 1 !== m) return
        if (t.type === 'income') incTotal += t.amount
        else if (t.type === 'expense') expTotal += t.amount
      })
      income.push(incTotal)
      expense.push(expTotal)
    }

    return { labels, income, expense }
  }, [transactions])

  const getYearMonthDetail = useCallback((year: number) => {
    const result: { month: string; income: number; expense: number; balance: number }[] = []
    for (let m = 1; m <= 12; m++) {
      let inc = 0
      let exp = 0
      transactions.forEach(t => {
        if (!t.transactionDate) return
        // 用 / 格式避免 new Date('YYYY-MM-DD') 被解析为 UTC 导致的时区偏移
        const d = new Date(t.transactionDate.replace(/-/g, '/'))
        if (isNaN(d.getTime())) return
        if (d.getFullYear() !== year || d.getMonth() + 1 !== m) return
        if (t.type === 'income') inc += t.amount
        else if (t.type === 'expense') exp += t.amount
      })
      result.push({ month: `${m}月`, income: inc, expense: exp, balance: inc - exp })
    }
    return result
  }, [transactions])

  const getMonthExpenseByCategory = useCallback((year: number, month: number) => {
    return categories.expense.map(cat => {
      const total = transactions
        .filter(t => {
          if (t.type !== 'expense' || t.categoryId !== cat.id) return false
          if (!t.transactionDate) return false
          const d = new Date(t.transactionDate.replace(/-/g, '/'))
          if (isNaN(d.getTime())) return false
          return d.getFullYear() === year && d.getMonth() + 1 === month
        })
        .reduce((sum, t) => sum + t.amount, 0)
      return { ...cat, total }
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
  }, [transactions, categories.expense])

  const getMonthTopExpenses = useCallback((year: number, month: number, threshold: number = 100): Transaction[] => {
    return transactions
      .filter(t => {
        if (t.type !== 'expense' || t.amount < threshold) return false
        if (!t.transactionDate) return false
        const d = new Date(t.transactionDate.replace(/-/g, '/'))
        if (isNaN(d.getTime())) return false
        return d.getFullYear() === year && d.getMonth() + 1 === month
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [transactions])

  // ============================================================
  // Context Value
  // ============================================================

  return (
    <AppContext.Provider value={{
      accounts: accountsWithBalance,
      categories,
      transactions,
      budgets,
      loading,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount,
      setDefaultAccount,
      deleteAccount,
      addBudget,
      updateBudget,
      addCategory,
      updateCategory,
      deleteCategory,
      subCategories,
      addSubCategory,
      updateSubCategory,
      deleteSubCategory,
      reorderSubCategories,
      tags,
      addTag,
      updateTag,
      deleteTag,
      getTotalAssets,
      getTotalLiabilities,
      getNetAssets,
      getMonthlyIncome,
      getMonthlyExpense,
      getBudgetProgress,
      getCategoryBudgetSpent,
      getAssetTrend,
      getMonthlyTrend,
      getWeekExpense,
      getMonthSummary,
      getMonthWeekExpense,
      getYearMonthExpense,
      getYearMonthDetail,
      getMonthExpenseByCategory,
      getMonthTopExpenses,
      bigExpenseThreshold,
      setBigExpenseThreshold,
      refreshData,
      resetAndReload,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
