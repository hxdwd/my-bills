import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/useAuthStore';
import { Wallet, Eye, EyeOff, User, Lock, LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { theme } = useTheme();
  const { login, loading, error } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const displayError = localError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!username.trim()) {
      setLocalError('请输入用户名');
      return;
    }
    if (!password) {
      setLocalError('请输入密码');
      return;
    }
    if (password.length < 6) {
      setLocalError('密码长度至少6位');
      return;
    }

    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setLocalError(err?.message || '登录失败');
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 ${isDark ? 'bg-[#141413]' : 'bg-[#f5f4ed]'}`}>
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#c96442]/10 flex items-center justify-center">
          <Wallet size={40} className="text-[#c96442]" />
        </div>
        <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-[#faf9f5]' : 'text-[#141413]'}`}>
          钱盒子
        </h1>
        <p className={`text-sm ${isDark ? 'text-[#b0aea5]' : 'text-[#87867f]'}`}>
          温暖的个人财务管家
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        {/* Error */}
        {displayError && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm
            ${isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`}>
            <AlertCircle size={16} />
            <span>{displayError}</span>
          </div>
        )}

        {/* Username */}
        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-[#b0aea5]' : 'text-[#5e5d59]'}`}>
            用户名
          </label>
          <div className="relative">
            <User size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#87867f]' : 'text-[#b0aea5]'}`} />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-colors
                ${isDark 
                  ? 'bg-[#30302e] border-[#4a4a47] text-[#faf9f5] placeholder:text-[#87867f] focus:border-[#c96442]' 
                  : 'bg-white border-[#e8e6dc] text-[#141413] placeholder:text-[#b0aea5] focus:border-[#c96442]'
                } focus:outline-none focus:ring-2 focus:ring-[#c96442]/20`}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-[#b0aea5]' : 'text-[#5e5d59]'}`}>
            密码
          </label>
          <div className="relative">
            <Lock size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#87867f]' : 'text-[#b0aea5]'}`} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              className={`w-full pl-10 pr-12 py-3 rounded-xl border transition-colors
                ${isDark 
                  ? 'bg-[#30302e] border-[#4a4a47] text-[#faf9f5] placeholder:text-[#87867f] focus:border-[#c96442]' 
                  : 'bg-white border-[#e8e6dc] text-[#141413] placeholder:text-[#b0aea5] focus:border-[#c96442]'
                } focus:outline-none focus:ring-2 focus:ring-[#c96442]/20`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 ${isDark ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#c96442] hover:bg-[#d97757] disabled:bg-[#c96442]/50 
            text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <LogIn size={18} />
              <span>登录</span>
            </>
          )}
        </button>

        {/* Demo Hint */}
        <div className={`text-center pt-4 border-t ${isDark ? 'border-[#3d3d3a]' : 'border-[#e8e6dc]'}`}>
          <p className={`text-xs ${isDark ? 'text-[#87867f]' : 'text-[#b0aea5]'}`}>
            注册功能已关闭，请联系管理员开通账号
          </p>
        </div>
      </form>
    </div>
  );
}
