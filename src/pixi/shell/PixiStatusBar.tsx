/**
 * PixiStatusBar — Bottom status bar for WebGL mode.
 * Pure Pixi implementation — no PixiDOMOverlay.
 * Mirrors src/components/layout/StatusBar.tsx in the Pixi rendering layer.
 *
 * Layout:
 *   - Main status row (STATUS_BAR_HEIGHT): left info + right MIDI/audio/collab
 *   - MIDI knob panel (KNOB_PANEL_HEIGHT): bank tabs + 8-knob grid (conditional)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTick } from '@pixi/react';
import { isRapidScrolling } from '../scrollPerf';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useShallow } from 'zustand/react/shallow';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme, usePixiThemeId, getDeckColors } from '../theme';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useUIStore, useAudioStore, useTrackerStore, useTransportStore, useCursorStore, useEditorStore, useFormatStore } from '@stores';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { useDJStore } from '@/stores/useDJStore';
import { useCollaborationStore } from '@/stores/useCollaborationStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { KNOB_BANKS, type KnobAssignment } from '@/midi/knobBanks';
import type { KnobBankMode } from '@/midi/types';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { WorkbenchMinimap } from '../workbench/WorkbenchMinimap';
import { PixiIcon } from '../components/PixiIcon';

/** Main status bar height (matches DOM py-1.5 + text) */
const STATUS_BAR_HEIGHT = 32;
/** MIDI knob panel height when expanded */
const KNOB_PANEL_HEIGHT = 80;

// ─── Separator ────────────────────────────────────────────────────────────────

const PixiSep: React.FC<{ height: number }> = ({ height }) => {
  const theme = usePixiTheme();
  const drawSep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 1, height);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [height, theme]);

  return (
    <pixiGraphics
      draw={drawSep}
      layout={{ width: 1, height, marginLeft: 8, marginRight: 8, alignSelf: 'center' }}
    />
  );
};

// ─── Status dot ───────────────────────────────────────────────────────────────

const PixiDot: React.FC<{ color: number; size?: number }> = ({ color, size = 6 }) => {
  const drawDot = useCallback((g: GraphicsType) => {
    g.clear();
    g.circle(size / 2, size / 2, size / 2);
    g.fill({ color });
  }, [color, size]);

  return (
    <pixiGraphics
      draw={drawDot}
      layout={{ width: size, height: size, alignSelf: 'center', marginRight: 4 }}
    />
  );
};

// ─── Audio Health Badge ──────────────────────────────────────────────────────
// Prominent warning badge shown globally when AudioContext is suspended/closed.

const PixiAudioHealthBadge: React.FC = () => {
  const theme = usePixiTheme();
  const contextState = useAudioStore((s) => s.contextState);
  const state = contextState === 'running' ? null : (contextState ?? 'suspended');
  if (!state) return null;

  const bgColor = state === 'suspended'
    ? (theme.warning?.color ?? 0xeab308)
    : (theme.error?.color ?? 0xef4444);
  const label = `Audio: ${state}`;
  const badgeW = label.length * 7 + 12;
  const badgeH = 18;

  return (
    <pixiContainer layout={{ height: badgeH, width: badgeW, alignSelf: 'center' }}>
      <pixiGraphics
        draw={(g: GraphicsType) => {
          g.clear();
          g.roundRect(0, 0, badgeW, badgeH, 3);
          g.fill({ color: bgColor, alpha: 0.9 });
        }}
      />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        x={badgeW / 2}
        y={badgeH / 2}
        anchor={0.5}
      />
    </pixiContainer>
  );
};

// ─── DJ Status Content ────────────────────────────────────────────────────────

const DJStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();
  const themeId = usePixiThemeId();
  const { deckA, deckB } = getDeckColors(themeId, theme.accent, theme.accentSecondary);
  const {
    deck1Playing, deck2Playing,
    deck1BPM, deck2BPM,
    deck1Name, deck2Name,
    crossfader,
  } = useDJStore(useShallow((s) => ({
    deck1Playing: s.decks.A.isPlaying,
    deck2Playing: s.decks.B.isPlaying,
    deck1BPM: s.decks.A.effectiveBPM || 0,
    deck2BPM: s.decks.B.effectiveBPM || 0,
    deck1Name: s.decks.A.trackName,
    deck2Name: s.decks.B.trackName,
    crossfader: s.crossfaderPosition,
  })));

  const d1BpmStr = deck1BPM.toFixed(1);
  const d2BpmStr = deck2BPM.toFixed(1);
  const xFadeStr = `X-Fade ${(crossfader * 100).toFixed(0)}%`;
  const d1Label = deck1Playing ? 'PLAY' : 'STOP';
  const d2Label = deck2Playing ? 'PLAY' : 'STOP';
  const d1Color = deck1Playing ? theme.success.color : theme.textMuted.color;
  const d2Color = deck2Playing ? theme.success.color : theme.textMuted.color;

  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: barHeight }}>
      {/* Deck 1 label */}
      <pixiBitmapText text="D1" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={deckA} layout={{ alignSelf: 'center', marginRight: 4 }} />
      <pixiBitmapText text={d1Label} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={d1Color} layout={textLayout} />
      {/* Always mounted — conditional render causes @pixi/layout BindingError */}
      <pixiContainer alpha={deck1Name ? 1 : 0} layout={{ flexDirection: 'row', flexShrink: 0 }}>
        <PixiSep height={10} />
        <pixiBitmapText
          text={deck1Name ? (deck1Name.length > 14 ? deck1Name.slice(0, 12) + '\u2026' : deck1Name) : ''}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={textLayout}
        />
      </pixiContainer>
      <PixiSep height={10} />
      <pixiBitmapText text={d1BpmStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={deckA} layout={textLayout} />
      <pixiBitmapText text=" BPM" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />

      <PixiSep height={10} />
      <pixiBitmapText text={xFadeStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />

      <PixiSep height={10} />
      <pixiBitmapText text="D2" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={deckB} layout={{ alignSelf: 'center', marginRight: 4 }} />
      <pixiBitmapText text={d2Label} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={d2Color} layout={textLayout} />
      {/* Always mounted — conditional render causes @pixi/layout BindingError */}
      <pixiContainer alpha={deck2Name ? 1 : 0} layout={{ flexDirection: 'row', flexShrink: 0 }}>
        <PixiSep height={10} />
        <pixiBitmapText
          text={deck2Name ? (deck2Name.length > 14 ? deck2Name.slice(0, 12) + '\u2026' : deck2Name) : ''}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={textLayout}
        />
      </pixiContainer>
      <PixiSep height={10} />
      <pixiBitmapText text={d2BpmStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={deckB} layout={textLayout} />
      <pixiBitmapText text=" BPM" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
    </pixiContainer>
  );
};

// ─── Tracker Status Content ───────────────────────────────────────────────────

const TrackerStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();

  const { currentOctave, insertMode, recordMode } = useEditorStore(
    useShallow((s) => ({
      currentOctave: s.currentOctave,
      insertMode: s.insertMode,
      recordMode: s.recordMode,
    }))
  );
  const { patternLength } = useTrackerStore(
    useShallow((s) => ({
      patternLength: s.patterns[s.currentPatternIndex]?.length || 64,
    }))
  );
  const { songDBInfo, sidMetadata } = useFormatStore(
    useShallow((s) => ({
      songDBInfo: s.songDBInfo,
      sidMetadata: s.sidMetadata,
    }))
  );
  const isPlaying = useTransportStore(s => s.isPlaying);

  // Cursor ref — updated via subscription, NOT React state (avoids @pixi/react reconciliation)
  const cursorRef = useRef(useCursorStore.getState().cursor);
  useEffect(() => {
    const unsub = useCursorStore.subscribe((state, prev) => {
      if (state.cursor !== prev.cursor) cursorRef.current = state.cursor;
    });
    return unsub;
  }, []);

  // Row, channel, column BitmapTexts are updated imperatively in useTick — no React re-render
  const rowBitmapTextRef = useRef<import('pixi.js').BitmapText | null>(null);
  const channelBitmapTextRef = useRef<import('pixi.js').BitmapText | null>(null);
  const columnBitmapTextRef = useRef<import('pixi.js').BitmapText | null>(null);

  useTick(() => {
    if (isRapidScrolling()) return;
    const cur = cursorRef.current;
    if (rowBitmapTextRef.current) {
      const currentRow = isPlaying
        ? useTransportStore.getState().currentRow
        : cur.rowIndex;
      const rowText = String(currentRow).padStart(2, '0') + '/' + String(patternLength - 1).padStart(2, '0');
      if (rowBitmapTextRef.current.text !== rowText) rowBitmapTextRef.current.text = rowText;
    }
    if (channelBitmapTextRef.current) {
      const chText = `Ch ${cur.channelIndex + 1}`;
      if (channelBitmapTextRef.current.text !== chText) channelBitmapTextRef.current.text = chText;
    }
    if (columnBitmapTextRef.current) {
      const colText = cur.columnType.charAt(0).toUpperCase() + cur.columnType.slice(1);
      if (columnBitmapTextRef.current.text !== colText) columnBitmapTextRef.current.text = colText;
    }
  });

  const channelStr = `Ch ${cursorRef.current.channelIndex + 1}`;
  const columnStr = cursorRef.current.columnType.charAt(0).toUpperCase() + cursorRef.current.columnType.slice(1);
  const octStr = String(currentOctave);
  const modeStr = insertMode ? 'INS' : 'OVR';
  const modeColor = insertMode ? theme.warning.color : theme.accent.color;
  const recStr = recordMode ? 'REC' : 'EDIT';
  const recColor = recordMode ? theme.error.color : theme.text.color;

  const hasMetadata = !!songDBInfo || !!sidMetadata;
  let metadataStr = '';
  if (sidMetadata) {
    const parts: string[] = [];
    if (sidMetadata.title) parts.push(sidMetadata.title);
    if (sidMetadata.author) parts.push(`by ${sidMetadata.author}`);
    const chipInfo = [];
    if (sidMetadata.chipModel !== 'Unknown') chipInfo.push(`MOS ${sidMetadata.chipModel}`);
    if (sidMetadata.clockSpeed !== 'Unknown') chipInfo.push(sidMetadata.clockSpeed);
    if (chipInfo.length) parts.push(`[${chipInfo.join(' ')}]`);
    if (sidMetadata.subsongs > 1) parts.push(`Sub ${sidMetadata.currentSubsong + 1}/${sidMetadata.subsongs}`);
    if (songDBInfo?.album) parts.push(`· ${songDBInfo.album}`);
    if (songDBInfo?.year) parts.push(`(${songDBInfo.year})`);
    metadataStr = parts.join(' ');
  } else if (songDBInfo) {
    const parts: string[] = [];
    if (songDBInfo!.album) {
      parts.push(songDBInfo!.album);
    }
    if (songDBInfo!.year) {
      parts.push(`(${songDBInfo!.year})`);
    }
    if (songDBInfo!.format) {
      parts.push(`[${songDBInfo!.format}]`);
    }
    if (songDBInfo!.authors?.length) {
      parts.push(`by ${songDBInfo!.authors.join(', ')}`);
    }
    metadataStr = parts.join(' ');
  }

  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: barHeight }}>
      <pixiBitmapText text="Row" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={{ ...textLayout, marginRight: 4 }} />
      <pixiBitmapText
        ref={rowBitmapTextRef as any}
        text="00/00"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={textLayout}
      />
      <PixiSep height={10} />
      <pixiBitmapText ref={channelBitmapTextRef as any} text={channelStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText ref={columnBitmapTextRef as any} text={columnStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text="Oct" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={{ ...textLayout, marginRight: 4 }} />
      <pixiBitmapText text={octStr} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={theme.accent.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text="Mode:" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={{ ...textLayout, marginRight: 4 }} />
      <pixiBitmapText text={modeStr} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={modeColor} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={recStr} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={recColor} layout={textLayout} />
      {/* SongDB metadata — always mounted to avoid @pixi/layout BindingError */}
      <pixiContainer alpha={hasMetadata ? 1 : 0} layout={{ flexDirection: 'row', flexShrink: 0 }}>
        <PixiSep height={10} />
        <pixiBitmapText
          text={metadataStr}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={textLayout}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── VJ Status Content ────────────────────────────────────────────────────────

const VJStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();
  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);
  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: barHeight }}>
      <pixiBitmapText text="VJ" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={theme.accent.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText
        text="Esc: back  Cmd+Shift+V: toggle  Milkdrop | ISF | 3D"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={textLayout}
      />
    </pixiContainer>
  );
};

