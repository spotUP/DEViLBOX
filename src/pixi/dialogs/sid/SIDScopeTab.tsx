/**
 * SIDScopeTab — Real-time oscilloscope visualization for SID playback.
 *
 * Renders 3 voice waveforms synthesized from SID register data (frequency,
 * waveform type, pulse width, gate) plus a combined audio output trace via
 * Web Audio AnalyserNode. Supports split/combined view and per-voice muting.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';

/* ── Colours ── */
const C_BG     = 0x0a0a1a;
const C_GRID   = 0x1a1a3a;
const C_CENTER = 0x333355;
const C_BORDER = 0x333366;
const C_V1     = 0x00ff88;
const C_V2     = 0x6699ff;
const C_V3     = 0xff6644;
const C_LABEL  = 0x888899;
const C_MUTED  = 0x444466;
const VOICE_COLORS = [C_V1, C_V2, C_V3];
const VOICE_NAMES  = ['Voice 1', 'Voice 2', 'Voice 3'];

/* ── Wave constants ── */
const WAVE_NOISE    = 0x80;
const WAVE_PULSE    = 0x40;
const WAVE_SAW      = 0x20;
const WAVE_TRIANGLE = 0x10;

const TOOLBAR_H = 24;
const STATUS_H  = 20;
const FFT_SIZE  = 2048;

interface SIDScopeTabProps {
  width: number;
  height: number;
}

interface VoiceSnapshot {
  frequency: number;
  pulseWidth: number;
  waveform: number;
  gate: boolean;
}

/** Waveform label from register bits */
function waveLabel(w: number): string {
  const parts: string[] = [];
  if (w & WAVE_NOISE)    parts.push('NOI');
  if (w & WAVE_PULSE)    parts.push('PUL');
  if (w & WAVE_SAW)      parts.push('SAW');
  if (w & WAVE_TRIANGLE) parts.push('TRI');
  return parts.length ? parts.join('+') : '---';
}

/** Synthesize a single waveform sample (0..1) for a given phase and voice config */
function synthSample(phase: number, wf: number, pw: number): number {
  let out = 0;
  let count = 0;
  if (wf & WAVE_TRIANGLE) { out += Math.abs(2 * phase - 1) * 2 - 1; count++; }
  if (wf & WAVE_SAW)      { out += 2 * phase - 1; count++; }
  if (wf & WAVE_PULSE)    { out += phase < (pw / 4095) ? 1 : -1; count++; }
  if (wf & WAVE_NOISE)    { out += Math.random() * 2 - 1; count++; }
  return count > 0 ? out / count : 0;
}

