/**
 * KlysView — Main klystrack editor layout (DOM mode).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, speed, channels, position info) │
 * ├──────────────────────────────────────────────────┤
 * │ Position Editor (~160px tall)                    │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (fills remaining space)           │
 * └──────────────────────────────────────────────────┘
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTrackerStore , useFormatStore, useUIStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { KlysPositionEditor, KLYS_MATRIX_HEIGHT, KLYS_MATRIX_COLLAPSED_HEIGHT } from './KlysPositionEditor';
import { KlysInstrumentEditor } from './KlysInstrumentEditor';
import { klysToFormatChannels, KLYS_COLUMNS } from './klysAdapter';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getToneEngine } from '@engine/ToneEngine';
import { exportAsKlystrack } from '@lib/export/KlysExporter';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';
import { CustomSelect } from '@components/common/CustomSelect';

const POSITION_H = KLYS_MATRIX_HEIGHT;

export const KlysView: React.FC<{ width?: number; height?: number }> = ({ width: propW, height: propH }) => {
  const { isMobile } = useResponsiveSafe();
  const nativeData = useFormatStore(s => s.klysNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const editorFullscreen = useUIStore(s => s.editorFullscreen);

  const [editPosition, setEditPosition] = useState(0);
  const [selectedInstrument, setSelectedInstrument] = useState(0);
  const [showInstEditor, setShowInstEditor] = useState(false);
  const [matrixCollapsed, setMatrixCollapsed] = useState(isMobile); // Collapsed by default on mobile

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: propW ?? 800, h: propH ?? 600 });

  const klysFileData = useFormatStore(s => s.klysFileData);

  // Load song into WASM engine, populate native data, and wire position updates
  useEffect(() => {
    if (!klysFileData) return;
    let cancelled = false;
    let unsubData: (() => void) | null = null;
    let unsubPos: (() => void) | null = null;

    (async () => {
      const engine = KlysEngine.getInstance();
      await engine.ready();

      if (cancelled) return;

      // Connect engine output to audio destination so process() gets called
      try { engine.output.connect(engine.output.context.destination); } catch { /* already connected */ }

      // Wire position updates
      unsubPos = engine.onPositionUpdate((update) => {
        if (cancelled) return;
        const sp = update.songPosition;
        useTrackerStore.setState({ currentPositionIndex: sp });

        // patternPosition = g_mus.song_track[0].pattern_step = song_position - entry.position
        // This is the correct row within the currently-playing pattern for channel 0.
        useTransportStore.setState({ currentRow: update.patternPosition });
      });

      // Subscribe to song data BEFORE loading so we catch the response
      unsubData = engine.onSongData((data) => {
        if (cancelled) return;
        const current = useFormatStore.getState().klysNative;
        if (!current) {
          console.warn('[KlysView] klysNative not found in store');
          return;
        }
        // Map WASM instrument data to KlysNativeInstrument shape (nest fm fields)
        const instruments = data.instruments
          .filter((i): i is NonNullable<typeof i> => i !== null)
          .map(({ fmFlags, fmModulation, fmFeedback, fmWave, fmHarmonic, fmAdsr, fmAttackStart, ...rest }) => ({
            ...rest,
            fm: {
              flags: fmFlags,
              modulation: fmModulation,
              feedback: fmFeedback,
              wave: fmWave,
              harmonic: fmHarmonic,
              adsr: fmAdsr,
              attackStart: fmAttackStart,
            },
          }));
        useFormatStore.setState({
          klysNative: {
            ...current,
            patterns: data.patterns,
            sequences: data.sequences,
            instruments,
          },
        });
      });

      try {
        await engine.loadSong(klysFileData.slice(0));
      } catch (err) {
        console.error('[KlysView] Failed to load song into WASM:', err);
      }
    })();

    return () => {
      cancelled = true;
      unsubData?.();
      unsubPos?.();
    };
  }, [klysFileData]);

  useEffect(() => {
    if (propW && propH) { setSize({ w: propW, h: propH }); return; }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, [propW, propH]);

  const { w: width, h: height } = size;
  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  // Compute format channels from native data
  const channels = useMemo(() => {
    if (!nativeData) return [];
    return klysToFormatChannels(nativeData, activePosition);
  }, [nativeData, activePosition]);

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  // Handle pattern cell edits
  const handleCellChange = useCallback((channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    if (!nativeData) return;
    const seq = nativeData.sequences[channelIdx];
    if (!seq) return;

    // Find pattern at current position
    let patternIdx = -1;
    for (const entry of seq.entries) {
      if (entry.position <= activePosition) {
        patternIdx = entry.pattern;
      }
    }

    if (patternIdx < 0 || patternIdx >= nativeData.patterns.length) return;
    const pattern = nativeData.patterns[patternIdx];
    if (rowIdx >= pattern.numSteps) return;

    const step = pattern.steps[rowIdx];
    if (!step) return;

    // Update the appropriate field
    (step as any)[columnKey] = value;

    // Send to WASM engine
    if (KlysEngine.hasInstance()) {
      // Decode 16-bit command field
      const cmdLow = (step.command & 0xFF);
      const cmdHigh = (step.command >> 8) & 0xFF;
      KlysEngine.getInstance().setPatternStep(
        patternIdx, rowIdx,
        step.note, step.instrument, step.ctrl, step.volume,
        cmdLow, cmdHigh
      );
    }

    // Trigger re-render
    const state = useFormatStore.getState();
    if (state.klysNative) {
      useFormatStore.setState({ klysNative: { ...state.klysNative } });
    }
  }, [nativeData, activePosition]);

  const handlePlay = useCallback(async () => {
    if (!KlysEngine.hasInstance()) return;
    const toneEngine = getToneEngine();
    await toneEngine.init();
    toneEngine.stop();
    await new Promise(r => setTimeout(r, 60));
    KlysEngine.getInstance().play();
    useTransportStore.setState((s) => { s.isPlaying = true; s.isPaused = false; });
  }, []);

  const handleStop = useCallback(() => {
    if (!KlysEngine.hasInstance()) return;
    KlysEngine.getInstance().stop();
    useTransportStore.setState((s) => { s.isPlaying = false; s.isPaused = false; });
    // Match playStopToggle — mute/unmute cycle resets audio graph for next play
    getToneEngine().stop();
  }, []);

  const handleExport = useCallback(async () => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    try {
      const result = await exportAsKlystrack(song);
      const url = URL.createObjectURL(result.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (result.warnings.length > 0) {
        console.warn('[KlysExport]', result.warnings.join('; '));
      }
    } catch (err) {
      console.error('[KlysExport] Failed:', err);
    }
  }, []);

  if (!nativeData) {
    return (
      <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No klystrack module loaded</span>
      </div>
    );
  }

  const toolbarInfo = [
    `Speed: ${nativeData.songSpeed}/${nativeData.songSpeed2}`,
    `Rate: ${nativeData.songRate}Hz`,
    `Pat: ${nativeData.patterns.length}`,
    `Len: ${nativeData.songLength}`,
    `CH: ${nativeData.channels}`,
    `${activePosition.toString().padStart(3, '0')}/${nativeData.songLength.toString().padStart(3, '0')}`,
  ].join('  |  ');

  // Build instrument editor side panel
  const sidePanelContent = showInstEditor ? (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 bg-[#1a1a1a] border-b border-[#222]">
        <span className="text-[10px] text-text-muted">Inst:</span>
        <CustomSelect
          className="flex-1 bg-[#111] text-xs text-text-secondary border border-[#333] rounded px-1"
          value={String(selectedInstrument)}
          onChange={(v) => setSelectedInstrument(parseInt(v, 10))}
          options={nativeData.instruments.map((inst, i) => ({
            value: String(i),
            label: `${i.toString(16).toUpperCase().padStart(2, '0')}: ${inst.name || 'Unnamed'}`,
          }))}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <KlysInstrumentEditor instrumentIndex={selectedInstrument} />
      </div>
    </div>
  ) : undefined;

  // Build toolbar slot with Export and Inst buttons
  const toolbarSlot = (
    <>
      <button
        className="px-2 py-0.5 text-xs bg-blue-800 hover:bg-blue-700 text-blue-100 rounded border border-blue-600"
        onClick={handleExport}
      >Export .kt</button>
      <button
        className={`px-2 py-0.5 text-xs rounded border ${showInstEditor ? 'bg-purple-700 text-purple-100 border-purple-500' : 'bg-dark-bgHover hover:bg-dark-bgHover text-text-secondary border-dark-borderLight'}`}
        onClick={() => setShowInstEditor(!showInstEditor)}
      >Inst</button>
    </>
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        width: propW ? width : '100%',
        height: propH ? height : '100%',
        backgroundColor: 'var(--color-bg)',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
      }}
    >
      {/* Toolbar */}
      {!editorFullscreen && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        height: '36px', padding: '0 12px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 'bold', minWidth: '40px' }}>KT</div>
        <div style={{ flex: 1, fontSize: '11px', color: 'var(--color-text-muted)' }}>{toolbarInfo}</div>
        <button
          onClick={isPlaying ? handleStop : handlePlay}
          style={{
            padding: '4px 12px',
            backgroundColor: isPlaying ? '#e95545' : '#4a7c4e',
            color: 'var(--color-text)',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        {toolbarSlot}
      </div>
      )}

      {/* Position Editor */}
      {!editorFullscreen && (
      <div style={{
        height: `${matrixCollapsed ? KLYS_MATRIX_COLLAPSED_HEIGHT : POSITION_H}px`,
        borderBottom: '1px solid var(--color-border)',
        overflow: 'auto',
        backgroundColor: 'var(--color-bg-secondary)',
        flexShrink: 0,
      }}>
        <KlysPositionEditor
          width={width}
          height={matrixCollapsed ? KLYS_MATRIX_COLLAPSED_HEIGHT : POSITION_H}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
          collapsed={matrixCollapsed}
          onToggleCollapse={() => setMatrixCollapsed(!matrixCollapsed)}
        />
      </div>
      )}

      {/* Main content: pattern + side panel */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {channels.length > 0 ? (
            <PatternEditorCanvas
              formatColumns={KLYS_COLUMNS}
              formatChannels={channels}
              formatCurrentRow={currentRow}
              formatIsPlaying={isPlaying}
              onFormatCellChange={handleCellChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-secondary text-sm font-mono">
              Loading pattern data…
            </div>
          )}
        </div>
        {sidePanelContent && (
          <div style={{
            width: '280px',
            borderLeft: '1px solid var(--color-border)',
            overflow: 'auto',
            backgroundColor: 'var(--color-bg-secondary)',
            flexShrink: 0,
          }}>
            {sidePanelContent}
          </div>
        )}
      </div>
    </div>
  );
};
