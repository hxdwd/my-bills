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
        <label className="block text-sm text-ink-2 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          className={`
            w-full h-12 px-4 rounded-2xl
            bg-bg border border-transparent
            text-ink placeholder:text-ink-2/70
            transition-all duration-200
            focus:bg-surface focus:border-brand/40 focus:ring-2 focus:ring-brand/15
            disabled:opacity-50 disabled:cursor-not-allowed
            ${leftIcon ? 'pl-11' : ''}
            ${rightIcon ? 'pr-11' : ''}
            ${error ? 'border-danger/50 focus:border-danger focus:ring-danger/15' : ''}
            ${className}
          `}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-2">
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-danger">{error}</p>
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
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      <span className="text-3xl font-amount text-ink-2">
        {currency}
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (/^\d*\.?\d{0,2}$/.test(val)) {
            onChange(val);
          }
        }}
        className="
          w-full max-w-[220px] text-[44px] leading-none font-amount font-bold
          text-center bg-transparent border-none
          text-ink
          focus:outline-none
        "
        placeholder="0.00"
        {...props}
      />
    </div>
  );
});

AmountInput.displayName = 'AmountInput';
