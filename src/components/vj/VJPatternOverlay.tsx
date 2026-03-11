/**
 * VJPatternOverlay — Living, music-reactive pattern data overlay for VJ view.
 *
 * A holographic tracker display that dances with the music:
 * - 3D CSS perspective with Lissajous orbit + audio-modulated tilt & kick
 * - Beat-triggered glitch: random row displacement, chromatic aberration (RGB split)
 * - Frequency-mapped note colors (sub→red, bass→orange, mid→cyan, high→white)
 * - Smooth sub-row scroll interpolation via TrackerReplayer
 * - Per-channel glow columns, depth fade with shimmer wave
 * - Bass-driven scale pulse, drift, bounce, and character spacing
 * - Trailing ghost rows that fade behind the playhead
 *
 * Uses its own AudioDataBus instance (shared singleton AnalyserNodes, minimal overhead).
 */

import React, { useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useDJStore, type DeckId } from '@stores/useDJStore';
import { AudioDataBus, type VJAudioFrame } from '@engine/vj/AudioDataBus';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getDJEngineIfActive } from '@engine/dj/DJEngine';
import { getToneEngine } from '@engine/ToneEngine';
import type { TrackerCell, Pattern } from '@/types/tracker';

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

// ── VU Meter constants (LED segments extruding from highlight bar) ────────────
const VU_NUM_SEGMENTS = 26;
const VU_SEGMENT_GAP = 4;
const VU_SEGMENT_HEIGHT = 4;
const VU_METER_WIDTH = 28;
const VU_DECAY_RATE = 0.92;

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
  glitchAmount: number;
  glitchSeed: number;
  chromaShift: number;
  trailAlpha: number;
  energyPulse: number;
}

function createAnimState(): AnimState {
  return {
    beatFlash: 0, bassAccum: 0, hueShift: 0,
    tiltKickX: 0, tiltKickY: 0, bounceY: 0,
    prevRow: -1, scrollOffset: 0, time: 0,
    glitchAmount: 0, glitchSeed: 0, chromaShift: 0,
    trailAlpha: 0, energyPulse: 0,
  };
}

// Simple seeded pseudo-random for consistent glitch per frame
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Data source types ────────────────────────────────────────────────────────
export type OverlaySource = 'tracker' | 'deckA' | 'deckB' | 'deckC';

interface PatternSnapshot {
  pattern: Pattern;
  currentRow: number;
  isPlaying: boolean;
  label?: string;
}

/** Extract current pattern data from the given source. Returns null if no data available. */
function getPatternSnapshot(source: OverlaySource): PatternSnapshot | null {
  if (source === 'tracker') {
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const { currentRow, isPlaying } = useTransportStore.getState();
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return null;
    return { pattern, currentRow, isPlaying };
  }

  // DJ deck source
  const deckId = source.replace('deck', '') as DeckId;
  const djEngine = getDJEngineIfActive();
  if (!djEngine) return null;

  const deck = djEngine.getDeck(deckId);
  if (!deck) return null;

  const song = deck.replayer.getSong();
  if (!song || !song.patterns.length) return null;

  const songPos = deck.replayer.getSongPos();
  const patIdx = song.songPositions[songPos] ?? 0;
  const pattern = song.patterns[patIdx];
  if (!pattern) return null;

  const deckState = useDJStore.getState().decks[deckId];
  return {
    pattern,
    currentRow: deck.replayer.getPattPos(),
    isPlaying: deckState.isPlaying,
    label: `Deck ${deckId}`,
  };
}

interface VJPatternOverlayProps {
  source?: OverlaySource;
  /** Visual offset for stacking multiple overlays (0 = centered, 1 = right, -1 = left) */
  offsetX?: number;
}

