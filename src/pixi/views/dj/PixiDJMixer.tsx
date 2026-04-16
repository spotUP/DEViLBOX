/**
 * PixiDJMixer — Center mixer panel matching DOM DJMixer layout:
 *   1. EQ(A) | Fader(A) | VU(A) VU(B) | Fader(B) | EQ(B) — single horizontal row
 *   2. Crossfader (with bottom border)
 *   3. Transition controls (with bottom border)
 *   4. Master + Cue
 *   5. Broadcast
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTick } from '@pixi/react';
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
import { PIXI_FONTS } from '../../fonts';

const MIXER_WIDTH = 400;

/** Convert linear volume (0-1) to dB display string */
function volumeToDb(volume: number): string {
  if (volume <= 0) return '-\u221EdB';
  const dB = 20 * Math.log10(volume);
  if (dB >= -0.5) return '0.0dB';
  if (dB < -60) return '-\u221EdB';
  return `${dB.toFixed(1)}dB`;
}

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
        padding: 4,
        gap: 4,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: MIXER_WIDTH, height: '100%' }} />

      {/* Row 1: EQ(A) | Fader(A) | VU(A,B) | Fader(B) | EQ(B) — single horizontal row */}
      <MixerMainRow />

      {/* Row 4: Crossfader (matches DOM) */}
      <MixerCrossfader />

      {/* Row 5: Transition controls (matches DOM) */}
      <MixerTransitionSection />

      {/* Row 6: Master + Cue (matches DOM) */}
      <MixerMasterCueRow />

      {/* Row 7: Broadcast (matches DOM) */}
      <MixerRecordMic />
    </pixiContainer>
  );
};

// ─── EQ Band Row ────────────────────────────────────────────────────────────

/** EQ knob + kill button for one band. side controls kill button placement. */
const EQBandRow: React.FC<{
  deckId: 'A' | 'B' | 'C';
  band: 'high' | 'mid' | 'low';
  label: string;
  value: number;
  isKilled: boolean;
  side: 'left' | 'right';
}> = ({ deckId, band, label, value, isKilled, side }) => {
  const handleKillDown = useCallback(() => {
    DJActions.setDeckEQKill(deckId, band, true);
  }, [deckId, band]);

  const handleKillUp = useCallback(() => {
    DJActions.setDeckEQKill(deckId, band, false);
  }, [deckId, band]);

  const killBtn = (
    <PixiButton
      label="K"
      variant={isKilled ? 'ft2' : 'ghost'}
      color={isKilled ? 'red' : undefined}
      size="sm"
      active={isKilled}
      width={20}
      height={20}
      onPointerDown={handleKillDown}
      onPointerUp={handleKillUp}
    />
  );

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
      {side === 'left' && killBtn}
      <PixiKnob value={value} min={-24} max={6} defaultValue={0} size="sm" label={label} bipolar onChange={(v) => DJActions.setDeckEQ(deckId, band, v)} />
      {side === 'right' && killBtn}
    </pixiContainer>
  );
};

// ─── Deck EQ Column ─────────────────────────────────────────────────────────

/** Returns filter mode label and whether the filter is active */
function getFilterMode(position: number): { text: string; active: boolean } {
  if (Math.abs(position) < 0.01) return { text: 'OFF', active: false };
  if (position < 0) return { text: 'HPF', active: true };
  return { text: 'LPF', active: true };
}

/** Filter knob on top, then HI/MID/LO EQ bands with kill buttons */
const DeckEQColumn: React.FC<{
  deckId: 'A' | 'B' | 'C';
  side: 'left' | 'right';
}> = ({ deckId, side }) => {
  const theme = usePixiTheme();
  const filter = useDJStore(s => s.decks[deckId].filterPosition);
  const eqHigh = useDJStore(s => s.decks[deckId].eqHigh);
  const eqMid = useDJStore(s => s.decks[deckId].eqMid);
  const eqLow = useDJStore(s => s.decks[deckId].eqLow);
  const killHigh = useDJStore(s => s.decks[deckId].eqHighKill);
  const killMid = useDJStore(s => s.decks[deckId].eqMidKill);
  const killLow = useDJStore(s => s.decks[deckId].eqLowKill);

  const filterMode = getFilterMode(filter);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      {/* Filter knob on top */}
      <PixiKnob value={filter} min={-1} max={1} defaultValue={0} size="sm" label="FLT" color={theme.accentSecondary.color} bipolar onChange={(v) => DJActions.setDeckFilter(deckId, v)} />
      <PixiLabel text={filterMode.text} size="xs" color="custom" customColor={filterMode.active ? theme.accentSecondary.color : theme.textMuted.color} customAlpha={filterMode.active ? 1 : 0.5} />
      {/* EQ bands */}
      <EQBandRow deckId={deckId} band="high" label="HI" value={eqHigh} isKilled={killHigh} side={side} />
      <EQBandRow deckId={deckId} band="mid" label="MID" value={eqMid} isKilled={killMid} side={side} />
      <EQBandRow deckId={deckId} band="low" label="LO" value={eqLow} isKilled={killLow} side={side} />
    </pixiContainer>
  );
};

