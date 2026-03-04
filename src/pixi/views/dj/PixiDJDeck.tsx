/**
 * PixiDJDeck — Complete deck component: track info + turntable + waveform + transport.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme, usePixiThemeId, getDeckColors } from '../../theme';
import { PixiButton, PixiLabel, PixiSlider } from '../../components';
import { useDJStore } from '@/stores/useDJStore';
import { PixiDeckTransport } from './PixiDeckTransport';
import { PixiDeckTurntable } from './PixiDeckTurntable';
import { PixiDeckWaveform } from './PixiDeckWaveform';
import { PixiDeckScratch } from './PixiDeckScratch';
import { PixiDeckCuePoints } from './PixiDeckCuePoints';
import { PixiDeckScopes } from './PixiDeckScopes';
import { PixiDeckBeatGrid } from './PixiDeckBeatGrid';
import { getDJEngine } from '@engine/dj/DJEngine';
import { TurntablePhysics, OMEGA_NORMAL } from '@/engine/turntable/TurntablePhysics';

/** Format milliseconds as M:SS */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/* ─── Visualizer modes ──────────────────────────────────────────────── */

const VIZ_MODES = ['spectrum', 'waveform', 'circular', 'mirrored'] as const;
type VizMode = (typeof VIZ_MODES)[number];

const VIZ_LABELS: Record<VizMode, string> = {
  spectrum: 'SPECTRUM',
  waveform: 'WAVEFORM',
  circular: 'RADIAL',
  mirrored: 'MIRROR',
};

/* ─── Spectrum visualizer (rAF loop, multiple modes, beat flash) ───── */

const PixiSpectrumDisplay: React.FC<{
  deckId: 'A' | 'B' | 'C';
  width: number;
  height: number;
  deckColor: number;
  vizMode: VizMode;
  onBeatFlash?: () => void;
}> = ({ deckId, width, height, deckColor, vizMode, onBeatFlash }) => {
  const graphicsRef = useRef<GraphicsType | null>(null);
  const rafRef = useRef(0);
  const prevEnergyRef = useRef(0);

  useEffect(() => {
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) { rafRef.current = requestAnimationFrame(draw); return; }
      g.clear();

      g.rect(0, 0, width, height).fill({ color: 0x080808 });

      const isPlaying = useDJStore.getState().decks[deckId]?.isPlaying ?? false;
      let fft: Float32Array | null = null;
      let waveform: Float32Array | null = null;
      if (isPlaying) {
        try {
          const deck = getDJEngine().getDeck(deckId);
          fft = deck.getFFT();
          if (vizMode === 'waveform') waveform = deck.getWaveform();
        } catch { /* engine not ready */ }
      }

      // Beat detection from FFT energy
      if (fft && fft.length > 0 && onBeatFlash) {
        const lowBins = Math.min(16, fft.length);
        let energy = 0;
        for (let i = 0; i < lowBins; i++) energy += Math.abs(fft[i] ?? -100);
        energy /= lowBins;
        if (energy - prevEnergyRef.current > 15) onBeatFlash();
        prevEnergyRef.current = energy * 0.8 + prevEnergyRef.current * 0.2;
      }

      if (vizMode === 'waveform' && waveform && waveform.length > 0) {
        drawWaveform(g, waveform, width, height, deckColor);
      } else if (vizMode === 'circular' && fft && fft.length > 0) {
        drawCircular(g, fft, width, height, deckColor);
      } else if (vizMode === 'mirrored' && fft && fft.length > 0) {
        drawMirrored(g, fft, width, height, deckColor);
      } else if (fft && fft.length > 0) {
        drawSpectrumBars(g, fft, width, height, deckColor);
      }

      g.rect(0, 0, width, height).stroke({ color: 0x222222, width: 0.5 });
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deckId, width, height, deckColor, vizMode, onBeatFlash]);

  return <pixiGraphics ref={graphicsRef} draw={() => {}} layout={{ width, height }} />;
};

