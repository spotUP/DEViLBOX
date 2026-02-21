/**
 * PixiStatusBar — Bottom status bar (24px).
 * Shows tracker info in tracker/arrangement views, DJ info in DJ view.
 * Right side: audio state indicator.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme, usePixiThemeId, getDeckColors } from '../theme';
import { useUIStore, useTransportStore, useAudioStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useDJStore } from '@/stores/useDJStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { useCollaborationStore } from '@/stores/useCollaborationStore';

const STATUS_HEIGHT = 24;

// ─── Tracker status content ─────────────────────────────────────────────────

const TrackerStatus: React.FC = () => {
  const theme = usePixiTheme();
  const cursor = useTrackerStore(s => s.cursor);
  const currentOctave = useTrackerStore(s => s.currentOctave);
  const insertMode = useTrackerStore(s => s.insertMode);
  const recordMode = useTrackerStore(s => s.recordMode);
  const patternLength = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.length || 64;
  });
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

  const displayRow = isPlaying ? currentRow : cursor.rowIndex;
  const rowStr = `${String(displayRow).padStart(2, '0')}/${String(patternLength - 1).padStart(2, '0')}`;

  const sep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 4, 1, STATUS_HEIGHT - 8);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  return (
    <>
      {/* Row */}
      <pixiBitmapText
        text="Row"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{}}
      />
      <pixiBitmapText
        text={rowStr}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{ marginLeft: 4 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Channel */}
      <pixiBitmapText
        text={`Ch ${cursor.channelIndex + 1}`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{}}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Column type */}
      <pixiBitmapText
        text={cursor.columnType}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{}}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Octave */}
      <pixiBitmapText
        text="Oct"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{}}
      />
      <pixiBitmapText
        text={String(currentOctave)}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{ marginLeft: 4 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Insert/Overwrite mode */}
      <pixiBitmapText
        text={insertMode ? 'INS' : 'OVR'}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={insertMode ? theme.warning.color : theme.accent.color}
        layout={{}}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Record/Edit mode */}
      <pixiBitmapText
        text={recordMode ? 'REC' : 'EDIT'}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={recordMode ? theme.error.color : theme.text.color}
        layout={{}}
      />
    </>
  );
};

// ─── DJ status content ──────────────────────────────────────────────────────

const DJStatus: React.FC = () => {
  const theme = usePixiTheme();
  const deck1Playing = useDJStore(s => s.decks.A.isPlaying);
  const deck2Playing = useDJStore(s => s.decks.B.isPlaying);
  const deck1BPM = useDJStore(s => s.decks.A.effectiveBPM);
  const deck2BPM = useDJStore(s => s.decks.B.effectiveBPM);
  const deck1Name = useDJStore(s => s.decks.A.trackName);
  const deck2Name = useDJStore(s => s.decks.B.trackName);
  const crossfader = useDJStore(s => s.crossfaderPosition);

  const themeId = usePixiThemeId();
  const { deckA, deckB } = getDeckColors(themeId, theme.accent, theme.accentSecondary);

  const sep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 4, 1, STATUS_HEIGHT - 8);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  return (
    <>
      {/* Deck 1 */}
      <pixiBitmapText
        text="D1"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={deckA}
        layout={{}}
      />
      <pixiBitmapText
        text={deck1Playing ? 'PLAY' : 'STOP'}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={deck1Playing ? theme.success.color : theme.textMuted.color}
        layout={{ marginLeft: 4 }}
      />
      {deck1Name ? (
        <pixiBitmapText
          text={deck1Name.length > 15 ? deck1Name.substring(0, 15) + '..' : deck1Name}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginLeft: 6 }}
        />
      ) : null}
      <pixiBitmapText
        text={`${deck1BPM.toFixed(1)} BPM`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={deckA}
        layout={{ marginLeft: 6 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Crossfader */}
      <pixiBitmapText
        text="X-Fade"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{}}
      />
      <pixiBitmapText
        text={`${(crossfader * 100).toFixed(0)}%`}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{ marginLeft: 4 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Deck 2 */}
      <pixiBitmapText
        text="D2"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={deckB}
        layout={{}}
      />
      <pixiBitmapText
        text={deck2Playing ? 'PLAY' : 'STOP'}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={deck2Playing ? theme.success.color : theme.textMuted.color}
        layout={{ marginLeft: 4 }}
      />
      {deck2Name ? (
        <pixiBitmapText
          text={deck2Name.length > 15 ? deck2Name.substring(0, 15) + '..' : deck2Name}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginLeft: 6 }}
        />
      ) : null}
      <pixiBitmapText
        text={`${deck2BPM.toFixed(1)} BPM`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={deckB}
        layout={{ marginLeft: 6 }}
      />
    </>
  );
};