// ─── Channel Fader ──────────────────────────────────────────────────────────

const ChannelFader: React.FC<{ deckId: 'A' | 'B' | 'C'; label: string }> = ({ deckId, label }) => {
  const theme = usePixiTheme();
  const volume = useDJStore(s => s.decks[deckId].volume);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center', alignSelf: 'stretch' }}>
      <PixiLabel text={label} size="xs" color="textMuted" />
      <PixiSlider
        value={volume ?? 0.8}
        min={0}
        max={1}
        orientation="vertical"
        length={320}
        onChange={(v) => DJActions.setDeckVolume(deckId, v)}
      />
      <pixiBitmapText
        text={volumeToDb(volume ?? 0.8)}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: theme.textMuted.color }}
      />
    </pixiContainer>
  );
};

// ─── Main Row (EQ + Faders + VU) ────────────────────────────────────────────

const MixerMainRow: React.FC = () => {
  const theme = usePixiTheme();
  const thirdDeck = useDJStore(s => s.thirdDeckActive);

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 8, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center', width: '100%', flexShrink: 0 }}>
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'stretch', gap: 4, width: '100%', flexShrink: 0, justifyContent: 'center' }}>
        {/* Deck A: EQ column (kill buttons on left/outside) */}
        <DeckEQColumn deckId="A" side="left" />

        {/* Deck A fader */}
        <ChannelFader deckId="A" label="1" />

        {/* Center VU meters */}
        <MixerVUMeters />

        {/* Deck B fader */}
        <ChannelFader deckId="B" label="2" />

        {/* Deck B: EQ column (kill buttons on right/outside) */}
        <DeckEQColumn deckId="B" side="right" />

        {/* Deck C if active */}
        {thirdDeck && (
          <>
            <ChannelFader deckId="C" label="3" />
            <DeckEQColumn deckId="C" side="right" />
          </>
        )}
      </pixiContainer>

      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 8, height: 1 }} />
    </pixiContainer>
  );
};

// ─── VU Meters ──────────────────────────────────────────────────────────────

const VU_SEGMENTS = 20;
const VU_WIDTH = 12;
const VU_HEIGHT = 102;
const VU_SEG_HEIGHT = (VU_HEIGHT - 2) / VU_SEGMENTS;
const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_SEGMENTS_PER_SEC = 12;

