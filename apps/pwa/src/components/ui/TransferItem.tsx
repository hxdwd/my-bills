import { Transaction } from '../../types'
import { formatCurrency } from '../../utils/format'

interface TransferItemProps {
  transfer: Transaction
  onClick?: () => void
}

// 转账专属卡片：展示 出账户 → 入账户、原币种金额 → 目标币种金额、手续费、汇率、日期。
// 不复用通用交易卡片，避免把转账"套"在交易模型上。
export default function TransferItem({ transfer: t, onClick }: TransferItemProps) {
  const fromAmt = t.fromAmount ?? t.amount
  const toAmt = t.toAmount ?? t.amount
  const fromCur = t.fromCurrency || 'CNY'
  const toCur = t.toCurrency || 'CNY'
  const hasFee = (t.fee ?? 0) > 0
  const hasRate = fromCur !== toCur && (t.exchangeRate ?? 1) !== 1

  const amountText = `${formatCurrency(fromAmt, false, false)} → ${formatCurrency(toAmt, false, false)}`

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3 p-3 rounded-2xl transition-all
        hover:bg-brand-tint/50
        ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}
      `}
    >
      {/* Icon 容器：转账浅蓝底 */}
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
        style={{ backgroundColor: '#5b8dee15' }}
      >
        🔄
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="font-medium text-ink truncate shrink-0">转账</span>
          {t.note && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 leading-relaxed bg-brand-tint text-ink truncate">
              {t.note}
            </span>
          )}
        </div>
        <div className="text-xs text-ink-2 mt-0.5 truncate">
          从 {t.accountName}（{fromCur}） → {t.toAccountName}（{toCur}）
        </div>
        {(hasFee || hasRate) && (
          <div className="text-[11px] text-ink-2 mt-0.5 truncate">
            {hasFee && `手续费 ${formatCurrency(t.fee ?? 0, false, false)}`}
            {hasFee && hasRate && ' · '}
            {hasRate && `汇率 ${t.exchangeRate}`}
          </div>
        )}
      </div>

      {/* Amount & date */}
      <div className="text-right shrink-0 max-w-[50%] min-w-0">
        <div className="font-bold font-amount break-amount amount-fluid text-ink">
          {amountText}
        </div>
        <div className="text-xs text-ink-2 break-amount mt-0.5">
          {t.date} {t.time}
        </div>
      </div>
    </div>
  )
}
