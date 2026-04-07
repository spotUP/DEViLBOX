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
import { PixiKlysInstrumentEditor } from './PixiKlysInstrumentEditor';

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
  const [showInstEditor, setShowInstEditor] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState(0);

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

  const INST_PANEL_W = 360;
  const mainW = showInstEditor ? Math.max(200, width - INST_PANEL_W) : width;
  const numInstruments = nativeData.instruments.length;

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'row' }}>
      <pixiContainer layout={{ width: mainW, height, flexDirection: 'column' }}>
        {/* Inst toggle bar */}
        <pixiContainer layout={{ width: mainW, height: 22, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 6 }}>
          <pixiContainer
            eventMode="static"
            cursor="pointer"
            onPointerTap={() => setShowInstEditor(!showInstEditor)}
            layout={{ paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2, backgroundColor: showInstEditor ? theme.accent.color : theme.bgTertiary.color, borderRadius: 3 }}
          >
            <pixiBitmapText
              text="INST"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={showInstEditor ? 0xffffff : theme.textSecondary.color}
            />
          </pixiContainer>
          {showInstEditor && (
            <>
              <pixiContainer
                eventMode="static"
                cursor="pointer"
                onPointerTap={() => setSelectedInstrument(Math.max(0, selectedInstrument - 1))}
                layout={{ paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, backgroundColor: theme.bgTertiary.color, borderRadius: 3 }}
              >
                <pixiBitmapText text="<" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.textSecondary.color} />
              </pixiContainer>
              <pixiBitmapText
                text={`${selectedInstrument.toString(16).toUpperCase().padStart(2, '0')}: ${nativeData.instruments[selectedInstrument]?.name || 'Unnamed'}`}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                tint={theme.text.color}
              />
              <pixiContainer
                eventMode="static"
                cursor="pointer"
                onPointerTap={() => setSelectedInstrument(Math.min(numInstruments - 1, selectedInstrument + 1))}
                layout={{ paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, backgroundColor: theme.bgTertiary.color, borderRadius: 3 }}
              >
                <pixiBitmapText text=">" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.textSecondary.color} />
              </pixiContainer>
            </>
          )}
        </pixiContainer>

        <PixiGenericFormatView
          width={mainW}
          height={height - 22}
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
      </pixiContainer>
      {showInstEditor && (
        <PixiKlysInstrumentEditor
          instrumentIndex={selectedInstrument}
          width={INST_PANEL_W}
          height={height}
        />
      )}
    </pixiContainer>
  );
};
