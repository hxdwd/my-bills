import { ReactNode } from 'react'
import { useTheme } from '../../context/ThemeContext'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

export default function Card({ children, className = '', onClick, hoverable = false }: CardProps) {
  const { theme } = useTheme()
  
  return (
    <div
      onClick={onClick}
      className={`
        rounded-2xl p-4 transition-all duration-200
        ${theme === 'dark' 
          ? 'bg-[#30302e] border border-[#3d3d3a]' 
          : 'bg-[#faf9f5] border border-[#f0eee6]'
        }
        ${hoverable ? 'hover:shadow-md active:scale-[0.98] cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
