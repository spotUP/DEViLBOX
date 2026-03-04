/**
 * PixiGTUltraView — Top-level GoatTracker Ultra editor in WebGL/Pixi.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (song info, transport, SID config)       │
 * ├────────────────────────────┬─────────────────────┤
 * │                            │ Order List          │
 * │  Pattern Editor (MegaText) ├─────────────────────┤
 * │  3 or 6 channels           │ Instrument panel    │
 * │                            ├─────────────────────┤
 * │                            │ Table editor        │
 * └────────────────────────────┴─────────────────────┘
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import * as Tone from 'tone';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiButton } from '@/pixi/components/PixiButton';
import { PixiGTPatternGrid } from './PixiGTPatternGrid';
import { PixiGTOrderList } from './PixiGTOrderList';
import { PixiGTInstrumentPanel } from './PixiGTInstrumentPanel';
import { PixiGTTableEditor } from './PixiGTTableEditor';
import { PixiGTSIDMonitor } from './PixiGTSIDMonitor';
import { PixiGTOscilloscope } from './PixiGTOscilloscope';
import { PixiGTStudioInstrument } from './PixiGTStudioInstrument';
import { PixiGTStudioTables } from './PixiGTStudioTables';
import { PixiGTPianoRoll } from './PixiGTPianoRoll';
import { PixiGTPresetBrowser } from './PixiGTPresetBrowser';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { GTUltraEngine } from '@/engine/gtultra/GTUltraEngine';
import { getGTUltraASIDBridge } from '@/engine/gtultra/GTUltraASIDBridge';

const TOOLBAR_H = 32;
const SIDEBAR_W = 280;

// GoatTracker color palette
const GT_BG        = 0x1a1a2e;
const GT_TOOLBAR   = 0x0f3460;
const GT_ACCENT    = 0xe94560;
const GT_GREEN     = 0x2a9d8f;
const GT_SEP       = 0x333355;
const GT_TEXT_DIM  = 0x666688;

interface Props {
  width: number;
  height: number;
}

export const PixiGTUltraView: React.FC<Props> = ({ width, height }) => {
  const playing = useGTUltraStore((s) => s.playing);
  const songName = useGTUltraStore((s) => s.songName);
  const songAuthor = useGTUltraStore((s) => s.songAuthor);
  const tempo = useGTUltraStore((s) => s.tempo);
  const sidModel = useGTUltraStore((s) => s.sidModel);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const followPlay = useGTUltraStore((s) => s.followPlay);
  const engine = useGTUltraStore((s) => s.engine);
  const viewMode = useGTUltraStore((s) => s.viewMode);

  // Initialize engine on mount (mirrors GTUltraView.tsx logic)
  useEffect(() => {
    console.log('[GTUltra/Pixi] PixiGTUltraView mounted, engine:', !!useGTUltraStore.getState().engine, 'pendingSong:', !!useGTUltraStore.getState().pendingSongData);
    // Skip if engine already exists (e.g. DOM view initialized it)
    if (useGTUltraStore.getState().engine) return;

    let gtEngine: GTUltraEngine | null = null;
    let disposed = false;

    const setup = async () => {
      const audioCtx = Tone.getContext().rawContext as AudioContext;
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      gtEngine = new GTUltraEngine(audioCtx, {
        onReady: () => {
          if (disposed) return;
          console.log('[GTUltra/Pixi] Engine ready');
          const store = useGTUltraStore.getState();
          // Set engine in store FIRST so refresh methods can use it
          useGTUltraStore.getState().setEngine(gtEngine);
          // Load any pending song data that arrived before engine was ready
          if (store.pendingSongData) {
            gtEngine!.loadSong(store.pendingSongData.buffer as ArrayBuffer);
            store.setPendingSongData(null);
          }
          store.refreshSongInfo();
          store.refreshAllOrders();
          store.refreshAllInstruments();
          store.refreshAllTables();
        },
        onPosition: (pos) => useGTUltraStore.getState().updatePlaybackPos(pos),
        onAsidWrite: (chip, reg, value) => getGTUltraASIDBridge().writeRegister(chip, reg, value),
        onPatternData: (pattern, length, data) => useGTUltraStore.getState().updatePatternData(pattern, length, data),
        onOrderData: (channel, data) => useGTUltraStore.getState().updateOrderData(channel, data),
        onInstrumentData: (instrument, data) => useGTUltraStore.getState().updateInstrumentData(instrument, data),
        onTableData: (tableType, left, right) => useGTUltraStore.getState().updateTableData(tableType, left, right),
        onSidRegisters: (sidIdx, data) => useGTUltraStore.getState().updateSidRegisters(sidIdx, data),
        onSongInfo: (info) => {
          const store = useGTUltraStore.getState();
          store.setSongName(info.name);
          store.setSongAuthor(info.author);
          // Request all pattern data now that we know how many patterns exist
          if (info.numPatterns > 0) {
            store.refreshAllPatterns(info.numPatterns);
          }
        },
        onError: (err) => console.error('[GTUltra/Pixi] Engine error:', err),
      });
      await gtEngine.init();
      await gtEngine.ready;
      if (disposed) { gtEngine.dispose(); return; }
      gtEngine.output.connect(audioCtx.destination);
      // Engine already set in store by onReady callback above
    };

    setup().catch(console.error);

    return () => {
      disposed = true;
      if (gtEngine) {
        gtEngine.dispose();
        useGTUltraStore.getState().setEngine(null);
      }
    };
  }, []);

  const editorWidth = width - SIDEBAR_W;
  const editorHeight = height - TOOLBAR_H;
  const oscH = 80;
  // Pro mode layout
  const orderH = Math.floor((editorHeight - oscH) * 0.2);
  const instrH = Math.floor((editorHeight - oscH) * 0.3);
  const sideRemain = editorHeight - oscH - orderH - instrH;
  const tableH = Math.floor(sideRemain * (sidCount === 2 ? 0.33 : 0.5));
  const regMonTotal = sideRemain - tableH;
  const regMonH = sidCount === 2 ? Math.floor(regMonTotal / 2) : regMonTotal;
  const regMon2H = regMonTotal - regMonH;
  // Studio mode layout
  const studioInstrH = Math.floor((editorHeight - oscH) * 0.3);
  const studioPresetH = Math.floor((editorHeight - oscH) * 0.22);
  const studioTableH = Math.floor((editorHeight - oscH) * (sidCount === 2 ? 0.18 : 0.25));
  const studioRegTotal = editorHeight - oscH - studioInstrH - studioPresetH - studioTableH;
  const studioRegH = sidCount === 2 ? Math.floor(studioRegTotal / 2) : studioRegTotal;
  const studioReg2H = studioRegTotal - studioRegH;

  // Toolbar info
  const infoText = useMemo(() => {
    const pos = playbackPos.position.toString(16).toUpperCase().padStart(2, '0');
    const row = playbackPos.row.toString(16).toUpperCase().padStart(2, '0');
    const sid = sidModel === 0 ? '6581' : '8580';
    const ch = sidCount * 3;
    return `Pos:${pos} Row:${row}  |  ${sid} ${ch}ch  |  Tempo:${tempo}`;
  }, [playbackPos, sidModel, sidCount, tempo]);

  const togglePlay = useCallback(() => {
    if (!engine) return;
    if (playing) {
      engine.stop();
      useGTUltraStore.getState().setPlaying(false);
    } else {
      engine.play();
      useGTUltraStore.getState().setPlaying(true);
    }
  }, [engine, playing]);

  const toggleFollow = useCallback(() => {
    useGTUltraStore.getState().setFollowPlay(!followPlay);
  }, [followPlay]);

  const toggleViewMode = useCallback(() => {
    const store = useGTUltraStore.getState();
    store.setViewMode(store.viewMode === 'pro' ? 'studio' : 'pro');
  }, []);

  const handleApplyPreset = useCallback((preset: import('@/constants/gtultraPresets').GTSIDPreset) => {
    if (!engine) return;
    const idx = useGTUltraStore.getState().currentInstrument;
    engine.setInstrumentAD(idx, preset.ad);
    engine.setInstrumentSR(idx, preset.sr);
    engine.setInstrumentFirstwave(idx, preset.waveform | 0x01); // set gate bit
    engine.requestInstrumentData(idx);
  }, [engine]);

  // Draw callbacks
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: GT_BG });
  }, [width, height]);

  const drawToolbar = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_H).fill({ color: GT_TOOLBAR });
    g.rect(0, TOOLBAR_H - 1, width, 1).fill({ color: GT_SEP });
  }, [width]);

  const drawSidebarSep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(editorWidth - 1, 0, 1, editorHeight).fill({ color: GT_SEP });
  }, [editorWidth, editorHeight]);

  // Always render the same tree structure to avoid @pixi/layout yoga BindingErrors.
  // Use alpha/renderable to hide content when engine is not yet loaded.
  const ready = !!engine;

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Initializing overlay — shown when engine is not yet loaded */}
      <pixiContainer
        alpha={ready ? 0 : 1}
        renderable={!ready}
        layout={{ position: 'absolute', width, height, alignItems: 'center', justifyContent: 'center' }}
      >
        <pixiBitmapText
          text="GoatTracker Ultra — initializing..."
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={GT_TEXT_DIM}
        />
      </pixiContainer>

      {/* ─── Toolbar ─── */}
      <pixiContainer
        alpha={ready ? 1 : 0}
        renderable={ready}
        layout={{
          width,
          height: TOOLBAR_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbar} layout={{ position: 'absolute', width, height: TOOLBAR_H }} />

        {/* Play/Stop */}
        <PixiButton
          label=""
          icon={playing ? 'stop' : 'play'}
          variant="ft2"
          size="sm"
          color={playing ? 'red' : 'green'}
          onClick={togglePlay}
        />

        {/* Song name */}
        <pixiBitmapText
          text={songName || 'Untitled'}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={GT_ACCENT}
        />

        {/* Always mount to avoid Yoga BindingError — hide via alpha */}
        <pixiBitmapText
          text={songAuthor ? `by ${songAuthor}` : ''}
          alpha={songAuthor ? 1 : 0}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={GT_TEXT_DIM}
        />

        <pixiContainer layout={{ flex: 1 }} />

        {/* Follow */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={toggleFollow}>
          <pixiBitmapText
            eventMode="none"
            text={followPlay ? '[FOLLOW]' : '[follow]'}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={followPlay ? GT_GREEN : GT_TEXT_DIM}
          />
        </pixiContainer>

        {/* Pro/Studio mode switcher */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={toggleViewMode}>
          <pixiBitmapText
            eventMode="none"
            text={viewMode === 'pro' ? '[PRO]' : '[STUDIO]'}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={viewMode === 'pro' ? GT_ACCENT : GT_GREEN}
          />
        </pixiContainer>

        {/* Info */}
        <pixiBitmapText
          text={infoText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={GT_TEXT_DIM}
        />
      </pixiContainer>

      {/* ─── Main area ─── */}
      <pixiContainer alpha={ready ? 1 : 0} renderable={ready} layout={{ flexDirection: 'row', flex: 1, width, height: editorHeight }}>
        {/* Pattern editor: hex grid in Pro, piano roll in Studio.
            Both always mounted to avoid @pixi/layout Yoga BindingErrors
            when switching modes. Inactive view hidden via alpha/renderable. */}
        <pixiContainer alpha={viewMode === 'pro' ? 1 : 0} renderable={viewMode === 'pro'} eventMode={viewMode === 'pro' ? 'static' : 'none'} layout={{ width: editorWidth, height: editorHeight }}>
          <PixiGTPatternGrid
            width={Math.max(100, editorWidth)}
            height={Math.max(100, editorHeight)}
          />
        </pixiContainer>
        <pixiContainer alpha={viewMode !== 'pro' ? 1 : 0} renderable={viewMode !== 'pro'} eventMode={viewMode !== 'pro' ? 'static' : 'none'} layout={{ position: 'absolute', top: 0, left: 0, width: editorWidth, height: editorHeight }}>
          <PixiGTPianoRoll
            width={Math.max(100, editorWidth)}
            height={Math.max(100, editorHeight)}
          />
        </pixiContainer>

        {/* Sidebar separator */}
        <pixiGraphics draw={drawSidebarSep} layout={{ position: 'absolute', left: editorWidth, width: 1, height: editorHeight }} />

        {/* Sidebar */}
        <pixiContainer layout={{ width: SIDEBAR_W, flexDirection: 'column' }}>
          <PixiGTOscilloscope
            width={SIDEBAR_W}
            height={oscH}
          />
          {/* Always mount both sidebar modes to avoid Yoga BindingErrors */}
          <pixiContainer alpha={viewMode === 'pro' ? 1 : 0} renderable={viewMode === 'pro'} eventMode={viewMode === 'pro' ? 'static' : 'none'} layout={{ width: SIDEBAR_W, flexDirection: 'column' }}>
            {/* Pro mode: hex-based editors */}
            <PixiGTOrderList width={SIDEBAR_W} height={orderH} />
            <PixiGTInstrumentPanel width={SIDEBAR_W} height={instrH} />
            <PixiGTTableEditor width={SIDEBAR_W} height={tableH} />
            <PixiGTSIDMonitor width={SIDEBAR_W} height={regMonH} sidIndex={0} />
            <pixiContainer alpha={sidCount === 2 ? 1 : 0} renderable={sidCount === 2} layout={{ height: sidCount === 2 ? regMon2H : 0 }}>
              <PixiGTSIDMonitor width={SIDEBAR_W} height={regMon2H} sidIndex={1} />
            </pixiContainer>
          </pixiContainer>
          <pixiContainer alpha={viewMode !== 'pro' ? 1 : 0} renderable={viewMode !== 'pro'} eventMode={viewMode !== 'pro' ? 'static' : 'none'} layout={{ position: 'absolute', top: oscH, width: SIDEBAR_W, flexDirection: 'column' }}>
            {/* Studio mode: visual instrument designer + presets + visual tables + register monitor */}
            <PixiGTStudioInstrument width={SIDEBAR_W} height={studioInstrH} />
            <PixiGTPresetBrowser width={SIDEBAR_W} height={studioPresetH} onApplyPreset={handleApplyPreset} />
            <PixiGTStudioTables width={SIDEBAR_W} height={studioTableH} />
            <PixiGTSIDMonitor width={SIDEBAR_W} height={studioRegH} sidIndex={0} />
            <pixiContainer alpha={sidCount === 2 ? 1 : 0} renderable={sidCount === 2} layout={{ height: sidCount === 2 ? studioReg2H : 0 }}>
              <PixiGTSIDMonitor width={SIDEBAR_W} height={studioReg2H} sidIndex={1} />
            </pixiContainer>
          </pixiContainer>
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};
