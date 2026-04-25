/**
 * SIDScopeTab — DOM/Canvas real-time oscilloscope for SID voice visualization.
 *
 * Renders 3 voice waveforms synthesized from SID register data (frequency,
 * waveform type, pulse width, gate) plus a combined audio output trace via
 * Web Audio AnalyserNode. Supports split/combined view and per-voice muting.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layers, Eye, EyeOff } from 'lucide-react';

/* ── Colours ── */
const C_BG = '#0a0a1a';
const C_GRID = '#1a1a3a';
const C_CENTER = '#333355';
const C_V1 = '#00ff88';
const C_V2 = '#6699ff';
const C_V3 = '#ff6644';
const C_LABEL = '#888899';
const VOICE_COLORS = [C_V1, C_V2, C_V3];
const VOICE_NAMES = ['V1', 'V2', 'V3'];

/* ── Wave constants ── */
const WAVE_NOISE = 0x80;
const WAVE_PULSE = 0x40;
const WAVE_SAW = 0x20;
const WAVE_TRIANGLE = 0x10;
const FFT_SIZE = 2048;

interface SIDScopeTabProps {
  className?: string;
}

interface VoiceSnapshot {
  frequency: number;
  pulseWidth: number;
  waveform: number;
  gate: boolean;
}

function waveLabel(w: number): string {
  const parts: string[] = [];
  if (w & WAVE_NOISE) parts.push('NOI');
  if (w & WAVE_PULSE) parts.push('PUL');
  if (w & WAVE_SAW) parts.push('SAW');
  if (w & WAVE_TRIANGLE) parts.push('TRI');
  return parts.length ? parts.join('+') : '---';
}

function synthSample(phase: number, wf: number, pw: number): number {
  let out = 0;
  let count = 0;
  if (wf & WAVE_TRIANGLE) { out += Math.abs(2 * phase - 1) * 2 - 1; count++; }
  if (wf & WAVE_SAW) { out += 2 * phase - 1; count++; }
  if (wf & WAVE_PULSE) { out += phase < (pw / 4095) ? 1 : -1; count++; }
  if (wf & WAVE_NOISE) { out += Math.random() * 2 - 1; count++; }
  return count > 0 ? out / count : 0;
}

