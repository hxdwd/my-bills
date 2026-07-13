// 金额缩写阈值：绝对值超过该值（默认 10000 元）才启用 k / 万 缩写，
// 否则一律保留标准两位小数，避免百元级账单被缩写成失真的不直观数值。
const COMPACT_THRESHOLD = 10000

// 格式化为带 ¥ 的金额字符串。
// 符号约定：
// - 金额为负时始终显示 '-'（财务严谨，净值/结余为负必须可见负号）。
// - 金额为正且 showSign=true 时显示 '+'（用于单笔收支、带符号合计）。
// - 金额为正的常规汇总（收入/支出/资产等）默认 showSign=false，无符号。
// - 缩写模式（compact=true 且 |amount| > 阈值）同样遵循以上符号规则。
// 注意：compact 缩写仍保留两位小数，且阈值以下绝不缩写，杜绝 ¥-0.2k 这类失真。
export function formatCurrency(amount: number, showSign = false, compact = false): string {
  const sign = amount < 0 ? '-' : showSign ? '+' : '';
  const abs = Math.abs(amount);

  if (compact && abs > COMPACT_THRESHOLD) {
    if (abs >= 100000000) {
      return `${sign}${(abs / 100000000).toFixed(2)}亿`;
    }
    if (abs >= 10000) {
      return `${sign}${(abs / 10000).toFixed(2)}万`;
    }
    return `${sign}${(abs / 1000).toFixed(2)}k`;
  }

  return `${sign}${abs.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// 图表坐标轴等场景用的大额紧凑格式：低于阈值时返回整数/两位小数标准格式，
// 超过阈值才缩写，与 formatCurrency 共用同一阈值，保证全站一致。
export function formatCompact(amount: number): string {
  return formatCurrency(amount, false, true);
}

// 根据金额位数动态计算等宽数字的 font-size（返回带单位的字符串，如 '0.85rem'）。
// 用途：在小屏手机上，超长数字（>8 位）自动缩小字号以避免撑破容器，
// 同时财务数字必须完整显示——本函数仅缩字号、绝不截断。
// 防御性：入参支持 number / string / null / undefined / 空串，非法值返回默认字号。
export function calcAmountFontSize(value: number | string | null | undefined): string {
  const STR_DEFAULT = '0.95rem'
  const raw = value === null || value === undefined ? '' : String(value)
  const trimmed = raw.trim()
  if (!trimmed) return STR_DEFAULT

  // 仅提取数字主体（去除 ¥ + - 等符号与千分位逗号），用于判断位数
  const digits = trimmed.replace(/[^\d.]/g, '').replace(/\./g, '')
  if (!digits) return STR_DEFAULT

  const len = digits.length
  if (len <= 8) return '0.95rem'
  if (len <= 11) return '0.85rem'
  if (len <= 14) return '0.75rem'
  return '0.68rem'
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
