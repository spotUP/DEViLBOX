/**
 * MusicLineView — MusicLine per-channel editor: track-table matrix above one
 * PatternEditorCanvas per channel, each scrolling on its own position.
 *
 * Its own component so that useMusicLineFormatData's playback subscriptions
 * (row, per-channel rows and positions) re-render this view only. Called from
 * TrackerView, the hook re-rendered the whole tracker tree on every row for
 * every format (2026-09-28: ~40 commits/s, dialogs and menus included).
 */

import React, { useCallback, useMemo } from 'react';
import { useTrackerStore, useUIStore, useFormatStore } from '@stores';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { PatternEditorCanvas } from '@components/tracker/PatternEditorCanvas';
import { MusicLineTrackTableEditor } from '@components/tracker/MusicLineTrackTableEditor';
import { useMusicLineFormatData } from './useMusicLineFormatData';
import { MusicLineChannelStatus } from './MusicLineChannelStatus';
import { MusicLineToolbar } from './MusicLineToolbar';
import { MUSICLINE_COLUMNS } from './musiclineAdapter';

export const MusicLineView: React.FC = () => {
  const mlFormatData = useMusicLineFormatData();
  const channelTrackTables = useFormatStore((s) => s.channelTrackTables);
  const patternCount = useTrackerStore((s) => s.patterns.length);

  /** Run a cleanup, report the count in the status bar. */
  const cleanup = useCallback((run: () => number, noun: string, nothing: string) => () => {
    const count = run();
    useUIStore.getState().setStatusMessage(count > 0 ? `${count} ${noun}${count > 1 ? 's' : ''} removed` : nothing);
  }, []);
  const handleRemoveUnusedParts = useMemo(() => cleanup(() => useFormatStore.getState().removeUnusedMusicLineParts(), 'unused part', 'No unused parts found'), [cleanup]);
  const handleRemoveUnusedWavesamples = useMemo(() => cleanup(() => useFormatStore.getState().removeUnusedMusicLineWavesamples(), 'unused wavesample', 'No unused wavesamples found'), [cleanup]);
  const handleMergeEqualWavesamples = useMemo(() => cleanup(() => useFormatStore.getState().mergeEqualMusicLineWavesamples(), 'equal wavesample', 'No equal wavesamples found'), [cleanup]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-dark-bg">
      {/* Per-channel track table matrix */}
      <div className="flex-shrink-0 border-b border-dark-border" style={{ maxHeight: 220, overflowY: 'auto' }}>
        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
          <span className="text-sm font-bold text-ft2-text">MusicLine Editor</span>
          <span className="text-xs text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded border border-accent-primary/30">
            per-channel
          </span>
          <span className="text-xs text-ft2-textDim ml-auto mr-2">
            {channelTrackTables?.length ?? 0} channels · {patternCount} parts
          </span>
          <button
            className={`px-2 py-0.5 text-xs rounded border ${
              mlFormatData.followMode === 0
                ? 'bg-dark-bgSecondary text-text-muted border-dark-border'
                : 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
            }`}
            onClick={mlFormatData.cycleFollowMode}
            title="Cycle follow mode: Off / Pattern / Tune"
          >
            Follow: {mlFormatData.followMode === 0 ? 'Off' : mlFormatData.followMode === 1 ? 'Pattern' : 'Tune'}
          </button>
          {([
            [handleRemoveUnusedParts, 'Remove Unused Parts', 'Remove patterns no channel track table references'],
            [handleRemoveUnusedWavesamples, 'Remove Unused Wavesamples', 'Remove instruments no pattern cell references, and renumber the rest'],
            [handleMergeEqualWavesamples, 'Merge Equal Wavesamples', 'Merge instruments whose parameters and sample data are byte-equal, and renumber the rest'],
          ] as const).map(([onClick, label, title]) => (
            <button
              key={label}
              className="px-2 py-0.5 text-xs bg-dark-bgSecondary hover:bg-dark-bgTertiary text-text-muted rounded border border-dark-border"
              onClick={onClick}
              title={title}
            >{label}</button>
          ))}
        </div>
        <MusicLineToolbar numChannels={channelTrackTables?.length ?? 0} />
        <MusicLineChannelStatus />
        <div className="px-3 pb-3">
          <MusicLineTrackTableEditor
            onSeek={(pos) => {
              useTrackerStore.getState().setCurrentPosition(pos);
              getTrackerReplayer().jumpToPosition(pos, 0);
            }}
          />
        </div>
      </div>
      {/* Per-channel PatternEditorCanvas — each channel scrolls independently */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-row">
        {mlFormatData.channels.map((ch, chIdx) => (
          <div
            key={chIdx}
            className={`flex-1 min-w-0 overflow-hidden cursor-pointer relative ${chIdx === mlFormatData.selectedChannel ? 'border-t-2 border-t-accent-primary/40 bg-accent-primary/5' : 'border-t-2 border-t-transparent'}`}
            style={{ borderRight: chIdx < mlFormatData.channels.length - 1 ? '1px solid var(--color-border)' : undefined }}
            onClick={() => mlFormatData.setSelectedChannel(chIdx)}
          >
            <PatternEditorCanvas
              formatColumns={MUSICLINE_COLUMNS}
              formatChannels={[ch]}
              formatCurrentRow={
                mlFormatData.perChannelRows.length > chIdx
                  ? mlFormatData.perChannelRows[chIdx]
                  : mlFormatData.currentRow
              }
              formatIsPlaying={mlFormatData.isPlaying && mlFormatData.followMode === 1}
              formatChannelOffset={chIdx}
              onFormatCellChange={(_channelIdx, rowIdx, columnKey, value) => {
                mlFormatData.handleCellChange(chIdx, rowIdx, columnKey, value);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
