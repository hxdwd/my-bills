import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface HeaderProps {
  title?: string;
  showMonthNav?: boolean;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  rightAction?: React.ReactNode;
}

export function Header({
  title,
  showMonthNav = false,
  selectedMonth = '',
  onMonthChange,
  rightAction,
}: HeaderProps) {
  const { toggleTheme } = useTheme();

  const formatMonth = (month: string) => {
    if (!month) return '';
    const [year, m] = month.split('-');
    return `${year}年${parseInt(m)}月`;
  };

  const changeMonth = (delta: number) => {
    if (!selectedMonth || !onMonthChange) return;
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(newMonth);
  };

  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top">
      <div className="flex items-center justify-between h-14 px-5">
        {/* Left */}
        <div className="flex items-center gap-1">
          {showMonthNav && (
            <>
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 -ml-2 text-ink-2 hover:text-ink hover:bg-brand-tint rounded-full transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-[15px] font-semibold text-ink min-w-[80px] text-center">
                {formatMonth(selectedMonth)}
              </span>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 -mr-2 text-ink-2 hover:text-ink hover:bg-brand-tint rounded-full transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          {!showMonthNav && title && (
            <h1 className="text-xl font-serif font-semibold text-ink">
              {title}
            </h1>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1">
          {rightAction}
          <button
            onClick={toggleTheme}
            className="p-2 text-ink-2 hover:text-ink hover:bg-brand-tint rounded-full transition-colors"
            aria-label="切换主题"
          >
            <span className="text-base">☀️</span>
          </button>
        </div>
      </div>
    </header>
  );
}
