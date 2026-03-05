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
import * as Tone from 'tone';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { AudioDataBus, type VJAudioFrame } from '@engine/vj/AudioDataBus';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
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
const ROW_NUM_W = 28;
const CELL_W = 120;
const CANVAS_H = (VISIBLE_ROWS * 2 + 3) * ROW_H;

// ── Color helpers ────────────────────────────────────────────────────────────
function hsl(h: number, s: number, l: number, a: number): string {
  return `hsla(${h | 0},${s | 0}%,${l | 0}%,${a.toFixed(3)})`;
}

function bandHue(frame: VJAudioFrame): number {
  const bands = [frame.subEnergy, frame.bassEnergy, frame.midEnergy, frame.highEnergy];
  const hues = [0, 30, 180, 270];
  let maxE = 0, maxI = 0;
  for (let i = 0; i < 4; i++) {
    if (bands[i] > maxE) { maxE = bands[i]; maxI = i; }
  }
  return hues[maxI];
}

// ── Animation state ──────────────────────────────────────────────────────────
interface AnimState {
  beatFlash: number;
  bassAccum: number;
  hueShift: number;
  tiltKickX: number;
  tiltKickY: number;
  bounceY: number;
  prevRow: number;
  scrollOffset: number;
  time: number;
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

    const bus = new AudioDataBus();
    bus.enable();
    busRef.current = bus;

