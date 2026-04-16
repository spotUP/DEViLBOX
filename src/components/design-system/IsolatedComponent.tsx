/**
 * IsolatedComponent — Renders a single component full-screen for split-screen comparison.
 *
 * Used by ?_isolate=<component-name> URL parameter.
 * Renders the DOM version of the component.
 */

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

// Lazy-load GT Ultra DOM components
const GTToolbar = lazy(() => import('@/components/gtultra/GTToolbar').then(m => ({ default: m.GTToolbar })));
const GTInstrumentPanel = lazy(() => import('@/components/gtultra/GTInstrumentPanel').then(m => ({ default: m.GTInstrumentPanel })));
const GTOrderList = lazy(() => import('@/components/gtultra/GTOrderList').then(m => ({ default: m.GTOrderList })));
const GTTableEditor = lazy(() => import('@/components/gtultra/GTTableEditor').then(m => ({ default: m.GTTableEditor })));

interface Props {
  name: string;
}

export const IsolatedComponent: React.FC<Props> = ({ name }) => {
  const [size, setSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const sidCount = useGTUltraStore((s) => s.sidCount);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100vh', background: '#0d0d0d', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '4px 12px', background: '#1a1a24', borderBottom: '1px solid #2a2a3a', fontSize: 9, color: '#6b6b80', fontFamily: '"JetBrains Mono", monospace' }}>
        DOM: {name}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Suspense fallback={<div style={{ padding: 16, color: '#444' }}>Loading...</div>}>
          {name === 'toolbar' && <GTToolbar />}
          {name === 'instrument-panel' && <GTInstrumentPanel width={size.width} height={size.height - 30} />}
          {name === 'order-list' && <GTOrderList width={size.width} height={size.height - 30} channelCount={sidCount * 3} />}
          {name === 'table-editor' && <GTTableEditor width={size.width} height={size.height - 30} />}
          {name === 'pattern-grid' && (
            <div style={{ padding: 16, color: '#6b6b80', fontFamily: 'monospace', fontSize: 11 }}>
              Pattern Grid uses PatternEditorCanvas — load a GT Ultra .sng to see it in context.
            </div>
          )}
          {name === 'sid-monitor' && (
            <div style={{ padding: 16, color: '#6b6b80', fontFamily: 'monospace', fontSize: 11 }}>
              SID Monitor — available in GTUltraControls instrument tab. Load a .sng file.
            </div>
          )}
          {name === 'preset-browser' && (
            <div style={{ padding: 16, color: '#6b6b80', fontFamily: 'monospace', fontSize: 11 }}>
              Preset Browser — available in DAW mode bottom panel. Switch to DAW view.
            </div>
          )}
          {name === 'piano-roll' && (
            <div style={{ padding: 16, color: '#6b6b80', fontFamily: 'monospace', fontSize: 11 }}>
              Piano Roll — available in DAW mode. Load a GT Ultra .sng and switch to DAW view.
            </div>
          )}
          {name === 'mixer' && (
            <div style={{ padding: 16, color: '#6b6b80', fontFamily: 'monospace', fontSize: 11 }}>
              Mixer — available in DAW mode bottom panel or Mixer view.
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
};