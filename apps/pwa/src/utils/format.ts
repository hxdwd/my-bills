export function formatCurrency(amount: number, showSign = false): string {
  const sign = showSign && amount > 0 ? '+' : '';
  return `${sign}¥${Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(date: Date | string, format: 'full' | 'short' | 'time' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (format === 'time') {
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (format === 'short') {
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    });
  }

  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  return `${year}年${parseInt(m)}月`;
}

export function getMonthRange(month: string): { start: Date; end: Date } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(year, m - 1, 1);
  const end = new Date(year, m, 0);
  return { start, end };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
