// 设置页面主组件

import * as React from 'react';
import { useState, useEffect } from 'react';
import { SettingsLayout } from './components/SettingsLayout';
import { DashboardSettings } from './components/DashboardSettings';
import { BookmarksSettings } from './components/BookmarksSettings';
import { AISettings } from './components/AISettings';
import { OrganizerSettings } from './components/OrganizerSettings';
import { SyncSettings } from './components/SyncSettings';
import { StatsSettings } from './components/StatsSettings';
import { HealthSettings } from './components/HealthSettings';
import { AdvancedSettings } from './components/AdvancedSettings';
import { AboutSettings } from './components/AboutSettings';

type SettingsTab =
  | 'dashboard'
  | 'bookmarks'
  | 'ai'
  | 'organizer'
  | 'sync'
  | 'stats'
  | 'health'
  | 'advanced'
  | 'about';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('dashboard');

  // 监听 hash 变化
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && isValidTab(hash)) {
        setActiveTab(hash as SettingsTab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    // 初始化 hash
    handleHashChange();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const isValidTab = (tab: string): tab is SettingsTab => {
    return [
      'dashboard',
      'bookmarks',
      'ai',
      'organizer',
      'sync',
      'stats',
      'health',
      'advanced',
      'about',
    ].includes(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return React.createElement(DashboardSettings);
      case 'bookmarks':
        return React.createElement(BookmarksSettings);
      case 'ai':
        return React.createElement(AISettings);
      case 'organizer':
        return React.createElement(OrganizerSettings);
      case 'sync':
        return React.createElement(SyncSettings);
      case 'stats':
        return React.createElement(StatsSettings);
      case 'health':
        return React.createElement(HealthSettings);
      case 'advanced':
        return React.createElement(AdvancedSettings);
      case 'about':
        return React.createElement(AboutSettings);
      default:
        return React.createElement(DashboardSettings);
    }
  };

  return React.createElement(
    SettingsLayout,
    { activeTab, setActiveTab },
    renderContent()
  );
}
