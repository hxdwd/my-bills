import React, { useState, useEffect } from 'react';
import { BrowserRouter, useLocation, matchPath, Routes, Route } from 'react-router-dom';
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
  WealthHome,
  WealthCategory,
  WealthDetail,
  WealthAdd,
  WealthImport,
  EasterEgg,
  LifeProgress,
} from './pages';
import { TabType } from './types';
import { UpdatePrompt } from './pwa/UpdatePrompt';

// URL 路径到 Tab 的映射
// 注：calendar 不再是底部 Tab（已在 TabBar 移除），但保留映射以便首页快捷入口进入时同步 activeTab
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
  '/wealth': 'wealth',
};

// 子页面路由映射 (不映射到 TabBar，直接渲染页面)
// 使用带参数的 path 模板，配合 matchPath 做匹配（精确字符串匹配无法命中 :param 路由）
interface SubRoute { path: string; element: () => JSX.Element }
const subPageRoutes: SubRoute[] = [];
let subPageRoutesInited = false;
function ensureSubPageRoutes() {
  if (subPageRoutesInited) return;
  subPageRoutes.push({ path: '/categories', element: () => <Categories /> });
  // 注意：具体路由必须排在 /wealth/:type 之前，否则 /wealth/add 会被 :type 抢先匹配
  subPageRoutes.push({ path: '/wealth/detail/:market/:symbol', element: () => <WealthDetail /> });
  subPageRoutes.push({ path: '/wealth/add', element: () => <WealthAdd /> });
  subPageRoutes.push({ path: '/wealth/import', element: () => <WealthImport /> });
  subPageRoutes.push({ path: '/wealth/:type', element: () => <WealthCategory /> });
  subPageRoutes.push({ path: '/easterEgg/life', element: () => <LifeProgress /> });
  subPageRoutes.push({ path: '/easterEgg', element: () => <EasterEgg /> });
  subPageRoutesInited = true;
}

// 根据当前 pathname 找到匹配的子页面路由（支持 :param）
function matchSubPage(pathname: string): SubRoute | undefined {
  return subPageRoutes.find(r => matchPath(r.path, pathname));
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
    // 优先检查子页面路由（如 /categories、/wealth/detail/:market/:symbol）
    const subPage = matchSubPage(location.pathname);
    if (subPage) {
      // 用 <Routes> 包裹，使 <Route> 上下文正确注入 :param（useParams 才能取到值）
      return (
        <Routes>
          {subPageRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={<r.element />} />
          ))}
        </Routes>
      );
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
      case 'wealth':
        return <WealthHome />;
      default:
        return <Home onAddTransaction={() => setShowAddTransaction(true)} />;
    }
  };

  // 子页面不显示底部 TabBar（含财富明细页）
  const isSubPage =
    matchSubPage(location.pathname) !== undefined;

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
