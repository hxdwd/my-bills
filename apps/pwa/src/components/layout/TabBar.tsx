import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, PieChart, Settings, Wallet, Plus } from 'lucide-react';
import { TabType } from '../../types';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onAddClick: () => void;
}

// 动态日历图标：中间显示"今天"的日期数字
const TodayCalendarIcon: React.FC<{ size?: number; strokeWidth?: number; active?: boolean }> = ({
  size = 22,
  strokeWidth = 2,
  active = false,
}) => {
  const today = new Date().getDate();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: active ? '#222222' : '#888888' }}
    >
      <rect x="3" y="4" width="18" height="17" rx="5" />
      <path d="M3 9h18" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {today}
      </text>
    </svg>
  );
};

const tabs: { key: TabType; label: string; icon: typeof Home | typeof TodayCalendarIcon; path: string }[] = [
  { key: 'home', label: '首页', icon: Home, path: '/' },
  { key: 'reports', label: '报表', icon: PieChart, path: '/reports' },
  { key: 'calendar', label: '日历', icon: TodayCalendarIcon, path: '/calendar' },
  { key: 'assets', label: '资产', icon: Wallet, path: '/assets' },
  { key: 'settings', label: '设置', icon: Settings, path: '/settings' },
];

export function TabBar({ activeTab, onTabChange, onAddClick }: TabBarProps) {
  const navigate = useNavigate();

  const handleTabChange = (tab: TabType, path: string) => {
    onTabChange(tab);
    navigate(path, { replace: true });
  };

  return (
    <nav className="fixed left-3 right-3 z-50 bg-white/70 backdrop-blur-md border border-black/5 rounded-3xl shadow-soft" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      <div className="flex items-center justify-around h-[58px] px-2">
        {tabs.map(({ key, label, icon: Icon, path }) => {
          const isActive = activeTab === key;
          const IconEl = Icon as typeof Home;
          return (
            <button
              key={key}
              onClick={() => handleTabChange(key, path)}
              className="flex flex-col items-center justify-center gap-1 w-16 h-full transition-all active:scale-90"
            >
              {key === 'calendar' ? (
                <TodayCalendarIcon size={23} strokeWidth={isActive ? 2.5 : 2} active={isActive} />
              ) : (
                <IconEl
                  size={23}
                  strokeWidth={isActive ? 2.5 : 2}
                  color={isActive ? '#222222' : '#888888'}
                />
              )}
              <span
                className={`text-[10px] font-medium transition-colors ${isActive ? 'text-ink' : 'text-ink-2'}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 记一笔悬浮按钮：仅首页，固定在底部 bar 正上方，不遮挡日历图标 */}
      {activeTab === 'home' && (
        <button
          onClick={onAddClick}
          className="fixed left-1/2 -translate-x-1/2 z-[60] w-[56px] h-[56px] rounded-full bg-brand text-ink shadow-soft-brand flex items-center justify-center hover:bg-brand-strong active:scale-90 transition-all"
          style={{ bottom: 'calc(82px + env(safe-area-inset-bottom))' }}
          aria-label="记一笔"
        >
          <Plus size={28} strokeWidth={2.5} />
        </button>
      )}
    </nav>
  );
}

// 更紧凑的底部导航
export function MiniTabBar({ activeTab, onTabChange }: { activeTab: TabType; onTabChange: (tab: TabType) => void }) {
  return (
    <nav className="flex items-center bg-surface border-b border-brand-tint">
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = activeTab === key;
        const IconEl = Icon as typeof Home;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`
              flex-1 flex items-center justify-center gap-1.5
              h-11 transition-all active:scale-95
              ${isActive ? 'text-ink' : 'text-ink-2'}
            `}
          >
            <IconEl size={18} strokeWidth={isActive ? 2.5 : 2} color={isActive ? '#222' : '#888'} />
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
