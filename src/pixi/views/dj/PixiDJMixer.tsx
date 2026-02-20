/**
 * PixiDJMixer — Center mixer panel: Filter | EQ | Channel strips | Crossfader | Master
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiKnob, PixiSlider, PixiLabel } from '../../components';
import { useDJStore } from '@/stores/useDJStore';

const MIXER_WIDTH = 220;

export const PixiDJMixer: React.FC = () => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    // Left border
    g.rect(0, 0, 1, 9999);
    g.fill({ color: theme.border.color, alpha: 0.3 });
    // Right border
    g.rect(MIXER_WIDTH - 1, 0, 1, 9999);
    g.fill({ color: theme.border.color, alpha: 0.3 });
    // Background
    g.rect(1, 0, MIXER_WIDTH - 2, 9999);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.5 });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: MIXER_WIDTH,
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 8,
        gap: 8,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: MIXER_WIDTH, height: '100%' }} />

      <PixiLabel text="MIXER" size="md" weight="bold" color="accent" />

      {/* EQ Section */}
      <MixerEQSection />

      {/* Channel strips */}
      <MixerChannelStrips />

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Crossfader */}
      <MixerCrossfader />

      {/* Master volume */}
      <MixerMaster />
    </pixiContainer>
  );
};

// ─── EQ Section ─────────────────────────────────────────────────────────────

const MixerEQSection: React.FC = () => {
  const theme = usePixiTheme();
  const eqHighA = useDJStore(s => s.decks.A.eqHigh);
  const eqMidA = useDJStore(s => s.decks.A.eqMid);
  const eqLowA = useDJStore(s => s.decks.A.eqLow);
  const eqHighB = useDJStore(s => s.decks.B.eqHigh);
  const eqMidB = useDJStore(s => s.decks.B.eqMid);
  const eqLowB = useDJStore(s => s.decks.B.eqLow);
  const setDeckEQ = useDJStore(s => s.setDeckEQ);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <PixiLabel text="EQ" size="xs" color="textMuted" />

      <pixiContainer layout={{ flexDirection: 'row', gap: 16 }}>
        {/* Deck A EQ — dB range: -24 to +6 */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="A" size="xs" color="textMuted" />
          <PixiKnob value={eqHighA} min={-24} max={6} defaultValue={0} size="sm" label="HI" bipolar onChange={(v) => setDeckEQ('A', 'high', v)} />
          <PixiKnob value={eqMidA} min={-24} max={6} defaultValue={0} size="sm" label="MID" bipolar onChange={(v) => setDeckEQ('A', 'mid', v)} />
          <PixiKnob value={eqLowA} min={-24} max={6} defaultValue={0} size="sm" label="LO" bipolar onChange={(v) => setDeckEQ('A', 'low', v)} />
        </pixiContainer>

        {/* Deck B EQ */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="B" size="xs" color="textMuted" />
          <PixiKnob value={eqHighB} min={-24} max={6} defaultValue={0} size="sm" label="HI" bipolar onChange={(v) => setDeckEQ('B', 'high', v)} />
          <PixiKnob value={eqMidB} min={-24} max={6} defaultValue={0} size="sm" label="MID" bipolar onChange={(v) => setDeckEQ('B', 'mid', v)} />
          <PixiKnob value={eqLowB} min={-24} max={6} defaultValue={0} size="sm" label="LO" bipolar onChange={(v) => setDeckEQ('B', 'low', v)} />
        </pixiContainer>
      </pixiContainer>

      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
    </pixiContainer>
  );
};

// ─── Channel Strips ─────────────────────────────────────────────────────────

const MixerChannelStrips: React.FC = () => {
  const volumeA = useDJStore(s => s.decks.A.volume);
  const volumeB = useDJStore(s => s.decks.B.volume);
  const setDeckVolume = useDJStore(s => s.setDeckVolume);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
      {/* Channel A fader */}
      <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="CH A" size="xs" color="textMuted" />
        <PixiSlider
          value={volumeA ?? 0.8}
          min={0}
          max={1}
          orientation="vertical"
          length={100}
          onChange={(v) => setDeckVolume?.('A', v)}
        />
      </pixiContainer>

      {/* Channel B fader */}
      <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="CH B" size="xs" color="textMuted" />
        <PixiSlider
          value={volumeB ?? 0.8}
          min={0}
          max={1}
          orientation="vertical"
          length={100}
          onChange={(v) => setDeckVolume?.('B', v)}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Crossfader ─────────────────────────────────────────────────────────────

const MixerCrossfader: React.FC = () => {
  const theme = usePixiTheme();
  const crossfader = useDJStore(s => s.crossfaderPosition);
  const setCrossfader = useDJStore(s => s.setCrossfader);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
      <PixiLabel text="CROSSFADER" size="xs" color="textMuted" />
      <PixiSlider
        value={crossfader}
        min={0}
        max={1}
        orientation="horizontal"
        length={MIXER_WIDTH - 40}
        detent={0.5}
        onChange={(v) => setCrossfader?.(v)}
      />
      <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: MIXER_WIDTH - 40 }}>
        <PixiLabel text="A" size="xs" color="textMuted" />
        <PixiLabel text="B" size="xs" color="textMuted" />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Master ─────────────────────────────────────────────────────────────────

const MixerMaster: React.FC = () => {
  const theme = usePixiTheme();

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center', marginBottom: 4 }}>
      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
      <PixiKnob
        value={0.8}
        min={0}
        max={1}
        size="sm"
        label="MASTER"
        onChange={() => {}} // Placeholder — wire to master volume
      />
    </pixiContainer>
  );
};
