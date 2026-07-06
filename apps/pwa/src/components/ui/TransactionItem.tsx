import { useTheme } from '../../context/ThemeContext'

interface TagInfo {
  id: string
  name: string
  color: string
}

interface TransactionItemProps {
  icon: string
  iconBg?: string
  title: string
  subtitle?: string
  amount: number
  type: 'expense' | 'income' | 'transfer'
  account?: string
  tags?: TagInfo[]
  onClick?: () => void
}

export default function TransactionItem({
  icon,
  iconBg,
  title,
  subtitle,
  amount,
  type,
  account,
  tags,
  onClick
}: TransactionItemProps) {
  const { theme } = useTheme()

  const amountColor = type === 'expense' ? 'text-[#e05555]' : type === 'income' ? 'text-[#2d8a5e]' : 'text-[#5b8dee]'
  const amountPrefix = type === 'expense' ? '-' : type === 'income' ? '+' : ''
  const amountFormat = type === 'transfer' ? `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : `${amountPrefix}¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`

  return (
    <div 
      onClick={onClick}
      className={`
        flex items-center gap-3 p-3 rounded-xl transition-all
        ${theme === 'dark' ? 'hover:bg-[#30302e]' : 'hover:bg-[#faf9f5]'}
        ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}
      `}
    >
      {/* Icon */}
      <div 
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
        style={{ backgroundColor: iconBg || (theme === 'dark' ? '#3d3d3a' : '#f5f4ed') }}
      >
        {icon}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={`font-medium ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
          {title}
        </div>
        {subtitle && (
          <div className={`text-xs ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
            {subtitle}
          </div>
        )}
        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {tags.map(tag => (
              <span
                key={tag.id}
                className="text-[10px] px-1.5 py-px rounded border text-current font-medium shrink-0 leading-relaxed"
                style={{ 
                  borderColor: `${tag.color}40`,
                  backgroundColor: `${tag.color}15`,
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Amount & Account */}
      <div className="text-right shrink-0 max-w-[45%]">
        <div className={`font-medium font-mono break-amount ${amountColor}`}>
          {amountFormat}
        </div>
        {account && (
          <div className={`text-xs break-amount ${theme === 'dark' ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
            {account}
          </div>
        )}
      </div>
    </div>
  )
}
