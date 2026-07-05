import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 500kB超はmermaid内部のパーサチャンクのみ。図の初回描画時に遅延ロードされる
    // サードパーティ内部のチャンクで、これ以上の分割は初期ロードに寄与しない
    chunkSizeWarningLimit: 700,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8040',
    },
  },
})