// ─── Drum Pad Status Content ──────────────────────────────────────────────────

const DrumPadStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();
  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);
  const currentBank = useDrumPadStore(s => s.currentBank);
  const programCount = useDrumPadStore(s => s.programs.size);
  const noteRepeatEnabled = useDrumPadStore(s => s.noteRepeatEnabled);
  const noteRepeatRate = useDrumPadStore(s => s.noteRepeatRate);

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: barHeight }}>
      <pixiBitmapText text={`Bank ${currentBank}`} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={theme.accent.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={`${programCount} program${programCount !== 1 ? 's' : ''}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={`16 pads`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.textMuted.color} layout={textLayout} />
      {/* Always mounted — conditional render causes @pixi/layout BindingError */}
      <pixiContainer alpha={noteRepeatEnabled ? 1 : 0} layout={{ flexDirection: 'row', flexShrink: 0 }}>
        <PixiSep height={10} />
        <pixiBitmapText text={`Repeat: ${noteRepeatRate}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.warning.color} layout={textLayout} />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Studio Status Content ────────────────────────────────────────────────────

const StudioStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();
  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);
  const windowCount = useWorkbenchStore(s => Object.keys(s.windows).length);
  const zoom = useWorkbenchStore(s => s.camera.scale);

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: barHeight }}>
      <pixiBitmapText text="STUDIO" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={theme.accent.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={`${windowCount} window${windowCount !== 1 ? 's' : ''}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={`Zoom: ${Math.round(zoom * 100)}%`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.textMuted.color} layout={textLayout} />
    </pixiContainer>
  );
};

interface RightSideProps {
  barHeight: number;
  hasMIDIDevice: boolean;
  deviceName: string;
  showKnobBar: boolean;
  onToggleKnobBar: () => void;
  isAudioRunning: boolean;
  collabConnected: boolean;
  collabRoomCode: string | null;
  activeView: string;
  onShowTips: () => void;
}

const RightSide: React.FC<RightSideProps> = ({
  barHeight,
  hasMIDIDevice,
  deviceName,
  showKnobBar,
  onToggleKnobBar,
  isAudioRunning,
  collabConnected,
  collabRoomCode,
  activeView,
  onShowTips,
}) => {
  const theme = usePixiTheme();
  const [tipsHovered, setTipsHovered] = useState(false);
  const showMIDI = hasMIDIDevice && activeView !== 'dj' && activeView !== 'vj';

  // SID hardware status — poll from settings store
  const sidHwMode = useSettingsStore(s => s.sidHardwareMode);
  const [sidHwConnected, setSidHwConnected] = useState(false);
  const [sidHwWriteCount, setSidHwWriteCount] = useState(0);
  const lastWriteCountRef = useRef(0);
  const [sidHwActive, setSidHwActive] = useState(false); // true when writes are flowing

  useEffect(() => {
    if (sidHwMode === 'off') {
      setSidHwConnected(false);
      setSidHwActive(false);
      return;
    }
    let unsub: (() => void) | undefined;
    import('@lib/sid/SIDHardwareManager').then(({ getSIDHardwareManager }) => {
      const mgr = getSIDHardwareManager();
      const update = () => {
        const st = mgr.getStatus();
        setSidHwConnected(st.connected);
        setSidHwWriteCount(st.writeCount);
      };
      update();
      unsub = mgr.onStatusChange(update);
    });
    return () => unsub?.();
  }, [sidHwMode]);

  // Activity detection — pulse when write count changes
  useEffect(() => {
    if (sidHwMode === 'off') return;
    const interval = setInterval(() => {
      if (sidHwWriteCount !== lastWriteCountRef.current) {
        lastWriteCountRef.current = sidHwWriteCount;
        setSidHwActive(true);
      } else {
        setSidHwActive(false);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [sidHwMode, sidHwWriteCount]);

  const showSidHw = sidHwMode !== 'off';

  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);
  const audioDotColor = isAudioRunning ? theme.success.color : theme.textMuted.color;
  const audioLabel = isAudioRunning ? 'Audio Active' : 'Audio Off';
  const audioLabelColor = isAudioRunning ? theme.success.color : theme.textMuted.color;
  const chevron = showKnobBar ? '\u25BE' : '\u25B4'; // ▾ / ▴

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', height: barHeight, paddingRight: 12, flexShrink: 0 }}>
      {/* Collab badge — always mounted to avoid @pixi/layout BindingError */}
      <pixiContainer alpha={collabConnected && collabRoomCode ? 1 : 0} layout={{ flexDirection: 'row', flexShrink: 0 }}>
        <PixiDot color={theme.success.color} />
        <pixiBitmapText text="Collab" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={theme.success.color} layout={textLayout} />
        <pixiBitmapText text={collabRoomCode ? ` ${collabRoomCode}` : ''} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }} tint={theme.textMuted.color} layout={textLayout} />
        <PixiSep height={10} />
      </pixiContainer>

      {/* SID hardware badge — always mounted to avoid @pixi/layout BindingError */}
      <pixiContainer alpha={showSidHw ? 1 : 0} layout={{ flexDirection: 'row', flexShrink: 0 }}>
        <PixiDot color={sidHwConnected ? (sidHwActive ? 0x00FF88 : theme.success.color) : theme.error.color} />
        <pixiBitmapText
          text={`SID ${sidHwMode === 'webusb' ? 'USB' : 'ASID'}`}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
          tint={sidHwConnected ? theme.success.color : theme.error.color}
          layout={textLayout}
        />
        <PixiSep height={10} />
      </pixiContainer>

      {/* MIDI device toggle button — always mounted to avoid @pixi/layout BindingError */}
      <pixiContainer alpha={showMIDI ? 1 : 0} eventMode={showMIDI ? 'static' : 'none'} layout={{ flexDirection: 'row', flexShrink: 0 }}>
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onClick={onToggleKnobBar}
          layout={{ flexDirection: 'row', alignItems: 'center', height: barHeight }}
        >
          <PixiDot color={theme.success.color} />
          <pixiBitmapText
            text={deviceName.toUpperCase()}
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={textLayout}
          />
          <pixiBitmapText
            text={` ${chevron}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={textLayout}
          />
        </pixiContainer>
        <PixiSep height={10} />
      </pixiContainer>

      {/* TIPS button */}
      <pixiContainer
        eventMode="static"
        cursor="pointer"
        onClick={onShowTips}
        onPointerOver={() => setTipsHovered(true)}
        onPointerOut={() => setTipsHovered(false)}
        layout={{ flexDirection: 'row', alignItems: 'center', height: barHeight, marginRight: 8 }}
      >
        <PixiIcon name="thunderbolt" size={12} color={tipsHovered ? theme.warning.color : theme.warning.color} layout={{ alignSelf: 'center' }} />
        <pixiBitmapText
          text="TIPS"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
          tint={tipsHovered ? theme.warning.color : theme.warning.color}
          layout={{ alignSelf: 'center' }}
        />
      </pixiContainer>
      <PixiSep height={10} />

      {/* Audio state indicator — prominent badge when suspended/closed */}
      {isAudioRunning ? (
        <>
          <PixiDot color={audioDotColor} />
          <pixiBitmapText
            text={audioLabel}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
            tint={audioLabelColor}
            layout={textLayout}
          />
        </>
      ) : (
        <PixiAudioHealthBadge />
      )}
    </pixiContainer>
  );
};

