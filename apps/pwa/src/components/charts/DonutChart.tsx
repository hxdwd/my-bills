import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useTheme } from '../../hooks/useTheme';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DonutChartProps {
  data: {
    labels: string[];
    values: number[];
    colors: string[];
  };
  centerText?: {
    main: string;
    sub?: string;
  };
  size?: number;
  onClick?: (event: any, elements: any[]) => void;
}

// 环形图圆心可用内径：cutout=70% → 内径约占整体的 30%，再留 12% 安全边距
const CUTOUT = 0.7
function innerDiameter(size: number): number {
  const s = Number.isFinite(size) ? size : 200
  return s * (1 - CUTOUT) * 0.88
}

// 按字符数估算文字像素宽度（等宽数字字体下更稳定）。
// 货币符号/逗号/小数点较窄（约 0.55em），其余数字约 0.62em。
function estimateTextWidth(text: string, fontSize: number): number {
  if (!text) return 0
  let units = 0
  for (const ch of text) {
    units += /[¥$,.\s%]/.test(ch) ? 0.55 : 0.62
  }
  return units * fontSize
}

// 动态计算圆心主数字字号：保证在圆心内径内单行显示、不溢出、不折行。
// 类型安全：所有入参做空值/NaN 兜底，绝不返回 NaN/undefined/Infinity。
function fitCenterFontSize(textRaw: string | undefined, size: number): number {
  const text = typeof textRaw === 'string' ? textRaw : ''
  const inner = innerDiameter(size)
  if (inner <= 0) return 14
  const charCount = Math.max(text.length, 1) // 防除零
  // 先给一个上限（与 amount-fluid-lg 上限一致，保持视觉量级）
  let fontSize = 28
  // 迭代收窄：让估算宽度不超过内径的 92%，同时不小于下限 10px
  while (fontSize > 10 && estimateTextWidth(text, fontSize) > inner * 0.92) {
    fontSize -= 1
  }
  // 最终钳制，确保有限且合理
  if (!Number.isFinite(fontSize) || fontSize <= 0) fontSize = 14
  return Math.min(fontSize, 28)
}

export function DonutChart({ data, centerText, size = 200, onClick }: DonutChartProps) {
  const { isDark } = useTheme();
  const textColor = isDark ? '#b0aea5' : '#5e5d59';

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '70%',
    onClick: onClick as any,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: isDark ? '#30302e' : '#ffffff',
        titleColor: isDark ? '#faf9f5' : '#141413',
        bodyColor: textColor,
        borderColor: isDark ? '#3d3d3a' : '#e8e6dc',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function (context: any) {
            const value = context.raw;
            return ` ¥${value.toLocaleString()}`;
          },
        },
      },
    },
  };

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        data: data.values,
        backgroundColor: data.colors,
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };



  return (
    <div className="relative inline-flex items-center justify-center">
      <div style={{ width: size, height: size }}>
        <Doughnut data={chartData} options={options} />
      </div>
      {centerText && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="font-bold px-2 text-center text-[var(--text-primary)] whitespace-nowrap"
            style={{ fontSize: `${fitCenterFontSize(centerText.main, size)}px`, lineHeight: 1.1, maxWidth: '100%' }}
          >
            {centerText.main}
          </span>
          {centerText.sub && (
            <span className="text-sm text-[var(--text-secondary)]">
              {centerText.sub}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
