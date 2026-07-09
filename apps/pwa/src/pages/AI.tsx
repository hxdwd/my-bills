import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useApp } from '../context/AppContext'
import Card from '../components/ui/Card'
import { Send, Sparkles, TrendingUp, Lightbulb, FileText, TrendingDown, AlertTriangle } from 'lucide-react'

type AIFeature = 'analysis' | 'suggestion' | 'report' | 'warning' | null

export default function AIPage() {
  const { theme } = useTheme()
  const { transactions, getMonthlyIncome, getMonthlyExpense, budgets } = useApp()
  const [input, setInput] = useState('')
  const [selectedFeature, setSelectedFeature] = useState<AIFeature>(null)
  const [messages, setMessages] = useState<{role: 'user' | 'ai'; content: string}[]>([
    { role: 'ai', content: '您好！我是您的 AI 财务助手。有什么我可以帮您分析的吗？' }
  ])

  const monthlyIncome = getMonthlyIncome()
  const monthlyExpense = getMonthlyExpense()

  const features = [
    { id: 'analysis' as AIFeature, icon: TrendingUp, label: '消费分析', color: '#a855f7', desc: '分析您的消费习惯' },
    { id: 'suggestion' as AIFeature, icon: Lightbulb, label: '预算建议', color: '#E5C45E', desc: '智能预算推荐' },
    { id: 'report' as AIFeature, icon: FileText, label: '月报生成', color: '#5b8dee', desc: '生成财务月报' },
    { id: 'warning' as AIFeature, icon: AlertTriangle, label: '异常提醒', color: '#e05555', desc: '消费异常预警' },
  ]

  const handleFeatureClick = (feature: AIFeature) => {
    setSelectedFeature(feature)
    let response = ''
    switch (feature) {
      case 'analysis':
        response = `📊 **消费分析报告**

根据您最近一个月的消费记录分析：

**支出结构：**
• 餐饮占比最高 (35%)，共 ¥1,860
• 购物次之 (35%)，共 ¥1,854
• 交通第三 (8%)，共 ¥420
• 娱乐 (6%)，共 ¥320

**发现：**
🔍 您在餐饮上的支出占比偏高
🔍 工作日外卖频率较高
🔍 周末娱乐消费稳定

💡 **建议**：考虑自带午餐，每周可节省约 ¥200`
        break
      case 'suggestion':
        response = `💡 **智能预算建议**

基于您过去3个月的消费数据，为您推荐：

| 分类 | 推荐预算 | 说明 |
|------|---------|------|
| 🍜 餐饮 | ¥2,200 | 降低15% |
| 🚗 交通 | ¥600 | 维持现状 |
| 🛒 购物 | ¥1,500 | 重点控制 |
| 🎮 娱乐 | ¥400 | 维持现状 |

**总预算建议：¥8,000**

预计可节省约 ¥500/月
是否采纳此建议？`
        break
      case 'report':
        response = `📅 **7月财务月报**

**收支概况：**
• 总收入：¥18,500
• 总支出：¥5,234
• 结余：¥13,266 (+12.3%)

**亮点：**
✅ 收入稳定增长
✅ 支出控制良好
✅ 存款率达71.7%

**需关注：**
⚠️ 购物超预算 ¥154
⚠️ 餐饮支出偏高

**下月目标：**
🎯 控制购物支出
🎯 减少外卖次数`
        break
      case 'warning':
        const overBudget = budgets.filter(b => b.spent > b.amount)
        response = overBudget.length > 0 
          ? `⚠️ **超支预警**

检测到以下分类超支：

${overBudget.map(b => `• ${b.categoryName}：已超支 ¥${(b.spent - b.amount).toLocaleString()}`).join('\n')}

**建议**：优先控制购物支出，避免进一步超支`
          : `✅ **暂无异常**

您本月的支出都在预算范围内，继续保持！

**健康指标：**
• 支出/收入比：28%
• 存款率：71.7%
• 预算执行率：65%`
        break
    }
    setMessages(prev => [...prev, { role: 'ai', content: response }])
  }

  const handleSend = () => {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: 'user', content: input }])
    setInput('')
    
    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: '感谢您的提问！作为您的 AI 财务助手，我会持续学习您的消费习惯，为您提供更精准的分析和建议。'
      }])
    }, 1000)
  }

  return (
    <div className={`min-h-screen bg-bg flex flex-col`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-5 pt-3 pb-2 `}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>
              AI 财务助手
            </h1>
            <p className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>
              智能分析 · 个性建议
            </p>
          </div>
        </div>
      </header>

      {/* Feature Cards */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-2 gap-3">
          {features.map(f => (
            <button
              key={f.id}
              onClick={() => handleFeatureClick(f.id)}
              className={`p-4 rounded-2xl text-left transition-all active:scale-95 ${theme === 'dark' ? 'bg-surface' : 'bg-[#faf9f5]'}`}
            >
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
                style={{ backgroundColor: `${f.color}15` }}
              >
                <f.icon size={20} style={{ color: f.color }} />
              </div>
              <div className={`font-medium mb-0.5 ${theme === 'dark' ? 'text-ink' : 'text-ink'}`}>{f.label}</div>
              <div className={`text-xs ${theme === 'dark' ? 'text-ink-2' : 'text-ink-2'}`}>{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4 tabbar-safe">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user' 
                ? 'bg-brand text-white rounded-br-md' 
                : theme === 'dark' ? 'bg-surface text-ink rounded-bl-md' : 'bg-[#faf9f5] text-ink rounded-bl-md'
            }`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className={`px-4 py-3 border-t ${theme === 'dark' ? 'bg-[#1a1a19] border-brand-tint' : 'bg-white border-brand-tint'}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入您的问题..."
            className={`flex-1 px-4 py-3 rounded-full text-sm ${
              theme === 'dark' 
                ? 'bg-surface text-ink placeholder-[#87867f]' 
                : 'bg-bg text-ink placeholder-[#b0aea5]'
            } outline-none`}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors
              ${input.trim() ? 'bg-brand text-white' : theme === 'dark' ? 'bg-surface text-ink-2' : 'bg-brand-tint text-ink-2'}`}
          >
            <Send size={20} />
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}
