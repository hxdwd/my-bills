// 金额缩写阈值：绝对值超过该值（默认 10000 元）才启用 k / 万 缩写，
// 否则一律保留标准两位小数，避免百元级账单被缩写成失真的不直观数值。
const COMPACT_THRESHOLD = 10000

// 格式化为带 ¥ 的金额字符串。
// - 默认（compact=false）：始终两位小数，如 -171.36。
// - compact=true 且 |amount| > 阈值：大额定额缩写，k=千 / 万=万，
//   如 12345 → ¥1.23万；-15800 → -¥1.58万。
// 注意：compact 缩写仍保留两位小数，且阈值以下绝不缩写，杜绝 ¥-0.2k 这类失真。
export function formatCurrency(amount: number, showSign = false, compact = false): string {
  const sign = showSign && amount > 0 ? '+' : '';
  const abs = Math.abs(amount);

  if (compact && abs > COMPACT_THRESHOLD) {
    if (abs >= 100000000) {
      return `${sign}¥${(abs / 100000000).toFixed(2)}亿`;
    }
    if (abs >= 10000) {
      return `${sign}¥${(abs / 10000).toFixed(2)}万`;
    }
    return `${sign}¥${(abs / 1000).toFixed(2)}k`;
  }

  return `${sign}¥${abs.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// 图表坐标轴等场景用的大额紧凑格式：低于阈值时返回整数/两位小数标准格式，
// 超过阈值才缩写，与 formatCurrency 共用同一阈值，保证全站一致。
export function formatCompact(amount: number): string {
  return formatCurrency(amount, false, true);
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