export const VJPatternOverlay: React.FC<VJPatternOverlayProps> = React.memo(({ source = 'tracker', offsetX = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const busRef = useRef<AudioDataBus | null>(null);
  const animRef = useRef<AnimState>(createAnimState());
  const lastTimeRef = useRef(0);
  const sourceRef = useRef(source);
  const offsetXRef = useRef(offsetX);
  sourceRef.current = source;
  offsetXRef.current = offsetX;
  // Per-channel VU meter levels (decayed each frame)
  const vuLevelsRef = useRef<number[]>([]);
  const vuLastGensRef = useRef<number[]>([]);
  const numChannelsRef = useRef(0);

  // Click on a channel column → toggle mute
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const ch = Math.floor((localX - ROW_NUM_W) / CELL_W);
    if (ch < 0 || ch >= numChannelsRef.current) return;
    const mixer = useMixerStore.getState();
    const current = mixer.channels[ch]?.muted ?? false;
    mixer.setChannelMute(ch, !current);
  }, []);

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
      const snapshot = getPatternSnapshot(sourceRef.current);
      if (!snapshot) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      const { pattern, currentRow, isPlaying } = snapshot;
      const channels = pattern.channels;
      const numChannels = channels.length;
      numChannelsRef.current = numChannels;
      const patLen = pattern.length;

      // Read mute state for visual dimming
      const mixerChannels = useMixerStore.getState().channels;

      const canvasW = ROW_NUM_W + numChannels * CELL_W;
      if (canvas.width !== canvasW) canvas.width = canvasW;

      // ── Read audio ─────────────────────────────────────────────────────
      bus.update();
      const frame = bus.getFrame();

      // ── Update animation state ─────────────────────────────────────────
      const decay = (v: number, rate: number) => v * Math.exp(-rate * dt);

      if (frame.beat) {
        anim.beatFlash = 1;
        anim.hueShift += 25 + Math.random() * 50;
        anim.tiltKickX += (Math.random() - 0.5) * 18;
        anim.tiltKickY += (Math.random() - 0.5) * 14;
        anim.bounceY = 10 + Math.random() * 8;
        anim.glitchAmount = 0.6 + Math.random() * 0.4;
        anim.glitchSeed = Math.random() * 1000;
        anim.chromaShift = 3 + Math.random() * 4;
        anim.trailAlpha = 0.6;
      }

      anim.beatFlash = decay(anim.beatFlash, 6);
      anim.bassAccum = anim.bassAccum * 0.82 + frame.bassEnergy * 0.18;
      anim.tiltKickX = decay(anim.tiltKickX, 4);
      anim.tiltKickY = decay(anim.tiltKickY, 4);
      anim.bounceY = decay(anim.bounceY, 5);
      anim.glitchAmount = decay(anim.glitchAmount, 10);
      anim.chromaShift = decay(anim.chromaShift, 8);
      anim.trailAlpha = decay(anim.trailAlpha, 4);
      anim.energyPulse = anim.energyPulse * 0.9 + (frame.rms * 0.8 + frame.bassEnergy * 0.2) * 0.1;

      // Smooth scroll via replayer audio timeline for sub-row interpolation
      let displayRow = currentRow;
      if (isPlaying) {
        // Use the appropriate replayer based on source
        const curSource = sourceRef.current;
        const replayer = curSource === 'tracker'
          ? getTrackerReplayer()
          : getDJEngineIfActive()?.getDeck(curSource.replace('deck', '') as DeckId)?.replayer;
        if (replayer) {
          const audioTime = Tone.now() + 0.01;
          const audioState = replayer.getStateAtTime(audioTime);
          if (audioState) {
            displayRow = audioState.row;
            const nextState = replayer.getStateAtTime(audioTime + 0.5, true);
            const dur = (nextState && nextState.row !== audioState.row)
              ? nextState.time - audioState.time
              : (2.5 / (useTransportStore.getState().bpm || 125)) * (useTransportStore.getState().speed || 6);
            const progress = Math.min(Math.max((audioTime - audioState.time) / (dur || 0.125), 0), 1);
            anim.scrollOffset = progress * ROW_H;
          } else {
            anim.scrollOffset = 0;
          }
        } else {
          anim.scrollOffset = 0;
        }
      } else {
        anim.scrollOffset = 0;
      }
      anim.prevRow = displayRow;

      // ── 3D transform ──────────────────────────────────────────────────
      // Lissajous orbit — faster, wider, more complex
      const orbitX = Math.sin(t * 0.17) * Math.cos(t * 0.09) * 12 + Math.sin(t * 0.31) * 4;
      const orbitY = Math.sin(t * 0.13) * Math.cos(t * 0.21) * 8 + Math.cos(t * 0.37) * 3;
      const bassTilt = frame.bassEnergy * 10;
      const highShimmer = frame.highEnergy * Math.sin(t * 47) * 3;
      const midSway = frame.midEnergy * Math.sin(t * 7.3) * 4;
      // Dampen 3D tilt when smooth-scrolling to avoid parallax artifacts
      const tiltDampen = (anim.scrollOffset > 0.5) ? 0.15 : 1;
      const rx = (orbitX + bassTilt + anim.tiltKickX + midSway) * tiltDampen;
      const ry = (orbitY + anim.tiltKickY + highShimmer) * tiltDampen;
      const rz = Math.sin(t * 0.07) * 2 + anim.tiltKickX * 0.15;
      const scale = 2.1 + anim.bassAccum * 0.12 + anim.beatFlash * 0.08 + anim.energyPulse * 0.3;
      const driftX = Math.sin(t * 0.09) * 20 + Math.cos(t * 0.23) * 15 + frame.midEnergy * Math.sin(t * 3) * 8 + offsetXRef.current * 180;
      const driftY = Math.sin(t * 0.14) * 12 + anim.bounceY;
      const opacity = 0.8 + frame.rms * 0.2 + anim.beatFlash * 0.15;

      wrap.style.transform =
        `translate(${driftX.toFixed(1)}px, ${driftY.toFixed(1)}px) ` +
        `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) ` +
        `scale(${scale.toFixed(4)})`;
      wrap.style.opacity = Math.min(1, opacity).toFixed(3);

      // ── Canvas glow — dual-layer drop-shadow ──────────────────────────
      const glowRadius = 6 + frame.rms * 20 + anim.beatFlash * 18;
      const glowHue = (bandHue(frame) + anim.hueShift) % 360;
      const innerGlow = `drop-shadow(0 0 ${glowRadius.toFixed(0)}px ${hsl(glowHue, 90, 60, 0.6 + anim.beatFlash * 0.4)})`;
      const outerGlow = `drop-shadow(0 0 ${(glowRadius * 2.5).toFixed(0)}px ${hsl((glowHue + 40) % 360, 70, 40, 0.25 + anim.beatFlash * 0.2)})`;
      canvas.style.filter = `${innerGlow} ${outerGlow}`;

      // ── Draw pattern ──────────────────────────────────────────────────
      ctx.clearRect(0, 0, canvasW, CANVAS_H);

      const rowNumW = ROW_NUM_W;
      const cellW = CELL_W;
      const baseHue = (bandHue(frame) + anim.hueShift) % 360;
      const letterSpacing = anim.bassAccum * 2.5 + anim.beatFlash * 1.5;
      ctx.textBaseline = 'middle';

      // ── Current-row highlight bar (fixed position, no scroll) ────────
      const barY = ROW_H + VISIBLE_ROWS * ROW_H;
      if (isPlaying) {
        const flashBright = 0.45 + anim.beatFlash * 0.55;
        ctx.fillStyle = hsl(baseHue, 80, 55, flashBright);
        ctx.fillRect(0, barY, canvasW, ROW_H);
        if (anim.beatFlash > 0.05) {
          // Bright flash overlay on beat
          ctx.fillStyle = hsl(baseHue, 95, 85, anim.beatFlash * 0.6);
          ctx.fillRect(0, barY, canvasW, ROW_H);
        }
        // Energy-reactive side glow bars
        const sideGlow = frame.rms * 0.3 + anim.beatFlash * 0.2;
        if (sideGlow > 0.05) {
          const grad = ctx.createLinearGradient(0, barY, 0, barY + ROW_H);
          grad.addColorStop(0, hsl(baseHue, 90, 70, sideGlow));
          grad.addColorStop(0.5, hsl(baseHue, 90, 70, 0));
          grad.addColorStop(1, hsl(baseHue, 90, 70, sideGlow * 0.5));
          ctx.fillStyle = grad;
          ctx.fillRect(0, barY - 4, canvasW, ROW_H + 8);
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(0, barY, canvasW, ROW_H);
      }

      // ── Per-channel vertical glow columns ─────────────────────────────
      const bandEnergies = [frame.subEnergy, frame.bassEnergy, frame.midEnergy, frame.highEnergy];
      for (let ch = 0; ch < numChannels; ch++) {
        const bandIdx = ch % 4;
        const energy = bandEnergies[bandIdx];
        if (energy > 0.15) {
          const colX = rowNumW + ch * cellW;
          const colHue = (baseHue + ch * 35) % 360;
          const colAlpha = (energy - 0.15) * 0.25 + anim.beatFlash * 0.08;
          const grad = ctx.createLinearGradient(colX, 0, colX + cellW, 0);
          grad.addColorStop(0, hsl(colHue, 70, 50, 0));
          grad.addColorStop(0.3, hsl(colHue, 70, 50, colAlpha));
          grad.addColorStop(0.7, hsl(colHue, 70, 50, colAlpha));
          grad.addColorStop(1, hsl(colHue, 70, 50, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(colX, 0, cellW, CANVAS_H);
        }
      }

      // ── Scrolled content ────────────────────────────────────────────
      ctx.save();
      ctx.translate(0, -anim.scrollOffset);

      // Channel headers
      ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
      if (letterSpacing > 0.1) ctx.letterSpacing = `${letterSpacing.toFixed(1)}px`;
      ctx.fillStyle = hsl(baseHue, 50, 85, 0.8 + anim.beatFlash * 0.2);
      for (let ch = 0; ch < numChannels; ch++) {
        const x = rowNumW + ch * cellW;
        const name = channels[ch].shortName || channels[ch].name || `CH${ch + 1}`;
        ctx.fillText(name.slice(0, 8), x + 2, ROW_H * 0.5);
      }

      // Separator — reactive thickness + glow
      ctx.strokeStyle = hsl(baseHue, 70, 60, 0.5 + anim.beatFlash * 0.4);
      ctx.lineWidth = 1 + anim.beatFlash * 3 + frame.rms * 2;
      ctx.shadowColor = hsl(baseHue, 80, 60, 0.6);
      ctx.shadowBlur = 4 + anim.beatFlash * 8;
      ctx.beginPath();
      ctx.moveTo(0, ROW_H);
      ctx.lineTo(canvasW, ROW_H);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── Rows ──────────────────────────────────────────────────────────
      const doChroma = anim.chromaShift > 0.3;
      const chromaOff = anim.chromaShift;

      for (let i = -VISIBLE_ROWS; i <= VISIBLE_ROWS; i++) {
        const row = displayRow + i;
        if (row < 0 || row >= patLen) continue;
        const baseY = ROW_H + (i + VISIBLE_ROWS) * ROW_H;
        const isCurrent = i === 0;

        // Glitch: displace row horizontally on beat
        let glitchX = 0;
        if (anim.glitchAmount > 0.05) {
          const r = pseudoRandom(anim.glitchSeed + i * 17.3);
          if (r > 0.6) {
            glitchX = (pseudoRandom(anim.glitchSeed + i * 31.7) - 0.5) * 40 * anim.glitchAmount;
          }
        }

        const dist = Math.abs(i) / VISIBLE_ROWS;
        // Wave distortion along rows
        const wave = Math.sin(t * 4 + i * 0.5) * frame.midEnergy * 2;
        const shimmer = 0.5 + 0.5 * Math.sin(t * 3.5 + i * 0.4);
        const depthAlpha = (1 - dist * 0.55) * (0.85 + shimmer * 0.15);

        // Ghost trails: recently-passed rows get an echo
        const trailBoost = (i < 0 && i > -4 && anim.trailAlpha > 0.05)
          ? anim.trailAlpha * (1 + i / 4) * 0.3 : 0;

        const y = baseY + wave;

        // Row number
        const rnAlpha = isCurrent ? 1.0 : (0.5 + trailBoost) * depthAlpha;
        ctx.fillStyle = isCurrent
          ? hsl(baseHue, 70, 92, 0.95 + anim.beatFlash * 0.05)
          : `rgba(255,255,255,${rnAlpha.toFixed(3)})`;
        ctx.fillText(row.toString(16).toUpperCase().padStart(2, '0'), 4 + glitchX, y + ROW_H * 0.5);

        for (let ch = 0; ch < numChannels; ch++) {
          const cell = channels[ch].rows[row];
          if (!cell) continue;
          const x = rowNumW + ch * cellW + glitchX;
          const hasNote = cell.note > 0;
          const hasData = hasNote || cell.instrument > 0 || cell.effTyp > 0 || cell.eff > 0;
          const text = fmtCell(cell);

          // Color selection — richer palette
          let fillH = baseHue, fillS = 30, fillL = 70, fillA = 0.3 * depthAlpha;
          if (isCurrent && hasData) {
            fillH = (baseHue + ch * 35) % 360;
            fillS = 85;
            fillL = 82 + anim.beatFlash * 18;
            fillA = 0.97;
          } else if (isCurrent) {
            fillS = 40; fillL = 80; fillA = 0.75;
          } else if (hasNote) {
            fillH = (baseHue + ch * 35) % 360;
            fillS = 55 + frame.rms * 30;
            fillL = 72;
            fillA = (0.8 + trailBoost) * depthAlpha;
          } else if (hasData) {
            fillA = (0.55 + trailBoost) * depthAlpha;
          }

          // Chromatic aberration on beat — draw R and B offsets, then main
          if (doChroma && (isCurrent || hasNote)) {
            ctx.globalAlpha = fillA * 0.35;
            ctx.fillStyle = hsl(fillH - 40, fillS, fillL, 1);
            ctx.fillText(text, x + 2 - chromaOff, y + ROW_H * 0.5);
            ctx.fillStyle = hsl(fillH + 40, fillS, fillL, 1);
            ctx.fillText(text, x + 2 + chromaOff, y + ROW_H * 0.5);
            ctx.globalAlpha = 1;
          }

          ctx.fillStyle = hsl(fillH, fillS, fillL, fillA);
          ctx.fillText(text, x + 2, y + ROW_H * 0.5);
        }
      }

      ctx.restore();

      // ── Per-channel VU meters (LED segments from highlight bar, mirrored) ─
      {
        while (vuLevelsRef.current.length < numChannels) vuLevelsRef.current.push(0);
        while (vuLastGensRef.current.length < numChannels) vuLastGensRef.current.push(0);

        let realtimeLevels: number[] | null = null;
        let triggerLevels: number[] = [];
        let triggerGens: number[] = [];
        try {
          const engine = getToneEngine();
          realtimeLevels = engine.getChannelLevels(numChannels);
          triggerLevels = engine.getChannelTriggerLevels(numChannels);
          triggerGens = engine.getChannelTriggerGenerations(numChannels);
        } catch { /* engine not ready */ }

        // VU color matches the current-row highlight bar
        const vuAlpha = 0.7 + anim.beatFlash * 0.3;

        for (let ch = 0; ch < numChannels; ch++) {
          const stagger = ch * 0.012;

          if (!isPlaying) {
            vuLevelsRef.current[ch] = 0;
          } else if (realtimeLevels) {
            const target = realtimeLevels[ch] || 0;
            if (target > vuLevelsRef.current[ch]) {
              vuLevelsRef.current[ch] = target;
            } else {
              vuLevelsRef.current[ch] *= (VU_DECAY_RATE - stagger);
              if (vuLevelsRef.current[ch] < 0.01) vuLevelsRef.current[ch] = 0;
            }
          } else {
            const isNew = triggerGens[ch] !== vuLastGensRef.current[ch];
            if (isNew && triggerLevels[ch] > 0) {
              vuLevelsRef.current[ch] = triggerLevels[ch];
              vuLastGensRef.current[ch] = triggerGens[ch];
            } else {
              vuLevelsRef.current[ch] *= (VU_DECAY_RATE - stagger);
              if (vuLevelsRef.current[ch] < 0.01) vuLevelsRef.current[ch] = 0;
            }
          }

          const level = vuLevelsRef.current[ch];
          if (level < 0.01) continue;

          const centerX = rowNumW + ch * cellW + cellW / 2;
          const meterX = Math.round(centerX - VU_METER_WIDTH / 2);
          const activeSegs = Math.round(level * VU_NUM_SEGMENTS);
          const segStep = VU_SEGMENT_HEIGHT + VU_SEGMENT_GAP;

          for (let s = 0; s < activeSegs; s++) {
            const ratio = s / (VU_NUM_SEGMENTS - 1);
            const fade = vuAlpha * (1 - ratio * 0.4);
            ctx.fillStyle = hsl(baseHue, 80, 55 + ratio * 20, fade);

            // Upward from bar top
            const upY = barY - (s + 1) * segStep;
            ctx.fillRect(meterX, Math.round(upY), VU_METER_WIDTH, VU_SEGMENT_HEIGHT);

            // Mirrored downward from bar bottom
            const downY = barY + ROW_H + s * segStep;
            ctx.fillRect(meterX, Math.round(downY), VU_METER_WIDTH, VU_SEGMENT_HEIGHT);
          }
        }
      }

      // ── Vignette edges ─────────────────────────────────────────────────
      const vigGrad = ctx.createRadialGradient(canvasW / 2, CANVAS_H / 2, canvasW * 0.3, canvasW / 2, CANVAS_H / 2, canvasW * 0.7);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, `rgba(0,0,0,${(0.3 + anim.beatFlash * 0.15).toFixed(3)})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, canvasW, CANVAS_H);

      // ── Muted channel overlay ────────────────────────────────────────
      for (let ch = 0; ch < numChannels; ch++) {
        if (mixerChannels[ch]?.muted) {
          const colX = rowNumW + ch * cellW;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(colX, 0, cellW, CANVAS_H);
          // "MUTE" label
          ctx.save();
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = 'rgba(255, 80, 80, 0.7)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('MUTE', colX + cellW / 2, ROW_H * 0.5);
          ctx.restore();
        }
      }

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
          style={{ maxWidth: '90vw', pointerEvents: 'auto', cursor: 'pointer' }}
          onClick={handleCanvasClick}
        />
      </div>
    </div>
  );
});

VJPatternOverlay.displayName = 'VJPatternOverlay';
