/**
 * PixiStatusBar — Bottom status bar for WebGL mode.
 * Pure Pixi implementation — no PixiDOMOverlay.
 * Mirrors src/components/layout/StatusBar.tsx in the Pixi rendering layer.
 *
 * Layout:
 *   - Main status row (STATUS_BAR_HEIGHT): left info + right MIDI/audio/collab
 *   - MIDI knob panel (KNOB_PANEL_HEIGHT): bank tabs + 8-knob grid (conditional)
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useShallow } from 'zustand/react/shallow';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useUIStore, useAudioStore, useTrackerStore, useTransportStore } from '@stores';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { useDJStore } from '@/stores/useDJStore';
import { useCollaborationStore } from '@/stores/useCollaborationStore';
import { KNOB_BANKS, type KnobAssignment } from '@/midi/knobBanks';
import type { KnobBankMode } from '@/midi/types';

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

// ─── DJ Status Content ────────────────────────────────────────────────────────

const DJStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();
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
      <pixiBitmapText text="D1" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={0x60a5fa} layout={{ alignSelf: 'center', marginRight: 4 }} />
      <pixiBitmapText text={d1Label} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={d1Color} layout={textLayout} />
      {deck1Name ? (
        <>
          <PixiSep height={10} />
          <pixiBitmapText
            text={deck1Name.length > 14 ? deck1Name.slice(0, 12) + '\u2026' : deck1Name}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={textLayout}
          />
        </>
      ) : null}
      <PixiSep height={10} />
      <pixiBitmapText text={d1BpmStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={0x60a5fa} layout={textLayout} />
      <pixiBitmapText text=" BPM" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />

      <PixiSep height={10} />
      <pixiBitmapText text={xFadeStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />

      <PixiSep height={10} />
      <pixiBitmapText text="D2" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={0xf87171} layout={{ alignSelf: 'center', marginRight: 4 }} />
      <pixiBitmapText text={d2Label} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={d2Color} layout={textLayout} />
      {deck2Name ? (
        <>
          <PixiSep height={10} />
          <pixiBitmapText
            text={deck2Name.length > 14 ? deck2Name.slice(0, 12) + '\u2026' : deck2Name}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={textLayout}
          />
        </>
      ) : null}
      <PixiSep height={10} />
      <pixiBitmapText text={d2BpmStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={0xf87171} layout={textLayout} />
      <pixiBitmapText text=" BPM" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
    </pixiContainer>
  );
};

// ─── Tracker Status Content ───────────────────────────────────────────────────

const TrackerStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();

  const { cursor, currentOctave, insertMode, recordMode, patternLength } = useTrackerStore(
    useShallow((s) => ({
      cursor: s.cursor,
      currentOctave: s.currentOctave,
      insertMode: s.insertMode,
      recordMode: s.recordMode,
      patternLength: s.patterns[s.currentPatternIndex]?.length || 64,
    }))
  );
  const { isPlaying, currentRow } = useTransportStore(
    useShallow((s) => ({ isPlaying: s.isPlaying, currentRow: s.currentRow }))
  );

  const displayRow = isPlaying ? currentRow : cursor.rowIndex;
  const rowStr = String(displayRow).padStart(2, '0') + '/' + String(patternLength - 1).padStart(2, '0');
  const channelStr = `Ch ${cursor.channelIndex + 1}`;
  const columnStr = cursor.columnType.charAt(0).toUpperCase() + cursor.columnType.slice(1);
  const octStr = String(currentOctave);
  const modeStr = insertMode ? 'INS' : 'OVR';
  const modeColor = insertMode ? theme.warning.color : theme.accent.color;
  const recStr = recordMode ? 'REC' : 'EDIT';
  const recColor = recordMode ? theme.error.color : theme.text.color;

  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: barHeight }}>
      <pixiBitmapText text="Row " style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <pixiBitmapText text={rowStr} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={theme.accent.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={channelStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={columnStr} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text="Oct " style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <pixiBitmapText text={octStr} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={theme.accent.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text="Mode: " style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.text.color} layout={textLayout} />
      <pixiBitmapText text={modeStr} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={modeColor} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText text={recStr} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={recColor} layout={textLayout} />
    </pixiContainer>
  );
};

// ─── VJ Status Content ────────────────────────────────────────────────────────

const VJStatusContent: React.FC<{ barHeight: number }> = ({ barHeight }) => {
  const theme = usePixiTheme();
  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);
  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', flex: 1, height: barHeight }}>
      <pixiBitmapText text="VJ" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={theme.accent.color} layout={textLayout} />
      <PixiSep height={10} />
      <pixiBitmapText
        text="Esc: back  Cmd+Shift+V: toggle  Milkdrop | ISF | 3D"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={textLayout}
      />
    </pixiContainer>
  );
};

// ─── Right side: MIDI + Audio + Collab ────────────────────────────────────────

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
}) => {
  const theme = usePixiTheme();
  const showMIDI = hasMIDIDevice && activeView !== 'dj' && activeView !== 'vj';

  const textLayout = useMemo(() => ({ alignSelf: 'center' as const }), []);
  const audioDotColor = isAudioRunning ? theme.success.color : theme.textMuted.color;
  const audioLabel = isAudioRunning ? 'Audio Active' : 'Audio Off';
  const audioLabelColor = isAudioRunning ? theme.success.color : theme.textMuted.color;
  const chevron = showKnobBar ? '\u25BE' : '\u25B4'; // ▾ / ▴

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', height: barHeight, paddingRight: 12 }}>
      {/* Collab badge */}
      {collabConnected && collabRoomCode ? (
        <>
          <PixiDot color={theme.success.color} />
          <pixiBitmapText text="Collab" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={theme.success.color} layout={textLayout} />
          <pixiBitmapText text={` ${collabRoomCode}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.textMuted.color} layout={textLayout} />
          <PixiSep height={10} />
        </>
      ) : null}

      {/* MIDI device toggle button */}
      {showMIDI ? (
        <>
          <pixiContainer
            eventMode="static"
            cursor="pointer"
            onPointerUp={onToggleKnobBar}
            layout={{ flexDirection: 'row', alignItems: 'center', height: barHeight }}
          >
            <PixiDot color={theme.success.color} />
            <pixiBitmapText
              text={deviceName.toUpperCase()}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={textLayout}
            />
            <pixiBitmapText
              text={` ${chevron}`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={textLayout}
            />
          </pixiContainer>
          <PixiSep height={10} />
        </>
      ) : null}

      {/* Audio state indicator */}
      <PixiDot color={audioDotColor} />
      <pixiBitmapText
        text={audioLabel}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={audioLabelColor}
        layout={textLayout}
      />
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

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color });
  }, [width, height, theme]);

  // Bank tab row height
  const TAB_H = 24;
  const KNOB_H = height - TAB_H - 8; // 8px = top+bottom padding

  // Knob cell sizing: 8 knobs across
  const hPad = 16;
  const gap = 4;
  const numKnobs = 8;
  const cellW = Math.floor((width - hPad * 2 - gap * (numKnobs - 1)) / numKnobs);

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

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
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
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
    </pixiContainer>
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
      onPointerUp={onPress}
      layout={{ width: W, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: W, height }} />
      <pixiBitmapText
        text={label.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
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
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ marginBottom: 2 }}
      />
      <pixiBitmapText
        text={nameLabel}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
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
}) => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, STATUS_BAR_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color });
  }, [width, theme]);

  return (
    <pixiContainer layout={{
      width,
      height: STATUS_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 12,
    }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height: STATUS_BAR_HEIGHT }} />

      {/* Left content — view specific */}
      {activeView === 'dj'
        ? <DJStatusContent barHeight={STATUS_BAR_HEIGHT} />
        : activeView === 'vj'
          ? <VJStatusContent barHeight={STATUS_BAR_HEIGHT} />
          : <TrackerStatusContent barHeight={STATUS_BAR_HEIGHT} />
      }

      {/* Right content */}
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
      />
    </pixiContainer>
  );
};

// ─── PixiStatusBar (root) ─────────────────────────────────────────────────────

export const PixiStatusBar: React.FC = () => {
  const { width } = usePixiResponsive();

  const activeView = useUIStore((s) => s.activeView);
  const isAudioRunning = useAudioStore((s) => s.contextState === 'running');
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

  const drawRoot = useCallback((g: GraphicsType) => {
    g.clear();
  }, []);

  return (
    <pixiContainer layout={{ width, height: totalHeight, flexDirection: 'column' }}>
      <pixiGraphics draw={drawRoot} layout={{ position: 'absolute', width, height: totalHeight }} />

      {/* MIDI knob panel sits ABOVE the main status row to mirror DOM order */}
      {showMIDIPanel && (
        <KnobPanel
          width={width}
          height={KNOB_PANEL_HEIGHT}
          knobBank={knobBank}
          setKnobBank={setKnobBank}
          assignments={currentAssignments}
        />
      )}

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
      />
    </pixiContainer>
  );
};
