import { useTheme } from '../../context/ThemeContext'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md'
  className?: string
}

export default function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  const { theme } = useTheme()

  const variants = {
    default: theme === 'dark' ? 'bg-[#4a4a47] text-[#faf9f5]' : 'bg-[#e8e6dc] text-[#4d4c48]',
    success: 'bg-[#2d8a5e]/10 text-[#2d8a5e]',
    warning: 'bg-[#f59e0b]/10 text-[#f59e0b]',
    danger: 'bg-[#e05555]/10 text-[#e05555]',
    info: 'bg-[#5b8dee]/10 text-[#5b8dee]',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  }

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  )
}
