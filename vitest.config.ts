import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test unitari della logica in src/lib (ambiente Node).
// I test che toccano D1/KV useranno @cloudflare/vitest-pool-workers (Fase 4).
export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
  },
});
