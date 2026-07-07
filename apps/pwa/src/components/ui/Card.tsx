import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

export default function Card({ children, className = '', onClick, hoverable = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-surface rounded-3xl p-5 shadow-soft transition-all duration-200
        ${hoverable ? 'active:scale-[0.98] cursor-pointer hover:shadow-soft-lg' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
