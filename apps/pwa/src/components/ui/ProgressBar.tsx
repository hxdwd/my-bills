interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
  bgColor?: string;
  height?: number;
  showPercentage?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max,
  color,
  bgColor,
  height = 8,
  showPercentage = false,
  className = '',
}: ProgressBarProps) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);
  const isOverBudget = value > max;

  const defaultColor = isOverBudget ? '#e05555' : (color || '#c96442');
  const defaultBg = bgColor || (document.documentElement.classList.contains('dark') ? '#3d3d3a' : '#e8e6dc');

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{
          height,
          backgroundColor: defaultBg,
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: defaultColor,
          }}
        />
      </div>
      {showPercentage && (
        <span
          className={`text-sm font-medium ${
            isOverBudget ? 'text-[#e05555]' : 'text-[var(--text-secondary)]'
          }`}
          style={{ minWidth: '40px', textAlign: 'right' }}
        >
          {percentage}%
        </span>
      )}
    </div>
  );
}
