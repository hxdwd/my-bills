// 持仓批量导入解析器
// 输入：用户从理财 App 复制的持仓文本（截图识文 / 粘贴）
// 用户粘贴前先在 UI 选择资产类别（大A股票 / 基金 / 港股 / 美股），
// 解析器据此确定市场标签与解析策略，不再靠数值特征硬猜类别。
// 解析策略由「数据完备度」决定（与类别正交）：
//   - 精确模式：文本含 数量 + 成本/现价 → 直接采用，不查行情、不反推
//   - 反推模式：文本只有 市值 + 持有收益（基金常见）→ 按类别查行情取现价反推
// 输出结构化资产列表。
import type { Market } from './quoteApi'

// 资产类别（UI 选择条）：大A股票 / 基金 / 港股 / 美股
export type ImportMode = 'CNA' | 'FUND' | 'HK' | 'US'

const MODE_MARKET: Record<ImportMode, Market> = {
  CNA: 'CN',
  FUND: 'FUND',
  HK: 'HK',
  US: 'US',
}
const MODE_LABEL: Record<ImportMode, string> = {
  CNA: 'A股',
  FUND: '基金',
  HK: '港股',
  US: '美股',
}

export interface ParsedHolding {
  name: string
  market: Market
  marketLabel: string
  marketValue: number | null   // 持有金额（市值）——反推模式必需
  holdProfit: number | null    // 持有收益（反推模式用）——解析不到为 null
  quantity: number | null      // 数量（股/份/手）——精确模式用
  costPrice: number | null     // 成本价（买入价）——精确模式用
  currentPrice: number | null  // 现价/最新价——精确模式优先用（校验/反推现价）
  // 来源标记：true=文本已给精确值（不查行情），false=需反推
  precise: boolean
}

// 类型关键词（用于市场推断 + 类型行判定）
const TYPE_WORDS = ['基金', 'ETF', '指数', '混合', '债券', '货币', '理财', '股票', '黄金',
  '港股', '美股', 'A股', '联接', 'LOF', 'QDII', 'FOF', '进阶', '金选', '沪', '深', '科创', '创业',
  '纳斯达克', '纽交所', '道琼斯', '标普', '恒生', '主板', '创业板', '科创板', '中小板', '港股通']

// 类型关键词 → 市场
const TYPE_RULES: { re: RegExp; market: Market; label: string }[] = [
  { re: /黄金|金条|AU|积存金/, market: 'GOLD', label: '黄金' },
  { re: /美股|纳斯达克|纽交所|道琼斯|USStock/, market: 'US', label: '美股' },
  { re: /港股|恒生|HK|H股/, market: 'HK', label: '港股' },
  { re: /ETF|指数|联接|LOF|QDII|FOF|混合|债券|货币|基金|理财/, market: 'FUND', label: '基金' },
  { re: /A股|沪|深|创业板|科创/, market: 'CN', label: 'A股' },
]

function inferMarket(text: string, fallback: Market = 'CN'): { market: Market; label: string } {
  for (const r of TYPE_RULES) {
    if (r.re.test(text)) return { market: r.market, label: r.label }
  }
  return { market: fallback, label: '股票' }
}

// 类型 / 市场 / 行业 / 营销 等「非资产名实质」噪声词
// 用于区分「具体资产名」与「纯类型/行业描述行」（如 基金、纳斯达克、食品饮料、进阶理财）
const NOISE_WORDS = [
  ...TYPE_WORDS,
  '纳斯达克', '纽交所', '道琼斯', '标普', '恒生', '主板', '创业板', '科创板', '中小板', '港股通',
  '食品饮料', '医药', '医疗', '科技', '消费', '银行', '新能源', '半导体', '化工', '白酒',
  '煤炭', '地产', '汽车', '保险', '证券', '电力', '军工', '有色', '农业', '传媒', '通信',
  '计算机', '电子', '钢铁', '机械', '环保', '建筑', '交通运输', '产业', '行业', '主题',
  '稳健', '成长', '价值', '优选', '精选', '金选', '分红', '定期', '活期', '现金', '宝', '盈', '利',
]