function drawSpectrumBars(g: GraphicsType, fft: Float32Array, w: number, h: number, accentColor: number) {
  const bars = 32;
  const gap = 1;
  const barW = (w - gap * (bars + 1)) / bars;
  const step = Math.floor(fft.length / bars);
  for (let i = 0; i < bars; i++) {
    const db = fft[i * step] ?? -100;
    const val = Math.max(0, Math.min(1, (db + 100) / 80));
    const barH = val * (h - 4);
    if (barH < 1) continue;
    const color = val > 0.8 ? 0xff4444 : val > 0.5 ? 0xffaa00 : accentColor;
    g.rect(gap + i * (barW + gap), h - 2 - barH, barW, barH).fill({ color, alpha: 0.85 });
  }
}

function drawWaveform(g: GraphicsType, data: Float32Array, w: number, h: number, accentColor: number) {
  const mid = h / 2;
  const step = data.length / w;
  g.moveTo(0, mid);
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x * step);
    const val = data[idx] ?? 0;
    g.lineTo(x, mid + val * mid * 0.8);
  }
  g.stroke({ color: accentColor, width: 1.5 });
  // Center line
  g.moveTo(0, mid).lineTo(w, mid).stroke({ color: 0x333333, width: 0.5 });
}

function drawCircular(g: GraphicsType, fft: Float32Array, w: number, h: number, accentColor: number) {
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.3;
  const bars = 64;
  const step = Math.max(1, Math.floor(fft.length / bars));
  for (let i = 0; i < bars; i++) {
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const db = fft[i * step] ?? -100;
    const val = Math.max(0, Math.min(1, (db + 100) / 80));
    const barLen = val * radius * 0.8;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const x1 = cx + cosA * radius, y1 = cy + sinA * radius;
    const x2 = cx + cosA * (radius + barLen), y2 = cy + sinA * (radius + barLen);
    const color = val > 0.7 ? 0xff4444 : val > 0.4 ? 0xffaa00 : accentColor;
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: 2 });
  }
  g.circle(cx, cy, radius * 0.3).fill({ color: 0x111111 });
  g.circle(cx, cy, radius * 0.3).stroke({ color: accentColor, width: 1 });
}

function drawMirrored(g: GraphicsType, fft: Float32Array, w: number, h: number, accentColor: number) {
  const bars = 48;
  const barW = w / bars - 1;
  const step = Math.max(1, Math.floor(fft.length / bars));
  const mid = h / 2;
  for (let i = 0; i < bars; i++) {
    const db = fft[i * step] ?? -100;
    const val = Math.max(0, Math.min(1, (db + 100) / 80));
    const barH = val * mid * 0.9;
    const color = val > 0.7 ? 0xff4444 : val > 0.4 ? 0xffaa00 : accentColor;
    g.rect(i * (barW + 1), mid - barH, barW, barH).fill({ color, alpha: 0.85 });
    g.rect(i * (barW + 1), mid, barW, barH).fill({ color, alpha: 0.85 });
  }
}

/* ─── Vinyl record display with grooves, label, rotation, and scratch ─ */

const GROOVE_COUNT = 28;

