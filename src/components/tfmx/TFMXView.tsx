/**
 * TFMXView — Main TFMX editor layout (DOM mode).
 *
 * Two-pane layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (song name, subsong, tempo, export, info)│
 * ├──────────────────────────────────────────────────┤
 * │ Trackstep Matrix (~200px, collapsible)           │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (selected pattern from pool)      │
 * └──────────────────────────────────────────────────┘
 *
 * Clicking a voice cell in the matrix → pattern editor shows that TFMX pattern.
 * All data flows from useFormatStore.tfmxNative through tfmxAdapter (single source of truth).
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useFormatStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { TFMX_PATTERN_COLUMNS, tfmxPatternToChannels } from './tfmxAdapter';
import { TFMXTrackstepMatrix, TFMX_MATRIX_HEIGHT, TFMX_MATRIX_COLLAPSED_HEIGHT } from './TFMXTrackstepMatrix';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';
import { getTrackerReplayer } from '@engine/TrackerReplayer';

const TOOLBAR_H = 36;

export const TFMXView: React.FC<{ width?: number; height?: number }> = () => {
  const { isMobile } = useResponsiveSafe();
  const native = useFormatStore(s => s.tfmxNative);
  const selectedPattern = useFormatStore(s => s.tfmxSelectedPattern);
  const setSelectedPattern = useFormatStore(s => s.setTFMXSelectedPattern);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);

  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [matrixCollapsed, setMatrixCollapsed] = useState(isMobile);

  const matrixH = matrixCollapsed ? TFMX_MATRIX_COLLAPSED_HEIGHT : TFMX_MATRIX_HEIGHT;

  // Build mapping: flattened pattern index → native trackstep index
  const flatToTrackstep = useMemo(() => {
    if (!native) return [];
    return native.tracksteps
      .map((step, idx) => ({ step, idx }))
      .filter(({ step }) => !step.isEFFE);
  }, [native]);

  // Auto-follow playback: map flattened position → trackstep → voice pattern
  useEffect(() => {
    if (!isPlaying || !native) return;
    const mapping = flatToTrackstep[currentPositionIndex];
    if (!mapping) return;

    setActiveStepIdx(mapping.idx);

    const step = mapping.step;
    if (!step.isEFFE) {
      for (const voice of step.voices) {
        if (voice.patternNum >= 0 && !voice.isHold && !voice.isStop) {
          setSelectedPattern(voice.patternNum);
          break;
        }
      }
    }
  }, [isPlaying, currentPositionIndex, native, flatToTrackstep, setSelectedPattern]);

  // Measure container width
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width > 0) setContainerWidth(width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const handleSelectPattern = useCallback((patIdx: number) => {
    setSelectedPattern(patIdx);
  }, [setSelectedPattern]);

  const handleStepChange = useCallback((idx: number) => {
    setActiveStepIdx(idx);
  }, []);

  // Pattern cell editing via PatternEditorCanvas format mode
  const setPatternCommand = useFormatStore(s => s.setTFMXPatternCommand);
  const handleCellChange = useCallback((
    _chIdx: number, rowIdx: number, columnKey: string, value: number,
  ) => {
    const fieldMap: Record<string, 'note' | 'macro' | 'wait' | 'detune'> = {
      note: 'note', macro: 'macro', wait: 'wait', detune: 'detune',
    };
    const field = fieldMap[columnKey];
    if (field) {
      setPatternCommand(selectedPattern, rowIdx, field, value);
    }
  }, [selectedPattern, setPatternCommand]);

  // Export TFMX
  const handleExport = useCallback(async () => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const { exportTFMX } = await import('@lib/export/TFMXExporter');
    const result = await exportTFMX(song);
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result.warnings.length > 0) {
      console.warn('[TFMXExport]', result.warnings.join('; '));
    }
  }, []);

  // Subsong switching — re-parse the file with a different subsong index
  const handleSubsongChange = useCallback(async (newSubsong: number) => {
    const fileData = useFormatStore.getState().uadeEditableFileData;
    const fileName = useFormatStore.getState().uadeEditableFileName;
    if (!fileData || !fileName) return;

    const { parseTFMXFile } = await import('@lib/import/formats/TFMXParser');
    const song = parseTFMXFile(fileData, fileName, newSubsong);

    // Update native data in store (keeps the same editor mode)
    if (song.tfmxNative) {
      useFormatStore.getState().setTFMXNative(song.tfmxNative);
      useFormatStore.getState().setTFMXSelectedPattern(0);
    }

    // Update tracker store with new patterns
    const trackerStore = useTrackerStore.getState();
    trackerStore.loadPatterns(song.patterns);
    trackerStore.setPatternOrder(song.songPositions);
    trackerStore.setCurrentPosition(0, true);
  }, []);

  // Convert selected pattern to FormatChannel[] via adapter
  const patternChannels = useMemo(() => {
    if (!native) return [];
    return tfmxPatternToChannels(native, selectedPattern);
  }, [native, selectedPattern]);

  if (!native) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No TFMX module loaded</span>
      </div>
    );
  }

  // Count valid subsongs (start <= end)
  const validSubsongs: number[] = [];
  for (let i = 0; i < 32; i++) {
    if (native.songStarts[i] <= native.songEnds[i] && native.songStarts[i] < 0x4000) {
      validSubsongs.push(i);
    }
  }

  const toolbarInfo = [
    `Tempo: ${native.songTempos[native.activeSubsong]}`,
    `Patterns: ${native.patterns.filter(p => p.length > 0).length}`,
    `Steps: ${native.tracksteps.length}`,
    `Voices: ${native.numVoices}`,
    `Pat: ${selectedPattern.toString().padStart(3, '0')}`,
  ].join('  |  ');

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        backgroundColor: 'var(--color-bg)',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
      }}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        height: `${TOOLBAR_H}px`, padding: '0 12px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 'bold', color: '#e0a050', fontSize: '12px' }}>TFMX</span>
        <span style={{ color: 'var(--color-text-muted)' }}>|</span>
        <span style={{ fontWeight: 'bold', color: '#c0c0c0', fontSize: '11px' }}>{native.songName}</span>
        {validSubsongs.length > 1 && (
          <>
            <span style={{ color: 'var(--color-text-muted)' }}>|</span>
            <select
              value={native.activeSubsong}
              onChange={(e) => handleSubsongChange(Number(e.target.value))}
              style={{
                fontSize: '11px', padding: '1px 4px',
                background: 'var(--color-bg)', color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)', borderRadius: '3px',
              }}
            >
              {validSubsongs.map(i => (
                <option key={i} value={i}>Song {i}</option>
              ))}
            </select>
          </>
        )}
        <span style={{ color: 'var(--color-text-muted)' }}>|</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flex: 1 }}>{toolbarInfo}</span>
        <button
          className="px-2 py-0.5 text-xs bg-amber-800 hover:bg-amber-700 text-amber-100 rounded border border-amber-600"
          onClick={handleExport}
        >Export MDAT</button>
      </div>

      {/* Trackstep Matrix */}
      <div style={{
        height: `${matrixH}px`,
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <TFMXTrackstepMatrix
          width={containerWidth}
          height={matrixH}
          native={native}
          activeStep={activeStepIdx}
          selectedPattern={selectedPattern}
          onSelectPattern={handleSelectPattern}
          onStepChange={handleStepChange}
          collapsed={matrixCollapsed}
          onToggleCollapse={() => setMatrixCollapsed(!matrixCollapsed)}
        />
      </div>

      {/* Pattern Editor */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PatternEditorCanvas
          formatColumns={TFMX_PATTERN_COLUMNS}
          formatChannels={patternChannels}
          formatCurrentRow={isPlaying ? currentRow : undefined}
          formatIsPlaying={isPlaying}
          onFormatCellChange={handleCellChange}
        />
      </div>
    </div>
  );
};
