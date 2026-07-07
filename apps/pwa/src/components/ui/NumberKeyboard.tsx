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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-brand-tint safe-area-bottom shadow-soft-lg">
      {/* Quick amounts */}
      <div className="flex gap-2 p-3 border-b border-brand-tint">
        {[100, 500, 1000, 2000].map((amount) => (
          <button
            key={amount}
            onClick={() => onAmountSet?.(amount.toString())}
            className="
              flex-1 h-9 rounded-2xl
              bg-brand-tint
              text-sm font-medium
              text-ink
              hover:bg-brand-soft active:scale-95
              transition-all
            "
          >
            ¥{amount}
          </button>
        ))}
      </div>

      {/* Keyboard */}
      <div className="grid grid-cols-3 gap-px bg-brand-tint">
        {keys.flat().map((key) => (
          <button
            key={key}
            onClick={() => handleKeyPress(key)}
            className="
              h-14 flex items-center justify-center
              bg-surface
              text-xl font-amount font-medium
              text-ink
              hover:bg-brand-tint/50 active:bg-brand-tint
              transition-colors
            "
          >
            {key === 'del' ? (
              <Delete size={24} className="text-ink-2" />
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
              w-full h-[52px] rounded-2xl
              bg-brand text-ink font-semibold text-base
              hover:bg-brand-strong active:scale-[0.98]
              transition-all shadow-soft-brand
            "
          >
            {confirmText}
          </button>
        </div>
      )}
    </div>
  );
}
