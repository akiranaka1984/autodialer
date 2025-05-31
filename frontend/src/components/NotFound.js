// frontend/src/components/NotFound.js
import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-full flex flex-col justify-center items-center py-12 px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-300">404</h1>
        <h2 className="text-3xl font-bold mt-4 text-gray-800">ページが見つかりません</h2>
        <p className="mt-2 text-gray-600">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Home className="h-5 w-5 mr-2" />
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;