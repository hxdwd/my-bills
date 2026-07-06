import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showClose?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  showClose = true,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />

      {/* Content */}
      <div
        className="
          relative w-full max-w-sm
          bg-bg-secondary dark:bg-dark-surface
          rounded-lg md:rounded-xl
          shadow-xl
          animate-scale-in
        "
      >
        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-dark-border">
            <h3 className="text-lg font-medium text-text-primary dark:text-dark-text font-serif">
              {title}
            </h3>
            {showClose && (
              <button
                onClick={onClose}
                className="p-1 -mr-1 text-text-tertiary hover:text-text-primary dark:text-dark-text dark:hover:text-dark-text transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
