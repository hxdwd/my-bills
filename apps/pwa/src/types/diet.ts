export type PeriodType = 'weekly' | 'monthly'

export interface DietControlItem {
  id: string
  name: string
  icon: string
  limitType: PeriodType
  limitCount: number
  color: string
  createdAt: string
}

// 单条饮食记录：仅保留饮食本身必须的信息。
// id / itemId / amount / note 全部去除——
//  - 记录是追加型数组，无需逐条 id；归属由字典键（itemId）承担；
//  - amount / note 属交易信息，若关联到账单则通过 transactionId 去账单表匹配。
export interface DietRecord {
  date: string // YYYY-MM-DD
  name: string // 这次具体吃了什么（默认取控制项名，可改）
  transactionId: string | null // 可选：关联的账单 uuid；其余交易字段由账单表提供
}

// 某月的记录字典：键为 itemId，值为该控制项当月记录数组。
export type DietMonthRecords = Record<string, DietRecord[]>

// 前端内存态装配（不再对应某个数据库 key）。
export interface DietControlData {
  items: DietControlItem[]
  monthRecords: DietMonthRecords
}
