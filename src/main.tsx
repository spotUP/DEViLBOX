import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { enableMapSet } from 'immer'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ResponsiveProvider } from './contexts/ResponsiveContext.tsx'
import { useSettingsStore } from './stores/useSettingsStore'
import { getToneEngine } from './engine/ToneEngine'

// Enable Immer support for Map and Set (required for stores using these)
enableMapSet();

// Dev tools: synth tester (adds testAllSynths() etc. to window)
import './utils/synthTester'

// Subscribe to audio latency setting changes
useSettingsStore.subscribe(
  (state) => {
    try {
      getToneEngine().setAudioLatency(state.audioLatency);
    } catch { /* ignore */ }
  }
);

// Global error handlers for uncaught errors
window.addEventListener('error', (event) => {
  console.error('[Global] Uncaught error:', event.error);
  // In production, send to error reporting service
});

window.addEventListener('unhandledrejection', (event) => {
  // Suppress InvalidStateError - this happens when audioWorklet.addModule() is called
  // on a suspended AudioContext. It's not critical as worklets will load when context resumes.
  if (event.reason?.name === 'InvalidStateError') {
    event.preventDefault(); // Suppress the error
    console.debug('[Global] Suppressed InvalidStateError (AudioContext suspended)');
    return;
  }

  console.error('[Global] Unhandled promise rejection:', event.reason);
  // In production, send to error reporting service
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ResponsiveProvider>
        <App />
      </ResponsiveProvider>
    </ErrorBoundary>
  </StrictMode>,
)
