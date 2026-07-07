import React, { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PageContainer({ children, className = '', noPadding = false }: PageContainerProps) {
  return (
    <main className={`flex-1 overflow-y-auto bg-bg ${noPadding ? '' : 'px-5 py-4'} ${className}`}>
      {children}
    </main>
  );
}
