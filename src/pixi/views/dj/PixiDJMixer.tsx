/**
 * PixiDJMixer — Center mixer panel matching DOM DJMixer layout:
 *   1. Filters (with bottom border)
 *   2. EQ + VU meters (with bottom border)
 *   3. Channel strips (with bottom border)
 *   4. Crossfader (with bottom border)
 *   5. Transition controls (with bottom border)
 *   6. Master + Cue
 *   7. Broadcast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiKnob, PixiSlider, PixiLabel } from '../../components';
import { useDJStore } from '@/stores/useDJStore';
import { useDJSetStore } from '@/stores/useDJSetStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import type { CrossfaderCurve } from '@/engine/dj/DJMixerEngine';
import { DJVideoCapture, getCaptureCanvas } from '@/engine/dj/streaming/DJVideoCapture';
import { DJVideoRecorder } from '@/engine/dj/streaming/DJVideoRecorder';
import {
  beatMatchedTransition,
  cancelAllAutomation,
} from '@/engine/dj/DJQuantizedFX';
import { onNextDownbeat } from '@/engine/dj/DJAutoSync';
import type { DeckId } from '@/engine/dj/DeckEngine';
import * as DJActions from '@/engine/dj/DJActions';

const MIXER_WIDTH = 400;

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
        flexShrink: 0,
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 8,
        gap: 8,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: MIXER_WIDTH, height: '100%' }} />

      {/* Row 1: Filters (matches DOM) */}
      <MixerFilterSection />

      {/* Row 2: EQ + VU meters (matches DOM) */}
      <MixerEQSection />

      {/* Row 3: Channel strips (matches DOM) */}
      <MixerChannelStrips />

      {/* Row 4: Crossfader (matches DOM) */}
      <MixerCrossfader />

      {/* Row 5: Transition controls (matches DOM) */}
      <MixerTransitionSection />

      {/* Row 6: Master + Cue (matches DOM) */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <MixerMaster />
        <MixerCueSection />
      </pixiContainer>

      {/* Row 7: Broadcast (matches DOM) */}
      <MixerRecordMic />
    </pixiContainer>
  );
};

// ─── Filter Section ─────────────────────────────────────────────────────────

const MixerFilterSection: React.FC = () => {
  const theme = usePixiTheme();
  const filterA = useDJStore(s => s.decks.A.filterPosition);
  const filterB = useDJStore(s => s.decks.B.filterPosition);
  const filterC = useDJStore(s => s.decks.C.filterPosition);
  const thirdDeck = useDJStore(s => s.thirdDeckActive);

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
          <PixiKnob value={filterA} min={-1} max={1} defaultValue={0} size="sm" label="FLT" color={0xaa44ff} bipolar onChange={(v) => DJActions.setDeckFilter('A', v)} />
        </pixiContainer>

        {/* Deck B Filter */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="B" size="xs" color="textMuted" />
          <PixiKnob value={filterB} min={-1} max={1} defaultValue={0} size="sm" label="FLT" color={0xaa44ff} bipolar onChange={(v) => DJActions.setDeckFilter('B', v)} />
        </pixiContainer>

        {/* Deck C Filter */}
        {thirdDeck && (
          <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <PixiLabel text="C" size="xs" color="textMuted" />
            <PixiKnob value={filterC} min={-1} max={1} defaultValue={0} size="sm" label="FLT" color={0xaa44ff} bipolar onChange={(v) => DJActions.setDeckFilter('C', v)} />
          </pixiContainer>
        )}
      </pixiContainer>

      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
    </pixiContainer>
  );
};

// ─── EQ Section ─────────────────────────────────────────────────────────────