    const render = (timestamp: number) => {
      const dt = Math.min((timestamp - (lastTimeRef.current || timestamp)) / 1000, 0.05);
      lastTimeRef.current = timestamp;
      const anim = animRef.current;
      anim.time += dt;
      const t = anim.time;

      // ── Read stores ────────────────────────────────────────────────────
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

      const canvasW = ROW_NUM_W + numChannels * CELL_W;
      if (canvas.width !== canvasW) canvas.width = canvasW;

      // ── Read audio ─────────────────────────────────────────────────────
      bus.update();
      const frame = bus.getFrame();

      // ── Update animation state ─────────────────────────────────────────
      const decay = (v: number, rate: number) => v * Math.exp(-rate * dt);

      if (frame.beat) {
        anim.beatFlash = 1;
        anim.hueShift += 20 + Math.random() * 40;
        anim.tiltKickX += (Math.random() - 0.5) * 12;
        anim.tiltKickY += (Math.random() - 0.5) * 8;
        anim.bounceY = 6 + Math.random() * 4;
      }

      anim.beatFlash = decay(anim.beatFlash, 8);
      anim.bassAccum = anim.bassAccum * 0.85 + frame.bassEnergy * 0.15;
      anim.tiltKickX = decay(anim.tiltKickX, 5);
      anim.tiltKickY = decay(anim.tiltKickY, 5);
      anim.bounceY = decay(anim.bounceY, 6);

      // Smooth scroll — use replayer audio timeline for sub-row interpolation
      // (same approach as PixiPatternEditor for jitter-free scrolling)
      const { smoothScrolling } = useTransportStore.getState();
      if (smoothScrolling && isPlaying) {
        const replayer = getTrackerReplayer();
        const audioTime = Tone.now() + 0.01;
        const audioState = replayer.getStateAtTime(audioTime);
        if (audioState) {
          // Compute row duration from replayer or estimate from BPM
          const nextState = replayer.getStateAtTime(audioTime + 0.5, true);
          const dur = (nextState && nextState.row !== audioState.row)
            ? nextState.time - audioState.time
            : (2.5 / useTransportStore.getState().bpm) * useTransportStore.getState().speed;
          const progress = Math.min(Math.max((audioTime - audioState.time) / (dur || 0.125), 0), 1);
          anim.scrollOffset = progress * ROW_H;
        } else {
          anim.scrollOffset = 0;
        }
      } else {
        anim.scrollOffset = 0;
      }
      anim.prevRow = currentRow;

      // ── 3D transform ──────────────────────────────────────────────────
      // Lissajous orbit
      const orbitX = Math.sin(t * 0.13) * Math.cos(t * 0.07) * 8;
      const orbitY = Math.sin(t * 0.11) * Math.cos(t * 0.17) * 5;
      const bassTilt = frame.bassEnergy * 6;
      const shimmerZ = frame.highEnergy * Math.sin(t * 37) * 1.5;
      const rx = orbitX + bassTilt + anim.tiltKickX;
      const ry = orbitY + anim.tiltKickY + shimmerZ;
      const scale = 2.1 + anim.bassAccum * 0.06 + anim.beatFlash * 0.03;
      const driftX = Math.sin(t * 0.09) * 15 + Math.cos(t * 0.23) * 10;
      const driftY = Math.sin(t * 0.14) * 8 + anim.bounceY;
      const opacity = 0.85 + frame.rms * 0.15 + anim.beatFlash * 0.1;

      wrap.style.transform =
        `translate(${driftX.toFixed(1)}px, ${driftY.toFixed(1)}px) ` +
        `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) ` +
        `scale(${scale.toFixed(4)})`;
      wrap.style.opacity = Math.min(1, opacity).toFixed(3);

      // ── Canvas glow ────────────────────────────────────────────────────
      const glowRadius = 4 + frame.rms * 16 + anim.beatFlash * 12;
      const glowHue = (bandHue(frame) + anim.hueShift) % 360;
      canvas.style.filter = `drop-shadow(0 0 ${glowRadius.toFixed(0)}px ${hsl(glowHue, 80, 60, 0.5 + anim.beatFlash * 0.3)})`;

      // ── Draw pattern ──────────────────────────────────────────────────
      ctx.clearRect(0, 0, canvasW, CANVAS_H);

      const rowNumW = ROW_NUM_W;
      const cellW = CELL_W;
      const baseHue = (bandHue(frame) + anim.hueShift) % 360;
      const letterSpacing = anim.bassAccum * 1.5;
      ctx.textBaseline = 'middle';

      // ── Current-row highlight bar (fixed position, no scroll) ────────
      const barY = ROW_H + VISIBLE_ROWS * ROW_H;
      if (isPlaying) {
        const flashBright = 0.4 + anim.beatFlash * 0.5;
        ctx.fillStyle = hsl(baseHue, 70, 55, flashBright);
        ctx.fillRect(0, barY, canvasW, ROW_H);
        if (anim.beatFlash > 0.05) {
          ctx.fillStyle = hsl(baseHue, 90, 80, anim.beatFlash * 0.4);
          ctx.fillRect(0, barY, canvasW, ROW_H);
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(0, barY, canvasW, ROW_H);
      }

      // ── Scrolled content ────────────────────────────────────────────
      ctx.save();
      ctx.translate(0, -anim.scrollOffset);

      // Channel headers
      ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
      if (letterSpacing > 0.1) ctx.letterSpacing = `${letterSpacing.toFixed(1)}px`;
      ctx.fillStyle = hsl(baseHue, 40, 80, 0.7 + anim.beatFlash * 0.3);
      for (let ch = 0; ch < numChannels; ch++) {
        const x = rowNumW + ch * cellW;
        const name = channels[ch].shortName || channels[ch].name || `CH${ch + 1}`;
        ctx.fillText(name.slice(0, 8), x + 2, ROW_H * 0.5);
      }

      // Separator
      ctx.strokeStyle = hsl(baseHue, 60, 50, 0.4 + anim.beatFlash * 0.3);
      ctx.lineWidth = 1 + anim.beatFlash * 2;
      ctx.beginPath();
      ctx.moveTo(0, ROW_H);
      ctx.lineTo(canvasW, ROW_H);
      ctx.stroke();

      // ── Rows ──────────────────────────────────────────────────────────
      for (let i = -VISIBLE_ROWS; i <= VISIBLE_ROWS; i++) {
        const row = currentRow + i;
        if (row < 0 || row >= patLen) continue;
        const y = ROW_H + (i + VISIBLE_ROWS) * ROW_H;
        const isCurrent = i === 0;

        const dist = Math.abs(i) / VISIBLE_ROWS;
        const shimmer = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.4);
        const depthAlpha = (1 - dist * 0.5) * (0.9 + shimmer * 0.1);

        const rnAlpha = isCurrent ? 1.0 : 0.45 * depthAlpha;
        ctx.fillStyle = isCurrent
          ? hsl(baseHue, 60, 90, 0.9 + anim.beatFlash * 0.1)
          : `rgba(255,255,255,${rnAlpha.toFixed(3)})`;
        ctx.fillText(row.toString(16).toUpperCase().padStart(2, '0'), 4, y + ROW_H * 0.5);

        for (let ch = 0; ch < numChannels; ch++) {
          const cell = channels[ch].rows[row];
          if (!cell) continue;
          const x = rowNumW + ch * cellW;
          const hasNote = cell.note > 0;
          const hasData = hasNote || cell.instrument > 0 || cell.effTyp > 0 || cell.eff > 0;

          if (isCurrent && hasData) {
            const noteHue = (baseHue + ch * 30) % 360;
            const noteBright = 80 + anim.beatFlash * 20;
            ctx.fillStyle = hsl(noteHue, 80, noteBright, 0.95);
          } else if (isCurrent) {
            ctx.fillStyle = hsl(baseHue, 30, 80, 0.7);
          } else if (hasNote) {
            ctx.fillStyle = `rgba(255,255,255,${(0.75 * depthAlpha).toFixed(3)})`;
          } else if (hasData) {
            ctx.fillStyle = `rgba(255,255,255,${(0.55 * depthAlpha).toFixed(3)})`;
          } else {
            ctx.fillStyle = `rgba(255,255,255,${(0.3 * depthAlpha).toFixed(3)})`;
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
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        ref={wrapRef}
        style={{
          transformStyle: 'preserve-3d',
          willChange: 'transform, opacity',
        }}
      >
        <canvas
          ref={canvasRef}
          width={ROW_NUM_W + 4 * CELL_W}
          height={CANVAS_H}
          style={{ maxWidth: '90vw' }}
        />
      </div>
    </div>
  );
});

VJPatternOverlay.displayName = 'VJPatternOverlay';
