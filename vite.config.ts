import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@engine': path.resolve(__dirname, './src/engine'),
      '@typedefs': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@constants': path.resolve(__dirname, './src/constants'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@generated': path.resolve(__dirname, './src/generated'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
    },
  },
  optimizeDeps: {
    exclude: ['chiptune3'],
  },
  build: {
    rollupOptions: {
      // Ensure worklet files are copied to output
      external: (id) => id.includes('chiptune3.worklet') || id.includes('libopenmpt.worklet'),
    },
  },
})