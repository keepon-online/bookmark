// Vitest 测试设置文件

import { vi } from 'vitest';

// Mock Chrome API
global.chrome = {
  bookmarks: {
    getTree: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({})),
    move: vi.fn(() => Promise.resolve({})),
    remove: vi.fn(() => Promise.resolve({})),
    search: vi.fn(() => Promise.resolve([])),
    getChildren: vi.fn(() => Promise.resolve([])),
    getRecent: vi.fn(() => Promise.resolve([])),
    getTree: vi.fn(() => Promise.resolve([])),
  },
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve({})),
      remove: vi.fn(() => Promise.resolve({})),
      clear: vi.fn(() => Promise.resolve({})),
    },
    sync: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve({})),
      remove: vi.fn(() => Promise.resolve({})),
      clear: vi.fn(() => Promise.resolve({})),
    },
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    get: vi.fn(() => Promise.resolve({})),
    create: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({})),
    remove: vi.fn(() => Promise.resolve({})),
  },
  runtime: {
    getURL: vi.fn(() => ''),
    sendMessage: vi.fn(() => Promise.resolve({})),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
} as any;

// Mock IndexedDB
global.indexedDB = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      close: vi.fn(),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          add: vi.fn(),
          put: vi.fn(),
          get: vi.fn(),
          delete: vi.fn(),
          getAll: vi.fn(() => []),
        })),
      })),
    },
  })),
  deleteDatabase: vi.fn(),
} as any;

// Console 设置
global.console = {
  ...console,
  // 在测试中减少日志噪音
  log: vi.fn(),
  debug: vi.fn(),
  info: console.info,
  warn: console.warn,
  error: console.error,
};
