import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // `@open-family/ui` is a `file:` dependency, so it is symlinked and Vite
  // resolves through the symlink to the real path. Without this, `import 'react'`
  // from inside the kit finds the kit's own copy and the app renders with two
  // Reacts and an invalid-hook-call.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.agents/**'],
  },
  server: {
    host: '0.0.0.0',
    port: 3005,
    proxy: {
      // Connectors still live on ora-api; more specific rule before /api → oam-api.
      '/api/connectors': {
        target: process.env.VITE_ORA_API_PROXY_TARGET || 'http://127.0.0.1:8091',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
  },
})
