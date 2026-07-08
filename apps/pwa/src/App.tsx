import React, { useState, useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppProvider } from './context/AppContext';
import { TabBar } from './components/layout';
import { useAuthStore } from './stores/useAuthStore';
import {
  LoginPage as Login,
  HomePage as Home,
  AddTransactionPage as AddTransaction,
  AssetsPage as Assets,
  ReportsPage as Reports,
  CalendarPage as Calendar,
  BudgetPage as Budget,
  AIPage as AI,
  SearchPage as Search,
  SettingsPage as Settings,
  TransactionListPage as TransactionList,
  CategoriesPage as Categories,
} from './pages';
import { TabType } from './types';
import { UpdatePrompt } from './pwa/UpdatePrompt';

// URL 路径到 Tab 的映射
const pathToTab: Record<string, TabType> = {
  '/': 'home',
  '/home': 'home',
  '/assets': 'assets',
  '/reports': 'reports',
  '/calendar': 'calendar',
  '/budget': 'budget',
  '/ai': 'ai',
  '/search': 'search',
  '/transactions': 'transactions',
  '/settings': 'settings',
};

// 子页面路由映射 (不映射到 TabBar，直接渲染页面)
const subPageRoutes: Record<string, () => JSX.Element> = {};
let subPageRoutesInited = false;
function ensureSubPageRoutes() {
  if (subPageRoutesInited) return;
  subPageRoutes['/categories'] = () => <Categories />;
  subPageRoutesInited = true;
}

function AppContent() {
  const { user, loading: authLoading, initAuth } = useAuthStore();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  // 初始化认证状态
  useEffect(() => {
    initAuth().catch(() => {
      // initAuth 内部已处理错误，这里做兜底
    });
  }, [initAuth]);

  // URL 变化时同步 activeTab
  useEffect(() => {
    const tab = pathToTab[location.pathname];
    if (tab) {
      setActiveTab(tab);
    }
  }, [location.pathname]);

  // 认证加载中
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f4ed] dark:bg-[#141413]">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-[#c96442]/20 border-t-[#c96442] rounded-full animate-spin" />
          <p className="text-[#87867f] text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  // 未登录 - 显示登录页面
  if (!user) {
    return <Login />;
  }

  // 已登录 - 显示主应用
  ensureSubPageRoutes();

  const renderPage = () => {
    // 优先检查子页面路由（如 /categories）
    const subPage = subPageRoutes[location.pathname];
    if (subPage) {
      return subPage();
    }

    switch (activeTab) {
      case 'home':
        return <Home onAddTransaction={() => setShowAddTransaction(true)} />;
      case 'assets':
        return <Assets />;
      case 'reports':
        return <Reports />;
      case 'calendar':
        return <Calendar />;
      case 'budget':
        return <Budget />;
      case 'ai':
        return <AI />;
      case 'search':
        return <Search />;
      case 'transactions':
        return <TransactionList />;
      case 'settings':
        return <Settings />;
      default:
        return <Home onAddTransaction={() => setShowAddTransaction(true)} />;
    }
  };

  // 子页面不显示底部 TabBar
  const isSubPage = subPageRoutes[location.pathname] !== undefined;

  return (
    <div className="min-h-screen bg-bg">
      {renderPage()}

      {!isSubPage && (
        <TabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onAddClick={() => setShowAddTransaction(true)}
        />
      )}

      <AddTransaction
        isOpen={showAddTransaction}
        onClose={() => setShowAddTransaction(false)}
      />

      <UpdatePrompt />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