// ─── MIDI Knob Panel ──────────────────────────────────────────────────────────

interface KnobPanelProps {
  width: number;
  height: number;
  knobBank: KnobBankMode;
  setKnobBank: (bank: KnobBankMode) => void;
  assignments: KnobAssignment[];
}

const BANK_DEFS: { id: KnobBankMode; label: string }[] = [
  { id: '303',   label: '303/Synth' },
  { id: 'Siren', label: 'Dub Siren' },
  { id: 'FX',    label: 'Effects'   },
  { id: 'Mixer', label: 'Mixer'     },
];

const KnobPanel: React.FC<KnobPanelProps> = ({ width, height, knobBank, setKnobBank, assignments }) => {
  const theme = usePixiTheme();

  // Bank tab row height
  const TAB_H = 24;
  const KNOB_H = height - TAB_H - 8; // 8px = top+bottom padding

  // Knob cell sizing: 8 knobs across
  const hPad = 16;
  const gap = 4;
  const numKnobs = 8;
  const cellW = Math.floor((width - hPad * 2 - gap * (numKnobs - 1)) / numKnobs);

  return (
    <layoutContainer layout={{
      width, height, flexDirection: 'column',
      backgroundColor: theme.bgTertiary.color,
      borderTopWidth: 1,
      borderColor: theme.border.color,
    }}>

      {/* Bank tabs row */}
      <pixiContainer layout={{
        flexDirection: 'row',
        alignItems: 'center',
        height: TAB_H,
        paddingLeft: hPad,
        paddingTop: 4,
        gap: 6,
      }}>
        <pixiBitmapText
          text="KNOB BANK:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ alignSelf: 'center', marginRight: 4 }}
        />
        {BANK_DEFS.map((bank) => (
          <PixiBankTab
            key={bank.id}
            label={bank.label}
            isActive={knobBank === bank.id}
            height={TAB_H - 6}
            onPress={() => setKnobBank(bank.id)}
          />
        ))}
      </pixiContainer>

      {/* Knob assignment grid */}
      <pixiContainer layout={{
        flexDirection: 'row',
        alignItems: 'center',
        height: KNOB_H,
        paddingLeft: hPad,
        paddingRight: hPad,
        gap,
      }}>
        {assignments.slice(0, numKnobs).map((a, i) => (
          <KnobCell
            key={i}
            index={i}
            assignment={a}
            cellW={cellW}
            cellH={KNOB_H}
          />
        ))}
      </pixiContainer>
    </layoutContainer>
  );
};

