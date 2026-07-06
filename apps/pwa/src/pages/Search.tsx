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
  const { transactions, categories } = useApp()
  
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all')
  const [showFilters, setShowFilters] = useState(false)

  const searchHistory = ['星巴克', '餐饮', '工资']

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      
      // Search query
      if (query) {
        const q = query.toLowerCase()
        const searchableText = [
          t.categoryName,
          t.note,
          t.accountName,
          t.amount.toString(),
          t.date,
        ].filter(Boolean).join(' ').toLowerCase()
        
        return searchableText.includes(q)
      }
      
      return true
    })
  }, [transactions, query, typeFilter])

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-[#c96442]/20 text-[#c96442] rounded px-0.5">{part}</mark>
        : part
    )
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 px-4 pt-3 pb-2 ${theme === 'dark' ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <X size={24} className={theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#5e5d59]'} />
          </button>
          <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full ${
            theme === 'dark' ? 'bg-[#30302e]' : 'bg-white'
          }`}>
            <Search size={18} className={theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索金额、分类、备注..."
              autoFocus
              className={`flex-1 bg-transparent outline-none text-sm ${
                theme === 'dark' ? 'text-[#faf9f5] placeholder-[#87867f]' : 'text-[#141413] placeholder-[#b0aea5]'
              }`}
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X size={16} className={theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'} />
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full ${showFilters ? 'bg-[#c96442] text-white' : theme === 'dark' ? 'bg-[#30302e] text-[#b0aea5]' : 'bg-white text-[#5e5d59]'}`}
          >
            <Filter size={20} />
          </button>
        </div>
      </header>

      {/* Filters */}
      {showFilters && (
        <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-[#3d3d3a] bg-[#141413]' : 'border-[#f0eee6] bg-[#f5f4ed]'}`}>
          <div className="flex gap-2">
            {(['all', 'expense', 'income', 'transfer'] as const).map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                  ${typeFilter === type 
                    ? 'bg-[#c96442] text-white' 
                    : theme === 'dark' ? 'bg-[#30302e] text-[#b0aea5]' : 'bg-white text-[#5e5d59]'
                  }`}
              >
                {type === 'all' ? '全部' : type === 'expense' ? '支出' : type === 'income' ? '收入' : '转账'}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="px-4 pb-4">
        {/* Search Results */}
        {query ? (
          <div>
            <div className={`text-sm mb-3 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
              找到 {filteredTransactions.length} 条结果
            </div>
            
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
              <div className={`text-center py-12 ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
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
                <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
                  搜索历史
                </h3>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.map(term => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm
                        ${theme === 'dark' ? 'bg-[#30302e] text-[#b0aea5]' : 'bg-white text-[#5e5d59]'}`}
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
              <h3 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
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
