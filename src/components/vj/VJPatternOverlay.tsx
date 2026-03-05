/**
 * VJPatternOverlay — Living, music-reactive pattern data overlay for VJ view.
 *
 * A holographic tracker display that dances with the music:
 * - 3D CSS perspective with slow Lissajous orbit + audio-modulated tilt
 * - Beat flash, bass pulse, amplitude-driven opacity
 * - Frequency-mapped note colors (sub→red, bass→orange, mid→cyan, high→white)
 * - Smooth sub-row scroll interpolation
 * - Depth fade, row shimmer wave, character spacing pulse
 *
 * Uses its own AudioDataBus instance (shared singleton AnalyserNodes, minimal overhead).
 */

import React, { useRef, useEffect } from 'react';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { AudioDataBus, type VJAudioFrame } from '@engine/vj/AudioDataBus';
import type { TrackerCell } from '@/types/tracker';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function fmtNote(note: number): string {
  if (note <= 0) return '\u00B7\u00B7\u00B7';
  if (note === 97 || note === 255) return '===';
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[(note - 1) % 12]}${octave}`;
}

function fmtHex(val: number, digits: number): string {
  if (val <= 0) return '\u00B7'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

function fmtEffect(typ: number, param: number): string {
  if (typ <= 0 && param <= 0) return '\u00B7\u00B7\u00B7';
  const t = typ > 0 ? typ.toString(16).toUpperCase() : '\u00B7';
  const p = param > 0 ? param.toString(16).toUpperCase().padStart(2, '0') : '\u00B7\u00B7';
  return `${t}${p}`;
}

function fmtCell(cell: TrackerCell): string {
  return `${fmtNote(cell.note)} ${fmtHex(cell.instrument, 2)} ${fmtEffect(cell.effTyp, cell.eff)}`;
}

// ── Layout ───────────────────────────────────────────────────────────────────
const VISIBLE_ROWS = 16;
const ROW_H = 16;
const CANVAS_W = 1200;
const CANVAS_H = (VISIBLE_ROWS * 2 + 3) * ROW_H; // extra rows for smooth scroll headroom

// ── Color helpers ────────────────────────────────────────────────────────────
function hsl(h: number, s: number, l: number, a: number): string {
  return `hsla(${h | 0},${s | 0}%,${l | 0}%,${a.toFixed(3)})`;
}

/** Map dominant frequency band to hue: sub→0(red), bass→30(orange), mid→180(cyan), high→270(violet) */
function bandHue(frame: VJAudioFrame): number {
  const bands = [frame.subEnergy, frame.bassEnergy, frame.midEnergy, frame.highEnergy];
  const hues = [0, 30, 180, 270];
  let maxE = 0, maxI = 0;
  for (let i = 0; i < 4; i++) {
    if (bands[i] > maxE) { maxE = bands[i]; maxI = i; }
  }
  return hues[maxI];
}

// ── Animation state (persists across frames, no React state) ─────────────────
interface AnimState {
  beatFlash: number;    // 0-1, decays quickly after beat
  bassAccum: number;    // accumulated bass for scale
  hueShift: number;     // random hue offset, shifted on beat
  tiltKickX: number;    // beat impulse on rotateX
  tiltKickY: number;    // beat impulse on rotateY
  bounceY: number;      // beat bounce translateY
  prevRow: number;      // previous row for smooth scroll
  scrollOffset: number; // smooth scroll pixel offset (decays to 0)
  time: number;         // accumulated time for Lissajous
}

function createAnimState(): AnimState {
  return {
    beatFlash: 0, bassAccum: 0, hueShift: 0,
    tiltKickX: 0, tiltKickY: 0, bounceY: 0,
    prevRow: -1, scrollOffset: 0, time: 0,
  };
}

export const VJPatternOverlay: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const busRef = useRef<AudioDataBus | null>(null);
  const animRef = useRef<AnimState>(createAnimState());
  const lastTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;

    // Create our own AudioDataBus (shared singleton analyser — lightweight)
    const bus = new AudioDataBus();
    bus.enable();
    busRef.current = bus;

    const render = (timestamp: number) => {
      const dt = Math.min((timestamp - (lastTimeRef.current || timestamp)) / 1000, 0.05);
      lastTimeRef.current = timestamp;
      const anim = animRef.current;
      anim.time += dt;

      // ── Read stores ──────────────────────────────────────────────────────
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const { currentRow, isPlaying } = useTransportStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const channels = pattern.channels;
      const numChannels = channels.length;
      const patLen = pattern.length;

      // ── Read audio ─────────────────────────────────────────────────────
      bus.update();
      const frame = bus.getFrame();

      // ── Update animation state ─────────────────────────────────────────
      const decay = (v: number, rate: number) => v * Math.exp(-rate * dt);

      // Beat triggers
      if (frame.beat) {
        anim.beatFlash = 1;
        anim.hueShift += 20 + Math.random() * 40;
        anim.tiltKickX += (Math.random() - 0.5) * 12;
        anim.tiltKickY += (Math.random() - 0.5) * 8;
        anim.bounceY = 6 + Math.random() * 4;
      }

      // Decay animation values
      anim.beatFlash = decay(anim.beatFlash, 8);
      anim.bassAccum = anim.bassAccum * 0.85 + frame.bassEnergy * 0.15;
      anim.tiltKickX = decay(anim.tiltKickX, 5);
      anim.tiltKickY = decay(anim.tiltKickY, 5);
      anim.bounceY = decay(anim.bounceY, 6);

      // Smooth scroll: detect row change, add offset, decay to zero
      if (anim.prevRow >= 0 && currentRow !== anim.prevRow) {
        const rowDelta = currentRow - anim.prevRow;
        // Only smooth for small jumps (1-2 rows), snap for large jumps
        if (Math.abs(rowDelta) <= 2) {
          anim.scrollOffset += rowDelta * ROW_H;
        }
      }
      anim.prevRow = currentRow;
      anim.scrollOffset = decay(anim.scrollOffset, 12);

      // ── 3D transform ──────────────────────────────────────────────────
      const t = anim.time;
      // Lissajous orbit (irrational ratios → never repeats)
      const orbitX = Math.sin(t * 0.13) * Math.cos(t * 0.07) * 8;
      const orbitY = Math.sin(t * 0.11) * Math.cos(t * 0.17) * 5;
      // Bass sway forward
      const bassTilt = frame.bassEnergy * 6;
      // High-freq shimmer
      const shimmerZ = frame.highEnergy * Math.sin(t * 37) * 1.5;
      // Combine
      const rx = orbitX + bassTilt + anim.tiltKickX;
      const ry = orbitY + anim.tiltKickY + shimmerZ;
      // Scale: subtle bass breathing
      const scale = 1.0 + anim.bassAccum * 0.06 + anim.beatFlash * 0.03;
      // Position drift
      const driftX = Math.sin(t * 0.09) * 15 + Math.cos(t * 0.23) * 10;
      const driftY = Math.sin(t * 0.14) * 8 + anim.bounceY;
      // Overall opacity: base + RMS pulse
      const opacity = 0.55 + frame.rms * 0.35 + anim.beatFlash * 0.15;

      wrap.style.transform =
        `translate(${driftX.toFixed(1)}px, ${driftY.toFixed(1)}px) ` +
        `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) ` +
        `scale(${scale.toFixed(4)})`;
      wrap.style.opacity = Math.min(1, opacity).toFixed(3);

      // ── Canvas glow (RMS-driven shadow) ───────────────────────────────
      const glowRadius = 4 + frame.rms * 16 + anim.beatFlash * 12;
      const glowHue = (bandHue(frame) + anim.hueShift) % 360;
      canvas.style.filter = `drop-shadow(0 0 ${glowRadius.toFixed(0)}px ${hsl(glowHue, 80, 60, 0.5 + anim.beatFlash * 0.3)})`;

      // ── Draw pattern ──────────────────────────────────────────────────
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.save();
      // Smooth scroll offset
      ctx.translate(0, -anim.scrollOffset);

      const rowNumW = 28;
      const cellW = Math.min(120, (CANVAS_W - rowNumW) / numChannels);
      const baseHue = (bandHue(frame) + anim.hueShift) % 360;

      // ── Character spacing driven by bass ──────────────────────────────
      const letterSpacing = anim.bassAccum * 1.5;
      ctx.textBaseline = 'middle';

      // Channel headers
      ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
      if (letterSpacing > 0.1) ctx.letterSpacing = `${letterSpacing.toFixed(1)}px`;
      ctx.fillStyle = hsl(baseHue, 40, 70, 0.4 + anim.beatFlash * 0.3);
      for (let ch = 0; ch < numChannels; ch++) {
        const x = rowNumW + ch * cellW;
        const name = channels[ch].shortName || channels[ch].name || `CH${ch + 1}`;
        ctx.fillText(name.slice(0, 8), x + 2, ROW_H * 0.5);
      }

      // Separator line
      ctx.strokeStyle = hsl(baseHue, 60, 50, 0.2 + anim.beatFlash * 0.3);
      ctx.lineWidth = 1 + anim.beatFlash * 2;
      ctx.beginPath();
      ctx.moveTo(0, ROW_H);
      ctx.lineTo(CANVAS_W, ROW_H);
      ctx.stroke();

      // ── Rows ──────────────────────────────────────────────────────────
      for (let i = -VISIBLE_ROWS; i <= VISIBLE_ROWS; i++) {
        const row = currentRow + i;
        if (row < 0 || row >= patLen) continue;
        const y = ROW_H + (i + VISIBLE_ROWS) * ROW_H;
        const isCurrent = i === 0;

        // Distance-based depth fade (0 at cursor, 1 at edges)
        const dist = Math.abs(i) / VISIBLE_ROWS;
        // Row shimmer wave — rolling sine phase
        const shimmer = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.4);
        const depthAlpha = (1 - dist * 0.7) * (0.85 + shimmer * 0.15);

        // Current row highlight
        if (isCurrent) {
          const flashBright = 0.25 + anim.beatFlash * 0.6;
          ctx.fillStyle = isPlaying
            ? hsl(baseHue, 70, 55, flashBright)
            : 'rgba(255,255,255,0.1)';
          ctx.fillRect(0, y, CANVAS_W, ROW_H);

          // Extra glow bar on beat
          if (anim.beatFlash > 0.05) {
            ctx.fillStyle = hsl(baseHue, 90, 80, anim.beatFlash * 0.4);
            ctx.fillRect(0, y, CANVAS_W, ROW_H);
          }
        }

        // Row number
        const rnAlpha = isCurrent ? 0.9 : 0.25 * depthAlpha;
        ctx.fillStyle = isCurrent
          ? hsl(baseHue, 60, 90, 0.9 + anim.beatFlash * 0.1)
          : `rgba(255,255,255,${rnAlpha.toFixed(3)})`;
        ctx.fillText(row.toString(16).toUpperCase().padStart(2, '0'), 4, y + ROW_H * 0.5);

        // Cell data
        for (let ch = 0; ch < numChannels; ch++) {
          const cell = channels[ch].rows[row];
          if (!cell) continue;
          const x = rowNumW + ch * cellW;
          const hasNote = cell.note > 0;
          const hasData = hasNote || cell.instrument > 0 || cell.effTyp > 0 || cell.eff > 0;

          if (isCurrent && hasData) {
            // Active notes on current row: frequency-colored
            const noteHue = (baseHue + ch * 30) % 360;
            const noteBright = 80 + anim.beatFlash * 20;
            ctx.fillStyle = hsl(noteHue, 80, noteBright, 0.95);
          } else if (isCurrent) {
            ctx.fillStyle = hsl(baseHue, 30, 80, 0.7);
          } else if (hasNote) {
            ctx.fillStyle = `rgba(255,255,255,${(0.5 * depthAlpha).toFixed(3)})`;
          } else if (hasData) {
            ctx.fillStyle = `rgba(255,255,255,${(0.3 * depthAlpha).toFixed(3)})`;
          } else {
            ctx.fillStyle = `rgba(255,255,255,${(0.15 * depthAlpha).toFixed(3)})`;
          }
          ctx.fillText(fmtCell(cell), x + 2, y + ROW_H * 0.5);
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      bus.disable();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none"
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'transform, opacity',
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          maxWidth: '90vw',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
});

VJPatternOverlay.displayName = 'VJPatternOverlay';
