import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeTheme } from '@/stores';

// 页面加载即刻初始化主题及主色调，避免渲染闪白
initializeTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