export const SIDScopeTab: React.FC<SIDScopeTabProps> = ({ width, height }) => {
  const containerRef = useRef<ContainerType>(null);
  const bgRef    = useRef<GraphicsType>(null);
  const waveRef  = useRef<GraphicsType>(null);
  const megaRef  = useRef<MegaText | null>(null);
  const animRef  = useRef(0);

  // Mutable state for rAF loop — avoid React state
  const splitRef  = useRef(true);
  const mutedRef  = useRef([false, false, false]);
  const voicesRef = useRef<(VoiceSnapshot | null)[]>([null, null, null]);

  // AnalyserNode for combined audio output
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserBuf = useRef(new Float32Array(FFT_SIZE));

  /* ── Connect analyser to master output ── */
  useEffect(() => {
    let analyser: AnalyserNode | null = null;
    let connected = false;

    (async () => {
      try {
        const { getToneEngine } = await import('@engine/ToneEngine');
        const te = getToneEngine();
        const ctx = te.nativeContext;
        if (!ctx) return;
        analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
        // Tap into master input (Tone.Gain wraps a native GainNode)
        const masterNode = (te.masterInput as any)._gainNode ?? (te.masterInput as any).input?.node;
        if (masterNode) {
          (masterNode as AudioNode).connect(analyser);
          connected = true;
        }
        analyserRef.current = analyser;
      } catch { /* engine not ready yet */ }
    })();

    return () => {
      if (analyser && connected) {
        try { analyser.disconnect(); } catch { /* ok */ }
      }
      analyserRef.current = null;
    };
  }, []);

  /* ── MegaText lifecycle ── */
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  /* ── Static background ── */
  const drawBg = useCallback(() => {
    const bg = bgRef.current;
    if (!bg) return;
    bg.clear();

    const scopeY = TOOLBAR_H;
    const scopeH = height - TOOLBAR_H - STATUS_H;

    bg.rect(0, 0, width, height).fill({ color: C_BG });
    bg.rect(0, scopeY, width, scopeH).stroke({ color: C_BORDER, width: 1 });

    const split = splitRef.current;
    const lanes = split ? 3 : 1;

    for (let lane = 0; lane < lanes; lane++) {
      const ly = scopeY + (scopeH / lanes) * lane;
      const lh = scopeH / lanes;
      const cy = ly + lh / 2;

      // Center line
      bg.moveTo(0, cy).lineTo(width, cy).stroke({ color: C_CENTER, width: 1 });

      // Horizontal quarter gridlines
      for (const frac of [0.25, 0.75]) {
        const gy = ly + lh * frac;
        bg.moveTo(0, gy).lineTo(width, gy).stroke({ color: C_GRID, width: 1 });
      }

      // Lane separator
      if (lane > 0) {
        bg.moveTo(0, ly).lineTo(width, ly).stroke({ color: C_BORDER, width: 1 });
      }
    }

    // Vertical grid
    for (let i = 1; i < 4; i++) {
      const x = (width / 4) * i;
      bg.moveTo(x, scopeY).lineTo(x, scopeY + scopeH).stroke({ color: C_GRID, width: 1 });
    }
  }, [width, height]);

  useEffect(() => { drawBg(); }, [drawBg]);

  /* ── Animation loop ── */
  const drawFrame = useCallback(() => {
    const wave = waveRef.current;
    const mega = megaRef.current;
    if (!wave || !mega) return;

    wave.clear();

    const scopeY = TOOLBAR_H;
    const scopeH = height - TOOLBAR_H - STATUS_H;
    const split  = splitRef.current;
    const muted  = mutedRef.current;

    // Poll voice state from SID engine
    let hasEngine = false;
    try {
      const { getTrackerReplayer } = require('@engine/TrackerReplayer');
      const engine = getTrackerReplayer()?.getC64SIDEngine?.();
      if (engine) {
        hasEngine = true;
        for (let v = 0; v < 3; v++) {
          const st = engine.getVoiceState(v);
          voicesRef.current[v] = st ? {
            frequency: st.frequency,
            pulseWidth: st.pulseWidth,
            waveform: st.waveform,
            gate: st.gate,
          } : null;
        }
      }
    } catch { /* engine not loaded */ }

    const voices = voicesRef.current;
    const anyActive = hasEngine && voices.some((v) => v !== null);

    // Labels collection
    const labels: GlyphLabel[] = [];

    // Toolbar labels
    const splitLabel = split ? '[Split]' : '[Combined]';
    labels.push({ x: 4, y: 5, text: splitLabel, color: C_LABEL, fontFamily: PIXI_FONTS.MONO });

    let tx = 80;
    for (let v = 0; v < 3; v++) {
      const col = muted[v] ? C_MUTED : VOICE_COLORS[v];
      const prefix = muted[v] ? 'x ' : '\u25A0 ';
      labels.push({ x: tx, y: 5, text: prefix + VOICE_NAMES[v], color: col, fontFamily: PIXI_FONTS.MONO });
      tx += 80;
    }

    if (!anyActive) {
      // No signal state
      labels.push({
        x: width / 2 - 36, y: scopeY + scopeH / 2 - 5,
        text: 'NO SIGNAL', color: C_LABEL, fontFamily: PIXI_FONTS.MONO,
      });
      mega.updateLabels(labels, 10);
      return;
    }

    // Draw synthesized voice waveforms
    const lanes = split ? 3 : 1;

    for (let v = 0; v < 3; v++) {
      if (muted[v]) continue;
      const vs = voices[v];
      if (!vs || !vs.gate) continue;

      const lane    = split ? v : 0;
      const laneY   = scopeY + (scopeH / lanes) * lane;
      const laneH   = scopeH / lanes;
      const cy      = laneY + laneH / 2;
      const amp     = laneH * 0.4;

      // SID frequency register → visual period in pixels
      // freq register 0..65535, higher = higher pitch
      const period = vs.frequency > 0 ? Math.max(4, (width * 16) / vs.frequency) : width;
      const color  = VOICE_COLORS[v];
      const alpha  = split ? 0.9 : 0.7;

      // Render ~3 cycles
      let started = false;
      for (let px = 0; px < width; px++) {
        const phase = (px % period) / period;
        const sample = synthSample(phase, vs.waveform, vs.pulseWidth);
        const y = cy - sample * amp;

        if (!started) { wave.moveTo(px, y); started = true; }
        else { wave.lineTo(px, y); }
      }
      wave.stroke({ color, width: 1.5, alpha });
    }

    // Draw combined analyser waveform (dimmed overlay)
    const an = analyserRef.current;
    if (an) {
      an.getFloatTimeDomainData(analyserBuf.current);
      const buf     = analyserBuf.current;
      const samples = Math.min(buf.length, width * 2);
      const step    = samples / width;

      // Trigger detection (zero-crossing, rising edge)
      let trigger = 0;
      for (let i = 1; i < samples / 2; i++) {
        if (buf[i - 1] <= 0 && buf[i] > 0) { trigger = i; break; }
      }

      const laneY = split ? scopeY : scopeY;
      const laneH = split ? scopeH : scopeH;
      const cy    = laneY + laneH / 2;
      const amp   = laneH * 0.4;

      wave.moveTo(0, cy - buf[trigger] * amp);
      for (let px = 1; px < width; px++) {
        const idx = trigger + Math.floor(px * step);
        if (idx >= buf.length) break;
        wave.lineTo(px, cy - buf[idx] * amp);
      }
      wave.stroke({ color: 0xffffff, width: 1, alpha: 0.15 });
    }

    // Status line — show selected voice info (first active non-muted voice)
    const sv = voices.find((v, i) => v !== null && !muted[i]) ?? voices.find((v) => v !== null);
    if (sv) {
      const freqHex = '$' + sv.frequency.toString(16).toUpperCase().padStart(4, '0');
      const pwHex   = '$' + sv.pulseWidth.toString(16).toUpperCase().padStart(3, '0');
      const statusY = height - STATUS_H + 4;
      labels.push({
        x: 4, y: statusY,
        text: `Freq: ${freqHex}  PW: ${pwHex}  Wave: ${waveLabel(sv.waveform)}  Gate: ${sv.gate ? 'ON' : 'OFF'}`,
        color: C_LABEL, fontFamily: PIXI_FONTS.MONO,
      });
    }

    mega.updateLabels(labels, 10);
  }, [width, height]);

  useEffect(() => {
    const tick = () => {
      drawFrame();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawFrame]);

  /* ── Interaction: toggle split/mute via click regions ── */
  const handlePointerDown = useCallback((e: any) => {
    const local = e.data?.getLocalPosition?.(containerRef.current) ?? e;
    const lx = local.x ?? 0;
    const ly = local.y ?? 0;

    if (ly > TOOLBAR_H) return; // only toolbar clicks

    // Split/Combined toggle (first 76px)
    if (lx < 76) {
      splitRef.current = !splitRef.current;
      drawBg();
      return;
    }

    // Voice mute toggles (80px wide each, starting at x=80)
    for (let v = 0; v < 3; v++) {
      const vx = 80 + v * 80;
      if (lx >= vx && lx < vx + 76) {
        mutedRef.current = mutedRef.current.map((m, i) => i === v ? !m : m);
        return;
      }
    }
  }, [drawBg]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics ref={bgRef} draw={() => {}} layout={{ position: 'absolute', width, height }} />
      <pixiGraphics ref={waveRef} draw={() => {}} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
