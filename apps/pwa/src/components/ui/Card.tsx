import { ReactNode, forwardRef } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className = '', onClick, hoverable = false },
  ref
) {
  return (
    <div
      ref={ref}
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
})

export default Card
