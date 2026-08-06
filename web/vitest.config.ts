import { defineConfig } from 'vitest/config'

/**
 * Unit tests for the pure modules — layout maths, the gauge model, chart aggregation, partial
 * exports, the configuration diff, the template evaluator, the theming contract.
 *
 * Node environment on purpose: everything tested here is deliberately free of React and the DOM,
 * which is what makes it testable at all. Anything that genuinely needs a browser belongs in the
 * end-to-end suites under `e2e/`, not here.
 *
 * Run: `npm test` (once) or `npm run test:watch` (while working).
 */
export default defineConfig({
  test: {
    environment: 'node',
    // `scripts/` holds build-time tooling (the docs renderer), which is plain ESM rather than TS.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    reporters: ['default'],
  },
})
