import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ResponsiveProvider } from './contexts/ResponsiveContext.tsx'
import { useSettingsStore } from './stores/useSettingsStore'
import { useTransportStore } from './stores/useTransportStore'
import { getToneEngine } from './engine/ToneEngine'

// Dev tools: synth tester (adds testAllSynths() etc. to window)
import './utils/synthTester'

// 1. Subscribe to manual audio latency setting changes
useSettingsStore.subscribe(
  (state) => {
    try {
      const isPlaying = useTransportStore.getState().isPlaying;
      // If auto-latency is off, or if it is on but we are currently playing,
      // apply the setting immediately.
      if (!state.autoLatency || isPlaying) {
        getToneEngine().setAudioLatency(state.audioLatency);
      }
    } catch (e) { /* ignore */ }
  }
);

// 2. Subscribe to transport state for Auto-Latency switching
useTransportStore.subscribe(
  (state) => {
    try {
      const settings = useSettingsStore.getState();
      if (settings.autoLatency) {
        const engine = getToneEngine();
        if (state.isPlaying) {
          // Switch to user's preferred stable setting for playback
          console.log('[Auto-Latency] Playback started: Switching to', settings.audioLatency);
          engine.setAudioLatency(settings.audioLatency);
        } else {
          // Switch to interactive (10ms) for snappy jam sessions when stopped
          console.log('[Auto-Latency] Playback stopped: Switching to interactive');
          engine.setAudioLatency('interactive');
        }
      }
    } catch (e) { /* ignore */ }
  }
);

// Global error handlers for uncaught errors
window.addEventListener('error', (event) => {
  console.error('[Global] Uncaught error:', event.error);
  // In production, send to error reporting service
});

window.addEventListener('unhandledrejection', (event) => {
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
