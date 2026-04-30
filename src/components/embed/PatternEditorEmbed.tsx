/**
 * PatternEditorEmbed — Minimal pattern editor for iframe embedding.
 *
 * Activated via ?embed=pattern-editor.  Renders only:
 *   • PatternEditorCanvas (full-height)
 *   • Compact transport bar (play/stop, BPM, position)
 *
 * PostMessage API (inbound from parent):
 *   LOAD_FILE   { arrayBuffer: ArrayBuffer, filename: string }
 *   PLAY        {}
 *   PAUSE       {}
 *   STOP        {}
 *   SEEK        { orderIndex: number, row: number }
 *
 * PostMessage API (outbound to parent):
 *   READY       {}
 *   FILE_LOADED { filename: string }
 *   FILE_CHANGED { arrayBuffer: ArrayBuffer }   (debounced full MOD export)
 *   POSITION_UPDATE { row, pattern, orderIndex, isPlaying }
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PatternEditorCanvas } from '../tracker/PatternEditorCanvas';
import { useTrackerStore, useTransportStore, useAudioStore } from '../../stores';
import { getToneEngine } from '../../engine/ToneEngine';
import { usePatternPlayback } from '../../hooks/audio/usePatternPlayback';
import { useGlobalKeyboardHandler } from '../../hooks/useGlobalKeyboardHandler';
import { initKeyboardRouter, destroyKeyboardRouter } from '../../engine/keyboard/KeyboardRouter';
import { loadFile } from '../../lib/file/UnifiedFileLoader';

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
]);

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || origin === window.location.origin;
}

export function PatternEditorEmbed() {
  const [audioReady, setAudioReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const parentOriginRef = useRef<string | null>(null);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileChangedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio store
  const { initialized, setInitialized, setContextState, setToneEngineInstance,
    setAnalyserNode, setFFTNode } = useAudioStore(
    useShallow((s) => ({
      initialized: s.initialized,
      setInitialized: s.setInitialized,
      setContextState: s.setContextState,
      setToneEngineInstance: s.setToneEngineInstance,
      setAnalyserNode: s.setAnalyserNode,
      setFFTNode: s.setFFTNode,
    }))
  );

  // Transport
  const { isPlaying, bpm, speed, currentRow } = useTransportStore(
    useShallow((s) => ({
      isPlaying: s.isPlaying,
      bpm: s.bpm,
      speed: s.speed,
      currentRow: s.currentRow,
    }))
  );

  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const currentPositionIndex = useTrackerStore((s) => s.currentPositionIndex);

  // Pattern playback engine (same as App-level mount)
  usePatternPlayback();

  // Keyboard router for pattern editor navigation
  useGlobalKeyboardHandler();
  useEffect(() => {
    initKeyboardRouter();
    return () => { destroyKeyboardRouter(); };
  }, []);

  // Initialize audio engine (same as App.tsx lines 400-432)
  useEffect(() => {
    const initAudio = async () => {
      try {
        const engine = getToneEngine();
        setToneEngineInstance(engine);
        setAnalyserNode(engine.analyser);
        setFFTNode(engine.fft);
        const audioState = useAudioStore.getState();
        engine.setMasterVolume(audioState.masterVolume);
        engine.setSampleBusGain(audioState.sampleBusGain);
        engine.setSynthBusGain(audioState.synthBusGain);
        engine.setMasterMute(audioState.masterMuted);
        setContextState(engine.getContextState() as 'suspended' | 'running' | 'closed');
        setInitialized(true);
      } catch (error) {
        console.error('[Embed] Audio init failed:', error);
      }
    };
    initAudio();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle user click to resume AudioContext (browser autoplay policy)
  const handleEnableAudio = useCallback(async () => {
    try {
      const engine = getToneEngine();
      await engine.init();
      setContextState(engine.getContextState() as 'suspended' | 'running' | 'closed');
      setAudioReady(true);
    } catch (error) {
      console.error('[Embed] Audio resume failed:', error);
    }
  }, [setContextState]);

  // Send message to parent
  const postToParent = useCallback((type: string, data: Record<string, unknown> = {}) => {
    const origin = parentOriginRef.current || '*';
    window.parent?.postMessage({ type, ...data }, origin);
  }, []);

  // PostMessage handler
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (!isAllowedOrigin(e.origin)) return;
      parentOriginRef.current = e.origin;

      const { type, ...data } = e.data || {};

      switch (type) {
        case 'LOAD_FILE': {
          if (!data.arrayBuffer || !data.filename) return;
          setLoading(true);
          try {
            const blob = new Blob([data.arrayBuffer]);
            const file = new File([blob], data.filename);
            const result = await loadFile(file);
            if (result.success === true) {
              setLoadedFile(data.filename);
              postToParent('FILE_LOADED', { filename: data.filename });
            }
          } catch (err) {
            console.error('[Embed] LOAD_FILE failed:', err);
          }
          setLoading(false);
          break;
        }

        case 'PLAY': {
          if (!audioReady) await handleEnableAudio();
          useTransportStore.getState().play();
          break;
        }

        case 'PAUSE':
          useTransportStore.getState().pause();
          break;

        case 'STOP':
          useTransportStore.getState().stop();
          break;

        case 'SEEK': {
          const transport = useTransportStore.getState();
          if (typeof data.orderIndex === 'number') {
            useTrackerStore.getState().setCurrentPosition(data.orderIndex);
          }
          if (typeof data.row === 'number') {
            transport.setCurrentRow(data.row);
          }
          break;
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [audioReady, handleEnableAudio, postToParent]);

  // Emit POSITION_UPDATE periodically
  useEffect(() => {
    positionIntervalRef.current = setInterval(() => {
      const t = useTransportStore.getState();
      const tr = useTrackerStore.getState();
      postToParent('POSITION_UPDATE', {
        row: t.currentRow,
        pattern: tr.currentPatternIndex,
        orderIndex: tr.currentPositionIndex,
        isPlaying: t.isPlaying,
      });
    }, 100);
    return () => {
      if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
    };
  }, [postToParent]);

  // Watch tracker store for pattern changes → debounced FILE_CHANGED
  useEffect(() => {
    const unsub = useTrackerStore.subscribe((state, prev) => {
      if (state.patterns !== prev.patterns) {
        if (fileChangedTimerRef.current) clearTimeout(fileChangedTimerRef.current);
        fileChangedTimerRef.current = setTimeout(() => {
          postToParent('FILE_CHANGED', { patternsModified: true });
        }, 2000);
      }
    });
    return () => unsub();
  }, [postToParent]);

  // Send READY once initialized
  useEffect(() => {
    if (initialized) {
      postToParent('READY', {});
    }
  }, [initialized, postToParent]);

  if (!initialized) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d0d0d', color: '#6b6b80', fontFamily: 'monospace',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 16, height: 16, border: '2px solid #6b6b80',
            borderTop: '2px solid transparent', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          Initializing...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d', overflow: 'hidden' }}>
      {/* Compact transport bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
        background: '#1a1a2e', borderBottom: '1px solid #2a2a3e', flexShrink: 0,
        fontFamily: 'monospace', fontSize: 12, color: '#ccc',
      }}>
        <button
          onClick={async () => {
            if (!audioReady) await handleEnableAudio();
            const t = useTransportStore.getState();
            if (t.isPlaying) t.stop(); else t.play();
          }}
          style={{
            padding: '2px 12px', background: isPlaying ? '#e74c3c' : '#2ecc71',
            color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
            fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold',
          }}
        >
          {isPlaying ? '■ STOP' : '▶ PLAY'}
        </button>
        <span style={{ color: '#888' }}>BPM:</span>
        <span style={{ color: '#fff', minWidth: 30 }}>{bpm}</span>
        <span style={{ color: '#888' }}>SPD:</span>
        <span style={{ color: '#fff', minWidth: 20 }}>{speed}</span>
        <span style={{ color: '#888' }}>POS:</span>
        <span style={{ color: '#fff', minWidth: 20 }}>{String(currentPositionIndex).padStart(2, '0')}</span>
        <span style={{ color: '#888' }}>ROW:</span>
        <span style={{ color: '#fff', minWidth: 20 }}>{String(currentRow).padStart(2, '0')}</span>
        {loading && <span style={{ color: '#f1c40f' }}>Loading...</span>}
        {loadedFile && <span style={{ color: '#888', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loadedFile}</span>}
        {!audioReady && (
          <button
            onClick={handleEnableAudio}
            style={{
              marginLeft: 'auto', padding: '2px 8px', background: '#e67e22',
              color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'monospace', fontSize: 11,
            }}
          >
            🔊 Enable Audio
          </button>
        )}
      </div>

      {/* Pattern editor fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PatternEditorCanvas hideAutomationLanes />
      </div>
    </div>
  );
}