// 去除噪声词后剩余的中文数（用于判断一行是否为「具体资产名」还是「纯类型/行业标签」）
function residualCn(line: string): number {
  let s = line
  for (const w of NOISE_WORDS) s = s.split(w).join('')
  s = s.replace(/[A-Za-z0-9\s%\+\-−·.、，,。]/g, '')
  return (s.match(/[一-龥]/g) || []).length
}

// 金额解析：支持千分位、正负号（含全角 −）、小数点；过滤占比/收益率等无效行
function parseAmount(line: string): number | null {
  if (/占比|收益率|比例|仓位|％|%/ .test(line)) return null
  const norm = line.replace(/−/g, '-')
  const m = norm.match(/-?\d[\d,]*\.?\d*/)
  if (!m) return null
  const n = parseFloat(m[0].replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// 是否像「纯代码行」（不应当作名称/市值）：6 位 A股/基金代码、或 字母+数字证券代号
function looksLikeCode(line: string): boolean {
  const s = line.trim()
  if (/^\d{6}$/.test(s)) return true                       // 600519
  if (/^[A-Za-z]{1,5}\d{4,6}$/.test(s)) return true        // AAPL / 00700
  if (/^[A-Za-z]{2,}\s+\d{4,6}$/.test(s)) return false     // 允许 "HSI 12345" 这种带名
  return false
}

// 带标签的金额行：从行中提取「数量 / 成本 / 现价 / 市值 / 持有收益」
// 标签词优先级：含多个标签时取最具体的（现价 > 成本 > 数量 > 市值 > 收益）
const LABEL_PATTERNS: { re: RegExp; kind: 'qty' | 'cost' | 'cur' | 'mv' | 'profit' }[] = [
  { re: /现价|最新价|市价|最新|实时价/, kind: 'cur' },
  { re: /成本|买入价|成本价|开仓价/, kind: 'cost' },
  { re: /持仓|持股|数量|股数|份额|份数|持有数量/, kind: 'qty' },
  { re: /市值|持有金额|资产金额|最新市值/, kind: 'mv' },
  { re: /盈亏|收益|浮动盈亏|持仓盈亏|累计盈亏/, kind: 'profit' },
]

// 判断一行是否带「数量/成本/现价/市值/收益」标签，并返回其数值。
// 命中标签的行不是资产名、也不是类型行，应直接归位到对应字段。
function matchLabelKind(line: string): { kind: 'qty' | 'cost' | 'cur' | 'mv' | 'profit'; val: number } | null {
  if (/%|％/.test(line)) return null // 收益率行不抽
  const amt = parseAmount(line)
  if (amt == null) return null
  for (const p of LABEL_PATTERNS) {
    if (p.re.test(line)) return { kind: p.kind, val: amt }
  }
  return null
}

// 名称行：有具体资产名。
//  - 含中文且「去噪后实质中文 ≥ 2」（基金/股票/黄金名，可含代码数字如 沪深300、AU9999）
//    噪声词（类型/市场/行业/营销）已全部剥离，纯类型行 residualCn=0 自然被排除
//  - 或含英文字母且像证券名（Apple Inc.、HSI 等）
function isNameLine(line: string): boolean {
  const s = line.trim()
  if (s.length === 0 || s.length > 50) return false
  if (looksLikeCode(s)) return false
  if (matchLabelKind(line)) return false // 带「持仓/成本/现价/市值/收益」标签的行不是资产名
  if (residualCn(s) >= 2) return true
  // 英文/港股名：带常见证券后缀，或首字母大写的多词
  // 排除「代码 + 市场」组合（如 "AAPL 纳斯达克"），这类应判为类型行
  if (/^[A-Za-z]{1,6}\s+(纳斯达克|纽交所|恒生|港股|美股|主板|创业板|科创板|ETF|LOF|指数)$/i.test(s)) return false
  if (/Inc\.|Corp\.|ETF|Ltd\.|Holding|Group|Index/i.test(s)) return true
  const words = s.split(/[\s.,]+/).filter(Boolean)
  if (words.length >= 2 && /^[A-Z][a-zA-Z]*$/.test(words[0])) return true
  return false
}

// 类型行：含类型词、去除后几乎无中文（整行基本就是类型词）
function isTypeLine(line: string): boolean {
  if (looksLikeCode(line.trim())) return false
  if (parseAmount(line) != null) return false
  if (residualCn(line) >= 2) return false
  return TYPE_WORDS.some(w => line.includes(w))
}

/* ----------------------------- 表头列对齐模式 ----------------------------- */

// 表头列名 → 语义
type ColKind = 'name' | 'dayProfit' | 'holdProfit' | 'totalProfit' | 'rate' | 'ignore'
const COL_HEADERS: { re: RegExp; kind: ColKind }[] = [
  { re: /名称|证券|标的|基金名|产品/, kind: 'name' },
  { re: /日收益|当日|今日/, kind: 'dayProfit' },
  { re: /持有收益|持仓收益|累积收益|累计收益$|浮动盈亏|持仓盈亏/, kind: 'holdProfit' },
  { re: /累计收益|总收益|历史收益/, kind: 'totalProfit' },
  { re: /收益率|涨跌|涨幅|比率/, kind: 'rate' },
]

function classifyHeaderCell(cell: string): ColKind {
  for (const h of COL_HEADERS) if (h.re.test(cell)) return h.kind
  return 'ignore'
}

// 把一行拆成列：优先按制表符，其次按 ≥2 连续空格，最后按全角空格
function splitColumns(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(s => s.trim()).filter(s => s.length > 0)
  const bySpaces = line.split(/\s{2,}/).map(s => s.trim()).filter(s => s.length > 0)
  if (bySpaces.length >= 2) return bySpaces
  // 退化为按单个空白拆分（部分识文会把列挤在一起，再用金额边界切）
  return line.split(/\s+/).map(s => s.trim()).filter(s => s.length > 0)
}

// 检测是否存在表头行（含 ≥2 个已知列语义）
function detectHeader(lines: string[]): { headerLineIndex: number; kinds: ColKind[] } | null {
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const cells = splitColumns(lines[i])
    if (cells.length < 2) continue
    const kinds = cells.map(classifyHeaderCell).filter(k => k !== 'ignore')
    const hasName = cells.some(c => classifyHeaderCell(c) === 'name')
    if (hasName && kinds.length >= 2) {
      return { headerLineIndex: i, kinds: cells.map(classifyHeaderCell) }
    }
  }
  return null
}

// 表头模式解析：找到表头后，逐行按相同列结构提取
// 关键：识文常出现「表头列名」与「数据列」错位（如表头说持有收益，数据那列实为市值）。
// 因此不机械按表头语义取列，而是用【数值特征】判定：
//   市值列 = name 之后、无 +/-、无 %、且量级通常最大的纯正数
//   持有收益列 = 带符号（或量级远小于市值）的金额列
function parseWithHeader(text: string, mode: ImportMode): ParsedHolding[] | null {
  const lines = text.split(/\r?\n/).map(l => l.trim())
  const hdr = detectHeader(lines)
  if (!hdr) return null

  const nameIdx = hdr.kinds.findIndex(k => k === 'name')
  const out: ParsedHolding[] = []

  for (let i = hdr.headerLineIndex + 1; i < lines.length; i++) {
    const cells = splitColumns(lines[i])
    if (cells.length === 0) continue
    // 跳过表头重复 / 汇总 / 非数据行
    if (/合计|总计|总市值|全部|累计收益排序|投资增值|收益明细|交易记录/.test(lines[i])) continue
    if (classifyHeaderCell(cells[0]) !== 'ignore' && cells.length >= 2 && hdr.kinds.includes(classifyHeaderCell(cells[0]))) continue

    const nameCell = cells[nameIdx]
    if (!nameCell || !isNameLine(nameCell)) continue

    // 收集 name 列之后的所有金额单元格（跳过收益率列）
    type Cell = { raw: string; val: number; signed: boolean }
    const amts: Cell[] = []
    for (let c = nameIdx + 1; c < cells.length; c++) {
      const raw = cells[c]
      if (/%|％/.test(raw)) continue
      const v = parseAmount(raw)
      if (v == null) continue
      amts.push({ raw, val: Math.abs(v), signed: /[+\-−]/.test(raw) })
    }
    if (amts.length === 0) continue

    // 市值列：选无符号且数值最大者（市值通常远大于收益）
    const unsigned = amts.filter(a => !a.signed)
    let mvCell: Cell
    if (unsigned.length > 0) {
      mvCell = unsigned.reduce((m, a) => (a.val > m.val ? a : m), unsigned[0])
    } else {
      mvCell = amts.reduce((m, a) => (a.val > m.val ? a : m), amts[0])
    }
    const mv = mvCell.val

    // 持有收益列：在带符号金额中，日收益量级通常最小、累计收益（若有）通常最大，
    // 持有收益居中——故取「带符号金额里绝对值最大者」最稳（日收益几乎总远小于持有收益）。
    const rest = amts.filter(a => a !== mvCell)
    const signedRest = rest.filter(a => a.signed)
    let holdCell: Cell | null = null
    if (signedRest.length > 0) {
      holdCell = signedRest.reduce((m, a) => (a.val > m.val ? a : m), signedRest[0])
    } else if (rest.length > 0) {
      // 无带符号数时，取与市值量级差异最大者（持有收益通常 << 市值）
      holdCell = rest.reduce((m, a) => (Math.abs(a.val - mv) > Math.abs(m.val - mv) ? a : m), rest[0])
    }

    let hold: number | null = null
    if (holdCell) {
      const h = parseAmount(holdCell.raw) // 保留正负号
      if (h != null) hold = h
    }

    // 表头列对齐布局一般是基金/理财导出（市值 + 持有收益分列），属反推场景，
    // 市场由用户选择的 mode 决定（不再靠文本类型词猜）。
    const market = MODE_MARKET[mode]
    out.push({
      name: nameCell.trim(),
      market,
      marketLabel: MODE_LABEL[mode],
      marketValue: mv,
      holdProfit: hold,
      quantity: null,
      costPrice: null,
      currentPrice: null,
      precise: false,
    })
  }

  return out.length > 0 ? out : null
}

/* ----------------------------- 逐行堆叠模式 ----------------------------- */

/**
 * 解析持仓文本。
 * @param mode 用户在 UI 选择的资产类别（大A股票 / 基金 / 港股 / 美股），
 *             决定市场标签与反推时查询的行情接口。
 * 解析策略由数据完备度决定：
 *   - 文本含 数量 + 成本/现价（带标签或位置可识别）→ 精确模式（precise=true），直接采用，不查行情
 *   - 仅含 市值 + 持有收益 → 反推模式（precise=false），由 WealthImport 查行情反推
 */
export function parseHoldingsText(text: string, mode: ImportMode = 'CNA'): ParsedHolding[] {
  const cleaned = (text || '').replace(/\r/g, '').trim()
  if (!cleaned) return []

  // 优先尝试表头列对齐模式（基金/理财导出常见，属反推场景）
  const byHeader = parseWithHeader(cleaned, mode)
  if (byHeader && byHeader.length > 0) return byHeader

  // 兜底：逐行堆叠模式（应对无表头粘贴）
  const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const out: ParsedHolding[] = []
  const market = MODE_MARKET[mode]
  const marketLabel = MODE_LABEL[mode]

  type Amt = { val: number; signed: boolean; signedVal: number }
  // 显式标签抽取的值（带「持仓/成本/现价」前缀时）
  type Draft = {
    name: string
    market: Market
    marketLabel: string
    amounts: Amt[]
    qty: number | null
    cost: number | null
    cur: number | null
    labelMv: number | null
    labelProfit: number | null
  }
  let cur: Draft | null = null

  const isCodeOrDescLine = (line: string): boolean => {
    const s = line.trim()
    if (looksLikeCode(s)) return true
    if (/^\d{6}\s/.test(s) || /\s\d{6}$/.test(s)) return true // "600519 食品饮料"
    return false
  }

  const flush = () => {
    if (!cur || !cur.name) { cur = null; return }
    const amts = cur.amounts
    if (amts.length === 0 && cur.qty == null && cur.labelMv == null) { cur = null; return }

    // 市值：标签优先，否则取无符号最大者
    let mv: number | null = cur.labelMv
    if (mv == null && amts.length > 0) {
      const unsigned = amts.filter(a => !a.signed)
      mv = unsigned.length > 0
        ? unsigned.reduce((m, a) => (a.val > m.val ? a : m), unsigned[0]).val
        : amts.reduce((m, a) => (a.val > m.val ? a : m), amts[0]).val
    }

    // 持有收益：标签优先，否则从带符号数中取
    let hold: number | null = cur.labelProfit
    if (hold == null && amts.length > 0) {
      const signed = amts.filter(a => a.signed).map(a => a.signedVal)
      if (signed.length >= 2) hold = signed[1]
      else if (signed.length === 1) hold = Math.abs(signed[0]) / (mv || 1) < 0.05 ? null : signed[0]
    }

    // 精确模式值：标签已给优先；否则在无标签金额里按位置兜底（数量→成本→现价）
    let qty = cur.qty
    let cost = cur.cost
    let curP = cur.cur
    if (qty == null || cost == null) {
      // 收集「非市值、非带符号收益」的无符号数，按出现顺序兜底为 [数量, 成本, 现价]
      // 跳过与数量相等的重复值（「持仓 100 / 可用 100」常重复出现）
      const rest = amts
        .filter(a => !a.signed && a.val !== (mv ?? -1))
        .map(a => a.val)
      const takeNext = (exclude?: number | null) => {
        while (rest.length && rest[0] === exclude) rest.shift()
        return rest.length ? rest.shift()! : null
      }
      if (qty == null) qty = takeNext()
      if (cost == null) cost = takeNext(qty)
      if (curP == null) curP = takeNext(qty)
    }

    // 精确模式判定：有数量且有成本（或现价）即视为精确，不再反推
    const precise = qty != null && (cost != null || curP != null)

    out.push({
      name: cur.name,
      market,
      marketLabel,
      marketValue: mv,
      holdProfit: hold,
      quantity: qty,
      costPrice: cost,
      currentPrice: curP,
      precise,
    })
    cur = null
  }

  for (const line of lines) {
    const isName = isNameLine(line)
    const isType = isTypeLine(line)
    const amt = parseAmount(line)
    const labeled = matchLabelKind(line)

    if (isName) {
      flush()
      const inf = inferMarket(line, market)
      // 名称内的类型词仅在「基金」判定上辅助（如用户选大A却贴了基金名），但主市场仍以 mode 为准
      const finalMarket = mode === 'CNA' && /基金|ETF|联接|LOF|QDII|FOF|混合|债券|货币/.test(line) ? 'FUND' : market
      cur = {
        name: line,
        market: finalMarket,
        marketLabel: finalMarket === 'FUND' ? '基金' : marketLabel,
        amounts: [],
        qty: null, cost: null, cur: null, labelMv: null, labelProfit: null,
      }
      continue
    }

    if (isType && cur) {
      const inf = inferMarket(line, cur.market)
      if (mode === 'CNA' && inf.market === 'FUND') { cur.market = 'FUND'; cur.marketLabel = '基金' }
      continue
    }

    // 带标签的金额行：直接归位（持仓/成本/现价/市值/收益）
    if (labeled && cur) {
      if (labeled.kind === 'qty') cur.qty = labeled.val
      else if (labeled.kind === 'cost') cur.cost = labeled.val
      else if (labeled.kind === 'cur') cur.cur = labeled.val
      else if (labeled.kind === 'mv') cur.labelMv = labeled.val
      else if (labeled.kind === 'profit') cur.labelProfit = labeled.val
      continue
    }

    // 无标签金额：收入 amounts 供反推/位置兜底
    if (amt != null && cur && !isCodeOrDescLine(line)) {
      const signed = /[+\-−]/.test(line)
      cur.amounts.push({ val: Math.abs(amt), signed, signedVal: signed ? amt : Math.abs(amt) })
      continue
    }
  }
  flush()
  return out
}
