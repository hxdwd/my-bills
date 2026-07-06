import React, { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PageContainer({ children, className = '', noPadding = false }: PageContainerProps) {
  return (
    <main className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-4'} ${className}`}>
      {children}
    </main>
  );
}
