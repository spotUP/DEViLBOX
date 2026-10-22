/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { testCpuLimits } from './vitest.limits';

// Test tiers (tools/test-tiers/heavy.json, measured from CI): the fast tier
// (VITEST_TIER=fast, npm run test:ci) runs on every push and leaves the
// heavy offline-render suites out; the heavy tier (VITEST_TIER=heavy,
// npm run test:heavy) runs only those, nightly. Unset: every test.
const testTier = process.env.VITEST_TIER as 'fast' | 'heavy' | undefined
const heavyTestFiles: string[] = testTier
  ? (JSON.parse(fs.readFileSync(path.resolve(__dirname, 'tools/test-tiers/heavy.json'), 'utf8')) as { files: { file: string }[] }).files.map((f) => f.file)
  : []

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

        // `closeBundle` also runs when vitest tears its server down, and
        // there is no dist/ then — nor after a build-cache clean. Creating it
        // keeps a test run from printing three ENOENT stack traces that have
        // nothing to do with the tests.
        fs.mkdirSync(path.dirname(distPath), { recursive: true });
        fs.writeFileSync(distPath, JSON.stringify(versionData, null, 2));
        console.log('Generated version.json:', versionData);
      } catch (error) {
        console.error('Failed to generate version.json:', error);
      }
    },
  };
}

// Plugin to copy ONNX Runtime WASM files from node_modules to public/onnx-wasm/
/**
 * Dev: reload the page, not hot-swap, when audio-engine code changes.
 *
 * An AudioContext registers each worklet processor once, so an edited worklet
 * keeps running its old code until the page reloads. Engine, store and bridge
 * modules hot-swapped under a React component become second copies beside the
 * ones the running audio graph holds - two stores, two engine singletons, a UI
 * that reads one while audio uses the other. Both showed up as "stale" state
 * that only a manual reload cleared (2026-09-29). UI components keep HMR.
 *
 * The page gets a custom event, not a bare full-reload, so it can hold the
 * reload while an agent is mid-measurement (src/lib/dev/engineReloadGate.ts,
 * wired in src/bridge/MCPBridge.ts). A bare full-reload made another agent's
 * save of src/engine/dj/** look like a tab crash in the middle of a measurement
 * (2026-10-08).
 */
