import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, PieChart, Wallet, Plus, Settings, Coins } from 'lucide-react';
import { TabType } from '../../types';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onAddClick: () => void;
}

const tabs: { key: TabType; label: string; icon: typeof Home; path: string }[] = [
  { key: 'home', label: '首页', icon: Home, path: '/' },
  { key: 'reports', label: '报表', icon: PieChart, path: '/reports' },
  { key: 'assets', label: '资产', icon: Wallet, path: '/assets' },
  { key: 'wealth', label: '财富', icon: Coins, path: '/wealth' },
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
          return (
            <button
              key={key}
              onClick={() => handleTabChange(key, path)}
              className="flex flex-col items-center justify-center gap-1 w-16 h-full transition-all active:scale-90"
            >
              <Icon
                size={23}
                strokeWidth={isActive ? 2.5 : 2}
                color={isActive ? '#222222' : '#888888'}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${isActive ? 'text-ink' : 'text-ink-2'}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 悬浮 + 号：仅在首页出现。首页=记一笔账单。财富页的加仓入口移至页面内悬浮胶囊。 */}
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
            <Icon size={18} strokeWidth={isActive ? 2.5 : 2} color={isActive ? '#222' : '#888'} />
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
