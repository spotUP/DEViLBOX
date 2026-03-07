/**
 * StudioCanvasView — Free-form 2D canvas studio layout.
 *
 * Pan/zoom canvas with freely positioned panels (tracker, instrument editor, mixer).
 * Modeled after the modular synth's ModularCanvasView.
 *
 * Features:
 * - Pan with middle-mouse or Shift+drag
 * - Zoom with mouse wheel
 * - Drag panels by header to reposition
 * - Resize panels from any edge or corner
 * - Keyboard: F to fit all, R to reset
 */

import React, { useCallback, useRef, useEffect, useLayoutEffect, useState, lazy, Suspense } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

// Lazy-load heavy sub-views
const TrackerView = lazy(() =>
  import('../tracker/TrackerView').then(m => ({ default: m.TrackerView }))
);
const UnifiedInstrumentEditor = lazy(() =>
  import('../instruments/editors/UnifiedInstrumentEditor').then(m => ({ default: m.UnifiedInstrumentEditor }))
);
const MixerContent = lazy(() =>
  import('../panels/MixerPanel').then(m => ({ default: m.MixerView }))
);

// ─── Camera ─────────────────────────────────────────────────────────────────

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

function clampZoom(z: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

// ─── Panel Layout ───────────────────────────────────────────────────────────

type StudioPanelId = 'tracker' | 'instrument' | 'mixer';

interface PanelLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 8; // px gap between panels
const PANEL_MIN_W = 200;
const PANEL_MIN_H = 150;

function computeDefaultPanels(viewW: number, viewH: number): Record<StudioPanelId, PanelLayout> {
  const pad = 10;

  // Content-appropriate sizes — panels can extend beyond viewport (canvas is pannable)
  const trackerW = Math.max(900, Math.round(viewW * 0.55));
  const instrW = Math.max(560, Math.round(viewW * 0.42));
  const totalW = trackerW + instrW + GAP;
  const topH = Math.max(500, Math.round(viewH * 0.68));
  const mixerH = Math.max(220, Math.round(viewH * 0.28));

  return {
    tracker:    { x: pad, y: pad, w: trackerW, h: topH },
    instrument: { x: pad + trackerW + GAP, y: pad, w: instrW, h: topH },
    mixer:      { x: pad, y: pad + topH + GAP, w: totalW, h: mixerH },
  };
}

// Fallback before container is measured
const DEFAULT_PANELS: Record<StudioPanelId, PanelLayout> = computeDefaultPanels(1280, 800);

const PANEL_LABELS: Record<StudioPanelId, string> = {
  tracker: 'TRACKER',
  instrument: 'INSTRUMENT',
  mixer: 'MIXER',
};

const PANEL_COLORS: Record<StudioPanelId, string> = {
  tracker: 'border-2 border-blue-500/40',
  instrument: 'border-2 border-purple-500/40',
  mixer: 'border-2 border-green-500/40',
};

const EDGE_SIZE = 6; // px — hit area for edge resize handles

// Resize edge/corner directions
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGE_CURSORS: Record<ResizeEdge, string> = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  nw: 'nwse-resize', se: 'nwse-resize',
};

// ─── Grid Background ────────────────────────────────────────────────────────

const StudioGrid: React.FC<{ zoom: number; offsetX: number; offsetY: number }> = ({ zoom, offsetX, offsetY }) => {
  const gridSize = 20;
  const scaledSize = gridSize * zoom;

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <pattern
          id="studio-canvas-grid"
          width={scaledSize}
          height={scaledSize}
          patternUnits="userSpaceOnUse"
          x={offsetX}
          y={offsetY}
        >
          <circle
            cx={scaledSize / 2}
            cy={scaledSize / 2}
            r={Math.max(0.6, zoom * 0.8)}
            fill="var(--color-text-muted)"
            opacity="0.2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#studio-canvas-grid)" />
    </svg>
  );
};

// ─── Instrument Panel Content ───────────────────────────────────────────────

