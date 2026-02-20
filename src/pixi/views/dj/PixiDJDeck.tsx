/**
 * PixiDJDeck — Complete deck component: track info + turntable + waveform + transport.
 */

import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiLabel, PixiSlider } from '../../components';
import { useDJStore } from '@/stores/useDJStore';
import { PixiDeckTransport } from './PixiDeckTransport';
import { PixiDeckTurntable } from './PixiDeckTurntable';
import { PixiDeckWaveform } from './PixiDeckWaveform';

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

  const DECK_COLOR = deckId === 'A' ? 0x60a5fa : 0xf87171;

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
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13 }}
          tint={DECK_COLOR}
        />
        <pixiBitmapText
          text={isPlaying ? 'PLAYING' : 'STOPPED'}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
          tint={isPlaying ? theme.success.color : theme.textMuted.color}
        />
        <pixiContainer layout={{ flex: 1 }} />
        <pixiBitmapText
          text={`${bpm.toFixed(1)} BPM`}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11 }}
          tint={DECK_COLOR}
        />
      </pixiContainer>

      {/* Track name */}
      <pixiBitmapText
        text={trackName || 'No track loaded'}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11 }}
        tint={trackName ? theme.text.color : theme.textMuted.color}
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
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
            tint={theme.textMuted.color}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Waveform */}
      <PixiDeckWaveform deckId={deckId} width={280} height={60} />

      {/* Track overview bar */}
      <pixiContainer layout={{ height: 16, width: 280 }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.roundRect(0, 0, 280, 16, 2);
            g.fill({ color: theme.bg.color });
            g.roundRect(0, 0, 280, 16, 2);
            g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });
          }}
          layout={{ width: 280, height: 16 }}
        />
        <pixiBitmapText
          text="Track Overview"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 7 }}
          tint={theme.textMuted.color}
          layout={{ position: 'absolute', left: 4, top: 3 }}
        />
      </pixiContainer>

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Transport controls */}
      <PixiDeckTransport deckId={deckId} />
    </pixiContainer>
  );
};
