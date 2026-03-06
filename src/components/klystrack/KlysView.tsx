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

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore , useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { KlysPatternEditor } from './KlysPatternEditor';
import { KlysPositionEditor } from './KlysPositionEditor';
import { KlysInstrumentEditor } from './KlysInstrumentEditor';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsKlystrack } from '@lib/export/KlysExporter';

const TOOLBAR_H = 36;
const POSITION_H = 160;

export const KlysView: React.FC<{ width?: number; height?: number }> = ({ width: propW, height: propH }) => {
  const nativeData = useFormatStore(s => s.klysNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const [editPosition, setEditPosition] = useState(0);
  const [selectedInstrument, setSelectedInstrument] = useState(0);
  const [showInstEditor, setShowInstEditor] = useState(false);

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
        useTrackerStore.setState({ currentPositionIndex: update.songPosition });
        useTransportStore.setState({ currentRow: update.patternPosition });
      });

      // Subscribe to song data BEFORE loading so we catch the response
      unsubData = engine.onSongData((data) => {
        if (cancelled) return;
        console.log('[KlysView] songData received:', {
          patterns: data.patterns.length,
          sequences: data.sequences.length,
          instruments: data.instruments.length,
        });
        const current = useFormatStore.getState().klysNative;
        if (!current) {
          console.warn('[KlysView] klysNative not found in store');
          return;
        }
        // Map WASM instrument data to KlysNativeInstrument shape (nest fm fields)
        const instruments = data.instruments
          .filter((i): i is NonNullable<typeof i> => i !== null)
          .map(({ fmModulation, fmFeedback, fmHarmonic, fmAdsr, ...rest }) => ({
            ...rest,
            fm: { modulation: fmModulation, feedback: fmFeedback, harmonic: fmHarmonic, adsr: fmAdsr },
          }));
        console.log('[KlysView] updating klysNative with', instruments.length, 'instruments');
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

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  const handlePlay = useCallback(() => {
    if (!KlysEngine.hasInstance()) return;
    KlysEngine.getInstance().play();
    useTransportStore.setState((s) => { s.isPlaying = true; s.isPaused = false; });
  }, []);

  const handleStop = useCallback(() => {
    if (!KlysEngine.hasInstance()) return;
    KlysEngine.getInstance().stop();
    useTransportStore.setState((s) => { s.isPlaying = false; s.isPaused = false; });
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

  const editorH = height - TOOLBAR_H - POSITION_H;

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono" style={propW ? { width, height } : undefined}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 border-b border-ft2-border bg-dark-bgSecondary" style={{ height: TOOLBAR_H }}>
        <span className="text-xs font-bold text-cyan-300">KT</span>
        <span className="text-ft2-textDim">|</span>
        <span className="text-xs text-ft2-textDim">{toolbarInfo}</span>
        <div className="flex-1" />
        <button
          className={`px-2 py-0.5 text-xs rounded border ${isPlaying ? 'bg-red-800 hover:bg-red-700 text-red-100 border-red-600' : 'bg-green-800 hover:bg-green-700 text-green-100 border-green-600'}`}
          onClick={isPlaying ? handleStop : handlePlay}
        >{isPlaying ? 'Stop' : 'Play'}</button>
        <button
          className="px-2 py-0.5 text-xs bg-blue-800 hover:bg-blue-700 text-blue-100 rounded border border-blue-600"
          onClick={handleExport}
        >Export .kt</button>
        <button
          className={`px-2 py-0.5 text-xs rounded border ${showInstEditor ? 'bg-purple-700 text-purple-100 border-purple-500' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-500'}`}
          onClick={() => setShowInstEditor(!showInstEditor)}
        >Inst</button>
      </div>

      {/* Position editor */}
      <div className="border-b border-ft2-border" style={{ height: POSITION_H }}>
        <KlysPositionEditor
          width={width}
          height={POSITION_H}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
        />
      </div>

      {/* Pattern editor + optional instrument editor side panel */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-h-0">
          <KlysPatternEditor
            width={showInstEditor ? width - 280 : width}
            height={Math.max(100, editorH)}
            nativeData={nativeData}
            currentPosition={activePosition}
          />
        </div>
        {showInstEditor && (
          <div className="flex flex-col border-l border-ft2-border" style={{ width: 280 }}>
            <div className="flex items-center gap-1 px-2 py-1 bg-[#1a1a1a] border-b border-ft2-border">
              <span className="text-[10px] text-gray-500">Inst:</span>
              <select
                className="flex-1 bg-[#111] text-xs text-gray-200 border border-[#333] rounded px-1"
                value={selectedInstrument}
                onChange={e => setSelectedInstrument(parseInt(e.target.value, 10))}
              >
                {nativeData.instruments.map((inst, i) => (
                  <option key={i} value={i}>
                    {i.toString(16).toUpperCase().padStart(2, '0')}: {inst.name || 'Unnamed'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto">
              <KlysInstrumentEditor instrumentIndex={selectedInstrument} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
