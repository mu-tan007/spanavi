import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  esbuild: {
    // 本番ビルド時のみ console.* と debugger を除去
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}))
