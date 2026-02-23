/**
 * PixiDJMixer — Center mixer panel: Filter | EQ | Channel strips | Crossfader | Master
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiKnob, PixiSlider, PixiLabel } from '../../components';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import type { CrossfaderCurve } from '@/engine/dj/DJMixerEngine';

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

      {/* Filter Section */}
      <MixerFilterSection />

      {/* EQ Section */}
      <MixerEQSection />

      {/* VU Meters */}
      <MixerVUMeters />

      {/* Channel strips */}
      <MixerChannelStrips />

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Crossfader */}
      <MixerCrossfader />

      {/* Master volume + Cue */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <MixerMaster />
        <MixerCueSection />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Filter Section ─────────────────────────────────────────────────────────

const MixerFilterSection: React.FC = () => {
  const theme = usePixiTheme();
  const filterA = useDJStore(s => s.decks.A.filterPosition);
  const filterB = useDJStore(s => s.decks.B.filterPosition);
  const setDeckFilter = useDJStore(s => s.setDeckFilter);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <PixiLabel text="FILTER" size="xs" color="textMuted" />

      <pixiContainer layout={{ flexDirection: 'row', gap: 16 }}>
        {/* Deck A Filter: -1 (HPF) to 0 (off) to +1 (LPF) */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="A" size="xs" color="textMuted" />
          <PixiKnob value={filterA} min={-1} max={1} defaultValue={0} size="sm" label="FLT" bipolar onChange={(v) => setDeckFilter('A', v)} />
        </pixiContainer>

        {/* Deck B Filter */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="B" size="xs" color="textMuted" />
          <PixiKnob value={filterB} min={-1} max={1} defaultValue={0} size="sm" label="FLT" bipolar onChange={(v) => setDeckFilter('B', v)} />
        </pixiContainer>
      </pixiContainer>

      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
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

// ─── VU Meters ──────────────────────────────────────────────────────────────

const VU_SEGMENTS = 20;
const VU_WIDTH = 12;
const VU_HEIGHT = 80;
const VU_SEG_HEIGHT = (VU_HEIGHT - 2) / VU_SEGMENTS;

const COLOR_GREEN = 0x22c55e;
const COLOR_YELLOW = 0xeab308;
const COLOR_RED = 0xef4444;

function segmentColor(index: number): number {
  if (index >= 17) return COLOR_RED;
  if (index >= 12) return COLOR_YELLOW;
  return COLOR_GREEN;
}

function dbToSegments(dB: number): number {
  if (dB <= -60) return 0;
  if (dB >= 0) return VU_SEGMENTS;
  return Math.round(((dB + 60) / 60) * VU_SEGMENTS);
}

const MixerVUMeters: React.FC = () => {
  const theme = usePixiTheme();
  const graphicsRef = useRef<GraphicsType | null>(null);
  const levelsRef = useRef({ a: 0, b: 0 });

  useEffect(() => {
    let rafId: number;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) { rafId = requestAnimationFrame(draw); return; }

      // Read levels from DJ engine
      try {
        const engine = getDJEngine();
        const dbA = engine.getDeck('A').getLevel() as number;
        const dbB = engine.getDeck('B').getLevel() as number;
        levelsRef.current.a = dbToSegments(dbA);
        levelsRef.current.b = dbToSegments(dbB);
      } catch {
        // Decay toward 0 when engine not ready
        levelsRef.current.a = Math.max(0, levelsRef.current.a - 1);
        levelsRef.current.b = Math.max(0, levelsRef.current.b - 1);
      }

      g.clear();
      const { a, b } = levelsRef.current;

      // Draw two VU meters side by side
      for (let deckIdx = 0; deckIdx < 2; deckIdx++) {
        const segs = deckIdx === 0 ? a : b;
        const xOff = deckIdx * (VU_WIDTH + 4);

        for (let i = 0; i < VU_SEGMENTS; i++) {
          const y = VU_HEIGHT - 1 - (i + 1) * VU_SEG_HEIGHT;
          const lit = i < segs;
          g.rect(xOff, y, VU_WIDTH, VU_SEG_HEIGHT - 1);
          g.fill({
            color: lit ? segmentColor(i) : (theme.bgTertiary?.color ?? 0x313244),
            alpha: lit ? 0.9 : 0.3,
          });
        }
      }

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      <PixiLabel text="LEVEL" size="xs" color="textMuted" />
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, width: VU_WIDTH * 2 + 4, height: VU_HEIGHT }}>
        <pixiGraphics
          ref={graphicsRef}
          draw={() => {}}
          layout={{ position: 'absolute', width: VU_WIDTH * 2 + 4, height: VU_HEIGHT }}
        />
      </pixiContainer>
      <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: VU_WIDTH * 2 + 4 }}>
        <PixiLabel text="A" size="xs" color="textMuted" />
        <PixiLabel text="B" size="xs" color="textMuted" />
      </pixiContainer>
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
  const crossfaderCurve = useDJStore(s => s.crossfaderCurve);

  const handleCurveChange = useCallback((curve: CrossfaderCurve) => {
    useDJStore.getState().setCrossfaderCurve(curve);
    try { getDJEngine().mixer.setCurve(curve); } catch { /* not ready */ }
  }, []);

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
      {/* Crossfader curve selector */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
        <PixiButton
          label="Lin"
          variant={crossfaderCurve === 'linear' ? 'ft2' : 'ghost'}
          color={crossfaderCurve === 'linear' ? 'blue' : undefined}
          size="sm"
          active={crossfaderCurve === 'linear'}
          onClick={() => handleCurveChange('linear')}
        />
        <PixiButton
          label="Cut"
          variant={crossfaderCurve === 'cut' ? 'ft2' : 'ghost'}
          color={crossfaderCurve === 'cut' ? 'red' : undefined}
          size="sm"
          active={crossfaderCurve === 'cut'}
          onClick={() => handleCurveChange('cut')}
        />
        <PixiButton
          label="Smo"
          variant={crossfaderCurve === 'smooth' ? 'ft2' : 'ghost'}
          color={crossfaderCurve === 'smooth' ? 'green' : undefined}
          size="sm"
          active={crossfaderCurve === 'smooth'}
          onClick={() => handleCurveChange('smooth')}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Master ─────────────────────────────────────────────────────────────────

const MixerMaster: React.FC = () => {
  const theme = usePixiTheme();
  const masterVolume = useDJStore(s => s.masterVolume);

  const handleVolumeChange = useCallback((value: number) => {
    useDJStore.getState().setMasterVolume(value);
    getDJEngine().mixer.setMasterVolume(value);
  }, []);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center', marginBottom: 4 }}>
      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
      <PixiKnob
        value={masterVolume}
        min={0}
        max={1.5}
        size="sm"
        label="MASTER"
        onChange={handleVolumeChange}
      />
    </pixiContainer>
  );
};

// ─── Cue Section ────────────────────────────────────────────────────────────

const MixerCueSection: React.FC = () => {
  const theme = usePixiTheme();
  const pflA = useDJStore(s => s.decks.A.pflEnabled);
  const pflB = useDJStore(s => s.decks.B.pflEnabled);
  const cueVolume = useDJStore(s => s.cueVolume);

  const handlePFLToggle = useCallback((deck: 'A' | 'B' | 'C') => {
    const current = deck === 'A'
      ? useDJStore.getState().decks.A.pflEnabled
      : useDJStore.getState().decks.B.pflEnabled;
    useDJStore.getState().setDeckPFL(deck, !current);
  }, []);

  const handleCueVolumeChange = useCallback((value: number) => {
    useDJStore.getState().setCueVolume(value);
  }, []);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 1, 40);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <pixiGraphics draw={drawBorder} layout={{ position: 'absolute', width: 1, height: 40, left: -6 }} />
      <PixiKnob
        value={cueVolume}
        min={0}
        max={1.5}
        size="sm"
        label="CUE"
        onChange={handleCueVolumeChange}
      />
      {/* PFL buttons */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
        <PixiButton
          label="1"
          variant={pflA ? 'ft2' : 'ghost'}
          color={pflA ? 'yellow' : undefined}
          size="sm"
          active={pflA}
          onClick={() => handlePFLToggle('A')}
        />
        <PixiButton
          label="2"
          variant={pflB ? 'ft2' : 'ghost'}
          color={pflB ? 'yellow' : undefined}
          size="sm"
          active={pflB}
          onClick={() => handlePFLToggle('B')}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
