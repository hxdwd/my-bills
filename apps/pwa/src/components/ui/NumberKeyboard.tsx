import React from 'react';
import { Delete } from 'lucide-react';

interface NumberKeyboardProps {
  onKeyPress: (key: string) => void;
  onDelete?: () => void;
  onConfirm?: () => void;
  onAmountSet?: (amount: string) => void;
  showConfirm?: boolean;
  confirmText?: string;
}

export function NumberKeyboard({
  onKeyPress,
  onDelete,
  onConfirm,
  onAmountSet,
  showConfirm = true,
  confirmText = '确认',
}: NumberKeyboardProps) {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'del'],
  ];

  const handleKeyPress = (key: string) => {
    if (key === 'del') {
      onDelete?.();
    } else {
      onKeyPress(key);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-bg-secondary dark:bg-dark-surface border-t border-border-light dark:border-dark-border safe-area-bottom">
      {/* Quick amounts */}
      <div className="flex gap-2 p-3 border-b border-border-light dark:border-dark-border">
        {[100, 500, 1000, 2000].map((amount) => (
          <button
            key={amount}
            onClick={() => onAmountSet?.(amount.toString())}
            className="
              flex-1 h-9 rounded-md
              bg-surface-warm dark:bg-dark-border
              text-sm font-medium
              text-text-primary dark:text-dark-text
              hover:bg-border-warm dark:hover:bg-dark-border/80
              active:scale-95
              transition-all
            "
          >
            ¥{amount}
          </button>
        ))}
      </div>

      {/* Keyboard */}
      <div className="grid grid-cols-3 gap-px bg-border-light dark:bg-dark-border">
        {keys.flat().map((key) => (
          <button
            key={key}
            onClick={() => handleKeyPress(key)}
            className="
              h-14 flex items-center justify-center
              bg-bg-secondary dark:bg-dark-surface
              text-xl font-amount font-medium
              text-text-primary dark:text-dark-text
              hover:bg-surface-warm/50 dark:hover:bg-dark-border/50
              active:bg-surface-warm dark:active:bg-dark-border
              transition-colors
            "
          >
            {key === 'del' ? (
              <Delete size={24} className="text-text-secondary dark:text-dark-text" />
            ) : (
              key
            )}
          </button>
        ))}
      </div>

      {/* Confirm button */}
      {showConfirm && (
        <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onConfirm}
            className="
              w-full h-12 rounded-lg
              bg-brand text-white font-medium
              hover:bg-brand-secondary active:scale-[0.98]
              transition-all
            "
          >
            {confirmText}
          </button>
        </div>
      )}
    </div>
  );
}
