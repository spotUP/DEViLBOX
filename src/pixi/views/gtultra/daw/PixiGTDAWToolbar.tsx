/**
 * PixiGTDAWToolbar — Transport bar for DAW mode.
 *
 * Layout: [Play] [Stop] [Rec] | BPM | Pos:XX Row:XX | Song Name | <flex> | Grid | Sidebar | Pro/Studio/DAW
 */

import React, { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { useGTUltraStore, type GTViewMode } from '@/stores/useGTUltraStore';
import {
  DAW_PANEL_BG, DAW_PANEL_BORDER, DAW_ACCENT, DAW_ACCENT_WARM,
  DAW_SUCCESS, DAW_ERROR, DAW_TEXT, DAW_TEXT_SEC, DAW_TEXT_MUTED, DAW_TOOLBAR_H,
} from './dawTheme';

interface Props {
  width: number;
}

export const PixiGTDAWToolbar: React.FC<Props> = ({ width }) => {
  const playing = useGTUltraStore((s) => s.playing);
  const recordMode = useGTUltraStore((s) => s.recordMode);
  const tempo = useGTUltraStore((s) => s.tempo);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const songName = useGTUltraStore((s) => s.songName);
  const viewMode = useGTUltraStore((s) => s.viewMode);
  const dawSidebarOpen = useGTUltraStore((s) => s.dawSidebarOpen);
  const dawGridSnap = useGTUltraStore((s) => s.dawGridSnap);
  const engine = useGTUltraStore((s) => s.engine);

  const posText = useMemo(() => {
    const pos = playbackPos.position.toString(16).toUpperCase().padStart(2, '0');
    const row = playbackPos.row.toString(16).toUpperCase().padStart(2, '0');
    return `${pos}:${row}`;
  }, [playbackPos]);

  const handlePlay = useCallback(() => {
    if (playing) return;
    engine?.play(0, 0, 0);
  }, [engine, playing]);

  const handleStop = useCallback(() => {
    engine?.stop();
  }, [engine]);

  const handleRecord = useCallback(() => {
    useGTUltraStore.getState().setRecordMode(!recordMode);
  }, [recordMode]);

  const handleSidebar = useCallback(() => {
    useGTUltraStore.getState().setDawSidebarOpen(!dawSidebarOpen);
  }, [dawSidebarOpen]);

  const handleViewMode = useCallback((mode: GTViewMode) => {
    useGTUltraStore.getState().setViewMode(mode);
  }, []);

  const handleGridSnap = useCallback(() => {
    const snaps: Array<1 | 2 | 4 | 8 | 16> = [1, 2, 4, 8, 16];
    const idx = snaps.indexOf(dawGridSnap);
    const next = snaps[(idx + 1) % snaps.length];
    useGTUltraStore.getState().setDawGridSnap(next);
  }, [dawGridSnap]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, DAW_TOOLBAR_H).fill({ color: DAW_PANEL_BG });
    g.rect(0, DAW_TOOLBAR_H - 1, width, 1).fill({ color: DAW_PANEL_BORDER });
  }, [width]);

  const gridLabel = `1/${dawGridSnap === 1 ? '1' : dawGridSnap.toString()}`;

  const viewModes: { mode: GTViewMode; label: string }[] = [
    { mode: 'pro', label: 'PRO' },
    { mode: 'studio', label: 'STU' },
    { mode: 'daw', label: 'DAW' },
  ];

  return (
    <pixiContainer layout={{ width, height: DAW_TOOLBAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, gap: 6 }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height: DAW_TOOLBAR_H }} />

      {/* Transport */}
      <pixiContainer eventMode="static" cursor="pointer" onPointerUp={handlePlay}>
        <pixiBitmapText eventMode="none" text={playing ? '[PLAY]' : '[play]'} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={playing ? DAW_SUCCESS : DAW_TEXT_MUTED} />
      </pixiContainer>

      <pixiContainer eventMode="static" cursor="pointer" onPointerUp={handleStop}>
        <pixiBitmapText eventMode="none" text="[stop]" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={DAW_TEXT_SEC} />
      </pixiContainer>

      <pixiContainer eventMode="static" cursor="pointer" onPointerUp={handleRecord}>
        <pixiBitmapText eventMode="none" text={recordMode ? '[REC]' : '[rec]'} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={recordMode ? DAW_ERROR : DAW_TEXT_MUTED} />
      </pixiContainer>

      {/* Separator */}
      <pixiBitmapText text="|" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={DAW_PANEL_BORDER} />

      {/* BPM */}
      <pixiBitmapText text={`BPM:${tempo}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={DAW_TEXT_SEC} />

      {/* Position */}
      <pixiBitmapText text={posText} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }} tint={DAW_ACCENT_WARM} />

      {/* Song name */}
      <pixiBitmapText text={songName || 'Untitled'} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }} tint={DAW_TEXT} />

      {/* Flex spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Grid snap */}
      <pixiContainer eventMode="static" cursor="pointer" onPointerUp={handleGridSnap}>
        <pixiBitmapText eventMode="none" text={`Grid:${gridLabel}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={DAW_TEXT_SEC} />
      </pixiContainer>

      {/* Sidebar toggle */}
      <pixiContainer eventMode="static" cursor="pointer" onPointerUp={handleSidebar}>
        <pixiBitmapText eventMode="none" text={dawSidebarOpen ? '[SIDE]' : '[side]'} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={dawSidebarOpen ? DAW_ACCENT : DAW_TEXT_MUTED} />
      </pixiContainer>

      {/* View mode switches */}
      {viewModes.map(({ mode, label }) => (
        <pixiContainer key={mode} eventMode="static" cursor="pointer" onPointerUp={() => handleViewMode(mode)}>
          <pixiBitmapText eventMode="none" text={`[${label}]`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={viewMode === mode ? DAW_ACCENT : DAW_TEXT_MUTED} />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
};
