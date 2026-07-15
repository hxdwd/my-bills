import type { Currency } from '../../utils/currency'

const META: Record<Currency, { symbol: string; gradientStart: string; gradientEnd: string; flag: string }> = {
  CNY: { symbol: '¥', gradientStart: '#c96442', gradientEnd: '#e8a87c', flag: '🇨🇳' },
  USD: { symbol: '$', gradientStart: '#2f6f4f', gradientEnd: '#5aad7f', flag: '🇺🇸' },
  HKD: { symbol: 'HK$', gradientStart: '#3b5b9a', gradientEnd: '#6b8ec8', flag: '🇭🇰' },
}

interface Props {
  currency: Currency
  size?: number
  className?: string
}

// 方案 D — 镂空圆章 + 渐变底 + 国旗 emoji + 大字币种符号
export default function CashIcon({ currency, size = 68, className = '' }: Props) {
  const m = META[currency] ?? META.CNY
  const w = size
  const h = Math.round(size * 0.5)
  const gradientId = `cash-grad-${currency}`
  const symFontSize = currency === 'HKD' ? 10 : 13
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 68 34"
      className={className}
      role="img"
      aria-label={currency}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={m.gradientStart} />
          <stop offset="100%" stopColor={m.gradientEnd} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="66" height="32" rx="5" fill={`url(#${gradientId})`} />
      <circle cx="20" cy="17" r="9" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.3" />
      <text
        x="20" y="21.5"
        textAnchor="middle"
        fontSize="13"
        fontFamily="system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"
      >
        {m.flag}
      </text>
      <text
        x="46" y="22"
        textAnchor="middle"
        fontSize={symFontSize}
        fontWeight="800"
        fill="rgba(255,255,255,0.95)"
        fontFamily="system-ui"
      >
        {m.symbol}
      </text>
    </svg>
  )
}