// ─── Main StatusBar ─────────────────────────────────────────────────────────

export const PixiStatusBar: React.FC = () => {
  const theme = usePixiTheme();
  const activeView = useUIStore(s => s.activeView);
  const contextState = useAudioStore(s => s.contextState);
  const midiInitialized = useMIDIStore(s => s.isInitialized);
  const midiInputDevices = useMIDIStore(s => s.inputDevices);
  const midiSelectedInput = useMIDIStore(s => s.selectedInputId);
  const collabStatus = useCollaborationStore(s => s.status);
  const collabRoomCode = useCollaborationStore(s => s.roomCode);

  const handleTips = useCallback(() => {
    useUIStore.getState().openModal('tips');
  }, []);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    // Top border
    g.rect(0, 0, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
    // Background
    g.rect(0, 1, 4000, STATUS_HEIGHT - 1);
    g.fill({ color: theme.bgSecondary.color });
  }, [theme]);

  const isAudioActive = contextState === 'running';
  const hasMIDIDevice = midiInitialized && midiInputDevices.length > 0;
  const midiDeviceName = hasMIDIDevice
    ? midiInputDevices.find(d => d.id === midiSelectedInput)?.name || midiInputDevices[0].name
    : null;
  const isCollabConnected = collabStatus === 'connected' && collabRoomCode;

  const sep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 4, 1, STATUS_HEIGHT - 8);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: STATUS_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {/* Background */}
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width: '100%', height: STATUS_HEIGHT }}
      />

      {/* Left: View-specific content */}
      <pixiContainer layout={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        {activeView === 'dj' ? <DJStatus /> : <TrackerStatus />}
      </pixiContainer>

      {/* Right side indicators */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>

        {/* MIDI device indicator */}
        {hasMIDIDevice && (
          <>
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                g.circle(3, 3, 2.5);
                g.fill({ color: theme.success.color });
              }}
              layout={{ width: 6, height: 6 }}
            />
            <pixiBitmapText
              text={midiDeviceName ? (midiDeviceName.length > 12 ? midiDeviceName.substring(0, 12) + '..' : midiDeviceName) : 'MIDI'}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
              tint={theme.success.color}
              layout={{}}
            />
            <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 4, marginRight: 4 }} />
          </>
        )}

        {/* Tips button */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={handleTips}
          layout={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
        >
          <pixiBitmapText
            text="TIPS"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
            tint={theme.warning.color}
            layout={{}}
          />
        </pixiContainer>

        <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 4, marginRight: 4 }} />

        {/* Collab status */}
        {isCollabConnected && (
          <>
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                g.circle(3, 3, 2.5);
                g.fill({ color: theme.success.color });
              }}
              layout={{ width: 6, height: 6 }}
            />
            <pixiBitmapText
              text="Collab"
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
              tint={theme.success.color}
              layout={{}}
            />
            <pixiBitmapText
              text={collabRoomCode}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ marginLeft: 3 }}
            />
            <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 4, marginRight: 4 }} />
          </>
        )}

        {/* Audio state indicator */}
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.circle(4, 4, 3);
            g.fill({ color: isAudioActive ? theme.success.color : theme.textMuted.color });
          }}
          layout={{ width: 8, height: 8 }}
        />
        <pixiBitmapText
          text={isAudioActive ? 'Audio Active' : 'Audio Off'}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={isAudioActive ? theme.success.color : theme.textMuted.color}
          layout={{}}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
