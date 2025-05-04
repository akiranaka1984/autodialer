import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Phone, Home, BarChart2, Clock, LogOut, User } from 'lucide-react';

const OperatorLayout = ({ user, onLogout }) => {
  const location = useLocation();
  
  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* サイドバー */}
      <aside className="w-64 bg-gray-800 text-white">
        <div className="p-4">
          <div className="flex items-center mb-6">
            <Phone className="h-8 w-8 mr-2" />
            <span className="text-lg font-bold">オペレーター</span>
          </div>
          
          <nav className="space-y-2">
            <Link
              to="/operator"
              className={`flex items-center px-4 py-2 rounded ${
                isActive('/operator') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <Home className="h-5 w-5 mr-3" />
              ダッシュボード
            </Link>
            
            <Link
              to="/operator/history"
              className={`flex items-center px-4 py-2 rounded ${
                isActive('/operator/history') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <Clock className="h-5 w-5 mr-3" />
              通話履歴
            </Link>
            
            <Link
              to="/operator/performance"
              className={`flex items-center px-4 py-2 rounded ${
                isActive('/operator/performance') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <BarChart2 className="h-5 w-5 mr-3" />
              パフォーマンス
            </Link>
          </nav>
        </div>
        
        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-700">
          <div className="flex items-center mb-4">
            <User className="h-5 w-5 mr-2" />
            <span>{user?.name}</span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center w-full px-4 py-2 text-gray-300 hover:bg-gray-700 rounded"
          >
            <LogOut className="h-5 w-5 mr-2" />
            ログアウト
          </button>
        </div>
      </aside>
      
      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default OperatorLayout;