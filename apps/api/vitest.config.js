'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const config_1 = require('vitest/config');
exports.default = (0, config_1.defineConfig)({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/helpers/test-setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    isolate: true,
    silent: false,
  },
});
