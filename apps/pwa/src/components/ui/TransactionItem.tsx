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
  const amountColor = type === 'expense' ? 'text-danger' : type === 'income' ? 'text-ok' : 'text-ink-2'
  const amountPrefix = type === 'expense' ? '-' : type === 'income' ? '+' : ''
  const amountFormat = type === 'transfer'
    ? `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    : `${amountPrefix}¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3 p-3 rounded-2xl transition-all
        hover:bg-brand-tint/50
        ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}
      `}
    >
      {/* Icon 容器：浅金底 */}
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
        style={{ backgroundColor: iconBg || '#FFF7E6' }}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink truncate">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-ink-2 mt-0.5 truncate">
            {subtitle}
          </div>
        )}
        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {tags.map(tag => (
              <span
                key={tag.id}
                className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 leading-relaxed bg-brand-tint text-ink"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Amount & Account */}
      <div className="text-right shrink-0 max-w-[45%]">
        <div className={`font-bold font-amount text-[15px] break-amount ${amountColor}`}>
          {amountFormat}
        </div>
        {account && (
          <div className="text-xs text-ink-2 break-amount mt-0.5">
            {account}
          </div>
        )}
      </div>
    </div>
  )
}
