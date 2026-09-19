import React, { useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatCompact } from '../../utils/format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface LineChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color: string;
    fill?: boolean;
  }[];
  height?: number;
  /** tooltip 金额前缀（默认 ¥；本位币非人民币时传入对应符号） */
  valuePrefix?: string;
  /**
   * 自定义 Y 轴刻度格式。默认用 formatCompact（按单个数值跨阈值切单位，
   * 同一轴上可能混出「1.20万」与「10,000.00」）。数值跨阈值时建议传入，
   * 按整轴量级统一单位。
   */
  yTickFormatter?: (v: number) => string;
  /**
   * 左右滑动手势（水平拖动超过阈值触发）：prev = 看更早，next = 看更晚。
   * 图表本身始终铺满容器宽度（坐标轴不会滚走），滑动由调用方切换数据窗口。
   */
  onSwipe?: (dir: 'prev' | 'next') => void;
}

// 触发滑动的最小水平位移（px）
const SWIPE_THRESHOLD = 40;

export function LineChart({
  labels,
  datasets,
  height = 200,
  valuePrefix = '¥',
  yTickFormatter,
  onSwipe,
}: LineChartProps) {
  const startXRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    const startX = startXRef.current;
    startXRef.current = null;
    if (startX == null || !onSwipe) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    // 手指右滑 → 回到更早；左滑 → 看更晚
    onSwipe(dx > 0 ? 'prev' : 'next');
  };

  const chartData = {
    labels,
    datasets: datasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: ds.fill ? `${ds.color}20` : 'transparent',
      fill: ds.fill || false,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: ds.color,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: datasets.length > 1,
        position: 'bottom' as const,
        labels: {
          padding: 16,
          usePointStyle: true,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `${context.dataset.label}: ${valuePrefix}${context.raw.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 11,
          },
          autoSkip: true, // 点密集时自动抽稀标签，避免小屏文字重叠
          maxRotation: 0,
        },
      },
      y: {
        grid: {
          color: 'rgba(0,0,0,0.05)',
        },
        ticks: {
          font: {
            size: 11,
          },
          callback: (value: any) => {
            const n = Number(value);
            return yTickFormatter ? yTickFormatter(n) : formatCompact(n);
          },
        },
      },
    },
  };

  return (
    <div
      style={{ height, touchAction: 'pan-y' }}
      onPointerDown={onSwipe ? handlePointerDown : undefined}
      onPointerUp={onSwipe ? handlePointerUp : undefined}
      onPointerCancel={() => { startXRef.current = null; }}
    >
      <Line data={chartData} options={options} />
    </div>
  );
}
