import React from 'react';
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
}

export function LineChart({ labels, datasets, height = 200 }: LineChartProps) {
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
            if (value >= 1000) {
              return `¥${(value / 1000).toFixed(0)}k`;
            }
            return `¥${value}`;
          },
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
}
