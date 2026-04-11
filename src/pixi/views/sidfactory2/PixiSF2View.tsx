/**
 * PixiSF2View — SID Factory II pattern viewer (pure Pixi/GL).
 *
 * Uses PixiGenericFormatView + PixiFormatPatternEditor for a 1:1 match
 * with the DOM SF2View. Order list rendered as Pixi bitmap text.
 */

import React from 'react';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme } from '@/pixi/theme';
import { PixiGenericFormatView } from '@/pixi/views/shared/PixiGenericFormatView';
import { SF2_COLUMNS } from '@/components/sidfactory2/sf2Adapter';
import { useSF2FormatData } from '@/components/sidfactory2/useSF2FormatData';
import { useSF2Store } from '@/stores/useSF2Store';

const ORDER_H = 80;
const SF2_ACCENT = 0x66aaff;

interface Props {
  width: number;
  height: number;
}

export const PixiSF2View: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const { channels, currentRow, isPlaying } = useSF2FormatData();
  const descriptor = useSF2Store((s) => s.descriptor);
  const songName = useSF2Store((s) => s.songName);
  const trackCount = useSF2Store((s) => s.trackCount);
  const orderLists = useSF2Store((s) => s.orderLists);
  const orderCursor = useSF2Store((s) => s.orderCursor);
  const loaded = useSF2Store((s) => s.loaded);

  const maxOlLen = Math.max(1, ...orderLists.map(ol => ol.entries.length));

  const driverVersion = descriptor
    ? `${descriptor.driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')}`
    : '';

  const toolbarInfo = [
    songName || 'Untitled',
    driverVersion,
    `Tracks: ${trackCount}`,
    `Pos: ${orderCursor + 1}/${maxOlLen}`,
  ].filter(Boolean).join('  |  ');

  // Order list overview text
  const orderLines: string[] = [];
  for (let t = 0; t < trackCount; t++) {
    const ol = orderLists[t];
    if (!ol) continue;
    const entries = ol.entries.map((e, i) => {
      const seqStr = e.seqIdx.toString(16).toUpperCase().padStart(2, '0');
      return i === orderCursor ? `[${seqStr}]` : ` ${seqStr} `;
    }).join('');
    orderLines.push(`CH${t + 1}: ${entries}`);
  }

  const overviewSlot = (
    <pixiContainer layout={{ flexDirection: 'column', paddingLeft: 8, paddingTop: 4, gap: 2 }}>
      {orderLines.map((line, i) => (
        <pixiBitmapText
          key={i}
          text={line}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          layout={{ height: 14 }}
        />
      ))}
    </pixiContainer>
  );

  if (!loaded) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiBitmapText
          text="No SID Factory II file loaded"
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
      formatLabel="SF2"
      formatAccentColor={SF2_ACCENT}
      toolbarInfo={toolbarInfo}
      overviewSlot={overviewSlot}
      overviewHeight={ORDER_H}
      columns={SF2_COLUMNS}
      channels={channels}
      currentRow={currentRow}
      isPlaying={isPlaying}
    />
  );
};
