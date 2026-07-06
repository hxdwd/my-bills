import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, PieChart, Calendar, Settings, Wallet, Plus, TrendingUp, FileText, Sparkles } from 'lucide-react';
import { TabType } from '../../types';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onAddClick: () => void;
}

const tabs: { key: TabType; label: string; icon: typeof Home; path: string }[] = [
  { key: 'home', label: '首页', icon: Home, path: '/' },
  { key: 'reports', label: '报表', icon: PieChart, path: '/reports' },
  { key: 'calendar', label: '日历', icon: Calendar, path: '/calendar' },
  { key: 'assets', label: '资产', icon: Wallet, path: '/assets' },
  { key: 'settings', label: '设置', icon: Settings, path: '/settings' },
];

// 保留更多 tab 用于完整功能
const moreTabs: { key: TabType; label: string; icon: typeof FileText }[] = [
  { key: 'budget', label: '预算', icon: TrendingUp },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'search', label: '搜索', icon: FileText },
];

export function TabBar({ activeTab, onTabChange, onAddClick }: TabBarProps) {
  const navigate = useNavigate();

  const handleTabChange = (tab: TabType, path: string) => {
    onTabChange(tab);
    navigate(path, { replace: true });
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary/95 dark:bg-dark-surface/95 backdrop-blur-md border-t border-border-light dark:border-dark-border safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {/* Main tabs */}
        {tabs.map(({ key, label, icon: Icon, path }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => handleTabChange(key, path)}
              className={`
                flex flex-col items-center justify-center gap-0.5
                w-16 h-full
                transition-colors
                ${isActive ? 'text-brand' : 'text-text-tertiary dark:text-dark-text'}
              `}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>

      {/* FAB for add - 仅在首页显示 */}
      {activeTab === 'home' && (
        <button
          onClick={onAddClick}
          className="
            fixed bottom-20 left-1/2 -translate-x-1/2
            w-14 h-14 rounded-full
            bg-brand text-white shadow-lg shadow-brand/30
            flex items-center justify-center
            hover:bg-brand-secondary active:scale-95
            transition-all z-50
          "
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
    <nav className="flex items-center bg-bg-secondary dark:bg-dark-surface border-b border-border-light dark:border-dark-border">
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`
              flex-1 flex items-center justify-center gap-1.5
              h-11
              transition-colors
              border-b-2
              ${isActive
                ? 'text-brand border-brand'
                : 'text-text-tertiary dark:text-dark-text border-transparent'
              }
            `}
          >
            <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
