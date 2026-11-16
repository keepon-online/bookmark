import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    // regressions 等用例走真实定时器（域名间隔 250ms、锁复核 50ms），
    // 最重用例 ~3s，慢 CI 上对默认 5s 余量不足
    testTimeout: 15_000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'json-summary', 'html'],
        // 只统计 src/ 运行时代码：构建产物、根配置、纯挂载入口不参与分母
        exclude: [
          'node_modules/',
          'src/test/',
          '**/*.test.{ts,tsx}',
          '**/*.spec.{ts,tsx}',
          'wxt.config.ts',
          'coverage/',
          '.output/',
          '.wxt/',
          'eslint.config.js',
          'postcss.config.js',
          'tailwind.config.js',
          'vitest.config.ts',
          'src/entrypoints/**/main.tsx',
        ],
      },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
