import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
  
  const variants = {
    primary: 'bg-[#c96442] text-white hover:bg-[#b85a3a] shadow-sm',
    secondary: 'bg-[#e8e6dc] text-[#4d4c48] hover:bg-[#dedad0]',
    ghost: 'bg-transparent text-[#5e5d59] hover:bg-[#e8e6dc]',
    danger: 'bg-[#e05555] text-white hover:bg-[#d04545]',
  }
  
  const sizes = {
    sm: 'h-7 px-3 text-xs rounded-lg gap-1',
    md: 'h-9 px-4 text-sm rounded-xl gap-1.5',
    lg: 'h-11 px-6 text-base rounded-xl gap-2',
  }

  return (
    <button
      ref={ref}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
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
