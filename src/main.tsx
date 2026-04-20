// Polyfills for older browsers (must be first import)
import './utils/polyfills'
import { startConsoleCapture } from './bridge/consoleCapture'
startConsoleCapture();

import { createRoot } from 'react-dom/client'
import { enableMapSet } from 'immer'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ResponsiveProvider } from './contexts/ResponsiveContext.tsx'

// Enable Immer support for Map and Set (required for stores using these)
enableMapSet();

// Auto-blur <select> elements after change so keyboard focus returns to the app.
// Without this, dropdown selections steal focus and swallow tracker keypresses.
document.addEventListener('change', (e) => {
  if (e.target instanceof HTMLSelectElement) e.target.blur();
}, true);

// Register synth descriptors with SynthRegistry
// Built-in synths (Tone.js, Sampler, TB-303, Furnace) — eager registration
import './engine/registry/builtin'
// SDK synths (MAME, Buzz, VSTBridge, WAM, etc.) — lazy loader registration
import './engine/registry/sdk'
// Effect descriptors — eager (Tone.js, WASM) + lazy loaders (Buzz, WAM, Neural)
import './engine/registry/effects'

// Dev tools: synth tester (adds testAllSynths() etc. to window)
import './utils/synthTester'

// iOS: Install global audio unlock listener so the very first touch/click
// (even dismissing a modal) unlocks the AudioContext. No-op on non-iOS.
import { installIOSAudioUnlock } from './utils/ios-audio-unlock'
installIOSAudioUnlock();

// MCP Bridge: Connect to MCP server for programmatic tracker control
// Always initialized so the AI panel's MCP tools work in any browser
import('./bridge/MCPBridge').then(({ initMCPBridge }) => initMCPBridge());

// Soak test: opt-in via ?soak=supreme URL param. Runs end-to-end auto-DJ through
// the Supreme Synthetics playlist and dumps a timing/heap/error report on finish.
if (new URLSearchParams(window.location.search).has('soak')) {
  import('./soak/soakTest').then(({ runSupremeSynthSoak }) => {
    void runSupremeSynthSoak();
  });
}

// Global error handlers for uncaught errors
window.addEventListener('error', (event) => {
  // Suppress Tone.js PolySynth disposal errors - these happen when scheduled events
  // (like note releases) fire after the synth has been disposed. Not critical.
  if (event.error?.message?.includes('already disposed')) {
    event.preventDefault();
    return;
  }

  // Suppress PixiJS render-pipeline race conditions — a texture's source can become
  // null between React reconciliation and PixiJS's render pass (alphaMode / renderPipeId).
  // These are transient and self-heal on the next frame.
  if (event.error?.message?.includes('alphaMode') || event.error?.message?.includes('renderPipeId')) {
    event.preventDefault();
    return;
  }

  // Suppress WAM plugin SortableJS clone errors — external WAM plugins bundle their
  // own SortableJS which crashes when cloning custom elements (constructors require
  // initialized plugin instances). Non-critical; the WAM GUI still works.
  if (event.error?.message?.includes("setting 'gui'") || event.error?.message?.includes("reading 'audioNode'")) {
    event.preventDefault();
    return;
  }

  // event.error is null for cross-origin script errors (browser sanitizes them for security)
  // or when WASM/worker code throws a non-Error value. Log what we can from the event itself.
  if (event.error == null) {
    console.warn('[Global] Uncaught script error (cross-origin or non-Error throw):', event.message || '(no message)', event.filename ? `@ ${event.filename}:${event.lineno}` : '');
    return;
  }

  console.error('[Global] Uncaught error:', event.error);
  // In production, send to error reporting service
});

// Dev-mode capture array — ui-smoke and manual probes can read
// window.__capturedRejections to pull every stack we've seen. Populated only
// when import.meta.env.DEV so production never accumulates the array.
declare global {
  interface Window {
    __capturedRejections?: Array<{
      time: number;
      reasonType: string;
      reasonStr: string;
      reasonName: string | null;
      stack: string;
    }>;
  }
}
if (import.meta.env.DEV) {
  window.__capturedRejections = [];
}

window.addEventListener('unhandledrejection', (event) => {
  // Suppress InvalidStateError - this happens when audioWorklet.addModule() is called
  // on a suspended AudioContext. It's not critical as worklets will load when context resumes.
  if (event.reason?.name === 'InvalidStateError') {
    event.preventDefault(); // Suppress the error
    console.debug('[Global] Suppressed InvalidStateError (AudioContext suspended)');
    return;
  }

  // Build a structured snapshot that's useful even when event.reason is an
  // empty string / undefined / non-Error — exactly the silent-failure class
  // the regression suite is supposed to surface. Uses the distinctive
  // `[unhandledrejection]` prefix so tools/ui-smoke/get_console_errors can
  // grep for it without a new MCP tool.
  const reason = event.reason;
  const reasonType = typeof reason;
  const reasonStr = (() => {
    try { return String(reason); } catch { return '<unstringifiable>'; }
  })();
  const reasonName = reason && typeof reason === 'object' && 'name' in reason
    ? String((reason as { name?: unknown }).name ?? '')
    : null;
  // If the reason is an Error, use its stack. Otherwise synthesize one from
  // the handler call site so there's always *something* traceable.
  const stack = reason instanceof Error
    ? reason.stack ?? '(Error without stack)'
    : (new Error('synthetic stack at unhandledrejection listener').stack ?? '(no stack)');

  if (import.meta.env.DEV && window.__capturedRejections) {
    window.__capturedRejections.push({
      time: Date.now(),
      reasonType,
      reasonStr,
      reasonName,
      stack,
    });
  }

  console.error(
    `[unhandledrejection] type=${reasonType}` +
    ` name=${reasonName ?? '-'}` +
    ` reason=${reasonStr || '(empty)'}\n${stack}`
  );
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ResponsiveProvider>
      <App />
    </ResponsiveProvider>
  </ErrorBoundary>,
)

// Soak test debug hooks: DJ/VJ actions + frame-time/GPU telemetry for MCP-driven stress test
if (import.meta.env.DEV) {
  import('./debug/soakActions').then(m => m.installSoakHooks()).catch(() => {});
}

// Register service worker for caching (samples, app shell, WAM plugins)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => {
    // Prefetch all WAM synth/FX plugins in background so they're cached
    // and load instantly when needed (also enables offline use)
    import('./engine/wam/WAMPrefetch').then(m => m.prefetchWAMPlugins()).catch(() => {});
  }).catch((err) => {
    console.warn('[SW] Registration failed:', err);
  });
}