/** EQ knob + kill button row for one band */
const EQBandRow: React.FC<{
  deckId: 'A' | 'B' | 'C';
  band: 'high' | 'mid' | 'low';
  label: string;
  value: number;
  isKilled: boolean;
}> = ({ deckId, band, label, value, isKilled }) => {
  const handleKillToggle = useCallback(() => {
    const killKey = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill` as 'eqLowKill' | 'eqMidKill' | 'eqHighKill';
    const current = useDJStore.getState().decks[deckId][killKey];
    DJActions.setDeckEQKill(deckId, band, !current);
  }, [deckId, band]);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
      <PixiKnob value={value} min={-24} max={6} defaultValue={0} size="sm" label={label} bipolar onChange={(v) => DJActions.setDeckEQ(deckId, band, v)} />
      <PixiButton
        label="K"
        variant={isKilled ? 'ft2' : 'ghost'}
        color={isKilled ? 'red' : undefined}
        size="sm"
        active={isKilled}
        width={20}
        height={20}
        onClick={handleKillToggle}
      />
    </pixiContainer>
  );
};

const MixerEQSection: React.FC = () => {
  const theme = usePixiTheme();
  const eqHighA = useDJStore(s => s.decks.A.eqHigh);
  const eqMidA = useDJStore(s => s.decks.A.eqMid);
  const eqLowA = useDJStore(s => s.decks.A.eqLow);
  const eqHighB = useDJStore(s => s.decks.B.eqHigh);
  const eqMidB = useDJStore(s => s.decks.B.eqMid);
  const eqLowB = useDJStore(s => s.decks.B.eqLow);
  const eqHighC = useDJStore(s => s.decks.C.eqHigh);
  const eqMidC = useDJStore(s => s.decks.C.eqMid);
  const eqLowC = useDJStore(s => s.decks.C.eqLow);
  const killHighA = useDJStore(s => s.decks.A.eqHighKill);
  const killMidA = useDJStore(s => s.decks.A.eqMidKill);
  const killLowA = useDJStore(s => s.decks.A.eqLowKill);
  const killHighB = useDJStore(s => s.decks.B.eqHighKill);
  const killMidB = useDJStore(s => s.decks.B.eqMidKill);
  const killLowB = useDJStore(s => s.decks.B.eqLowKill);
  const killHighC = useDJStore(s => s.decks.C.eqHighKill);
  const killMidC = useDJStore(s => s.decks.C.eqMidKill);
  const killLowC = useDJStore(s => s.decks.C.eqLowKill);
  const thirdDeck = useDJStore(s => s.thirdDeckActive);

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
          <EQBandRow deckId="A" band="high" label="HI" value={eqHighA} isKilled={killHighA} />
          <EQBandRow deckId="A" band="mid" label="MID" value={eqMidA} isKilled={killMidA} />
          <EQBandRow deckId="A" band="low" label="LO" value={eqLowA} isKilled={killLowA} />
        </pixiContainer>

        {/* VU Meters in center (matching DOM layout: EQ | VU | EQ) */}
        <MixerVUMeters />

        {/* Deck B EQ */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="B" size="xs" color="textMuted" />
          <EQBandRow deckId="B" band="high" label="HI" value={eqHighB} isKilled={killHighB} />
          <EQBandRow deckId="B" band="mid" label="MID" value={eqMidB} isKilled={killMidB} />
          <EQBandRow deckId="B" band="low" label="LO" value={eqLowB} isKilled={killLowB} />
        </pixiContainer>

        {/* Deck C EQ */}
        {thirdDeck && (
          <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <PixiLabel text="C" size="xs" color="textMuted" />
            <EQBandRow deckId="C" band="high" label="HI" value={eqHighC} isKilled={killHighC} />
            <EQBandRow deckId="C" band="mid" label="MID" value={eqMidC} isKilled={killMidC} />
            <EQBandRow deckId="C" band="low" label="LO" value={eqLowC} isKilled={killLowC} />
          </pixiContainer>
        )}
      </pixiContainer>

      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
    </pixiContainer>
  );
};

// ─── VU Meters ──────────────────────────────────────────────────────────────

const VU_SEGMENTS = 20;
const VU_WIDTH = 12;
const VU_HEIGHT = 102;
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
  const thirdDeck = useDJStore(s => s.thirdDeckActive);
  const levelsRef = useRef({ a: 0, b: 0, c: 0 });
  const thirdDeckRef = useRef(thirdDeck);
  thirdDeckRef.current = thirdDeck;

  useEffect(() => {
    let rafId: number;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) { rafId = requestAnimationFrame(draw); return; }

      // Read levels from DJ engine
      try {
        const engine = getDJEngine();
        levelsRef.current.a = dbToSegments(engine.getDeck('A').getLevel() as number);
        levelsRef.current.b = dbToSegments(engine.getDeck('B').getLevel() as number);
        if (thirdDeckRef.current) {
          levelsRef.current.c = dbToSegments(engine.getDeck('C').getLevel() as number);
        }
      } catch {
        levelsRef.current.a = Math.max(0, levelsRef.current.a - 1);
        levelsRef.current.b = Math.max(0, levelsRef.current.b - 1);
        levelsRef.current.c = Math.max(0, levelsRef.current.c - 1);
      }

      g.clear();
      const { a, b, c } = levelsRef.current;
      const meterCount = thirdDeckRef.current ? 3 : 2;

      for (let deckIdx = 0; deckIdx < meterCount; deckIdx++) {
        const segs = deckIdx === 0 ? a : deckIdx === 1 ? b : c;
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

  const meterCount = thirdDeck ? 3 : 2;
  const totalW = VU_WIDTH * meterCount + 4 * (meterCount - 1);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, width: totalW, height: VU_HEIGHT }}>
        <pixiGraphics
          ref={graphicsRef}
          draw={() => {}}
          layout={{ position: 'absolute', width: totalW, height: VU_HEIGHT }}
        />
      </pixiContainer>
      <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: totalW }}>
        <PixiLabel text="A" size="xs" color="textMuted" />
        <PixiLabel text="B" size="xs" color="textMuted" />
        {thirdDeck && <PixiLabel text="C" size="xs" color="textMuted" />}
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Channel Strips ─────────────────────────────────────────────────────────

const MixerChannelStrips: React.FC = () => {
  const theme = usePixiTheme();
  const volumeA = useDJStore(s => s.decks.A.volume);
  const volumeB = useDJStore(s => s.decks.B.volume);
  const volumeC = useDJStore(s => s.decks.C.volume);
  const thirdDeck = useDJStore(s => s.thirdDeckActive);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <pixiContainer layout={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
        {/* Channel A fader */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="1" size="xs" color="textMuted" />
          <PixiSlider
            value={volumeA ?? 0.8}
            min={0}
            max={1}
            orientation="vertical"
            length={100}
            onChange={(v) => DJActions.setDeckVolume('A', v)}
          />
        </pixiContainer>

        {/* Channel B fader */}
        <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <PixiLabel text="2" size="xs" color="textMuted" />
          <PixiSlider
            value={volumeB ?? 0.8}
            min={0}
            max={1}
            orientation="vertical"
            length={100}
            onChange={(v) => DJActions.setDeckVolume('B', v)}
          />
        </pixiContainer>

        {/* Channel C fader */}
        {thirdDeck && (
          <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <PixiLabel text="3" size="xs" color="textMuted" />
            <PixiSlider
              value={volumeC ?? 0.8}
              min={0}
              max={1}
              orientation="vertical"
              length={100}
              onChange={(v) => DJActions.setDeckVolume('C', v)}
            />
          </pixiContainer>
        )}
      </pixiContainer>

      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
    </pixiContainer>
  );
};

// ─── Crossfader ─────────────────────────────────────────────────────────────

const MixerCrossfader: React.FC = () => {
  const theme = usePixiTheme();
  const crossfader = useDJStore(s => s.crossfaderPosition);
  const crossfaderCurve = useDJStore(s => s.crossfaderCurve);

  const handleCurveChange = useCallback((curve: CrossfaderCurve) => {
    DJActions.setCrossfaderCurve(curve);
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
        onChange={(v) => DJActions.setCrossfader(v)}
      />
      <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: MIXER_WIDTH - 40 }}>
        <PixiLabel text="1" size="xs" color="textMuted" />
        <PixiLabel text="2" size="xs" color="textMuted" />
      </pixiContainer>
      {/* Crossfader curve selector */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
        <PixiButton
          label="Linear"
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
          label="Smooth"
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

// ─── Transition ──────────────────────────────────────────────────────────────

const MixerTransitionSection: React.FC = () => {
  const theme = usePixiTheme();
  const [automating, setAutomating] = useState(false);
  const [direction, setDirection] = useState<'A>B' | 'B>A' | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  const cancelCurrent = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    cancelAllAutomation();
    setAutomating(false);
    setDirection(null);
  }, []);

  const handleTransition = useCallback((from: DeckId, to: DeckId) => {
    cancelCurrent();
    setAutomating(true);
    setDirection(from === 'A' ? 'A>B' : 'B>A');
    cancelRef.current = beatMatchedTransition(from, to, 8, true);
    const timeout = setTimeout(() => {
      setAutomating(false);
      setDirection(null);
      cancelRef.current = null;
    }, 30000);
    const originalCancel = cancelRef.current;
    cancelRef.current = () => {
      clearTimeout(timeout);
      originalCancel();
    };
  }, [cancelCurrent]);

  const handleQuickCut = useCallback((to: DeckId) => {
    cancelCurrent();
    const target = to === 'A' ? 0 : 1;
    const refDeck: DeckId = to === 'A' ? 'B' : 'A'; // reference the outgoing deck
    onNextDownbeat(refDeck, () => DJActions.setCrossfader(target));
  }, [cancelCurrent]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
      {/* Button order matches DOM: A->B, quickA, cancel/spacer, quickB, B->A */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiButton
          label={automating && direction === 'A>B' ? 'A>>B' : 'A>B'}
          variant={automating && direction === 'A>B' ? 'ft2' : 'ghost'}
          color={automating && direction === 'A>B' ? 'blue' : undefined}
          size="sm"
          active={automating && direction === 'A>B'}
          onClick={() => handleTransition('A', 'B')}
        />
        <PixiButton label="A" variant="ghost" size="sm" onClick={() => handleQuickCut('A')} />
        {automating ? (
          <PixiButton label="X" variant="ft2" color="red" size="sm" onClick={cancelCurrent} />
        ) : (
          <pixiContainer layout={{ width: 28 }} />
        )}
        <PixiButton label="B" variant="ghost" size="sm" onClick={() => handleQuickCut('B')} />
        <PixiButton
          label={automating && direction === 'B>A' ? 'B>>A' : 'B>A'}
          variant={automating && direction === 'B>A' ? 'ft2' : 'ghost'}
          color={automating && direction === 'B>A' ? 'blue' : undefined}
          size="sm"
          active={automating && direction === 'B>A'}
          onClick={() => handleTransition('B', 'A')}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Master ─────────────────────────────────────────────────────────────────

// ─── Master Stereo VU ──────────────────────────────────────────────────────

const MASTER_VU_SEGMENTS = 8;
const MASTER_VU_SEG_W = 5;
const MASTER_VU_SEG_H = 4;

function masterSegmentColor(index: number): number {
  // 8 segments: 0-4 green, 5-6 yellow, 7 red (matching DOM's 8-segment scheme)
  if (index >= 7) return COLOR_RED;
  if (index >= 5) return COLOR_YELLOW;
  return COLOR_GREEN;
}

function masterDbToSegments(dB: number): number {
  if (dB <= -60) return 0;
  if (dB >= 0) return MASTER_VU_SEGMENTS;
  return Math.round(((dB + 60) / 60) * MASTER_VU_SEGMENTS);
}

const MixerMaster: React.FC = () => {
  const theme = usePixiTheme();
  const masterVolume = useDJStore(s => s.masterVolume);
  const masterVURef = useRef<GraphicsType | null>(null);
  const masterLevelsRef = useRef({ l: 0, r: 0 });
  const [limiterActive, setLimiterActive] = useState(false);

  const handleVolumeChange = useCallback((value: number) => {
    DJActions.setMasterVolume(value);
  }, []);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  // Animate master stereo VU via rAF
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const g = masterVURef.current;
      if (!g) { rafId = requestAnimationFrame(tick); return; }

      try {
        const raw = getDJEngine().mixer.getMasterLevel();
        if (Array.isArray(raw) && raw.length >= 2) {
          masterLevelsRef.current.l = masterDbToSegments(raw[0]);
          masterLevelsRef.current.r = masterDbToSegments(raw[1]);
          setLimiterActive(raw[0] > -1 || raw[1] > -1);
        } else {
          const mono = typeof raw === 'number' ? raw : -Infinity;
          const segs = masterDbToSegments(mono);
          masterLevelsRef.current.l = segs;
          masterLevelsRef.current.r = segs;
          setLimiterActive(mono > -1);
        }
      } catch {
        masterLevelsRef.current.l = Math.max(0, masterLevelsRef.current.l - 1);
        masterLevelsRef.current.r = Math.max(0, masterLevelsRef.current.r - 1);
      }

      g.clear();
      const { l, r } = masterLevelsRef.current;
      const bgColor = theme.bgTertiary?.color ?? 0x313244;

      // Draw L channel
      for (let i = 0; i < MASTER_VU_SEGMENTS; i++) {
        const y = (MASTER_VU_SEGMENTS - 1 - i) * (MASTER_VU_SEG_H + 1);
        const lit = i < l;
        g.rect(0, y, MASTER_VU_SEG_W, MASTER_VU_SEG_H);
        g.fill({ color: lit ? masterSegmentColor(i) : bgColor, alpha: lit ? 0.9 : 0.3 });
      }

      // Draw R channel (offset by width + gap)
      const rX = MASTER_VU_SEG_W + 2;
      for (let i = 0; i < MASTER_VU_SEGMENTS; i++) {
        const y = (MASTER_VU_SEGMENTS - 1 - i) * (MASTER_VU_SEG_H + 1);
        const lit = i < r;
        g.rect(rX, y, MASTER_VU_SEG_W, MASTER_VU_SEG_H);
        g.fill({ color: lit ? masterSegmentColor(i) : bgColor, alpha: lit ? 0.9 : 0.3 });
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [theme]);

  const vuTotalW = MASTER_VU_SEG_W * 2 + 2;
  const vuTotalH = MASTER_VU_SEGMENTS * (MASTER_VU_SEG_H + 1) - 1;

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center', marginBottom: 4 }}>
      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
      <PixiKnob
        value={masterVolume}
        min={0}
        max={1.5}
        size="sm"
        label="MST"
        color={0xffffff}
        defaultValue={1}
        onChange={handleVolumeChange}
      />

      {/* Stereo VU meter (L/R) */}
      <pixiContainer layout={{ flexDirection: 'column', gap: 1, alignItems: 'center' }}>
        <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: vuTotalW }}>
          <PixiLabel text="L" size="xs" color="textMuted" />
          <PixiLabel text="R" size="xs" color="textMuted" />
        </pixiContainer>
        <pixiContainer layout={{ width: vuTotalW, height: vuTotalH }}>
          <pixiGraphics
            ref={masterVURef}
            draw={() => {}}
            layout={{ position: 'absolute', width: vuTotalW, height: vuTotalH }}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Limiter indicator (matches DOM) */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.circle(2.5, 2.5, 2.5);
            g.fill({ color: limiterActive ? COLOR_RED : (theme.bgTertiary?.color ?? 0x313244), alpha: limiterActive ? 1 : 0.5 });
          }}
          layout={{ width: 5, height: 5 }}
        />
        <PixiLabel text="LIM" size="xs" color="textMuted" />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Cue Section ────────────────────────────────────────────────────────────

const MixerCueSection: React.FC = () => {
  const theme = usePixiTheme();
  const pflA = useDJStore(s => s.decks.A.pflEnabled);
  const pflB = useDJStore(s => s.decks.B.pflEnabled);
  const cueVolume = useDJStore(s => s.cueVolume);
  const cueMix = useDJStore(s => s.cueMix);

  const handlePFLToggle = useCallback((deck: 'A' | 'B' | 'C') => {
    DJActions.togglePFL(deck);
  }, []);

  const handleCueVolumeChange = useCallback((value: number) => {
    useDJStore.getState().setCueVolume(value);
  }, []);

  const handleCueMixChange = useCallback((value: number) => {
    useDJStore.getState().setCueMix(value);
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
        color={0xffcc00}
        defaultValue={1}
        onChange={handleCueVolumeChange}
      />
      <PixiKnob
        value={cueMix}
        min={0}
        max={1}
        size="sm"
        label="MIX"
        color={0x66ccff}
        defaultValue={0.5}
        onChange={handleCueMixChange}
      />
      {/* PFL buttons with headphone label (matches DOM) */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
        <PixiLabel text="PFL" size="xs" color="textMuted" />
        <PixiButton
          label="A"
          variant={pflA ? 'ft2' : 'ghost'}
          color={pflA ? 'yellow' : undefined}
          size="sm"
          active={pflA}
          onClick={() => handlePFLToggle('A')}
        />
        <PixiButton
          label="B"
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

// ─── Record + Mic ───────────────────────────────────────────────────────────

const MixerRecordMic: React.FC = () => {
  const isRecording = useDJSetStore(s => s.isRecording);
  const micEnabled = useDJSetStore(s => s.micEnabled);
  const micGain = useDJSetStore(s => s.micGain);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const videoCaptureRef = useRef<DJVideoCapture | null>(null);
  const videoRecorderRef = useRef<DJVideoRecorder | null>(null);

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      // Stop — prompt for name, then use DJActions to stop and detach recorder
      const name = prompt('Name your DJ set:', `DJ Set ${new Date().toLocaleString()}`);
      if (!name) return;
      const { useAuthStore } = await import('@/stores/useAuthStore');
      const auth = useAuthStore.getState();
      const set = await DJActions.stopRecording(name, auth.user?.id || 'local', auth.user?.username || 'DJ');
      // Save to server if authenticated
      if (set && auth.token) {
        try {
          const { saveDJSet } = await import('@/lib/djSetApi');
          await saveDJSet(set);
        } catch (err) { console.error('[PixiDJMixer] Save failed:', err); }
      }
    } else {
      // Start recording via DJActions
      await DJActions.startRecording();
    }
  }, [isRecording]);

  const handleMicToggle = useCallback(async () => {
    await DJActions.toggleMic();
  }, []);

  const handleMicGain = useCallback((v: number) => {
    DJActions.setMicGain(v);
  }, []);

  const handleVideoToggle = useCallback(async () => {
    if (videoRecording) {
      // Stop
      if (videoRecorderRef.current) {
        const blob = await videoRecorderRef.current.stopRecording();
        videoCaptureRef.current?.stopCapture();
        videoCaptureRef.current = null;
        videoRecorderRef.current = null;
        setVideoRecording(false);
        if (blob.size > 0) {
          const filename = `dj-set-${Date.now()}.webm`;
          DJVideoRecorder.download(blob, filename);
        }
      }
    } else {
      // Start — try VJ first, then DJ UI
      const source = getCaptureCanvas('vj') ? 'vj' as const : 'dj-ui' as const;
      if (!getCaptureCanvas(source)) { alert('No capture canvas available'); return; }
      const capture = new DJVideoCapture();
      const stream = capture.startCapture(source, source === 'vj' ? 60 : 30);
      const recorder = new DJVideoRecorder();
      recorder.startRecording(stream);
      videoCaptureRef.current = capture;
      videoRecorderRef.current = recorder;
      setVideoRecording(true);
    }
  }, [videoRecording]);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingTop: 4 }}>
      <PixiButton
        label="BROADCAST"
        size="sm"
        color={showBroadcast ? 'red' : undefined}
        active={showBroadcast}
        onClick={() => setShowBroadcast(v => !v)}
      />
      {showBroadcast && (
        <>
          <PixiButton
            label={isRecording ? 'STOP' : 'REC'}
            size="sm"
            color={isRecording ? 'red' : undefined}
            active={isRecording}
            onClick={handleRecordToggle}
          />
          <PixiButton
            label={videoRecording ? 'VSTOP' : 'VIDEO'}
            size="sm"
            color={videoRecording ? 'purple' : undefined}
            active={videoRecording}
            onClick={handleVideoToggle}
          />
          <PixiButton
            label={isLive ? 'STOP' : 'LIVE'}
            size="sm"
            color={isLive ? 'red' : undefined}
            active={isLive}
            onClick={() => setIsLive(v => !v)}
          />
          <PixiButton
            label="MIC"
            size="sm"
            color={micEnabled ? 'green' : undefined}
            active={micEnabled}
            onClick={handleMicToggle}
          />
          {micEnabled && (
            <PixiSlider
              value={micGain}
              min={0}
              max={1.5}
              length={50}
              orientation="horizontal"
              onChange={handleMicGain}
            />
          )}
        </>
      )}
    </pixiContainer>
  );
};