const PixiVinylDisplay: React.FC<{
  deckId: 'A' | 'B' | 'C';
  size: number;
  deckColor: number;
}> = ({ deckId, size, deckColor }) => {
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore(s => s.decks[deckId].effectiveBPM);
  const trackName = useDJStore(s => s.decks[deckId].trackName);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const labelR = outerR * 0.32;

  // ── Physics-driven rotation ──────────────────────────────────────────────
  const physicsRef = useRef(new TurntablePhysics());
  const angleRef = useRef(0);
  const lastTickRef = useRef(0);
  const isScratchActiveRef = useRef(false);
  const [isScratchActive, setIsScratchActive] = useState(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTimeRef = useRef(0);
  const graphicsRef = useRef<GraphicsType | null>(null);

  // Keep play state accessible from rAF closure without re-creating it
  const playStateRef = useRef({ isPlaying, effectiveBPM });
  playStateRef.current = { isPlaying, effectiveBPM };

  // ── Physics rAF loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const physics = physicsRef.current;
    let prevRate = 1;

    const tick = (now: number) => {
      const dt = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      const baseBPM = playStateRef.current.effectiveBPM || 120;
      const rps = (baseBPM / 120) * 0.5556; // 33⅓ RPM normalized

      if (playStateRef.current.isPlaying || isScratchActiveRef.current) {
        let rate = 1;
        if (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive) {
          rate = physics.tick(dt);
        }

        angleRef.current += rps * rate * 2 * Math.PI * dt;

        // Forward physics rate to DeckEngine scratch API
        if (isScratchActiveRef.current && Math.abs(rate - prevRate) > 0.01) {
          try { getDJEngine().getDeck(deckId).setScratchVelocity(rate); } catch { /* not ready */ }
          prevRate = rate;
        }

        // Check if physics settled back to normal — exit scratch
        if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
          if (Math.abs(rate - 1.0) < 0.02) {
            isScratchActiveRef.current = false;
            setIsScratchActive(false);
            try { getDJEngine().getDeck(deckId).stopScratch(50); } catch { /* not ready */ }
            useDJStore.getState().setDeckScratchActive(deckId, false);
            prevRate = 1;
          }
        }
      }

      // Render
      drawVinylToGraphics();
      rafRef.current = requestAnimationFrame(tick);
    };

    const rafRef = { current: requestAnimationFrame(tick) };
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // ── Imperative graphics draw (called each rAF frame) ─────────────────────
  const drawVinylToGraphics = useCallback(() => {
    const g = graphicsRef.current;
    if (!g) return;

    const rotation = angleRef.current;
    const playing = playStateRef.current.isPlaying || isScratchActiveRef.current;

    g.clear();

    // Platter
    g.circle(cx, cy, outerR).fill({ color: 0x111111 });
    g.circle(cx, cy, outerR).stroke({ color: 0x333333, width: 1.5 });

    // Vinyl disc
    g.circle(cx, cy, outerR - 3).fill({ color: 0x0a0a0a });

    // Grooves with shimmer
    const grooveStart = labelR + 6;
    const grooveEnd = outerR - 6;
    for (let i = 0; i < GROOVE_COUNT; i++) {
      const r = grooveStart + (i / (GROOVE_COUNT - 1)) * (grooveEnd - grooveStart);
      const alpha = 0.12 + 0.08 * Math.sin(i * 1.5 + rotation * 0.3);
      g.circle(cx, cy, r).stroke({ color: 0x1a1a1a, alpha, width: 0.5 });
    }

    // Rotation marker line
    g.moveTo(cx + Math.cos(rotation) * (labelR + 2), cy + Math.sin(rotation) * (labelR + 2))
      .lineTo(cx + Math.cos(rotation) * (outerR - 4), cy + Math.sin(rotation) * (outerR - 4))
      .stroke({ color: deckColor, alpha: playing ? 0.8 : 0.3, width: 2 });

    // Label area
    g.circle(cx, cy, labelR).fill({ color: deckColor, alpha: 0.15 });
    g.circle(cx, cy, labelR).stroke({ color: deckColor, alpha: 0.3, width: 0.5 });

    // Edge dot
    g.circle(cx + Math.cos(rotation) * (outerR - 2), cy + Math.sin(rotation) * (outerR - 2), 2)
      .fill({ color: 0xffffff, alpha: playing ? 0.7 : 0.2 });

    // Spindle
    g.circle(cx, cy, 3).fill({ color: 0x000000 });
    g.circle(cx, cy, 3).stroke({ color: 0x444444, width: 0.5 });
  }, [cx, cy, outerR, labelR, deckColor]);

  // ── Scratch enter/exit helpers ───────────────────────────────────────────
  const enterScratch = useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    setIsScratchActive(true);
    useDJStore.getState().setDeckScratchActive(deckId, true);
    try { getDJEngine().getDeck(deckId).startScratch(); } catch { /* not ready */ }
  }, [deckId]);

  // ── Pointer handlers (scratch grab) ──────────────────────────────────────
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();

    if (!playStateRef.current.isPlaying) return;

    enterScratch();

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    lastPointerTimeRef.current = performance.now();

    // Tell physics: hand on record
    physicsRef.current.setTouching(true);
    physicsRef.current.setHandVelocity(0);

    const onMove = (ev: PointerEvent) => {
      if (!lastPointerRef.current) return;
      const g = graphicsRef.current;
      if (!g) return;

      // Use global bounds of the graphics element for center calculation
      const bounds = g.getBounds();
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const rx = ev.clientX - centerX;
      const ry = ev.clientY - centerY;
      const radius = Math.sqrt(rx * rx + ry * ry);

      if (radius > 4) {
        const dx = ev.clientX - lastPointerRef.current.x;
        const dy = ev.clientY - lastPointerRef.current.y;
        // Tangential component of pointer movement relative to center
        const tangential = (rx * dy - ry * dx) / radius;

        const now = performance.now();
        const dt = Math.max(0.001, (now - lastPointerTimeRef.current) / 1000);
        lastPointerTimeRef.current = now;

        // Scale: tangential px/s → angular velocity in rad/s
        const pixelVelocity = tangential / dt;
        const omega = (pixelVelocity / (size * 0.8)) * OMEGA_NORMAL;

        physicsRef.current.setHandVelocity(omega);
      }

      lastPointerRef.current = { x: ev.clientX, y: ev.clientY };
    };

    const onUp = () => {
      lastPointerRef.current = null;
      physicsRef.current.setTouching(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [enterScratch, size]);

  // ── Wheel handler (nudge) ────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!playStateRef.current.isPlaying) return;
    e.preventDefault();

    if (!isScratchActiveRef.current) {
      enterScratch();
    }

    const impulse = TurntablePhysics.deltaToImpulse(e.deltaY, e.deltaMode);
    physicsRef.current.applyImpulse(impulse);
  }, [enterScratch]);

  // Attach wheel listener (needs { passive: false })
  useEffect(() => {
    const g = graphicsRef.current;
    if (!g) return;
    const canvas = (g as any).canvas?.parentElement ?? document.querySelector('canvas');
    if (!canvas) return;

    // We need the wheel on the actual DOM canvas; pixi doesn't have onWheel
    const handler = (e: WheelEvent) => {
      // Only handle if pointer is within vinyl bounds
      const bounds = g.getBounds();
      // WheelEvent doesn't have a reliable way to check bounds in pixi,
      // so delegate to the generic handler
      handleWheel(e);
    };
    // Note: wheel events are handled by the pixi canvas globally;
    // for now we skip wheel since it requires DOM access. The primary
    // interaction (pointer drag) is fully functional.
    void handler;
  }, [handleWheel]);

  return (
    <pixiContainer layout={{ width: size, height: size }}>
      <pixiGraphics
        ref={graphicsRef}
        draw={() => {}}
        eventMode="static"
        cursor={isScratchActive ? 'grabbing' : 'grab'}
        onPointerDown={handlePointerDown}
        layout={{ width: size, height: size }}
      />
      <pixiBitmapText
        text={trackName || `Deck ${deckId}`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: Math.max(8, Math.round(labelR * 0.4)), fill: 0xffffff }}
        tint={deckColor}
        alpha={0.7}
        layout={{ position: 'absolute', left: cx - labelR + 4, top: cy - 5 }}
      />
      {isScratchActive && (
        <PixiLabel
          text="SCR"
          size="xs"
          weight="bold"
          color="accent"
          layout={{ position: 'absolute', top: 4, right: 4 }}
        />
      )}
    </pixiContainer>
  );
};

