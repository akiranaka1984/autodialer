// frontend/src/components/CSVImport.js
import React, { useState } from 'react';
import { Upload, AlertCircle, Check, File } from 'lucide-react';

const CSVImport = ({ onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState([]);
  
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setMessage('CSVファイル形式のみアップロード可能です。');
      setStatus('error');
      return;
    }
    
    setFile(selectedFile);
    setStatus('idle');
    setMessage('');
    
    // CSVプレビュー表示
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').slice(0, 6); // ヘッダー + 最大5行
      setPreview(rows.map(row => row.split(',')));
    };
    reader.readAsText(selectedFile);
  };
  
  const handleUpload = async () => {
    // アップロード処理の実装
    // ...
  };
  
  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      {/* UI実装 */}
    </div>
  );
};

export default CSVImport;