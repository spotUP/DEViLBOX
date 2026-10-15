/**
 * KlysView - the klystrack format view: info bar, sequence matrix, pattern grid.
 *
 * Follows the format-view pattern (JamCrackerView, MusicLineView, HivelyView): it reads stores and renders
 * shared components. Transport is the app's main transport, export is the app's Export dialog
 * (nativeExportRouter, KT), and instruments are edited in the instrument panel (SynthTypeDispatcher,
 * editor mode 'klystrack'). The song's real data comes from the engine (useKlysSongData).
 *
 * Position: klystrack's song position is a song ROW. The tracker position (currentPositionIndex) is that row,
 * written from the engine while playing and from a matrix press while stopped - one source for the matrix and
 * the grid. The grid shows the sequence step holding that row, every channel at its own offset into its
 * pattern (klysToFormatChannels), so the play row is the same row on every channel.
 */

import React, { useCallback, useMemo } from 'react';
import { useTrackerStore, useFormatStore, useUIStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { FormatInfoBar } from '@/components/shared/FormatInfoBar';
import { KlysPositionEditor } from './KlysPositionEditor';
import { klysToFormatChannels, klysSequenceSteps, klysWindowAt, KLYS_COLUMNS } from './klysAdapter';
import { klysCellChangeFor } from './klysEdit';
import { useKlysSongData } from '@/hooks/useKlysSongData';

export const KlysView: React.FC = () => {
  useKlysSongData();
  const nativeData = useFormatStore((s) => s.klysNative);
  const songRow = useTrackerStore((s) => s.currentPositionIndex);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const editorFullscreen = useUIStore((s) => s.editorFullscreen);

  const steps = useMemo(() => (nativeData ? klysSequenceSteps(nativeData) : [0]), [nativeData]);
  // The sequence step holding the song row: the grid's cells change once per step, not once per row.
  const { start, length } = nativeData ? klysWindowAt(nativeData, steps, songRow) : { start: 0, length: 1 };
  const channels = useMemo(
    () => (nativeData ? klysToFormatChannels(nativeData, { start, length }) : []),
    [nativeData, start, length],
  );
  const handleCellChange = useMemo(() => klysCellChangeFor({ start, length }), [start, length]);

  // A press on the matrix moves the edit position while stopped; while playing the engine owns it.
  const handlePositionClick = useCallback((row: number) => {
    if (!useTransportStore.getState().isPlaying) useTrackerStore.getState().setCurrentPosition(row);
  }, []);

  if (!nativeData) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-dark-bg font-mono items-center justify-center">
        <span className="text-text-muted text-xs">No klystrack module loaded</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-dark-bg text-text-secondary font-mono text-xs" data-klys-view="">
      {!editorFullscreen && (
        <FormatInfoBar
          format="Klystrack"
          items={[
            { label: 'Speed', value: `${nativeData.songSpeed}/${nativeData.songSpeed2}` },
            { label: 'Tick Rate', value: `${nativeData.songRate} Hz` },
            { label: 'Patterns', value: nativeData.patterns.length },
            { label: 'Channels', value: nativeData.channels },
            { label: 'Song Row', value: `${songRow} / ${nativeData.songLength}` },
          ]}
        />
      )}

      {!editorFullscreen && (
        <div className="flex-shrink-0 border-b border-dark-border">
          <KlysPositionEditor
            nativeData={nativeData}
            songRow={songRow}
            isPlaying={isPlaying}
            onPositionClick={handlePositionClick}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {channels.length > 0 ? (
          <PatternEditorCanvas
            formatColumns={KLYS_COLUMNS}
            formatChannels={channels}
            formatCurrentRow={songRow - start}
            formatIsPlaying={isPlaying}
            onFormatCellChange={handleCellChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary text-xs font-mono">
            Loading pattern data
          </div>
        )}
      </div>
    </div>
  );
};