/* ─── Tonearm overlay for turntable mode ────────────────────────────── */

const PixiTonearm: React.FC<{
  size: number;
  isPlaying: boolean;
}> = ({ size, isPlaying }) => {
  const drawArm = useCallback((g: GraphicsType) => {
    g.clear();

    const baseX = size - 14;
    const baseY = 14;
    const armAngle = isPlaying ? Math.PI * 0.78 : Math.PI * 0.88;
    const armLen = size * 0.55;
    const endX = baseX - Math.cos(armAngle) * armLen;
    const endY = baseY + Math.sin(armAngle) * armLen;

    // Counterweight
    g.circle(baseX + Math.cos(armAngle) * 16, baseY - Math.sin(armAngle) * 16, 4)
      .fill({ color: 0x555555 });

    // Arm shaft
    g.moveTo(baseX, baseY).lineTo(endX, endY)
      .stroke({ color: 0x888888, width: 2 });

    // Headshell
    const sa = armAngle + 0.3;
    g.moveTo(endX, endY)
      .lineTo(endX - Math.cos(sa) * 12, endY + Math.sin(sa) * 12)
      .stroke({ color: 0xaaaaaa, width: 3 });

    // Pivot
    g.circle(baseX, baseY, 6).fill({ color: 0x444444 });
    g.circle(baseX, baseY, 2).fill({ color: 0x888888 });
  }, [size, isPlaying]);

  return (
    <pixiGraphics
      draw={drawArm}
      layout={{ width: size, height: size, position: 'absolute', left: 0, top: 0 }}
    />
  );
};

