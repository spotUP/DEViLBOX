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

// Formats that have genuine native pattern data (notes/instruments/effects).
// Chip-dump / CPU-code / UADE catch-all formats generate synthesized/stub patterns
// from register writes or chip RAM reads — those are NOT real pattern data.
const REAL_PATTERN_FORMATS = new Set([
  // Classic tracker formats
  'MOD', 'XM', 'IT', 'S3M', 'FUR',
  // Amiga tracker formats
  'HVL', 'AHX', 'OKT', 'MED', 'DIGI', 'DBM', 'FC', 'ML',
  'SFX', 'SMON', 'SIDMON2', 'FRED', 'DMUG',
  // Exotic Amiga tracker formats with real note data
  '667', '669', 'AMOSMusicBank', 'AON', 'AST', 'BD', 'C67',
  'DigitalSymphony', 'DM1', 'DM2', 'DSM', 'DSS', 'DTM',
  'FaceTheMusic', 'FMT', 'GameMusicCreator', 'GDM', 'GMC',
  'GraoumfTracker', 'GraoumfTracker2', 'ICE', 'IMF', 'IMS', 'IS10', 'IS20',
  'JamCracker', 'KRIS', 'MFP', 'MTM', 'MUS', 'PLM', 'PTM',
  'PumaTracker', 'QuadraComposer', 'RTM', 'SonicArranger', 'STK', 'STM',
  'STP', 'Symphonie', 'TCBTracker', 'ULT', 'UNIC',
  // PC tracker formats
  'AMS', 'DMF', 'MadTracker2', 'XRNS',
  // TFMX has real sequence data
  'TFMX',
  // MDX has native note data
  'MDX',
]);

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function fmtNote(note: number): string {
  if (!note || note <= 0) return '\u00B7\u00B7\u00B7';
  if (note === 97 || note === 255) return '===';
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[(note - 1) % 12]}${octave}`;
}

function fmtHex(val: number, digits: number): string {
  if (!val || val <= 0) return '\u00B7'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

function fmtEffect(typ: number, param: number): string {
  if ((!typ || typ <= 0) && (!param || param <= 0)) return '\u00B7\u00B7\u00B7';
  const t = (typ && typ > 0) ? typ.toString(16).toUpperCase() : '\u00B7';
  const p = (param && param > 0) ? param.toString(16).toUpperCase().padStart(2, '0') : '\u00B7\u00B7';
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
  replayerRow: number;
  replayerPatIdx: number;
}

function createAnimState(): AnimState {
  return {
    beatFlash: 0, bassAccum: 0, hueShift: 0,
    tiltKickX: 0, tiltKickY: 0, bounceY: 0,
    prevRow: -1, scrollOffset: 0, time: 0,
    glitchAmount: 0, glitchSeed: 0, chromaShift: 0,
    trailAlpha: 0, energyPulse: 0,
    replayerRow: -1, replayerPatIdx: -1,
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

/** Check if a pattern contains any real note/instrument/effect data */
function hasRealData(pattern: Pattern): boolean {
  for (const ch of pattern.channels) {
    for (const row of ch.rows) {
      if ((row.note && row.note > 0) || (row.instrument && row.instrument > 0) ||
          (row.effTyp && row.effTyp > 0) || (row.eff && row.eff > 0)) {
        return true;
      }
    }
  }
  return false;
}

/** Extract current pattern data from the given source. Returns null if no data available. */
function getPatternSnapshot(source: OverlaySource): PatternSnapshot | null {
  if (source === 'tracker') {
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const { currentRow, isPlaying } = useTransportStore.getState();
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return null;
    // Skip formats that generate fake/synthesized pattern data
    const sourceFormat = pattern.importMetadata?.sourceFormat;
    if (sourceFormat && !REAL_PATTERN_FORMATS.has(sourceFormat)) return null;
    if (!hasRealData(pattern)) return null;
    return { pattern, currentRow, isPlaying };
  }

  // DJ deck source — read position from store (updated by DJDeck rAF loop)
  const deckId = source.replace('deck', '') as DeckId;
  const deckState = useDJStore.getState().decks[deckId];
  if (!deckState.isPlaying) return null;

  const djEngine = getDJEngineIfActive();
  if (!djEngine) return null;

  const deck = djEngine.getDeck(deckId);
  if (!deck) return null;

  const song = deck.replayer.getSong();
  if (!song || !song.patterns.length) return null;

  // Skip formats that generate fake/synthesized pattern data
  if (!REAL_PATTERN_FORMATS.has(song.format)) return null;

  // Use store's songPos/pattPos — kept current by DJDeck polling loop
  const patIdx = song.songPositions[deckState.songPos] ?? 0;
  const pattern = song.patterns[patIdx];
  if (!pattern || !hasRealData(pattern)) return null;

  return {
    pattern,
    currentRow: deckState.pattPos,
    isPlaying: true,
    label: `Deck ${deckId}`,
  };
}

interface VJPatternOverlayProps {
  /** Data sources to display (rendered side by side on one canvas) */
  sources?: OverlaySource[];
  /** DJ crossfader position 0..1 (0=deck A, 1=deck B). Modulates per-deck opacity. */
  crossfader?: number;
}

const GAP_PX = 16; // gap between side-by-side source sections

export const VJPatternOverlay: React.FC<VJPatternOverlayProps> = React.memo(({ sources = ['tracker'] as OverlaySource[], crossfader = 0.5 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const busRef = useRef<AudioDataBus | null>(null);
  const animRef = useRef<AnimState>(createAnimState());
  const lastTimeRef = useRef(0);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const crossfaderRef = useRef(crossfader);
  crossfaderRef.current = crossfader;
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

    // Reusable per-frame arrays to reduce GC pressure
    const snapshotBuf: Array<{ snapshot: PatternSnapshot; source: OverlaySource }> = [];
    const layoutBuf: Array<{ xBase: number; sectionW: number; numChannels: number }> = [];

    const render = (timestamp: number) => {
      const dt = Math.min((timestamp - (lastTimeRef.current || timestamp)) / 1000, 0.05);
      lastTimeRef.current = timestamp;
      const anim = animRef.current;
      anim.time += dt;
      const t = anim.time;

      // ── Gather snapshots from all sources ────────────────────────────
      const allSources = sourcesRef.current;
      snapshotBuf.length = 0;
      for (const src of allSources) {
        const snap = getPatternSnapshot(src);
        if (snap) snapshotBuf.push({ snapshot: snap, source: src });
      }
      // No active sources with data — hide overlay (clear canvas)
      if (snapshotBuf.length === 0) {
        ctx.clearRect(0, 0, canvas.width, CANVAS_H);
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      const snapshots = snapshotBuf;

      // Compute total canvas width (all sources side by side)
      let totalW = 0;
      layoutBuf.length = 0;
      for (const { snapshot } of snapshots) {
        const numCh = snapshot.pattern.channels.length;
        const sectionW = ROW_NUM_W + numCh * CELL_W;
        layoutBuf.push({ xBase: totalW, sectionW, numChannels: numCh });
        totalW += sectionW;
      }
      // Add gaps between sections
      if (snapshots.length > 1) totalW += (snapshots.length - 1) * GAP_PX;
      // Recalculate xBase with gaps
      if (snapshots.length > 1) {
        let x = 0;
        for (let i = 0; i < layoutBuf.length; i++) {
          layoutBuf[i].xBase = x;
          x += layoutBuf[i].sectionW + GAP_PX;
        }
      }

      const canvasW = totalW;
      if (canvas.width !== canvasW) canvas.width = canvasW;

      // Track total channels for click handler
      numChannelsRef.current = layoutBuf.reduce((s, l) => s + l.numChannels, 0);

      // Check if any source is playing
      const anyPlaying = snapshots.some(s => s.snapshot.isPlaying);

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

      // Sub-row scroll + accurate row tracking for tracker source
      // Uses the replayer's time-stamped state ring instead of the throttled store
      // to avoid stutter when the tracker view is unmounted (VJ view active).
      anim.replayerRow = -1;
      anim.replayerPatIdx = -1;
      if (anyPlaying && snapshots[0].source === 'tracker') {
        const replayer = getTrackerReplayer();
        const audioTime = Tone.now() + 0.01;
        const audioState = replayer.getStateAtTime(audioTime);
        if (audioState) {
          anim.replayerRow = audioState.row;
          anim.replayerPatIdx = audioState.pattern;
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

      // ── 3D transform (shared for all sources) ────────────────────────
      const orbitX = Math.sin(t * 0.17) * Math.cos(t * 0.09) * 12 + Math.sin(t * 0.31) * 4;
      const orbitY = Math.sin(t * 0.13) * Math.cos(t * 0.21) * 8 + Math.cos(t * 0.37) * 3;
      const bassTilt = frame.bassEnergy * 10;
      const highShimmer = frame.highEnergy * Math.sin(t * 47) * 3;
      const midSway = frame.midEnergy * Math.sin(t * 7.3) * 4;
      const tiltDampen = (anim.scrollOffset > 0.5) ? 0.15 : 1;
      const rx = (orbitX + bassTilt + anim.tiltKickX + midSway) * tiltDampen;
      const ry = (orbitY + anim.tiltKickY + highShimmer) * tiltDampen;
      const rz = Math.sin(t * 0.07) * 2 + anim.tiltKickX * 0.15;
      const scale = 2.1 + anim.bassAccum * 0.12 + anim.beatFlash * 0.08 + anim.energyPulse * 0.3;
      const driftX = Math.sin(t * 0.09) * 20 + Math.cos(t * 0.23) * 15 + frame.midEnergy * Math.sin(t * 3) * 8;
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

      // ── Clear & draw all source sections ──────────────────────────────
      ctx.clearRect(0, 0, canvasW, CANVAS_H);
      const baseHue = (bandHue(frame) + anim.hueShift) % 360;
      const letterSpacing = anim.bassAccum * 2.5 + anim.beatFlash * 1.5;
      ctx.textBaseline = 'middle';
      const rowNumW = ROW_NUM_W;
      const cellW = CELL_W;
      const barY = ROW_H + VISIBLE_ROWS * ROW_H;

      // Read mute state for visual dimming (tracker only)
      const mixerChannels = useMixerStore.getState().channels;

      for (let si = 0; si < snapshots.length; si++) {
        const { snapshot, source: src } = snapshots[si];
        const { currentRow, isPlaying: srcPlaying, label: sourceLabel } = snapshot;
        const { xBase, numChannels } = layoutBuf[si];

        // For tracker source, use the replayer's pattern index for accuracy
        let pattern = snapshot.pattern;
        if (src === 'tracker' && anim.replayerPatIdx >= 0) {
          const patterns = useTrackerStore.getState().patterns;
          const replayerPat = patterns[anim.replayerPatIdx];
          if (replayerPat) pattern = replayerPat;
        }
        const channels = pattern.channels;
        const patLen = pattern.length;
        const sectionW = layoutBuf[si].sectionW;

        // Crossfader-driven opacity: 0=deckA, 0.5=equal, 1=deckB
        // Tracker source is unaffected (always 1.0)
        const cf = crossfaderRef.current;
        let sourceOpacity = 1.0;
        if (src === 'deckA') {
          sourceOpacity = 1 - cf;       // 1.0 at cf=0, 0.0 at cf=1
        } else if (src === 'deckB') {
          sourceOpacity = cf;            // 0.0 at cf=0, 1.0 at cf=1
        }
        // Minimum floor so the dim deck doesn't vanish entirely
        sourceOpacity = 0.08 + sourceOpacity * 0.92;

        // Display row: for tracker source, prefer the replayer's accurate row
        // over the throttled store value (avoids stutter when tracker view is unmounted)
        const displayRow = (src === 'tracker' && anim.replayerRow >= 0)
          ? anim.replayerRow
          : currentRow;

        ctx.save();
        ctx.translate(xBase, 0);
        ctx.globalAlpha = sourceOpacity;

        // ── Current-row highlight bar ────────────────────────────────
        if (srcPlaying) {
          const flashBright = 0.45 + anim.beatFlash * 0.55;
          ctx.fillStyle = hsl(baseHue, 80, 55, flashBright);
          ctx.fillRect(0, barY, sectionW, ROW_H);
          if (anim.beatFlash > 0.05) {
            ctx.fillStyle = hsl(baseHue, 95, 85, anim.beatFlash * 0.6);
            ctx.fillRect(0, barY, sectionW, ROW_H);
          }
          const sideGlow = frame.rms * 0.3 + anim.beatFlash * 0.2;
          if (sideGlow > 0.05) {
            const grad = ctx.createLinearGradient(0, barY, 0, barY + ROW_H);
            grad.addColorStop(0, hsl(baseHue, 90, 70, sideGlow));
            grad.addColorStop(0.5, hsl(baseHue, 90, 70, 0));
            grad.addColorStop(1, hsl(baseHue, 90, 70, sideGlow * 0.5));
            ctx.fillStyle = grad;
            ctx.fillRect(0, barY - 4, sectionW, ROW_H + 8);
          }
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(0, barY, sectionW, ROW_H);
        }

        // ── Per-channel vertical glow columns ────────────────────────
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

        // ── Scrolled content ─────────────────────────────────────────
        ctx.save();
        ctx.translate(0, -(src === 'tracker' ? anim.scrollOffset : 0));

        // Channel headers
        ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
        if (letterSpacing > 0.1) ctx.letterSpacing = `${letterSpacing.toFixed(1)}px`;
        // Deck source label
        if (sourceLabel) {
          ctx.save();
          ctx.font = 'bold 13px "Berkeley Mono", "JetBrains Mono", monospace';
          ctx.fillStyle = hsl(baseHue, 80, 90, 0.9);
          ctx.textAlign = 'right';
          ctx.fillText(sourceLabel, sectionW - 4, ROW_H * 0.5);
          ctx.restore();
          ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
          if (letterSpacing > 0.1) ctx.letterSpacing = `${letterSpacing.toFixed(1)}px`;
        }
        ctx.fillStyle = hsl(baseHue, 50, 85, 0.8 + anim.beatFlash * 0.2);
        for (let ch = 0; ch < numChannels; ch++) {
          const x = rowNumW + ch * cellW;
          const name = channels[ch].shortName || channels[ch].name || `CH${ch + 1}`;
          ctx.fillText(name.slice(0, 8), x + 2, ROW_H * 0.5);
        }

        // Separator
        ctx.strokeStyle = hsl(baseHue, 70, 60, 0.5 + anim.beatFlash * 0.4);
        ctx.lineWidth = 1 + anim.beatFlash * 3 + frame.rms * 2;
        ctx.shadowColor = hsl(baseHue, 80, 60, 0.6);
        ctx.shadowBlur = 4 + anim.beatFlash * 8;
        ctx.beginPath();
        ctx.moveTo(0, ROW_H);
        ctx.lineTo(sectionW, ROW_H);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Rows ─────────────────────────────────────────────────────
        const doChroma = anim.chromaShift > 0.3;
        const chromaOff = anim.chromaShift;

        for (let i = -VISIBLE_ROWS; i <= VISIBLE_ROWS; i++) {
          const row = displayRow + i;
          if (row < 0 || row >= patLen) continue;
          const baseY = ROW_H + (i + VISIBLE_ROWS) * ROW_H;
          const isCurrent = i === 0;

          let glitchX = 0;
          if (anim.glitchAmount > 0.05) {
            const r = pseudoRandom(anim.glitchSeed + i * 17.3);
            if (r > 0.6) {
              glitchX = (pseudoRandom(anim.glitchSeed + i * 31.7) - 0.5) * 40 * anim.glitchAmount;
            }
          }

          const dist = Math.abs(i) / VISIBLE_ROWS;
          const wave = Math.sin(t * 4 + i * 0.5) * frame.midEnergy * 2;
          const shimmer = 0.5 + 0.5 * Math.sin(t * 3.5 + i * 0.4);
          const depthAlpha = (1 - dist * 0.55) * (0.85 + shimmer * 0.15);
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

            if (doChroma && (isCurrent || hasNote)) {
              ctx.globalAlpha = fillA * 0.35 * sourceOpacity;
              ctx.fillStyle = hsl(fillH - 40, fillS, fillL, 1);
              ctx.fillText(text, x + 2 - chromaOff, y + ROW_H * 0.5);
              ctx.fillStyle = hsl(fillH + 40, fillS, fillL, 1);
              ctx.fillText(text, x + 2 + chromaOff, y + ROW_H * 0.5);
              ctx.globalAlpha = sourceOpacity;
            }

            ctx.fillStyle = hsl(fillH, fillS, fillL, fillA);
            ctx.fillText(text, x + 2, y + ROW_H * 0.5);
          }
        }

        ctx.restore(); // end scrolled content

        // ── Per-channel VU meters (tracker source only) ──────────────
        if (src === 'tracker') {
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

          const vuAlpha = 0.7 + anim.beatFlash * 0.3;
          for (let ch = 0; ch < numChannels; ch++) {
            const stagger = ch * 0.012;
            if (!srcPlaying) {
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
              const upY = barY - (s + 1) * segStep;
              ctx.fillRect(meterX, Math.round(upY), VU_METER_WIDTH, VU_SEGMENT_HEIGHT);
              const downY = barY + ROW_H + s * segStep;
              ctx.fillRect(meterX, Math.round(downY), VU_METER_WIDTH, VU_SEGMENT_HEIGHT);
            }
          }
        }

        // ── Muted channel overlay (tracker only) ─────────────────────
        if (src === 'tracker') {
          for (let ch = 0; ch < numChannels; ch++) {
            if (mixerChannels[ch]?.muted) {
              const colX = rowNumW + ch * cellW;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.fillRect(colX, 0, cellW, CANVAS_H);
              ctx.save();
              ctx.font = 'bold 11px monospace';
              ctx.fillStyle = 'rgba(255, 80, 80, 0.7)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('MUTE', colX + cellW / 2, ROW_H * 0.5);
              ctx.restore();
            }
          }
        }

        ctx.restore(); // end section translate
      } // end source loop

      // ── Vignette edges ─────────────────────────────────────────────────
      const vigGrad = ctx.createRadialGradient(canvasW / 2, CANVAS_H / 2, canvasW * 0.3, canvasW / 2, CANVAS_H / 2, canvasW * 0.7);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, `rgba(0,0,0,${(0.3 + anim.beatFlash * 0.15).toFixed(3)})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, canvasW, CANVAS_H);

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
