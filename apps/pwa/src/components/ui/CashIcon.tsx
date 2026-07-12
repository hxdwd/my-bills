import type { Currency } from '../../utils/currency'

const META: Record<Currency, { symbol: string; color: string; bg: string }> = {
  CNY: { symbol: '¥', color: '#c96442', bg: '#fff3ec' },
  USD: { symbol: '$', color: '#2f6f4f', bg: '#eaf5ee' },
  HKD: { symbol: 'HK$', color: '#3b5b9a', bg: '#eaf0fa' },
}

interface Props {
  currency: Currency
  size?: number
  className?: string
}

// 矢量纸质钞票图标：零依赖、风格与现有扁平 UI 统一
export default function CashIcon({ currency, size = 28, className = '' }: Props) {
  const m = META[currency] ?? META.CNY
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      className={className}
      role="img"
      aria-label={currency}
    >
      <rect x="2" y="5" width="24" height="18" rx="3" fill={m.bg} stroke={m.color} strokeWidth="1.4" />
      <circle cx="14" cy="14" r="5.4" fill="none" stroke={m.color} strokeWidth="1.2" opacity="0.55" />
      <circle cx="14" cy="14" r="2.2" fill={m.color} opacity="0.35" />
      <text
        x="14"
        y="14"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={currency === 'HKD' ? 8 : 11}
        fontWeight="700"
        fill={m.color}
        fontFamily="system-ui, sans-serif"
      >
        {m.symbol}
      </text>
    </svg>
  )
}