export const SIDScopeTab: React.FC<SIDScopeTabProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserBuf = useRef(new Float32Array(FFT_SIZE));
  const voicesRef = useRef<(VoiceSnapshot | null)[]>([null, null, null]);

  const [splitView, setSplitView] = useState(true);
  const [muted, setMuted] = useState([false, false, false]);
  const [statusVoice, setStatusVoice] = useState<VoiceSnapshot | null>(null);
  const [hasSignal, setHasSignal] = useState(false);

  // Keep refs in sync for rAF loop
  const splitRef = useRef(splitView);
  const mutedRef = useRef(muted);
  useEffect(() => { splitRef.current = splitView; }, [splitView]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const toggleMute = useCallback((v: number) => {
    setMuted(prev => prev.map((m, i) => i === v ? !m : m));
  }, []);

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
        // SID audio flows through synthBus (not masterInput — that's for tracker instruments).
        // synthBus is unaffected by DubBus wireMasterInsert, so the tap works
        // both when the dub deck is enabled and when it isn't.
        const tapNode = (te.synthBus as any)._gainNode ?? (te.synthBus as any).input?.node;
        if (tapNode) {
          (tapNode as AudioNode).connect(analyser);
          connected = true;
        }
        analyserRef.current = analyser;
      } catch { /* engine not ready */ }
    })();

    return () => {
      if (analyser && connected) {
        try { analyser.disconnect(); } catch { /* ok */ }
      }
      analyserRef.current = null;
    };
  }, []);

  /* ── Animation loop ── */
  useEffect(() => {
    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) { animRef.current = requestAnimationFrame(tick); return; }

      const ctx = canvas.getContext('2d');
      if (!ctx) { animRef.current = requestAnimationFrame(tick); return; }

      const w = canvas.width;
      const h = canvas.height;
      const split = splitRef.current;
      const mutedNow = mutedRef.current;

      // Poll voice state from SID engine
      let engineActive = false;
      try {
        const { getTrackerReplayer } = require('@engine/TrackerReplayer');
        const engine = getTrackerReplayer()?.getC64SIDEngine?.();
        if (engine) {
          engineActive = true;
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
      const anyActive = engineActive && voices.some(v => v !== null);

      // Update React state (throttled by rAF)
      setHasSignal(anyActive);
      const sv = voices.find((v, i) => v !== null && !mutedNow[i]) ?? voices.find(v => v !== null);
      setStatusVoice(sv ?? null);

      // Clear
      ctx.fillStyle = C_BG;
      ctx.fillRect(0, 0, w, h);

      const lanes = split ? 3 : 1;

      // Draw grid
      for (let lane = 0; lane < lanes; lane++) {
        const ly = (h / lanes) * lane;
        const lh = h / lanes;
        const cy = ly + lh / 2;

        ctx.strokeStyle = C_CENTER;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();

        ctx.strokeStyle = C_GRID;
        for (const frac of [0.25, 0.75]) {
          const gy = ly + lh * frac;
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
          ctx.stroke();
        }

        if (lane > 0) {
          ctx.strokeStyle = '#333366';
          ctx.beginPath();
          ctx.moveTo(0, ly);
          ctx.lineTo(w, ly);
          ctx.stroke();
        }
      }

      // Vertical grid
      ctx.strokeStyle = C_GRID;
      for (let i = 1; i < 4; i++) {
        const x = (w / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      if (!anyActive) {
        ctx.fillStyle = C_LABEL;
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO SIGNAL', w / 2, h / 2 + 4);
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      // Draw synthesized voice waveforms
      for (let v = 0; v < 3; v++) {
        if (mutedNow[v]) continue;
        const vs = voices[v];
        if (!vs || !vs.gate) continue;

        const lane = split ? v : 0;
        const laneY = (h / lanes) * lane;
        const laneH = h / lanes;
        const cy = laneY + laneH / 2;
        const amp = laneH * 0.4;

        const period = vs.frequency > 0 ? Math.max(4, (w * 16) / vs.frequency) : w;
        const color = VOICE_COLORS[v];

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = split ? 0.9 : 0.7;
        ctx.beginPath();
        for (let px = 0; px < w; px++) {
          const phase = (px % period) / period;
          const sample = synthSample(phase, vs.waveform, vs.pulseWidth);
          const y = cy - sample * amp;
          if (px === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Combined analyser overlay
      const an = analyserRef.current;
      if (an) {
        an.getFloatTimeDomainData(analyserBuf.current);
        const buf = analyserBuf.current;
        const samples = Math.min(buf.length, w * 2);
        const step = samples / w;

        let trigger = 0;
        for (let i = 1; i < samples / 2; i++) {
          if (buf[i - 1] <= 0 && buf[i] > 0) { trigger = i; break; }
        }

        const cy = h / 2;
        const amp = h * 0.4;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(0, cy - buf[trigger] * amp);
        for (let px = 1; px < w; px++) {
          const idx = trigger + Math.floor(px * step);
          if (idx >= buf.length) break;
          ctx.lineTo(px, cy - buf[idx] * amp);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  /* ── Resize canvas to fill container ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      canvas.width = Math.floor(width);
      canvas.height = Math.floor(height);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-dark-border/50">
        <button
          onClick={() => setSplitView(!splitView)}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-text-secondary
                     border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
        >
          <Layers size={12} />
          {splitView ? 'Split' : 'Combined'}
        </button>

        {[0, 1, 2].map(v => (
          <button
            key={v}
            onClick={() => toggleMute(v)}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono
                       rounded hover:bg-dark-bgHover transition-colors"
            style={{ color: muted[v] ? '#444466' : VOICE_COLORS[v] }}
          >
            {muted[v] ? <EyeOff size={10} /> : <Eye size={10} />}
            {VOICE_NAMES[v]}
          </button>
        ))}

        {!hasSignal && (
          <span className="ml-auto text-[10px] font-mono text-text-muted">No signal</span>
        )}
      </div>

      {/* Scope canvas */}
      <canvas ref={canvasRef} className="flex-1 w-full" style={{ background: C_BG }} />

      {/* Status bar */}
      <div className="flex items-center gap-4 px-2 py-1 border-t border-dark-border/50 text-[10px] font-mono text-text-muted">
        {statusVoice ? (
          <>
            <span>Freq: ${statusVoice.frequency.toString(16).toUpperCase().padStart(4, '0')}</span>
            <span>PW: ${statusVoice.pulseWidth.toString(16).toUpperCase().padStart(3, '0')}</span>
            <span>Wave: {waveLabel(statusVoice.waveform)}</span>
            <span>Gate: {statusVoice.gate ? 'ON' : 'OFF'}</span>
          </>
        ) : (
          <span>---</span>
        )}
      </div>
    </div>
  );
};
