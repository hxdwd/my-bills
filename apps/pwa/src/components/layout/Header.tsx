import React from 'react';
import { Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const { theme, toggleTheme } = useTheme();

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
    <header className="sticky top-0 z-40 bg-bg-primary/95 dark:bg-dark-bg/95 backdrop-blur-md border-b border-border-light dark:border-dark-border safe-area-top">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Left */}
        <div className="flex items-center gap-2">
          {showMonthNav && (
            <>
              <button
                onClick={() => changeMonth(-1)}
                className="p-1.5 -ml-1.5 text-text-secondary hover:text-text-primary dark:text-dark-text dark:hover:text-dark-text transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-medium text-text-primary dark:text-dark-text min-w-[80px] text-center">
                {formatMonth(selectedMonth)}
              </span>
              <button
                onClick={() => changeMonth(1)}
                className="p-1.5 -mr-1.5 text-text-secondary hover:text-text-primary dark:text-dark-text dark:hover:text-dark-text transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          {!showMonthNav && title && (
            <h1 className="text-lg font-serif font-medium text-text-primary dark:text-dark-text">
              {title}
            </h1>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {rightAction}
          <button
            onClick={toggleTheme}
            className="p-2 text-text-secondary hover:text-text-primary dark:text-dark-text dark:hover:text-dark-text transition-colors"
            aria-label="切换主题"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
