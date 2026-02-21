/**
 * PixiDJDeck — Complete deck component: track info + turntable + waveform + transport.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme, usePixiThemeId, getDeckColors } from '../../theme';
import { PixiButton, PixiLabel, PixiSlider } from '../../components';
import { PixiDOMOverlay } from '../../components/PixiDOMOverlay';
import { useDJStore } from '@/stores/useDJStore';
import { PixiDeckTransport } from './PixiDeckTransport';
import { PixiDeckTurntable } from './PixiDeckTurntable';
import { PixiDeckWaveform } from './PixiDeckWaveform';
import { getDJEngine } from '@engine/dj/DJEngine';
import { DeckScratch } from '@components/dj/DeckScratch';
import { DeckScopes } from '@components/dj/DeckScopes';
import { DeckCuePoints } from '@components/dj/DeckCuePoints';
import { DeckBeatGrid } from '@components/dj/DeckBeatGrid';

/** Format milliseconds as M:SS */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

interface PixiDJDeckProps {
  deckId: 'A' | 'B';
}

export const PixiDJDeck: React.FC<PixiDJDeckProps> = ({ deckId }) => {
  const theme = usePixiTheme();
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);
  const bpm = useDJStore(s => s.decks[deckId].effectiveBPM);
  const trackName = useDJStore(s => s.decks[deckId].trackName);
  const pitchOffset = useDJStore(s => s.decks[deckId].pitchOffset);
  const setDeckPitch = useDJStore(s => s.setDeckPitch);
  const loopActive = useDJStore(s => s.decks[deckId].loopActive);
  const loopMode = useDJStore(s => s.decks[deckId].loopMode);
  const audioPosition = useDJStore(s => s.decks[deckId].audioPosition);
  const durationMs = useDJStore(s => s.decks[deckId].durationMs);

  const cuePoint = useDJStore(s => s.decks[deckId].cuePoint);

  // Set cue point at current position
  const handleSetCue = useCallback(() => {
    const pos = useDJStore.getState().decks[deckId].audioPosition;
    useDJStore.getState().setDeckCuePoint(deckId, pos);
  }, [deckId]);

  // Jump to cue point
  const handleGoToCue = useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const cp = useDJStore.getState().decks[deckId].cuePoint;
      deck.cue(cp / 1000);
    } catch { /* engine not ready */ }
  }, [deckId]);

  // Nudge BPM
  const handleNudge = useCallback((direction: 1 | -1) => {
    try {
      const engine = getDJEngine();
      engine.getDeck(deckId).nudge(direction * 2, 8);
    } catch { /* engine not ready */ }
  }, [deckId]);

  const handleLoopLine = useCallback(() => {
    const s = useDJStore.getState();
    const active = s.decks[deckId].loopMode === 'line' && s.decks[deckId].loopActive;
    s.setDeckLoop(deckId, 'line', !active);
  }, [deckId]);

  const handleLoopPattern = useCallback(() => {
    const s = useDJStore.getState();
    const active = s.decks[deckId].loopMode === 'pattern' && s.decks[deckId].loopActive;
    s.setDeckLoop(deckId, 'pattern', !active);
  }, [deckId]);

  const handleLoopOff = useCallback(() => {
    useDJStore.getState().setDeckLoop(deckId, 'off', false);
  }, [deckId]);

  const themeId = usePixiThemeId();
  const { deckA, deckB } = getDeckColors(themeId, theme.accent, theme.accentSecondary);
  const DECK_COLOR = deckId === 'A' ? deckA : deckB;

  return (
    <pixiContainer
      layout={{
        flex: 1,
        height: '100%',
        flexDirection: 'column',
        padding: 8,
        gap: 6,
      }}
    >
      {/* Deck header + track info */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <pixiBitmapText
          text={`DECK ${deckId}`}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13, fill: 0xffffff }}
          tint={DECK_COLOR}
          layout={{}}
        />
        <pixiBitmapText
          text={isPlaying ? 'PLAYING' : 'STOPPED'}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={isPlaying ? theme.success.color : theme.textMuted.color}
          layout={{}}
        />
        <pixiContainer layout={{ flex: 1 }} />
        <pixiBitmapText
          text={`${bpm.toFixed(1)} BPM`}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={DECK_COLOR}
          layout={{}}
        />
      </pixiContainer>

      {/* Track name */}
      <pixiBitmapText
        text={trackName || 'No track loaded'}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={trackName ? theme.text.color : theme.textMuted.color}
        layout={{}}
      />

      {/* Turntable + Pitch slider row */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <PixiDeckTurntable deckId={deckId} size={90} />

        {/* Pitch slider */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <PixiLabel text="PITCH" size="xs" color="textMuted" />
          <PixiSlider
            value={pitchOffset ?? 0}
            min={-0.08}
            max={0.08}
            orientation="vertical"
            length={80}
            detent={0}
            onChange={(v) => setDeckPitch?.(deckId, v)}
          />
          <pixiBitmapText
            text={`${((pitchOffset ?? 0) * 100).toFixed(1)}%`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Waveform */}
      <PixiDeckWaveform deckId={deckId} width={280} height={60} />

      {/* Track overview / progress bar */}
      <pixiContainer layout={{ height: 16, width: 280 }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            const barW = 280;
            const barH = 16;
            // Background
            g.roundRect(0, 0, barW, barH, 2);
            g.fill({ color: theme.bg.color });
            // Progress fill
            const progress = durationMs > 0 ? Math.min(1, audioPosition / durationMs) : 0;
            if (progress > 0) {
              const fillW = Math.max(2, progress * (barW - 2));
              g.roundRect(1, 1, fillW, barH - 2, 2);
              g.fill({ color: DECK_COLOR, alpha: 0.3 });
            }
            // Playhead
            if (progress > 0) {
              const px = Math.floor(progress * (barW - 2)) + 1;
              g.rect(px, 0, 1, barH);
              g.fill({ color: DECK_COLOR, alpha: 0.9 });
            }
            // Border
            g.roundRect(0, 0, barW, barH, 2);
            g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });
          }}
          layout={{ width: 280, height: 16 }}
        />
        {/* Time display */}
        <pixiBitmapText
          text={durationMs > 0
            ? `${formatTime(audioPosition)} / ${formatTime(durationMs)}`
            : 'No track loaded'
          }
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 7, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ position: 'absolute', left: 4, top: 3 }}
        />
      </pixiContainer>

      {/* Loop controls */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="LOOP" size="xs" color="textMuted" />
        <PixiButton
          label="Line"
          variant={loopActive && loopMode === 'line' ? 'ft2' : 'ghost'}
          color={loopActive && loopMode === 'line' ? 'green' : undefined}
          size="sm"
          active={loopActive && loopMode === 'line'}
          onClick={handleLoopLine}
        />
        <PixiButton
          label="Pattern"
          variant={loopActive && loopMode === 'pattern' ? 'ft2' : 'ghost'}
          color={loopActive && loopMode === 'pattern' ? 'blue' : undefined}
          size="sm"
          active={loopActive && loopMode === 'pattern'}
          onClick={handleLoopPattern}
        />
        {loopActive && (
          <PixiButton label="Off" variant="ghost" size="sm" onClick={handleLoopOff} />
        )}
      </pixiContainer>

      {/* Cue point */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="CUE" size="xs" color="textMuted" />
        <PixiButton label="SET" variant="ghost" size="sm" onClick={handleSetCue} />
        <PixiButton
          label="GO"
          variant={cuePoint > 0 ? 'ft2' : 'ghost'}
          color={cuePoint > 0 ? 'yellow' : undefined}
          size="sm"
          onClick={handleGoToCue}
        />
        {cuePoint > 0 && (
          <pixiBitmapText
            text={formatTime(cuePoint)}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        )}
      </pixiContainer>

      {/* Nudge controls */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="NUDGE" size="xs" color="textMuted" />
        <PixiButton label="<< -" variant="ghost" size="sm" onClick={() => handleNudge(-1)} />
        <PixiButton label="+ >>" variant="ghost" size="sm" onClick={() => handleNudge(1)} />
      </pixiContainer>

      {/* Scratch presets + Fader LFO */}
      <PixiDOMOverlay
        layout={{ width: 280, height: 56 }}
        style={{ overflow: 'hidden' }}
      >
        <DeckScratch deckId={deckId} />
      </PixiDOMOverlay>

      {/* Cue points */}
      <PixiDOMOverlay
        layout={{ width: 280, height: 36 }}
        style={{ overflow: 'hidden' }}
      >
        <DeckCuePoints deckId={deckId} />
      </PixiDOMOverlay>

      {/* Beat grid controls */}
      <PixiDOMOverlay
        layout={{ width: 280, height: 32 }}
        style={{ overflow: 'hidden' }}
      >
        <DeckBeatGrid deckId={deckId} />
      </PixiDOMOverlay>

      {/* Oscilloscope / spectrum scopes */}
      <PixiDOMOverlay
        layout={{ width: 280, height: 64 }}
        style={{ overflow: 'hidden' }}
      >
        <DeckScopes deckId={deckId} size={60} />
      </PixiDOMOverlay>

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Transport controls */}
      <PixiDeckTransport deckId={deckId} />
    </pixiContainer>
  );
};
