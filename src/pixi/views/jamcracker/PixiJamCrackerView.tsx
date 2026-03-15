/**
 * PixiJamCrackerView — JamCracker Pro pattern viewer (pure Pixi).
 *
 * Uses PixiGenericFormatView + PixiFormatPatternEditor for a 1:1 visual match
 * with the DOM JamCrackerView. Song order list rendered as Pixi bitmap text.
 */

import React, { useCallback } from 'react';
import { JamCrackerEngine } from '@engine/jamcracker/JamCrackerEngine';
import { useTransportStore } from '@/stores/useTransportStore';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiGenericFormatView } from '@/pixi/views/shared/PixiGenericFormatView';
import { JAMCRACKER_COLUMNS } from '@/components/jamcracker/jamcrackerAdapter';
import { useJamCrackerData } from '@/hooks/useJamCrackerData';

const ORDER_H = 96;
const JC_ACCENT = 0x88ccff;

interface Props {
  width: number;
  height: number;
}

export const PixiJamCrackerView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const speed = useTransportStore(s => s.speed);

  const {
    songInfo, channels, activePos,
    currentRow, isPlaying, patIdx, numRows,
  } = useJamCrackerData();

  const handleExport = useCallback(async () => {
    if (!JamCrackerEngine.hasInstance()) return;
    const data = await JamCrackerEngine.getInstance().save();
    if (!data || data.length === 0) return;
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'song.jam';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const toolbarInfo = [
    `Speed: ${speed}`,
    songInfo ? `Pat: ${songInfo.numPats}` : '',
    songInfo ? `Inst: ${songInfo.numInst}` : '',
    `Pos: ${activePos}/${songInfo?.songLen ?? '?'}`,
    patIdx >= 0 ? `#${patIdx.toString(16).toUpperCase().padStart(2, '0')}` : '',
    numRows > 0 ? `Rows: ${numRows}` : '',
  ].filter(Boolean).join('  |  ');

  // Song order text — current position shown with brackets
  const orderEntries = songInfo?.entries ?? [];
  const orderText = orderEntries.length > 0
    ? orderEntries.map((e, i) =>
        i === activePos
          ? `[${e.toString(16).toUpperCase().padStart(2, '0')}]`
          : ` ${e.toString(16).toUpperCase().padStart(2, '0')} `
      ).join('')
    : 'Loading...';

  const overviewSlot = (
    <pixiContainer layout={{ flexDirection: 'column', paddingLeft: 8, paddingTop: 4 }}>
      <pixiBitmapText
        text="Song Order:"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={JC_ACCENT}
        layout={{ height: 16 }}
      />
      <pixiBitmapText
        text={orderText}
        style={{
          fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff,
          wordWrap: true, wordWrapWidth: width - 16,
        }}
        tint={theme.textSecondary.color}
      />
    </pixiContainer>
  );

  if (!songInfo && channels.length === 0) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiBitmapText
          text="No JamCracker module loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  return (
    <PixiGenericFormatView
      width={width}
      height={height}
      formatLabel="JAM"
      formatAccentColor={JC_ACCENT}
      toolbarInfo={toolbarInfo}
      actionButton={{ label: 'JAM↓', onClick: handleExport, color: 'green' }}
      overviewSlot={overviewSlot}
      overviewHeight={ORDER_H}
      columns={JAMCRACKER_COLUMNS}
      channels={channels}
      currentRow={currentRow}
      isPlaying={isPlaying}
    />
  );
};
