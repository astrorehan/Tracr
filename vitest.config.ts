import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Dedicated test config: just the `@` alias + node env, so the app's PWA/react
// plugins don't load during unit runs. Pure-logic modules need nothing more.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