// Bank tab button
interface BankTabProps {
  label: string;
  isActive: boolean;
  height: number;
  onPress: () => void;
}

const PixiBankTab: React.FC<BankTabProps> = ({ label, isActive, height, onPress }) => {
  const theme = usePixiTheme();
  const W = label.length * 7 + 16; // rough estimate

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (isActive) {
      g.roundRect(0, 0, W, height, 10);
      g.fill({ color: theme.accent.color });
      g.roundRect(0, 0, W, height, 10);
      g.stroke({ color: theme.accent.color, width: 1 });
    } else {
      g.roundRect(0, 0, W, height, 10);
      g.fill({ color: theme.bgSecondary.color });
      g.roundRect(0, 0, W, height, 10);
      g.stroke({ color: theme.border.color, width: 1 });
    }
  }, [W, height, isActive, theme]);

  const textColor = isActive ? theme.textInverse.color : theme.textMuted.color;

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onClick={onPress}
      layout={{ width: W, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: W, height }} />
      <pixiBitmapText
        text={label.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
        tint={textColor}
        layout={{}}
      />
    </pixiContainer>
  );
};

// Individual knob assignment cell
interface KnobCellProps {
  index: number;
  assignment: KnobAssignment;
  cellW: number;
  cellH: number;
}

const KnobCell: React.FC<KnobCellProps> = ({ index, assignment, cellW, cellH }) => {
  const theme = usePixiTheme();

  const drawCell = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, cellW, cellH, 3);
    g.fill({ color: theme.bgSecondary.color });
    g.roundRect(0, 0, cellW, cellH, 3);
    g.stroke({ color: theme.border.color, width: 1 });
    // accent top bar
    g.rect(0, 0, cellW, 2);
    g.fill({ color: theme.accent.color, alpha: 0.2 });
  }, [cellW, cellH, theme]);

  const ccLabel = `K${index + 1} CC${assignment.cc}`;
  const nameLabel = assignment.label.length > 8
    ? assignment.label.slice(0, 7).toUpperCase() + '\u2026'
    : assignment.label.toUpperCase();

  return (
    <pixiContainer layout={{ width: cellW, height: cellH, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <pixiGraphics draw={drawCell} layout={{ position: 'absolute', width: cellW, height: cellH }} />
      <pixiBitmapText
        text={ccLabel}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ marginBottom: 2 }}
      />
      <pixiBitmapText
        text={nameLabel}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{}}
      />
    </pixiContainer>
  );
};

