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

// Plugin to copy ONNX Runtime WASM files from node_modules to public/onnx-wasm/
function copyOnnxWasmFiles() {
  return {
    name: 'copy-onnx-wasm',
    buildStart() {
      const srcDir = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');
      const destDir = path.resolve(__dirname, 'public/onnx-wasm');
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const wasmFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.wasm') || f.endsWith('.mjs'));
      for (const file of wasmFiles) {
        const destPath = path.resolve(destDir, file);
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(path.resolve(srcDir, file), destPath);
          console.log(`Copied ONNX WASM: ${file}`);
        }
      }
    },
    // Vite blocks dynamic import() of .mjs files from public/ in dev mode.
    // ONNX Runtime does `import('/onnx-wasm/ort-wasm-*.mjs')` which Vite intercepts
    // and rejects. Serve these files directly via middleware before Vite's resolver.
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url?.startsWith('/onnx-wasm/') && (req.url.endsWith('.mjs') || req.url.includes('.mjs?'))) {
          const filename = req.url.split('/').pop()?.split('?')[0];
          const filePath = path.resolve(__dirname, 'public/onnx-wasm', filename);
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), generateVersionFile(), copyOnnxWasmFiles()],
  // Force root base path for subdomain deployment (Docker/live site)
  // GitHub Pages deployment uses separate workflow with --base flag
  base: '/',
  test: {
    // Vitest configuration
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'Reference Code/**', 'dist'],
    environment: 'happy-dom',
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