const ENGINE_CHANGED_EVENT = 'devilbox:engine-changed';
function reloadOnEngineChange() {
  const ENGINE_CODE = /[\\/]src[\\/](engine|stores|bridge|audio|midi)[\\/]/;
  const WORKLET_CODE = /[\\/]public[\\/].*\.(worklet\.js|js)$/;
  return {
    name: 'devilbox-reload-on-engine-change',
    apply: 'serve' as const,
    configureServer(server: { watcher: { on(e: string, cb: (f: string) => void): void }; ws: { send(event: string, data?: unknown): void } }) {
      server.watcher.on('change', (file: string) => {
        if (WORKLET_CODE.test(file) && /worklet/i.test(file)) server.ws.send(ENGINE_CHANGED_EVENT);
      });
    },
    handleHotUpdate(ctx: { file: string; server: { ws: { send(event: string, data?: unknown): void } } }) {
      // Test files and everything under __tests__ (fixtures, helpers) are
      // never app code: a labels JSON under src/bridge/.../__tests__/fixtures
      // reloaded the tab on every write (2026-09-29).
      if (!ENGINE_CODE.test(ctx.file) || /\.test\.tsx?$/.test(ctx.file) || /[\\/]__tests__[\\/]/.test(ctx.file)) return;
      ctx.server.ws.send(ENGINE_CHANGED_EVENT);
      return [];
    },
  };
}

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
  plugins: [react(), generateVersionFile(), copyOnnxWasmFiles(), reloadOnEngineChange()],
  // Force root base path for subdomain deployment (Docker/live site)
  // GitHub Pages deployment uses separate workflow with --base flag
  base: '/',
  test: {
    // Vitest configuration
    include: testTier === 'heavy' ? heavyTestFiles : ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'Reference Code/**', 'dist', 'src/__tests__/ci/**', ...(testTier === 'fast' ? heavyTestFiles : [])],
    environment: 'happy-dom',
    setupFiles: ['src/test/nuadeNodeProbe.setup.ts'],
    // Worker cap and low CPU priority shared by every vitest config: vitest.limits.ts.
    ...testCpuLimits(),
    // A timeout is a hang detector, not a speed assertion. Vitest's 5 s default
    // failed working tests in the pre-push gate when two workers share a busy
    // machine: a first import that lazy-loads a route (Hippel ST 915 ms idle)
    // or a registry (mameChipWiring, its file 179 s under load, 2.5 s idle)
    // crossed it. A test that asserts speed says so itself.
    testTimeout: 30_000,
    // Same for beforeAll/afterAll: the 10 s default failed WASMSingletonBase.lifecycle's source scan in the gate.
    hookTimeout: 30_000,
    env: {
      // node-web-audio-api runs OfflineAudioContext.suspend() and
      // startRendering() as two futures on its tokio runtime; with several
      // runtime workers startRendering can be polled first, take the renderer,
      // and reject a suspend scheduled before it ("cannot suspend when
      // rendering has already started"), so the scheduled action never runs
      // and the render is silent. One worker polls them in the order they were
      // issued, as the spec requires. Read when the addon loads, so it is set
      // before any test imports it.
      // Regression: src/test/audio/__tests__/offlineSuspendBeforeRenderIsHonoured.test.ts
      TOKIO_WORKER_THREADS: '1',
    },
    server: {
      deps: {
        inline: ['tone'], // Tone.js uses extensionless ESM imports that Node can't resolve without bundling
      },
    },
  },
  resolve: {
    // Force single instances of React so hooks and context resolve to one copy
    dedupe: ['react', 'react-dom'],
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
    exclude: ['chiptune3', '@echogarden/espeak-ng-emscripten'],
    // Pre-bundle @dnd-kit packages upfront so lazy-loaded components that use
    // them don't trigger a runtime re-optimization (504 Outdated Optimize Dep).
    // onnxruntime-web/wasm is pre-bundled so the instrument-classifier Worker's
    // first import doesn't trigger a mid-session "optimized deps changed" reload.
    include: ['react', 'react-dom', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', 'onnxruntime-web/wasm'],
    // Don't scan Reference Code folder for dependencies
    entries: ['src/**/*.{ts,tsx,js,jsx}'],
  },
  server: {
    // Listen on all interfaces so iPhone controller can connect over WiFi
    host: '0.0.0.0',
    // Dedicated port. The Up_Rough maker app also defaults to Vite 5173 (strictPort),
    // so DEViLBOX pins 5174 to avoid the silent-fallback clash where opening 5173 lands
    // on maker instead of DEViLBOX. strictPort surfaces a conflict loudly instead.
    port: 5174,
    strictPort: true,
    // Cross-Origin Isolation headers required for SharedArrayBuffer (scsynth WASM pthreads)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      // Dev only: enables the JS Self-Profiling API behind MCP profile_main_thread.
      'Document-Policy': 'js-profiling',
    },
    // Proxy /api/* to Express so relative URL fetches work in dev
    proxy: {
      '/api': { target: 'http://localhost:3011', changeOrigin: false },
    },
    // HMR enabled — only watch src/ to keep file-watcher count low (~3K files).
    // server/ is intentionally excluded: it's backend-only (Express/MCP), none of it is
    // imported by the frontend. Including it caused tsx watch restarts to trigger Vite
    // HMR updates → full page reloads → MCPBridge connect/disconnect storm.
    // The 182 *-wasm/ dirs, third-party/ (83K files), public/ (20K), tools/ (5K),
    // docs/ (3K), and other non-source trees are ignored to stay under the fd limit.
    watch: {
      usePolling: false,
      ignored: [
        '**/node_modules/**',
        '**/server/**',
        '**/third-party/**',
        '**/Reference Code/**',
        '**/Reference Music/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/logs/**',
        '**/public/**',
        '**/*-wasm/**',
        '**/juce-wasm/**',
        '**/mame-wasm/**',
        '**/db303-local/**',
        '**/test-output/**',
        '**/test-data/**',
        '**/.worktrees/**',
        '**/.cache/**',
        '**/electron/**',
        '**/tools/**',
        '**/docs/**',
        '**/thoughts/**',
        '**/claudedocs/**',
        '**/assembly/**',
        '**/data/**',
        '**/icons/**',
        '**/Turntable/**',
        '**/Vestax Mixer/**',
        '**/*.png',
        '**/*.jpg',
        '**/*.wav',
        '**/*.mp3',
        '**/*.glb',
        '**/*.pdf',
        '**/*.gz',
      ],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  // Every app worker is a module worker (`new Worker(url, { type: 'module' })`
  // and `?worker` factories), and several worker graphs reach parsers through
  // dynamic import(), which code-splits. Vite's default worker.format 'iife'
  // cannot code-split and fails the production build; 'es' emits module
  // workers, which chrome90 (build.target) supports.
  worker: {
    format: 'es',
  },
  build: {
    // Target older Chromium for Tesla/embedded browser compatibility
    target: 'chrome90',
    // Clean dist/ before each build to prevent recursive nesting
    emptyOutDir: true,
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
      input: {
        main: 'index.html',
        controller: 'controller.html',
      },
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