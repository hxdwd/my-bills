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
}

export function DonutChart({ data, centerText, size = 200 }: DonutChartProps) {
  const { isDark } = useTheme();
  const textColor = isDark ? '#b0aea5' : '#5e5d59';

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

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '70%',
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

  return (
    <div className="relative inline-flex items-center justify-center">
      <div style={{ width: size, height: size }}>
        <Doughnut data={chartData} options={options} />
      </div>
      {centerText && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-[var(--text-primary)]">
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
