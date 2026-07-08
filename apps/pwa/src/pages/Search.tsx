import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import TransactionItem from '../components/ui/TransactionItem'
import { Search, X, Filter, Clock } from 'lucide-react'

export default function SearchPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { transactions, categories, subCategories, tags } = useApp()
  
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all')
  const [showFilters, setShowFilters] = useState(false)

  const searchHistory = ['星巴克', '餐饮', '工资']

  // 构建 tagId -> name 映射，便于搜索与展示
  const tagNameMap = useMemo(() => {
    const m = new Map<string, string>()
    tags.forEach(t => m.set(t.id, t.name))
    return m
  }, [tags])

  const subCategoryNameMap = useMemo(() => {
    const m = new Map<string, string>()
    subCategories.forEach(s => m.set(s.id, s.name))
    return m
  }, [subCategories])

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) return false

      // Search query
      if (query) {
        const q = query.toLowerCase()
        const tagNames = (t.tags || []).map(id => tagNameMap.get(id) || '').join(' ')
        const subName = t.subcategoryId ? (subCategoryNameMap.get(t.subcategoryId) || '') : ''
        const searchableText = [
          t.categoryName,
          subName,
          t.note,
          t.accountName,
          tagNames,
          t.amount.toString(),
          t.date,
        ].filter(Boolean).join(' ').toLowerCase()

        return searchableText.includes(q)
      }

      return true
    })
  }, [transactions, query, typeFilter, tagNameMap, subCategoryNameMap])

  // 汇总卡：搜索结果的总笔数、总支出、总收入
  const summary = useMemo(() => {
    let expense = 0
    let income = 0
    filteredTransactions.forEach(t => {
      if (t.type === 'expense') expense += t.amount
      else if (t.type === 'income') income += t.amount
    })
    return { count: filteredTransactions.length, expense, income }
  }, [filteredTransactions])

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-brand/20 text-ink rounded px-0.5">{part}</mark>
        : part
    )
  }

  return (
    <div className={`min-h-screen bg-bg`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <X size={24} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
          </button>
          <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full ${
            theme === 'dark' ? 'bg-surface' : 'bg-white'
          }`}>
            <Search size={18} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索金额、分类、备注..."
              autoFocus
              className={`flex-1 bg-transparent outline-none text-sm ${
                theme === 'dark' ? 'text-ink placeholder-[#87867f]' : 'text-ink placeholder-[#b0aea5]'
              }`}
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X size={16} className={theme === 'dark' ? 'text-ink-2' : 'text-ink-2'} />
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full ${showFilters ? 'bg-brand text-white' : theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-white text-ink-2'}`}
          >
            <Filter size={20} />
          </button>
        </div>
      </header>

      {/* Filters */}
      {showFilters && (
        <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-brand-tint bg-[#141413]' : 'border-brand-tint bg-bg'}`}>
          <div className="flex gap-2">
            {(['all', 'expense', 'income', 'transfer'] as const).map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                  ${typeFilter === type 
                    ? 'bg-brand text-white' 
                    : theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-white text-ink-2'
                  }`}
              >
                {type === 'all' ? '全部' : type === 'expense' ? '支出' : type === 'income' ? '收入' : '转账'}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="px-5 pb-6 animate-page-fade">
        {/* Search Results */}
        {query ? (
          <div>
            <div className={`text-sm mb-3 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              找到 {filteredTransactions.length} 条结果
            </div>

            {/* 汇总卡 */}
            {query && filteredTransactions.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-brand-tint/40 rounded-xl py-3 text-center">
                  <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>笔数</div>
                  <div className={`text-lg font-bold font-mono ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                    {summary.count}
                  </div>
                </div>
                <div className="bg-brand-tint/40 rounded-xl py-3 text-center">
                  <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>支出</div>
                  <div className="text-lg font-bold font-mono text-danger">
                    ¥{summary.expense.toLocaleString()}
                  </div>
                </div>
                <div className="bg-brand-tint/40 rounded-xl py-3 text-center">
                  <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>收入</div>
                  <div className="text-lg font-bold font-mono text-ok">
                    ¥{summary.income.toLocaleString()}
                  </div>
                </div>
              </div>
            )}
            
            {filteredTransactions.length > 0 ? (
              <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
                {filteredTransactions.map(t => {
                  const category = t.type === 'transfer'
                    ? { icon: '↔️', color: '#5b8dee' }
                    : (categories[t.type === 'expense' ? 'expense' : 'income'] as any[]).find(c => c.id === t.categoryId) || { icon: '📝', color: '#87867f' }
                  
                  return (
                    <TransactionItem
                      key={t.id}
                      icon={category.icon}
                      iconBg={`${category.color}15`}
                      title={highlightMatch(t.categoryName, query)}
                      subtitle={`${t.date} ${t.time} · ${t.accountName}`}
                      amount={t.amount}
                      type={t.type}
                    />
                  )
                })}
              </Card>
            ) : (
              <div className={`text-center py-12 ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
                <div className="text-4xl mb-3">🔍</div>
                <p>未找到相关交易</p>
                <p className="text-sm mt-1">试试其他关键词</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* History */}
            {searchHistory.length > 0 && (
              <div>
                <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                  搜索历史
                </h3>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.map(term => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm
                        ${theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-white text-ink-2'}`}
                    >
                      <Clock size={14} />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Transactions */}
            <div>
              <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
                最近交易
              </h3>
              <Card className="!p-0 divide-y divide-[#f0eee6] dark:divide-[#3d3d3a]">
                {transactions.slice(0, 10).map(t => {
                  const category = t.type === 'transfer'
                    ? { icon: '↔️', color: '#5b8dee' }
                    : (categories[t.type === 'expense' ? 'expense' : 'income'] as any[]).find(c => c.id === t.categoryId) || { icon: '📝', color: '#87867f' }
                  
                  return (
                    <TransactionItem
                      key={t.id}
                      icon={category.icon}
                      iconBg={`${category.color}15`}
                      title={t.categoryName}
                      subtitle={`${t.date} ${t.time}`}
                      amount={t.amount}
                      type={t.type}
                      account={t.accountName}
                    />
                  )
                })}
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
