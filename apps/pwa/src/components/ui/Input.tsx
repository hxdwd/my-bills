import React, { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  leftIcon,
  rightIcon,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm text-text-secondary mb-1.5 dark:text-dark-text">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          className={`
            w-full h-11 px-4 rounded-md
            bg-bg-secondary border border-border-light
            text-text-primary placeholder:text-text-tertiary
            dark:bg-dark-surface dark:border-dark-border dark:text-dark-text dark:placeholder:text-dark-text
            transition-all duration-200
            focus:border-brand focus:ring-2 focus:ring-brand/20
            disabled:opacity-50 disabled:cursor-not-allowed
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${error ? 'border-expense focus:border-expense focus:ring-expense/20' : ''}
            ${className}
          `}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-expense">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

// 金额输入框
interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
  onChange: (value: string) => void;
  currency?: string;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(({
  value,
  onChange,
  currency = '¥',
  className = '',
  ...props
}, ref) => {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <span className="text-2xl font-amount text-text-secondary dark:text-dark-text">
        {currency}
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          // 只允许数字和小数点
          if (/^\d*\.?\d{0,2}$/.test(val)) {
            onChange(val);
          }
        }}
        className="
          w-full max-w-[200px] text-4xl font-amount font-semibold
          text-center bg-transparent border-none
          text-text-primary dark:text-dark-text
          focus:outline-none
        "
        placeholder="0.00"
        {...props}
      />
    </div>
  );
});

AmountInput.displayName = 'AmountInput';
