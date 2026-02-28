/**
 * PixiHivelyView - Top-level HivelyTracker Editor View (pure Pixi)
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, tempo, speed, tracks, positions)│
 * ├──────────────────────────────────────────────────┤
 * │ Position Editor (~160px tall)                    │
 * ├──────────────────────────────────────────────────┤
 * │ Track Editor (fills remaining space)             │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsHively } from '@lib/export/HivelyExporter';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiButton } from '@/pixi/components/PixiButton';
import { PixiHivelyPositionEditor } from './PixiHivelyPositionEditor';
import { PixiHivelyTrackEditor } from './PixiHivelyTrackEditor';

const TOOLBAR_HEIGHT = 32;
const POSITION_EDITOR_HEIGHT = 160;

// HivelyTracker palette
const HVL_ACCENT = 0xffff88;
const HVL_SEP    = 0x555555;

interface HivelyViewProps {
  width: number;
  height: number;
}

export const PixiHivelyView: React.FC<HivelyViewProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const nativeData = useTrackerStore(s => s.hivelyNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const [editPosition, setEditPosition] = useState(0);
  const [focusTarget, setFocusTarget] = useState<'position' | 'track'>('track');

  // Use playback position when playing, edit position otherwise
  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  const handleExport = useCallback((format: 'hvl' | 'ahx') => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const result = exportAsHively(song, { format });
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result.warnings.length > 0) {
      console.warn('[HivelyExport]', result.warnings.join('; '));
    }
  }, []);

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  const handleFocusTrackEditor = useCallback(() => {
    setFocusTarget('track');
  }, []);

  const handleFocusPositionEditor = useCallback(() => {
    setFocusTarget('position');
  }, []);

  // ─── Draw callbacks ────────────────────────────────────────────────────────

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: 0x000000 });
  }, [width, height]);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_HEIGHT);
    g.fill({ color: 0x111111 });
    g.rect(0, TOOLBAR_HEIGHT - 1, width, 1);
    g.fill({ color: 0x333333 });
  }, [width]);

  const drawPosBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, POSITION_EDITOR_HEIGHT - 2, width, 2);
    g.fill({ color: focusTarget === 'position' ? HVL_ACCENT : 0x333333 });
  }, [width, focusTarget]);

  // ── No module loaded ───────────────────────────────────────────────────────

  if (!nativeData) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
        <pixiBitmapText
          text="No HivelyTracker module loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  const formatLabel = nativeData.channels <= 4 ? 'AHX' : 'HVL';
  const trackEditorHeight = height - TOOLBAR_HEIGHT - POSITION_EDITOR_HEIGHT;

  const toolbarInfo = [
    `Tempo: ${nativeData.tempo}`,
    `Speed: ${nativeData.speedMultiplier}x`,
    `Tracks: ${nativeData.tracks.length}`,
    `Positions: ${nativeData.positions.length}`,
    `CH: ${nativeData.channels}`,
    `Pos: ${activePosition.toString().padStart(3, '0')}/${nativeData.positions.length.toString().padStart(3, '0')}`,
  ].join('  |  ');

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Toolbar */}
      <pixiContainer
        layout={{
          width,
          height: TOOLBAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width, height: TOOLBAR_HEIGHT }} />

        {/* Format label */}
        <pixiBitmapText
          text={formatLabel}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={HVL_ACCENT}
        />

        <pixiBitmapText
          text="|"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={HVL_SEP}
        />

        {/* Info string */}
        <pixiBitmapText
          text={toolbarInfo}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
        />

        {/* Flex spacer */}
        <pixiContainer layout={{ flex: 1, height: TOOLBAR_HEIGHT }} />

        {/* Export buttons */}
        <PixiButton
          label="HVL↓"
          variant="ft2"
          size="sm"
          color="green"
          onClick={() => handleExport('hvl')}
        />
        <PixiButton
          label="AHX↓"
          variant="ft2"
          size="sm"
          color="green"
          onClick={() => handleExport('ahx')}
        />

        <pixiBitmapText
          text="|"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={HVL_SEP}
        />

        {/* Focus selectors */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={handleFocusPositionEditor}
          layout={{ height: TOOLBAR_HEIGHT, alignItems: 'center' }}
        >
          <pixiBitmapText
            text="[POS]"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={focusTarget === 'position' ? HVL_ACCENT : theme.textMuted.color}
          />
        </pixiContainer>

        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={handleFocusTrackEditor}
          layout={{ height: TOOLBAR_HEIGHT, alignItems: 'center' }}
        >
          <pixiBitmapText
            text="[TRK]"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={focusTarget === 'track' ? HVL_ACCENT : theme.textMuted.color}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Position Editor */}
      <pixiContainer layout={{ width, height: POSITION_EDITOR_HEIGHT }}>
        <PixiHivelyPositionEditor
          width={width}
          height={POSITION_EDITOR_HEIGHT}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
          onFocusTrackEditor={handleFocusTrackEditor}
        />
        <pixiGraphics
          draw={drawPosBorder}
          layout={{ position: 'absolute', width, height: POSITION_EDITOR_HEIGHT }}
        />
      </pixiContainer>

      {/* Track Editor */}
      <pixiContainer layout={{ flex: 1, width, height: trackEditorHeight }}>
        <PixiHivelyTrackEditor
          width={width}
          height={trackEditorHeight}
          nativeData={nativeData}
          currentPosition={activePosition}
          onFocusPositionEditor={handleFocusPositionEditor}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
