import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Focused unit tests for critical, environment-independent financial logic
// (payment signature/auth verification, amount/currency validation, commission
// math, donation-confirmation idempotency). Pure functions + a mocked admin
// client — no database, no network, no snapshots.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    globals: false,
  },
});
