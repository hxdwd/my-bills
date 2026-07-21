// 「人生进度」彩蛋的数据模型、文案池与计算工具。
// 约束：禁止出现死亡/死期等负面词汇，使用中性温暖表达。

export interface LifeGoal {
  id: string
  name: string
  emoji: string
  date: string // YYYY-MM-DD
  gradient: string // 对应 GRADIENTS 的 key
  createdAt: number
}

export interface LifeData {
  birthDate?: string // YYYY-MM-DD
  lifeExpectancy?: number // 默认 80
  goals?: LifeGoal[]
}

export const DEFAULT_LIFE_EXPECTANCY = 80

// 6 套预设渐变（金/暖/清新），用于倒计时卡片与进度环。
export const GRADIENTS: { key: string; name: string; from: string; to: string }[] = [
  { key: 'dawn', name: '晨曦', from: '#FFD56B', to: '#FF9F45' },
  { key: 'sunset', name: '落日', from: '#FFB347', to: '#FF6A88' },
  { key: 'warm', name: '暖阳', from: '#FFE29A', to: '#FFA99F' },
  { key: 'sea', name: '海蓝', from: '#A1C4FD', to: '#C2E9FB' },
  { key: 'mint', name: '青绿', from: '#43E97B', to: '#38F9D9' },
  { key: 'dream', name: '梦紫', from: '#C471F5', to: '#FA71CD' },
]

export function getGradient(key: string) {
  return GRADIENTS.find((g) => g.key === key) ?? GRADIENTS[0]
}

// 生命大环中心的「每日小诗」——按日稳定随机（dayOfYear 取模）。
const POEMS: string[] = [
  '且将新火试新茶，诗酒趁年华。',
  '人生如逆旅，我亦是行人。',
  '小舟从此逝，江海寄余生。',
  '山高月小，水落石出。',
  '万物皆有裂痕，那是光照进来的地方。',
  '你若安好，便是晴天。',
  '愿有岁月可回首，且以深情共白头。',
  '此时情绪此时天，无事小神仙。',
  '行到水穷处，坐看云起时。',
  '晚来天欲雪，能饮一杯无。',
  '春风十里不如你。',
  '生活明朗，万物可爱。',
]

// 下拉时浮现的随机名言（禁下拉同步，纯彩蛋）。
const QUOTES: string[] = [
  '把每一天，都过成自己喜欢的样子。',
  '慢慢来，比较快。',
  '你不必匆忙，也不必闪耀，做你自己就好。',
  '热爱可抵岁月漫长。',
  '日子常新，未来不远。',
  '愿你眼中总有光芒，活成自己想要的模样。',
  '所有的温柔，都值得被时间款待。',
  '今天也要好好吃饭，好好生活。',
  '把普通的事做好，就是不普通。',
  '心之所向，素履以往。',
]

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86400000)
}

export function dailyPoem(): string {
  return POEMS[dayOfYear(new Date()) % POEMS.length]
}

export function randomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)]
}

// —— 计算工具 ——

export interface LifeRingResult {
  percent: number
  age: number
  livedDays: number
  totalDays: number
}

export function computeLifeRing(
  birthDate: string,
  expectancy: number = DEFAULT_LIFE_EXPECTANCY
): LifeRingResult | null {
  const birth = new Date(birthDate + 'T00:00:00')
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  const livedMs = now.getTime() - birth.getTime()
  if (livedMs < 0) return null
  const end = new Date(birth)
  end.setFullYear(end.getFullYear() + expectancy)
  const totalMs = end.getTime() - birth.getTime()
  const ageMs = livedMs
  const msPerDay = 86400000
  return {
    percent: Math.min(100, (livedMs / totalMs) * 100),
    age: ageMs / (365.25 * msPerDay),
    livedDays: Math.floor(livedMs / msPerDay),
    totalDays: Math.floor(totalMs / msPerDay),
  }
}

export interface GranularityResult {
  year: number
  month: number
  week: number
  day: number
}

export function computeGranularity(now: Date = new Date()): GranularityResult {
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const endOfYear = new Date(now.getFullYear() + 1, 0, 1)
  const year = ((now.getTime() - startOfYear.getTime()) / (endOfYear.getTime() - startOfYear.getTime())) * 100

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const month = ((now.getTime() - startOfMonth.getTime()) / (endOfMonth.getTime() - startOfMonth.getTime())) * 100

  // 周：周一为起点
  const jsDay = now.getDay() // 0=Sun
  const weekday = (jsDay + 6) % 7 // 0=Mon..6=Sun
  const week = ((weekday + 1) / 7) * 100

  const secondsOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  const day = (secondsOfDay / 86400) * 100

  return { year, month, week, day }
}

export interface WeekCell {
  index: number
  lived: boolean
  isGoal: boolean
}

export function buildWeekGrid(
  birthDate: string,
  expectancy: number = DEFAULT_LIFE_EXPECTANCY,
  goalDates: string[] = []
): WeekCell[] {
  const birth = new Date(birthDate + 'T00:00:00')
  if (isNaN(birth.getTime())) return []
  const now = new Date()
  const livedWeeks = Math.floor((now.getTime() - birth.getTime()) / (7 * 86400000))
  const totalWeeks = Math.round(expectancy * 52)
  const goalTimes = goalDates
    .map((d) => new Date(d + 'T00:00:00').getTime())
    .filter((t) => !isNaN(t))
  return Array.from({ length: totalWeeks }, (_, i) => {
    const weekStart = birth.getTime() + i * 7 * 86400000
    const isGoal = goalTimes.some(
      (gt) => gt >= weekStart && gt < weekStart + 7 * 86400000
    )
    return { index: i, lived: i < livedWeeks, isGoal }
  })
}

export function daysUntil(date: string, now: Date = new Date()): number {
  const target = new Date(date + 'T00:00:00')
  if (isNaN(target.getTime())) return 0
  return Math.ceil((target.getTime() - now.getTime()) / 86400000)
}