const InstrumentPanelContent: React.FC = () => {
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
      <div className="flex-1 min-h-0 overflow-auto" style={{ containerType: 'inline-size' }}>
        <Suspense fallback={<div className="flex items-center justify-center text-text-muted text-xs p-4">Loading...</div>}>
          <UnifiedInstrumentEditor
            instrument={current}
            onChange={(updates) => updateInstrument(current.id, updates)}
          />
        </Suspense>
      </div>
    </div>
  );
};

// ─── Edge Resize Handles ────────────────────────────────────────────────────

interface EdgeHandlesProps {
  onEdgeDown: (edge: ResizeEdge, e: React.PointerEvent) => void;
}

const EdgeHandles: React.FC<EdgeHandlesProps> = ({ onEdgeDown }) => {
  const common = "absolute z-10";
  const E = EDGE_SIZE;
  return (
    <>
      {/* Edges */}
      <div className={common} style={{ top: E, bottom: E, left: 0, width: E, cursor: 'ew-resize' }} onPointerDown={(e) => onEdgeDown('w', e)} />
      <div className={common} style={{ top: E, bottom: E, right: 0, width: E, cursor: 'ew-resize' }} onPointerDown={(e) => onEdgeDown('e', e)} />
      <div className={common} style={{ left: E, right: E, top: 0, height: E, cursor: 'ns-resize' }} onPointerDown={(e) => onEdgeDown('n', e)} />
      <div className={common} style={{ left: E, right: E, bottom: 0, height: E, cursor: 'ns-resize' }} onPointerDown={(e) => onEdgeDown('s', e)} />
      {/* Corners */}
      <div className={common} style={{ top: 0, left: 0, width: E * 2, height: E * 2, cursor: 'nwse-resize' }} onPointerDown={(e) => onEdgeDown('nw', e)} />
      <div className={common} style={{ top: 0, right: 0, width: E * 2, height: E * 2, cursor: 'nesw-resize' }} onPointerDown={(e) => onEdgeDown('ne', e)} />
      <div className={common} style={{ bottom: 0, left: 0, width: E * 2, height: E * 2, cursor: 'nesw-resize' }} onPointerDown={(e) => onEdgeDown('sw', e)} />
      <div className={common} style={{ bottom: 0, right: 0, width: E * 2, height: E * 2, cursor: 'nwse-resize' }} onPointerDown={(e) => onEdgeDown('se', e)} />
    </>
  );
};

// ─── Draggable Panel ────────────────────────────────────────────────────────

const COLLAPSED_H = 28; // title bar height when collapsed

interface DraggablePanelProps {
  id: StudioPanelId;
  layout: PanelLayout;
  camera: CameraState;
  collapsed: boolean;
  zIndex: number;
  onDragStart: (id: StudioPanelId, e: React.PointerEvent) => void;
  onEdgeResizeStart: (id: StudioPanelId, edge: ResizeEdge, e: React.PointerEvent) => void;
  onBringToFront: (id: StudioPanelId) => void;
  onToggleCollapse: (id: StudioPanelId) => void;
  children: React.ReactNode;
}

