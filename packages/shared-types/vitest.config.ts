import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    typecheck: { enabled: true, include: ['src/**/*.test-d.ts'], tsconfig: './tsconfig.spec.json' },
  },
});
