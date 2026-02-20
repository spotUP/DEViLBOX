/**
 * PixiStatusBar — Bottom status bar (24px).
 * Shows tracker info in tracker/arrangement views, DJ info in DJ view.
 * Right side: audio state indicator.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { useUIStore, useTransportStore, useAudioStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useDJStore } from '@/stores/useDJStore';

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
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={theme.text.color}
      />
      <pixiBitmapText
        text={rowStr}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10 }}
        tint={theme.accent.color}
        layout={{ marginLeft: 4 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Channel */}
      <pixiBitmapText
        text={`Ch ${cursor.channelIndex + 1}`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={theme.text.color}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Column type */}
      <pixiBitmapText
        text={cursor.columnType}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={theme.text.color}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Octave */}
      <pixiBitmapText
        text="Oct"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={theme.text.color}
      />
      <pixiBitmapText
        text={String(currentOctave)}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10 }}
        tint={theme.accent.color}
        layout={{ marginLeft: 4 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Insert/Overwrite mode */}
      <pixiBitmapText
        text={insertMode ? 'INS' : 'OVR'}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10 }}
        tint={insertMode ? theme.warning.color : theme.accent.color}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Record/Edit mode */}
      <pixiBitmapText
        text={recordMode ? 'REC' : 'EDIT'}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10 }}
        tint={recordMode ? theme.error.color : theme.text.color}
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

  const sep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 4, 1, STATUS_HEIGHT - 8);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  const BLUE = 0x60a5fa;
  const RED = 0xf87171;

  return (
    <>
      {/* Deck 1 */}
      <pixiBitmapText
        text="D1"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10 }}
        tint={BLUE}
      />
      <pixiBitmapText
        text={deck1Playing ? 'PLAY' : 'STOP'}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={deck1Playing ? theme.success.color : theme.textMuted.color}
        layout={{ marginLeft: 4 }}
      />
      {deck1Name ? (
        <pixiBitmapText
          text={deck1Name.length > 15 ? deck1Name.substring(0, 15) + '..' : deck1Name}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
          tint={theme.textMuted.color}
          layout={{ marginLeft: 6 }}
        />
      ) : null}
      <pixiBitmapText
        text={`${deck1BPM.toFixed(1)} BPM`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={BLUE}
        layout={{ marginLeft: 6 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Crossfader */}
      <pixiBitmapText
        text="X-Fade"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={theme.text.color}
      />
      <pixiBitmapText
        text={`${(crossfader * 100).toFixed(0)}%`}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10 }}
        tint={theme.accent.color}
        layout={{ marginLeft: 4 }}
      />

      <pixiGraphics draw={sep} layout={{ width: 1, height: STATUS_HEIGHT, marginLeft: 8, marginRight: 8 }} />

      {/* Deck 2 */}
      <pixiBitmapText
        text="D2"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10 }}
        tint={RED}
      />
      <pixiBitmapText
        text={deck2Playing ? 'PLAY' : 'STOP'}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={deck2Playing ? theme.success.color : theme.textMuted.color}
        layout={{ marginLeft: 4 }}
      />
      {deck2Name ? (
        <pixiBitmapText
          text={deck2Name.length > 15 ? deck2Name.substring(0, 15) + '..' : deck2Name}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
          tint={theme.textMuted.color}
          layout={{ marginLeft: 6 }}
        />
      ) : null}
      <pixiBitmapText
        text={`${deck2BPM.toFixed(1)} BPM`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={RED}
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

      {/* Right: Audio state */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* Status dot */}
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
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
          tint={isAudioActive ? theme.success.color : theme.textMuted.color}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
