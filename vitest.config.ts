import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    // Pin NO_COLOR for tests so picocolors no-ops regardless of how the test
    // runner is invoked. npm propagates FORCE_COLOR=2 to child processes;
    // GitHub Actions inherits that, which would otherwise cause `formatReport`
    // (and any other pc-using code) to emit SGR sequences that break
    // assertions on plain-text output. Test code asserts the *contract*, not
    // the colored render.
    env: {
      NO_COLOR: '1',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