// ─── Main Status Row ──────────────────────────────────────────────────────────

interface MainRowProps {
  width: number;
  activeView: string;
  hasMIDIDevice: boolean;
  deviceName: string;
  showKnobBar: boolean;
  onToggleKnobBar: () => void;
  isAudioRunning: boolean;
  collabConnected: boolean;
  collabRoomCode: string | null;
  onShowTips: () => void;
  minimapVisible: boolean;
}

const MainStatusRow: React.FC<MainRowProps> = ({
  width,
  activeView,
  hasMIDIDevice,
  deviceName,
  showKnobBar,
  onToggleKnobBar,
  isAudioRunning,
  collabConnected,
  collabRoomCode,
  onShowTips,
  minimapVisible,
}) => {
  const theme = usePixiTheme();

  return (
    <layoutContainer layout={{
      width,
      height: STATUS_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 12,
      backgroundColor: theme.bgSecondary.color,
      borderTopWidth: 1,
      borderColor: theme.border.color,
    }}>

      {/* Left content — flex:1 with overflow hidden so it doesn't overlap right side.
          All always mounted (stacked via position:absolute, alpha-toggled) to avoid BindingError. */}
      <pixiContainer layout={{ flex: 1, height: STATUS_BAR_HEIGHT, overflow: 'hidden' }}>
        <pixiContainer alpha={activeView === 'tracker' ? 1 : 0} layout={{ position: 'absolute', left: 0, top: 0, right: 0, height: STATUS_BAR_HEIGHT }}>
          <TrackerStatusContent barHeight={STATUS_BAR_HEIGHT} />
        </pixiContainer>
        <pixiContainer alpha={activeView === 'dj' ? 1 : 0} layout={{ position: 'absolute', left: 0, top: 0, right: 0, height: STATUS_BAR_HEIGHT }}>
          <DJStatusContent barHeight={STATUS_BAR_HEIGHT} />
        </pixiContainer>
        <pixiContainer alpha={activeView === 'vj' ? 1 : 0} layout={{ position: 'absolute', left: 0, top: 0, right: 0, height: STATUS_BAR_HEIGHT }}>
          <VJStatusContent barHeight={STATUS_BAR_HEIGHT} />
        </pixiContainer>
        <pixiContainer alpha={activeView === 'drumpad' ? 1 : 0} layout={{ position: 'absolute', left: 0, top: 0, right: 0, height: STATUS_BAR_HEIGHT }}>
          <DrumPadStatusContent barHeight={STATUS_BAR_HEIGHT} />
        </pixiContainer>
        <pixiContainer alpha={activeView === 'studio' ? 1 : 0} layout={{ position: 'absolute', left: 0, top: 0, right: 0, height: STATUS_BAR_HEIGHT }}>
          <StudioStatusContent barHeight={STATUS_BAR_HEIGHT} />
        </pixiContainer>
        </pixiContainer>

      {/* Right content — flexShrink:0 to keep its natural size */}
      <RightSide
        barHeight={STATUS_BAR_HEIGHT}
        hasMIDIDevice={hasMIDIDevice}
        deviceName={deviceName}
        showKnobBar={showKnobBar}
        onToggleKnobBar={onToggleKnobBar}
        isAudioRunning={isAudioRunning}
        collabConnected={collabConnected}
        collabRoomCode={collabRoomCode}
        activeView={activeView}
        onShowTips={onShowTips}
      />

      {/* Workbench minimap — always mounted to avoid @pixi/layout BindingError */}
      <pixiContainer
        alpha={minimapVisible ? 1 : 0}
        renderable={minimapVisible}
        eventMode={minimapVisible ? 'auto' : 'none'}
        layout={{ position: 'absolute', right: 0, bottom: 0 }}
      >
        <WorkbenchMinimap screenW={width} screenH={window.innerHeight} />
      </pixiContainer>
    </layoutContainer>
  );
};