interface PixiDJDeckProps {
  deckId: 'A' | 'B' | 'C';
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

  // Visualizer mode cycling
  const [vizMode, setVizMode] = useState<VizMode>('spectrum');
  const cycleVizPrev = useCallback(() => {
    setVizMode(prev => VIZ_MODES[(VIZ_MODES.indexOf(prev) - 1 + VIZ_MODES.length) % VIZ_MODES.length]);
  }, []);
  const cycleVizNext = useCallback(() => {
    setVizMode(prev => VIZ_MODES[(VIZ_MODES.indexOf(prev) + 1) % VIZ_MODES.length]);
  }, []);

  // Beat flash state (decays via timeout)
  const [beatFlash, setBeatFlash] = useState(0);
  const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBeatFlash = useCallback(() => {
    setBeatFlash(1);
    if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
    beatTimerRef.current = setTimeout(() => setBeatFlash(0), 100);
  }, []);

  // View mode from global store (synced with DOM version)
  const viewMode = useDJStore(s => s.deckViewMode);
  const cycleDeckViewMode = useDJStore(s => s.cycleDeckViewMode);
  const VIEW_LABELS: Record<string, string> = { visualizer: 'WAV', vinyl: 'VIN', '3d': 'TBL' };

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
  const { deckA, deckB, deckC } = getDeckColors(themeId, theme.accent, theme.accentSecondary);
  const DECK_COLOR = deckId === 'A' ? deckA : deckId === 'B' ? deckB : deckC;

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
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 15, fill: 0xffffff }}
          tint={DECK_COLOR}
          layout={{}}
        />
        <pixiBitmapText
          text={isPlaying ? 'PLAYING' : 'STOPPED'}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={isPlaying ? theme.success.color : theme.textMuted.color}
          layout={{}}
        />
        <pixiContainer layout={{ flex: 1 }} />
        <PixiButton
          label={VIEW_LABELS[viewMode] ?? 'WAV'}
          variant="ghost"
          size="sm"
          onClick={cycleDeckViewMode}
        />
        <pixiBitmapText
          text={`${bpm.toFixed(1)} BPM`}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13, fill: 0xffffff }}
          tint={DECK_COLOR}
          layout={{}}
        />
      </pixiContainer>

      {/* Track name */}
      <pixiBitmapText
        text={trackName || 'No track loaded'}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
        tint={trackName ? theme.text.color : theme.textMuted.color}
        layout={{}}
      />

      {/* Deck content — switches based on view mode */}
      {viewMode === 'visualizer' && (
        <>
          {/* Spectrum visualizer with beat flash border */}
          <pixiContainer layout={{ width: 280, height: 80 }}>
            <PixiSpectrumDisplay deckId={deckId} width={280} height={80} deckColor={DECK_COLOR} vizMode={vizMode} onBeatFlash={handleBeatFlash} />
            {beatFlash > 0 && (
              <pixiGraphics
                draw={(g: GraphicsType) => {
                  g.clear();
                  g.roundRect(0, 0, 280, 80, 4).stroke({ color: DECK_COLOR, width: 3, alpha: beatFlash });
                }}
                layout={{ position: 'absolute', top: 0, left: 0, width: 280, height: 80 }}
                eventMode="none"
              />
            )}
          </pixiContainer>

          {/* Visualizer mode nav */}
          <pixiContainer layout={{ flexDirection: 'row', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
            <PixiButton icon="prev" label="" variant="ghost" width={28} onClick={cycleVizPrev} />
            <PixiLabel text={VIZ_LABELS[vizMode]} size="xs" color="textMuted" />
            <PixiButton icon="next" label="" variant="ghost" width={28} onClick={cycleVizNext} />
          </pixiContainer>

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
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>
          </pixiContainer>

          {/* Waveform */}
          <PixiDeckWaveform deckId={deckId} width={280} height={60} />
        </>
      )}

      {viewMode === 'vinyl' && (
        <>
          {/* Vinyl record + Pitch slider */}
          <pixiContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <PixiVinylDisplay deckId={deckId} size={250} deckColor={DECK_COLOR} />

            {/* Pitch slider */}
            <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              <PixiLabel text="PITCH" size="xs" color="textMuted" />
              <PixiSlider
                value={pitchOffset ?? 0}
                min={-0.08}
                max={0.08}
                orientation="vertical"
                length={140}
                detent={0}
                onChange={(v) => setDeckPitch?.(deckId, v)}
              />
              <pixiBitmapText
                text={`${((pitchOffset ?? 0) * 100).toFixed(1)}%`}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>
          </pixiContainer>
        </>
      )}

      {viewMode === '3d' && (
        <>
          {/* Turntable with tonearm overlay */}
          <pixiContainer layout={{ width: 200, height: 200, alignSelf: 'center' }}>
            <PixiDeckTurntable deckId={deckId} size={200} />
            <PixiTonearm size={200} isPlaying={isPlaying} />
          </pixiContainer>

          {/* Compact horizontal pitch slider */}
          <pixiContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <PixiLabel text="PITCH" size="xs" color="textMuted" />
            <PixiSlider
              value={pitchOffset ?? 0}
              min={-0.08}
              max={0.08}
              orientation="horizontal"
              length={160}
              detent={0}
              onChange={(v) => setDeckPitch?.(deckId, v)}
            />
            <pixiBitmapText
              text={`${((pitchOffset ?? 0) * 100).toFixed(1)}%`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </pixiContainer>
        </>
      )}

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
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
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
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
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
      <PixiDeckScratch deckId={deckId} layout={{ width: 280, height: 56 }} />

      {/* Cue points */}
      <PixiDeckCuePoints deckId={deckId} layout={{ width: 280, height: 36 }} />

      {/* Beat grid */}
      <PixiDeckBeatGrid deckId={deckId} />

      {/* Oscilloscope / spectrum scopes */}
      <PixiDeckScopes deckId={deckId} size={48} layout={{ width: 280, height: 64, paddingLeft: 2, paddingTop: 4, flexDirection: 'row', gap: 2 }} />

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Transport controls */}
      <PixiDeckTransport deckId={deckId} />
    </pixiContainer>
  );
};
