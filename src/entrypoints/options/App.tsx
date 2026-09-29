// Options 页面 - 新的模块化设置系统

import * as React from 'react';
import { SettingsPage } from './SettingsPage';
import { initializeTheme } from '@/stores';
import '@/styles/globals.css';

export function App() {
  React.useEffect(() => {
    return initializeTheme();
  }, []);

  return React.createElement(SettingsPage);
}

export default App;
