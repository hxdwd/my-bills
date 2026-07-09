import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { formatCompact } from '../../utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface BarChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color: string;
  }[];
  height?: number;
  horizontal?: boolean;
}

export function BarChart({ labels, datasets, height = 200, horizontal = false }: BarChartProps) {
  const chartData = {
    labels,
    datasets: datasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color,
      borderRadius: 6,
      borderSkipped: false,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? ('y' as const) : ('x' as const),
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
            return `${context.dataset.label}: ¥${context.raw.toLocaleString()}`;
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
            return formatCompact(value);
          },
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
