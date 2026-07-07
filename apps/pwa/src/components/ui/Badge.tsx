interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
  size?: 'sm' | 'md'
  className?: string
}

export default function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-brand-tint text-ink',
    brand: 'bg-brand text-ink',
    success: 'bg-ok/10 text-ok',
    warning: 'bg-brand-soft/60 text-ink',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-brand-tint text-ink-2',
  }

  const sizes = {
    sm: 'px-2.5 py-0.5 text-[11px]',
    md: 'px-3 py-1 text-xs',
  }

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  )
}
