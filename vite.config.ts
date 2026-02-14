/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Plugin to generate version.json for cache busting
function generateVersionFile() {
  return {
    name: 'generate-version-file',
    closeBundle() {
      const changelogPath = path.resolve(__dirname, 'src/generated/changelog.ts');
      const distPath = path.resolve(__dirname, 'dist/version.json');

      try {
        const changelogContent = fs.readFileSync(changelogPath, 'utf-8');
        const buildNumberMatch = changelogContent.match(/BUILD_NUMBER = '(\d+)'/);
        const buildHashMatch = changelogContent.match(/BUILD_HASH = '([^']+)'/);

        const versionData = {
          buildNumber: buildNumberMatch ? buildNumberMatch[1] : '0',
          buildHash: buildHashMatch ? buildHashMatch[1] : 'unknown',
          timestamp: new Date().toISOString(),
        };

        fs.writeFileSync(distPath, JSON.stringify(versionData, null, 2));
        console.log('Generated version.json:', versionData);
      } catch (error) {
        console.error('Failed to generate version.json:', error);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), generateVersionFile()],
  base: '/devilbox/',
  test: {
    // Vitest configuration
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'Reference Code/**', 'dist'],
  },
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
    // Don't scan Reference Code folder for dependencies
    entries: ['src/**/*.{ts,tsx,js,jsx}'],
  },
  server: {
    // Reduce resource usage for better performance when running multiple servers
    watch: {
      usePolling: false, // Disable polling to reduce CPU usage
      ignored: ['**/node_modules/**', '**/dist/**', '**/Reference Code/**'],
    },
    hmr: {
      overlay: false, // Reduce DOM operations
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      format: {
        comments: false,
      },
    } as any,
    rollupOptions: {
      // Ensure worklet files are copied to output
      external: (id) => id.includes('chiptune3.worklet') || id.includes('libopenmpt.worklet'),
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-tone': ['tone'],
          'vendor-utils': ['jszip', 'file-saver', 'immer', 'zustand'],
          'vendor-ui': ['lucide-react', 'clsx', 'tailwind-merge'],
        },
      },
    },
    // Reduce memory during build
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: false, // Speed up build
  },
})