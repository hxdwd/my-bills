import { useTheme } from '../../context/ThemeContext'

interface EmptyStateProps {
  icon: string
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const { theme } = useTheme()

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className={`text-5xl mb-4 ${theme === 'dark' ? 'opacity-70' : ''}`}>
        {icon}
      </div>
      <h3 className={`text-lg font-medium mb-2 ${theme === 'dark' ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
        {title}
      </h3>
      <p className={`text-sm text-center mb-6 ${theme === 'dark' ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-[#c96442] text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
