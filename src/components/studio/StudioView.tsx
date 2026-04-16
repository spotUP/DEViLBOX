/**
 * StudioView — DOM multi-panel studio layout.
 *
 * Tiled split view combining tracker, instrument editor, and mixer.
 * DOM equivalent of the GL WorkbenchContainer's "Compose" workspace.
 * Panels are resizable via drag handles.
 */

import React, { lazy, Suspense, useCallback, useRef, useState, useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';

// Lazy-load heavy sub-views
const TrackerView = lazy(() =>
  import('../tracker/TrackerView').then(m => ({ default: m.TrackerView }))
);
const UnifiedInstrumentEditor = lazy(() =>
  import('../instruments/editors/UnifiedInstrumentEditor').then(m => ({ default: m.UnifiedInstrumentEditor }))
);

type PanelId = 'tracker' | 'instrument';

const PANEL_LABELS: Record<PanelId, string> = {
  tracker: 'Tracker',
  instrument: 'Instrument',
};

const PANEL_MIN_W = 200;

const LoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
    Loading {label}...
  </div>
);

// ─── InstrumentPanel — reads from store, no props needed ────────────────────

const InstrumentPanel: React.FC = () => {
  const instruments = useInstrumentStore(s => s.instruments);
  const currentId = useInstrumentStore(s => s.currentInstrumentId);
  const updateInstrument = useInstrumentStore(s => s.updateInstrument);
  const setCurrentInstrument = useInstrumentStore(s => s.setCurrentInstrument);

  const current = instruments.find(i => i.id === currentId) ?? instruments[0];
  const sorted = [...instruments].sort((a, b) => a.id - b.id);
  const idx = sorted.findIndex(i => i.id === currentId);

  const handlePrev = useCallback(() => {
    if (sorted.length === 0) return;
    const prev = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1];
    setCurrentInstrument(prev.id);
  }, [idx, sorted, setCurrentInstrument]);

  const handleNext = useCallback(() => {
    if (sorted.length === 0) return;
    const next = idx < sorted.length - 1 ? sorted[idx + 1] : sorted[0];
    setCurrentInstrument(next.id);
  }, [idx, sorted, setCurrentInstrument]);

  if (!current) {
    return <div className="flex-1 flex items-center justify-center text-text-muted text-xs">No instruments</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Nav header */}
      <div className="flex items-center gap-1 px-2 py-1 bg-dark-bgTertiary border-b border-dark-border text-xs shrink-0">
        <button onClick={handlePrev} className="p-0.5 hover:bg-dark-bgHover rounded" title="Previous instrument">
          <ChevronLeft size={12} />
        </button>
        <span className="flex-1 text-center text-text-secondary font-mono truncate">
          {String(current.id).padStart(2, '0')}: {current.name || current.synthType}
        </span>
        <button onClick={handleNext} className="p-0.5 hover:bg-dark-bgHover rounded" title="Next instrument">
          <ChevronRight size={12} />
        </button>
      </div>
      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={<LoadingFallback label="instrument editor" />}>
          <UnifiedInstrumentEditor
            instrument={current}
            onChange={(updates) => updateInstrument(current.id, updates)}
          />
        </Suspense>
      </div>
    </div>
  );
};

// ─── Resizable Divider ─────────────────────────────────────────────────────

interface DividerProps {
  onDrag: (deltaX: number) => void;
}

const ResizeDivider: React.FC<DividerProps> = ({ onDrag }) => {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    onDrag(dx);
  }, [onDrag]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      className="w-1 bg-dark-border hover:bg-accent-primary/40 cursor-col-resize shrink-0 active:bg-accent-primary/60 transition-colors"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
};

// ─── Panel wrapper with collapse toggle ────────────────────────────────────

interface PanelProps {
  id: PanelId;
  collapsed: boolean;
  onToggle: () => void;
  width?: number;
  children: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({ id, collapsed, onToggle, width, children }) => (
  <div
    className="flex flex-col min-h-0 bg-dark-bg border-dark-border overflow-hidden"
    style={collapsed ? { width: 28, minWidth: 28, maxWidth: 28 } : width ? { width, minWidth: PANEL_MIN_W } : { flex: 1, minWidth: PANEL_MIN_W }}
  >
    {collapsed ? (
      <button
        onClick={onToggle}
        className="flex flex-col items-center justify-center h-full w-full bg-dark-bgSecondary hover:bg-dark-bgHover text-text-muted text-[9px] gap-1"
        title={`Expand ${PANEL_LABELS[id]}`}
      >
        <Maximize2 size={10} />
        <span className="writing-vertical-lr rotate-180 tracking-widest font-mono" style={{ writingMode: 'vertical-lr' }}>
          {PANEL_LABELS[id].toUpperCase()}
        </span>
      </button>
    ) : (
      <>
        <div className="flex items-center px-2 py-0.5 bg-dark-bgSecondary border-b border-dark-border shrink-0">
          <span className="text-[10px] font-mono text-text-muted tracking-widest flex-1">
            {PANEL_LABELS[id].toUpperCase()}
          </span>
          <button
            onClick={onToggle}
            className="p-0.5 hover:bg-dark-bgHover rounded text-text-muted"
            title={`Collapse ${PANEL_LABELS[id]}`}
          >
            <Minimize2 size={10} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </>
    )}
  </div>
);

// ─── StudioView ─────────────────────────────────────────────────────────────

export const StudioView: React.FC = () => {
  const openModal = useUIStore(s => s.openModal);
  const [collapsed, setCollapsed] = useState<Record<PanelId, boolean>>({
    tracker: false,
    instrument: false,
  });

  // Panel widths as percentages of remaining space (after collapsed panels)
  const containerRef = useRef<HTMLDivElement>(null);
  const [trackerW, setTrackerW] = useState<number | null>(null);

  // Initialize widths on first render
  useEffect(() => {
    if (containerRef.current && trackerW === null) {
      const total = containerRef.current.clientWidth;
      setTrackerW(Math.round(total * 0.45));
    }
  }, [trackerW]);

  const togglePanel = useCallback((id: PanelId) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleDivider2 = useCallback((dx: number) => {
    setTrackerW(prev => Math.max(PANEL_MIN_W, (prev ?? 400) + dx));
  }, []);

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
      {/* Tracker panel */}
      <Panel id="tracker" collapsed={collapsed.tracker} onToggle={() => togglePanel('tracker')} width={collapsed.tracker ? undefined : (trackerW ?? undefined)}>
        <Suspense fallback={<LoadingFallback label="tracker" />}>
          <TrackerView
            onShowExport={() => openModal('export')}
            onShowHelp={(tab) => openModal('help', { initialTab: tab || 'shortcuts' })}
            onShowMasterFX={() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }}
            onShowInstrumentFX={() => { const s = useUIStore.getState(); if (s.modalOpen === 'instrumentFx') { s.closeModal(); } else { s.openModal('instrumentFx'); } }}
            onShowInstruments={() => openModal('instruments')}
            onShowDrumpads={() => openModal('drumpads')}
            showPatterns={false}
            showMasterFX={false}
            showInstrumentFX={false}
          />
        </Suspense>
      </Panel>

      {!collapsed.tracker && !collapsed.instrument && <ResizeDivider onDrag={handleDivider2} />}

      {/* Instrument editor takes remaining space */}
      <Panel id="instrument" collapsed={collapsed.instrument} onToggle={() => togglePanel('instrument')}>
        <InstrumentPanel />
      </Panel>
    </div>
  );
};

export default StudioView;
