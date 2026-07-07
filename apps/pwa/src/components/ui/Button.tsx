import { ButtonHTMLAttributes, forwardRef, useRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
  fullWidth?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  children,
  disabled,
  onClick,
  ...props
}, ref) => {
  const btnRef = useRef<HTMLButtonElement | null>(null)

  const baseStyles = 'relative inline-flex items-center justify-center font-semibold overflow-hidden transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed select-none'

  const variants = {
    // 主按钮：品牌金底 + 深墨字（保证对比度）
    primary: 'bg-brand text-ink shadow-soft-brand hover:bg-brand-strong',
    secondary: 'bg-brand-tint text-ink hover:bg-brand-soft',
    ghost: 'bg-transparent text-ink-2 hover:bg-brand-tint',
    danger: 'bg-danger text-white shadow-soft hover:brightness-95',
  }

  const sizes = {
    sm: 'h-9 px-4 text-sm rounded-2xl gap-1.5',
    md: 'h-11 px-5 text-[15px] rounded-2xl gap-2',
    lg: 'h-[52px] px-6 text-base rounded-2xl gap-2',
  }

  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current
    if (!btn || disabled || loading) return
    const rect = btn.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const wave = document.createElement('span')
    wave.className = 'ripple-wave'
    wave.style.width = wave.style.height = `${size}px`
    wave.style.left = `${e.clientX - rect.left - size / 2}px`
    wave.style.top = `${e.clientY - rect.top - size / 2}px`
    btn.appendChild(wave)
    setTimeout(() => wave.remove(), 500)
  }

  return (
    <button
      ref={(node) => {
        btnRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
      }}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={(e) => { handleRipple(e); onClick?.(e) }}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  )
})

Button.displayName = 'Button'
export default Button