// Panels are positioned directly in screen-space (camera offset + zoom applied
// per-panel) instead of using a CSS `transform` wrapper. This avoids creating a
// new containing block that would trap `position: fixed` dialogs rendered inside
// child components like TrackerView.
const DraggablePanel: React.FC<DraggablePanelProps> = ({ id, layout, camera, collapsed, zIndex, onDragStart, onEdgeResizeStart, onBringToFront, onToggleCollapse, children }) => {
  const handleEdgeDown = useCallback((edge: ResizeEdge, e: React.PointerEvent) => {
    onEdgeResizeStart(id, edge, e);
  }, [id, onEdgeResizeStart]);

  const displayH = collapsed ? COLLAPSED_H : layout.h * camera.zoom;

  return (
    <div
      data-studio-panel
      className="absolute overflow-visible"
      style={{
        left: camera.x + layout.x * camera.zoom,
        top: camera.y + layout.y * camera.zoom,
        width: layout.w * camera.zoom,
        height: displayH,
        zIndex,
      }}
      onMouseDown={() => onBringToFront(id)}
    >
      {/* Edge resize handles (only when not collapsed) */}
      {!collapsed && <EdgeHandles onEdgeDown={handleEdgeDown} />}

      {/* Inner wrapper — clips content to rounded corners */}
      <div className={`w-full h-full rounded-lg ${PANEL_COLORS[id]} shadow-xl bg-dark-bg overflow-hidden flex flex-col`}>
        {/* Title bar — drag handle, double-click to collapse */}
        <div
          className="flex items-center px-2 py-1 bg-dark-bgSecondary border-b border-dark-border cursor-move shrink-0 select-none"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragStart(id, e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(id);
          }}
        >
          <span className="text-[10px] font-mono text-text-muted tracking-widest flex-1 pointer-events-none">
            {PANEL_LABELS[id]}
          </span>
          <span className="text-[9px] font-mono text-text-muted opacity-50 pointer-events-none">
            {collapsed ? 'collapsed' : `${Math.round(layout.w)}x${Math.round(layout.h)}`}
          </span>
        </div>
        {/* Content — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── StudioCanvasView ───────────────────────────────────────────────────────

interface DragState {
  id: StudioPanelId;
  startX: number;
  startY: number;
  panelX: number;
  panelY: number;
}

interface ResizeState {
  id: StudioPanelId;
  edge: ResizeEdge;
  startX: number;
  startY: number;
  layout: PanelLayout; // snapshot at drag start
}

export const StudioCanvasView: React.FC = () => {
  const openModal = useUIStore(s => s.openModal);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state
  const cameraRef = useRef<CameraState>({ x: 40, y: 40, zoom: 1 });
  const [camera, setCamera] = useState<CameraState>(cameraRef.current);

  // Panel layouts
  const [panels, setPanels] = useState<Record<StudioPanelId, PanelLayout>>({ ...DEFAULT_PANELS });
  const [collapsed, setCollapsed] = useState<Record<StudioPanelId, boolean>>({ tracker: false, instrument: false, mixer: false });
  const [zOrder, setZOrder] = useState<StudioPanelId[]>(['mixer', 'instrument', 'tracker']); // last = frontmost
  const initializedRef = useRef(false);

  // Auto-size panels and fit-to-view on first mount
  useLayoutEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const fitted = computeDefaultPanels(rect.width, rect.height);
      setPanels(fitted);

      // Compute bounding box of all panels and zoom to fit
      let maxX = 0, maxY = 0;
      for (const p of Object.values(fitted)) {
        maxX = Math.max(maxX, p.x + p.w);
        maxY = Math.max(maxY, p.y + p.h);
      }
      const margin = 20;
      const zoom = clampZoom(Math.min(rect.width / (maxX + margin), rect.height / (maxY + margin)));
      cameraRef.current = { x: 0, y: 0, zoom };
      setCamera({ x: 0, y: 0, zoom });
    }
  });

  // Interaction state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  // ── Camera controls ────────────────────────────────────────────────────────

  const updateCamera = useCallback((fn: (cam: CameraState) => CameraState) => {
    const next = fn(cameraRef.current);
    cameraRef.current = next;
    setCamera({ ...next });
  }, []);

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom when scrolling on the canvas background, not inside panels
      const target = e.target as HTMLElement;
      if (target.closest('[data-studio-panel]')) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      updateCamera((cam) => {
        const oldZoom = cam.zoom;
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        const newZoom = clampZoom(oldZoom * (1 + delta));

        const worldX = (mx - cam.x) / oldZoom;
        const worldY = (my - cam.y) / oldZoom;

        return {
          x: mx - worldX * newZoom,
          y: my - worldY * newZoom,
          zoom: newZoom,
        };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [updateCamera]);

  // Global move/up for drag, resize, and pan — use pointer events so
  // preventDefault() on pointerdown in panel headers doesn't swallow mouseup.
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      // Camera pan
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        panStart.current = { x: e.clientX, y: e.clientY };
        updateCamera((cam) => ({ ...cam, x: cam.x + dx, y: cam.y + dy }));
        return;
      }

      const z = cameraRef.current.zoom;

      // Panel drag
      if (dragRef.current) {
        const dt = dragRef.current;
        const dx = (e.clientX - dt.startX) / z;
        const dy = (e.clientY - dt.startY) / z;
        setPanels(prev => ({
          ...prev,
          [dt.id]: { ...prev[dt.id], x: dt.panelX + dx, y: dt.panelY + dy },
        }));
        return;
      }

      // Edge/corner resize
      if (resizeRef.current) {
        const rs = resizeRef.current;
        const dx = (e.clientX - rs.startX) / z;
        const dy = (e.clientY - rs.startY) / z;
        const { edge } = rs;
        const orig = rs.layout;

        let { x, y, w, h } = orig;

        // Horizontal
        if (edge === 'w' || edge === 'nw' || edge === 'sw') {
          const newW = Math.max(PANEL_MIN_W, w - dx);
          x = orig.x + (w - newW);
          w = newW;
        }
        if (edge === 'e' || edge === 'ne' || edge === 'se') {
          w = Math.max(PANEL_MIN_W, w + dx);
        }

        // Vertical
        if (edge === 'n' || edge === 'nw' || edge === 'ne') {
          const newH = Math.max(PANEL_MIN_H, h - dy);
          y = orig.y + (h - newH);
          h = newH;
        }
        if (edge === 's' || edge === 'sw' || edge === 'se') {
          h = Math.max(PANEL_MIN_H, h + dy);
        }

        setPanels(prev => ({ ...prev, [rs.id]: { x, y, w, h } }));
        return;
      }
    };

    const handleUp = () => {
      isPanning.current = false;
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.cursor = '';
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [updateCamera]);

  // Container mousedown for pan (any left click on background, middle mouse, or shift+left)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleDown = (e: MouseEvent) => {
      // Only pan when clicking the canvas background or grid SVG — not inside panels
      const target = e.target as HTMLElement;
      const isBackground = target === el || target.tagName === 'svg' || target.tagName === 'rect' || target.tagName === 'circle' || target.tagName === 'pattern';
      if (!isBackground) return;
      if (e.button === 1 || e.button === 0) {
        if (dragRef.current || resizeRef.current) return;
        e.preventDefault();
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        document.body.style.cursor = 'grabbing';
      }
    };

    el.addEventListener('mousedown', handleDown);
    return () => el.removeEventListener('mousedown', handleDown);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        updateCamera(() => ({ x: 0, y: 0, zoom: 1 }));
        const rect = containerRef.current?.getBoundingClientRect();
        setPanels(rect && rect.width > 0 ? computeDefaultPanels(rect.width, rect.height) : { ...DEFAULT_PANELS });
      }
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of Object.values(panels)) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x + p.w);
          maxY = Math.max(maxY, p.y + p.h);
        }
        const cw = maxX - minX;
        const ch = maxY - minY;
        const zoom = clampZoom(Math.min(rect.width / (cw + 80), rect.height / (ch + 80)));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        updateCamera(() => ({
          x: rect.width / 2 - cx * zoom,
          y: rect.height / 2 - cy * zoom,
          zoom,
        }));
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [panels, updateCamera]);

  // ── Panel drag handler ─────────────────────────────────────────────────────

  const handleDragStart = useCallback((id: StudioPanelId, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      panelX: panels[id].x,
      panelY: panels[id].y,
    };
    document.body.style.cursor = 'move';
  }, [panels]);

  // ── Edge resize handler ────────────────────────────────────────────────────

  const handleEdgeResizeStart = useCallback((id: StudioPanelId, edge: ResizeEdge, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      id,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      layout: { ...panels[id] },
    };
    document.body.style.cursor = EDGE_CURSORS[edge];
  }, [panels]);

  // ── Toolbar controls ───────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    updateCamera((cam) => ({ ...cam, zoom: clampZoom(cam.zoom * 1.2) }));
  }, [updateCamera]);

  const handleZoomOut = useCallback(() => {
    updateCamera((cam) => ({ ...cam, zoom: clampZoom(cam.zoom / 1.2) }));
  }, [updateCamera]);

  const handleReset = useCallback(() => {
    updateCamera(() => ({ x: 0, y: 0, zoom: 1 }));
    const rect = containerRef.current?.getBoundingClientRect();
    setPanels(rect && rect.width > 0 ? computeDefaultPanels(rect.width, rect.height) : { ...DEFAULT_PANELS });
  }, [updateCamera]);

  // ── Collapse / z-order handlers ──────────────────────────────────────────

  const handleBringToFront = useCallback((id: StudioPanelId) => {
    setZOrder(prev => {
      const without = prev.filter(p => p !== id);
      return [...without, id];
    });
  }, []);

  const handleToggleCollapse = useCallback((id: StudioPanelId) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleFitAll = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of Object.values(panels)) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }
    const cw = maxX - minX;
    const ch = maxY - minY;
    const zoom = clampZoom(Math.min(rect.width / (cw + 80), rect.height / (ch + 80)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    updateCamera(() => ({
      x: rect.width / 2 - cx * zoom,
      y: rect.height / 2 - cy * zoom,
      zoom,
    }));
  }, [panels, updateCamera]);

  return (
    <div ref={containerRef} className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-dark-bg select-none">
      {/* Grid background */}
      <StudioGrid zoom={camera.zoom} offsetX={camera.x} offsetY={camera.y} />

      {/* Panels — positioned directly in screen-space (no CSS transform wrapper,
           so position:fixed dialogs inside children render correctly) */}
      <DraggablePanel id="tracker" layout={panels.tracker} camera={camera} collapsed={collapsed.tracker} zIndex={zOrder.indexOf('tracker')} onDragStart={handleDragStart} onEdgeResizeStart={handleEdgeResizeStart} onBringToFront={handleBringToFront} onToggleCollapse={handleToggleCollapse}>
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted text-xs">Loading tracker...</div>}>
          <TrackerView
            onShowExport={() => openModal('export')}
            onShowHelp={(tab) => openModal('help', { initialTab: tab || 'shortcuts' })}
            onShowMasterFX={() => { const s = useUIStore.getState(); s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx'); }}
            onShowInstrumentFX={() => { const s = useUIStore.getState(); s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx'); }}
            onShowInstruments={() => openModal('instruments')}
            onShowDrumpads={() => openModal('drumpads')}
            showPatterns={false}
            showMasterFX={false}
            showInstrumentFX={false}
          />
        </Suspense>
      </DraggablePanel>

      <DraggablePanel id="instrument" layout={panels.instrument} camera={camera} collapsed={collapsed.instrument} zIndex={zOrder.indexOf('instrument')} onDragStart={handleDragStart} onEdgeResizeStart={handleEdgeResizeStart} onBringToFront={handleBringToFront} onToggleCollapse={handleToggleCollapse}>
        <InstrumentPanelContent />
      </DraggablePanel>

      <DraggablePanel id="mixer" layout={panels.mixer} camera={camera} collapsed={collapsed.mixer} zIndex={zOrder.indexOf('mixer')} onDragStart={handleDragStart} onEdgeResizeStart={handleEdgeResizeStart} onBringToFront={handleBringToFront} onToggleCollapse={handleToggleCollapse}>
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted text-xs">Loading mixer...</div>}>
          <MixerContent />
        </Suspense>
      </DraggablePanel>

      {/* Zoom toolbar (top-right) */}
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-dark-bgSecondary/90 backdrop-blur-sm border border-dark-border rounded-lg px-2 py-1 z-10">
        <button onClick={handleZoomOut} className="p-1 hover:bg-dark-bgHover rounded text-text-secondary" title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <span className="text-[10px] font-mono text-text-muted w-10 text-center">
          {Math.round(camera.zoom * 100)}%
        </span>
        <button onClick={handleZoomIn} className="p-1 hover:bg-dark-bgHover rounded text-text-secondary" title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <div className="w-px h-4 bg-dark-border mx-0.5" />
        <button onClick={handleFitAll} className="p-1 hover:bg-dark-bgHover rounded text-text-secondary" title="Fit all (F)">
          <Maximize size={14} />
        </button>
        <button onClick={handleReset} className="p-1 hover:bg-dark-bgHover rounded text-text-secondary" title="Reset layout (R)">
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Help hint (bottom-left) */}
      <div className="absolute bottom-2 left-2 text-[9px] font-mono text-text-muted opacity-50 z-10">
        Scroll: zoom | Shift+drag: pan | R: reset | F: fit all
      </div>
    </div>
  );
};

export default StudioCanvasView;