// ─── PixiStatusBar (root) ─────────────────────────────────────────────────────

export const PixiStatusBar: React.FC = () => {
  const { width } = usePixiResponsive();

  const activeView = useUIStore((s) => s.activeView);
  const openModal = useUIStore((s) => s.openModal);
  const isAudioRunning = useAudioStore((s) => s.contextState === 'running');

  const onShowTips = useCallback(() => {
    openModal('tips', { initialTab: 'tips' });
  }, [openModal]);
  const minimapVisible = useWorkbenchStore((s) => s.minimapVisible) && activeView === 'studio';
  const collabStatus = useCollaborationStore((s) => s.status);
  const collabRoomCode = useCollaborationStore((s) => s.roomCode);

  const {
    knobBank,
    setKnobBank,
    isInitialized,
    inputDevices,
    selectedInputId,
    showKnobBar,
    setShowKnobBar,
  } = useMIDIStore();

  const hasMIDIDevice = isInitialized && inputDevices.length > 0;
  const selectedDevice = hasMIDIDevice
    ? (inputDevices.find((d) => d.id === selectedInputId) || inputDevices[0])
    : null;
  const deviceName = selectedDevice?.name || 'MIDI Controller';

  const showMIDIPanel =
    activeView !== 'dj' &&
    activeView !== 'vj' &&
    hasMIDIDevice &&
    showKnobBar;

  const totalHeight = showMIDIPanel
    ? STATUS_BAR_HEIGHT + KNOB_PANEL_HEIGHT
    : STATUS_BAR_HEIGHT;

  const currentAssignments: KnobAssignment[] = hasMIDIDevice
    ? (KNOB_BANKS[knobBank] ?? [])
    : [];

  const onToggleKnobBar = useCallback(() => {
    setShowKnobBar(!showKnobBar);
  }, [setShowKnobBar, showKnobBar]);

  const collabConnected = collabStatus === 'connected';

  return (
    <pixiContainer layout={{ width, height: totalHeight, flexDirection: 'column' }}>

      {/* MIDI knob panel — always mounted, zero-height when hidden to avoid @pixi/layout BindingError */}
      <pixiContainer
        alpha={showMIDIPanel ? 1 : 0}
        renderable={showMIDIPanel}
        layout={{ width, height: showMIDIPanel ? KNOB_PANEL_HEIGHT : 0, overflow: 'hidden' }}
      >
        <KnobPanel
          width={width}
          height={KNOB_PANEL_HEIGHT}
          knobBank={knobBank}
          setKnobBank={setKnobBank}
          assignments={currentAssignments}
        />
      </pixiContainer>

      <MainStatusRow
        width={width}
        activeView={activeView}
        hasMIDIDevice={hasMIDIDevice}
        deviceName={deviceName}
        showKnobBar={showKnobBar}
        onToggleKnobBar={onToggleKnobBar}
        isAudioRunning={isAudioRunning}
        collabConnected={collabConnected}
        collabRoomCode={collabRoomCode}
        onShowTips={onShowTips}
        minimapVisible={minimapVisible}
      />
    </pixiContainer>
  );
};