function segmentColor(index: number, colorGreen: number, colorYellow: number, colorRed: number): number {
  if (index >= 17) return colorRed;
  if (index >= 12) return colorYellow;
  return colorGreen;
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
  const peakLevelRef = useRef({ a: 0, b: 0, c: 0 });
  const peakTimeRef = useRef({ a: 0, b: 0, c: 0 });
  const thirdDeckRef = useRef(thirdDeck);
  thirdDeckRef.current = thirdDeck;

  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();
    const deckKeys = ['a', 'b', 'c'] as const;

    const draw = (now: number) => {
      const g = graphicsRef.current;
      if (!g) { rafId = requestAnimationFrame(draw); return; }

      const dt = (now - lastTime) / 1000;
      lastTime = now;

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

      // Update peak hold per deck
      for (const key of deckKeys) {
        const segs = levelsRef.current[key];
        if (segs >= peakLevelRef.current[key]) {
          peakLevelRef.current[key] = segs;
          peakTimeRef.current[key] = now;
        } else if (now - peakTimeRef.current[key] > PEAK_HOLD_MS) {
          peakLevelRef.current[key] = Math.max(segs, peakLevelRef.current[key] - PEAK_DECAY_SEGMENTS_PER_SEC * dt);
        }
      }

      g.clear();
      const { a, b, c } = levelsRef.current;
      const meterCount = thirdDeckRef.current ? 3 : 2;

      for (let deckIdx = 0; deckIdx < meterCount; deckIdx++) {
        const segs = deckIdx === 0 ? a : deckIdx === 1 ? b : c;
        const peakSeg = Math.round(peakLevelRef.current[deckKeys[deckIdx]]);
        const xOff = deckIdx * (VU_WIDTH + 4);

        for (let i = 0; i < VU_SEGMENTS; i++) {
          const y = VU_HEIGHT - 1 - (i + 1) * VU_SEG_HEIGHT;
          const lit = i < segs;
          const isPeak = !lit && i === peakSeg - 1 && peakSeg > segs;
          g.rect(xOff, y, VU_WIDTH, VU_SEG_HEIGHT - 1);
          g.fill({
            color: (lit || isPeak) ? segmentColor(i, theme.success.color, theme.warning.color, theme.error.color) : (theme.bgTertiary?.color ?? 0x313244),
            alpha: lit ? 0.9 : isPeak ? 0.85 : 0.3,
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

function masterSegmentColor(index: number, colorGreen: number, colorYellow: number, colorRed: number): number {
  // 8 segments: 0-4 green, 5-6 yellow, 7 red (matching DOM's 8-segment scheme)
  if (index >= 7) return colorRed;
  if (index >= 5) return colorYellow;
  return colorGreen;
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
        g.fill({ color: lit ? masterSegmentColor(i, theme.success.color, theme.warning.color, theme.error.color) : bgColor, alpha: lit ? 0.9 : 0.3 });
      }

      // Draw R channel (offset by width + gap)
      const rX = MASTER_VU_SEG_W + 2;
      for (let i = 0; i < MASTER_VU_SEGMENTS; i++) {
        const y = (MASTER_VU_SEGMENTS - 1 - i) * (MASTER_VU_SEG_H + 1);
        const lit = i < r;
        g.rect(rX, y, MASTER_VU_SEG_W, MASTER_VU_SEG_H);
        g.fill({ color: lit ? masterSegmentColor(i, theme.success.color, theme.warning.color, theme.error.color) : bgColor, alpha: lit ? 0.9 : 0.3 });
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [theme]);

  const vuTotalW = MASTER_VU_SEG_W * 2 + 2;
  const vuTotalH = MASTER_VU_SEGMENTS * (MASTER_VU_SEG_H + 1) - 1;

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
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
            g.fill({ color: limiterActive ? theme.error.color : (theme.bgTertiary?.color ?? 0x313244), alpha: limiterActive ? 1 : 0.5 });
          }}
          layout={{ width: 5, height: 5 }}
        />
        <PixiLabel text="LIM" size="xs" color="textMuted" />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Master + Cue Row (with shared top border) ────────────────────────────

const MixerMasterCueRow: React.FC = () => {
  const theme = usePixiTheme();

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MIXER_WIDTH - 16, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, alignItems: 'center', width: '100%' }}>
      <pixiGraphics draw={drawBorder} layout={{ width: MIXER_WIDTH - 16, height: 1 }} />
      <pixiContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', justifyContent: 'center', width: '100%' }}>
        <MixerMaster />
        <MixerCueSection />
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
        color={theme.warning.color}
        defaultValue={1}
        onChange={handleCueVolumeChange}
      />
      {/* Cue/Master crossfader — horizontal for quick headphone blend */}
      <pixiContainer layout={{ flexDirection: 'column', gap: 1, alignItems: 'center', width: 80 }}>
        <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: 80 }}>
          <PixiLabel text="CUE" size="xs" color="textMuted" />
          <PixiLabel text="MST" size="xs" color="textMuted" />
        </pixiContainer>
        <PixiSlider
          value={cueMix}
          min={0}
          max={1}
          orientation="horizontal"
          length={76}
          detent={0.5}
          onChange={handleCueMixChange}
        />
      </pixiContainer>
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

const formatVideoDuration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(m)}:${pad(s % 60)}`;
};

const formatRecordDuration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

const MixerRecordMic: React.FC = () => {
  const theme = usePixiTheme();
  const isRecording = useDJSetStore(s => s.isRecording);
  const recordingDuration = useDJSetStore(s => s.recordingDuration);
  const isPlayingSet = useDJSetStore(s => s.isPlayingSet);
  const micEnabled = useDJSetStore(s => s.micEnabled);
  const micGain = useDJSetStore(s => s.micGain);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const videoCaptureRef = useRef<DJVideoCapture | null>(null);
  const videoRecorderRef = useRef<DJVideoRecorder | null>(null);
  const videoStartRef = useRef(0);
  const videoDurationTimerRef = useRef<number>(0);
  const recDurationTimerRef = useRef<number>(0);

  // Pulsing red dot ref
  const recDotRef = useRef<GraphicsType | null>(null);

  // Video recording duration timer
  useEffect(() => {
    if (!videoRecording) {
      setVideoDuration(0);
      return;
    }
    videoStartRef.current = Date.now();
    videoDurationTimerRef.current = window.setInterval(() => {
      setVideoDuration(Date.now() - videoStartRef.current);
    }, 1000);
    return () => clearInterval(videoDurationTimerRef.current);
  }, [videoRecording]);

  // Recording duration timer — polls engine.recorder.elapsed() every 250ms
  useEffect(() => {
    if (!isRecording) return;
    recDurationTimerRef.current = window.setInterval(async () => {
      try {
        const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
        const engine = getDJEngineIfActive();
        if (engine?.recorder) {
          useDJSetStore.getState().setRecordingDuration(engine.recorder.elapsed() / 1000);
        }
      } catch { /* engine not active */ }
    }, 250);
    return () => clearInterval(recDurationTimerRef.current);
  }, [isRecording]);

  // Pulse the red dot via useTick
  useTick(() => {
    if (!recDotRef.current || !videoRecording) return;
    recDotRef.current.alpha = 0.65 + 0.35 * Math.sin(Date.now() * 0.009);
  });

  const drawRecDot = useCallback((g: GraphicsType) => {
    g.clear();
    g.circle(4, 4, 4);
    g.fill(theme.error.color);
  }, [theme.error.color]);

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      // Stop — prompt for name, then use DJActions to stop and detach recorder
      const name = prompt('Name your DJ set:', `DJ Set ${new Date().toLocaleString()}`);
      if (!name) return;
      const { useAuthStore } = await import('@/stores/useAuthStore');
      const auth = useAuthStore.getState();
      const set = await DJActions.stopRecording(name, auth.user?.id || 'local', auth.user?.username || 'DJ');
      if (!set) return;

      // Save to server if authenticated
      if (auth.token) {
        setSaving(true);
        try {
          const { saveDJSet, uploadBlob } = await import('@/lib/djSetApi');
          const { getDJEngine: getEngine } = await import('@/engine/dj/DJEngine');
          const engine = getEngine();

          // Upload local tracks as blobs
          for (const track of set.metadata.trackList) {
            if (track.source.type === 'local') {
              for (const deckId of ['A', 'B', 'C'] as const) {
                try {
                  const deck = engine.getDeck(deckId);
                  const bytes = deck.audioPlayer?.getOriginalFileBytes?.();
                  if (bytes) {
                    const blob = new Blob([bytes], { type: 'application/octet-stream' });
                    const { id: blobId } = await uploadBlob(blob, track.fileName);
                    const originalSource = { ...track.source };
                    (track as any).source = { type: 'embedded', blobId, originalSource };

                    // Rewrite matching load events
                    for (const evt of set.events) {
                      if (evt.type === 'load' && evt.values?.fileName === track.fileName) {
                        (evt.values as any).source = track.source;
                      }
                    }
                    break; // Found the deck, move to next track
                  }
                } catch { /* deck might not exist */ }
              }
            }
          }

          // Upload mic recording if present
          try {
            const { getDJEngineIfActive: getEng } = await import('@/engine/dj/DJEngine');
            const eng = getEng();
            if (eng?.mic?.isRecording) {
              const micBlob = eng.mic.stopRecording();
              if (micBlob && micBlob.size > 0) {
                const { id } = await uploadBlob(micBlob, 'mic-recording.webm');
                set.micAudioId = id;
              }
            }
          } catch { /* no mic */ }

          await saveDJSet(set);
          useDJSetStore.getState().fetchSets();
          console.log('[PixiDJMixer] Set saved:', set.metadata.name);
        } catch (err) {
          console.error('[PixiDJMixer] Save failed:', err);
          alert('Failed to save DJ set to server. Set recorded locally.');
        } finally {
          setSaving(false);
        }
      }
    } else {
      // Warn if not signed in — set can't be saved to server
      const { useAuthStore } = await import('@/stores/useAuthStore');
      const auth = useAuthStore.getState();
      if (!auth.token) {
        const proceed = window.confirm(
          'You are not signed in!\n\n' +
          'Your DJ set will be recorded, but it CANNOT be saved to the server without an account. ' +
          'If you close the browser or navigate away, your recording will be lost.\n\n' +
          'Sign in first to save your sets safely.\n\n' +
          'Record anyway?'
        );
        if (!proceed) return;
      }

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
            label={saving ? 'Saving...' : isRecording ? formatRecordDuration(recordingDuration) : 'REC'}
            size="sm"
            color={isRecording ? 'red' : undefined}
            active={isRecording}
            disabled={saving || isPlayingSet}
            onClick={handleRecordToggle}
          />
          {videoRecording && (
            <pixiGraphics
              ref={recDotRef}
              draw={drawRecDot}
              layout={{ width: 8, height: 8 }}
            />
          )}
          <PixiButton
            label={videoRecording ? `REC ${formatVideoDuration(videoDuration)}` : 'VIDEO'}
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
