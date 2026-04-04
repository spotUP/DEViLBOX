/**
 * PixiKlysView — Klystrack editor view (pure Pixi).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, speed, channels, position info) │
 * ├──────────────────────────────────────────────────┤
 * │ Sequence Overview (~140px)                       │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Grid (fills remaining space)             │
 * └──────────────────────────────────────────────────┘
 *
 * Uses PixiGenericFormatView + PixiFormatPatternEditor for a 1:1 visual match
 * with the DOM KlysView. The klysAdapter converts KlysNativeData to FormatChannel[].
 */

import React, { useCallback, useState, useMemo } from 'react';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsKlystrack } from '@lib/export/KlysExporter';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiGenericFormatView } from '@/pixi/views/shared/PixiGenericFormatView';
import { klysToFormatChannels, KLYS_COLUMNS } from '@/components/klystrack/klysAdapter';
import { PixiKlysPositionEditor } from './PixiKlysPositionEditor';

const SEQ_H = 140;
const KT_ACCENT = 0x88ccff;

interface Props {
  width: number;
  height: number;
}

export const PixiKlysView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const nativeData = useFormatStore(s => s.klysNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const [editPosition, setEditPosition] = useState(0);

  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  const handleExport = useCallback(async () => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const result = await exportAsKlystrack(song);
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Convert native data to FormatChannel[] via the shared adapter
  const channels = useMemo(() => {
    if (!nativeData) return [];
    return klysToFormatChannels(nativeData, activePosition);
  }, [nativeData, activePosition]);

  // No data
  if (!nativeData) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiBitmapText
          text="No Klystrack module loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  const toolbarInfo = [
    `Speed: ${nativeData.songSpeed}/${nativeData.songSpeed2}`,
    `Rate: ${nativeData.songRate}`,
    `CH: ${nativeData.channels}`,
    `Len: ${nativeData.songLength}`,
    `Pat: ${nativeData.patterns.length}`,
    `Inst: ${nativeData.instruments.length}`,
    `Pos: ${activePosition}`,
  ].join('  |  ');

  // Position editor as the overview slot
  const overviewSlot = (
    <PixiKlysPositionEditor
      width={width}
      height={SEQ_H}
      nativeData={nativeData}
      currentPosition={activePosition}
      onPositionChange={handlePositionChange}
    />
  );

  return (
    <PixiGenericFormatView
      width={width}
      height={height}
      formatLabel="KT"
      formatAccentColor={KT_ACCENT}
      toolbarInfo={toolbarInfo}
      actionButton={{ label: 'KT\u2193', onClick: handleExport, color: 'green' }}
      overviewSlot={overviewSlot}
      overviewHeight={SEQ_H}
      columns={KLYS_COLUMNS}
      channels={channels}
      currentRow={currentRow}
      isPlaying={isPlaying}
    />
  );
};
