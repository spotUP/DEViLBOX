/**
 * Fil4EqCurve — Canvas frequency-response display for Fil4EqEffect.
 * Interactive: handles overlaid on canvas for dragging freq/gain per band.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Fil4EqEffect, Fil4Params } from '@/engine/effects/Fil4EqEffect';

const W = 600, H = 160;
const PAD_L = 32, PAD_R = 8, PAD_T = 8, PAD_B = 20;
const DB_MIN = -18, DB_MAX = 18;
const FREQ_MIN = 20, FREQ_MAX = 20000;
const N_POINTS = 512;

export function freqToX(f: number, plotW: number): number {
  return PAD_L + (Math.log10(f / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN)) * plotW;
}
export function dbToY(db: number, plotH: number): number {
  return PAD_T + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * plotH;
}

const GRID_FREQS = [100, 200, 500, 1000, 2000, 5000, 10000];
const GRID_DBS   = [-12, -6, 0, 6, 12];

const COLOR_PASS  = '#4F8EF7';
const COLOR_SHELF = '#A855F7';
const COLOR_PARA  = '#F59E0B';
const COLOR_CURVE = '#34D399';
const COLOR_GRID  = 'rgba(255,255,255,0.08)';
const COLOR_ZERO  = 'rgba(255,255,255,0.20)';
const COLOR_TEXT  = 'rgba(255,255,255,0.35)';
const COLOR_BG    = '#1a1a2e';

export type BandId = 'hp' | 'lp' | 'ls' | 'hs' | 'p0' | 'p1' | 'p2' | 'p3';

interface HandleDef {
  bandId: BandId;
  freq: number;
  gain: number;
  color: string;
  enabled: boolean;
  hasGain: boolean;
}

interface Props {
  effect: Fil4EqEffect;
  width?: number;
  height?: number;
  onBandChange?: (bandId: BandId, patch: { freq?: number; gain?: number; q?: number; bw?: number; enabled?: boolean }) => void;
}

export const Fil4EqCurve: React.FC<Props> = ({ effect, width = W, height = H, onBandChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [magnitude, setMagnitude] = useState<Float32Array | null>(null);
  const [params, setParams] = useState<Fil4Params>(() => effect.getParams());
  const [activeHandle, setActiveHandle] = useState<BandId | null>(null);
  const rafRef = useRef<number | null>(null);
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  useEffect(() => {
    const onParams = (p: Fil4Params) => { setParams({ ...p }); };
    effect.on('params', onParams);
    return () => { effect.off('params', onParams); };
  }, [effect]);

  useEffect(() => {
    effect.getMagnitude(N_POINTS).then(setMagnitude);
  }, [params, effect]);

  useEffect(() => {
    effect.getMagnitude(N_POINTS).then(setMagnitude);
  }, [effect]);

  // Prevent page scroll when scrolling over EQ canvas (React 19 passive wheel workaround)
  useEffect(() => {
    if (!onBandChange) return;
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', prevent, { passive: false });
    return () => el.removeEventListener('wheel', prevent);
  }, [onBandChange]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (const f of GRID_FREQS) {
      const x = freqToX(f, plotW);
      ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + plotH); ctx.stroke();
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x, height - 4);
    }

    ctx.textAlign = 'right';
    for (const db of GRID_DBS) {
      const y = dbToY(db, plotH);
      ctx.strokeStyle = db === 0 ? COLOR_ZERO : COLOR_GRID;
      ctx.lineWidth = db === 0 ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW, y); ctx.stroke();
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(`${db}`, PAD_L - 4, y + 3);
    }

    if (magnitude && magnitude.length >= N_POINTS) {
      ctx.strokeStyle = COLOR_CURVE; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < N_POINTS; i++) {
        const f = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, i / (N_POINTS - 1));
        const x = freqToX(f, plotW);
        const db = Math.max(DB_MIN - 2, Math.min(DB_MAX + 2, magnitude[i]));
        const y = dbToY(db, plotH);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [magnitude, params, width, height, plotW, plotH]);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  const handles: HandleDef[] = [
    { bandId: 'hp', freq: params.hp.freq, gain: 0,              color: COLOR_PASS,  enabled: params.hp.enabled, hasGain: false },
    { bandId: 'ls', freq: params.ls.freq, gain: params.ls.gain, color: COLOR_SHELF, enabled: params.ls.enabled, hasGain: true  },
    { bandId: 'p0', freq: params.p[0].freq, gain: params.p[0].gain, color: COLOR_PARA, enabled: params.p[0].enabled, hasGain: true },
    { bandId: 'p1', freq: params.p[1].freq, gain: params.p[1].gain, color: COLOR_PARA, enabled: params.p[1].enabled, hasGain: true },
    { bandId: 'p2', freq: params.p[2].freq, gain: params.p[2].gain, color: COLOR_PARA, enabled: params.p[2].enabled, hasGain: true },
    { bandId: 'p3', freq: params.p[3].freq, gain: params.p[3].gain, color: COLOR_PARA, enabled: params.p[3].enabled, hasGain: true },
    { bandId: 'hs', freq: params.hs.freq, gain: params.hs.gain, color: COLOR_SHELF, enabled: params.hs.enabled, hasGain: true  },
    { bandId: 'lp', freq: params.lp.freq, gain: 0,              color: COLOR_PASS,  enabled: params.lp.enabled, hasGain: false },
  ];

  const dragRef = useRef<{
    bandId: BandId;
    startX: number;
    startY: number;
    startFreq: number;
    startGain: number;
    hasGain: boolean;
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, h: HandleDef) => {
    if (!onBandChange) return;
    e.preventDefault();
    // Auto-enable disabled band on drag
    if (!h.enabled) {
      onBandChange(h.bandId, { enabled: true });
    }
    dragRef.current = {
      bandId: h.bandId,
      startX: e.clientX,
      startY: e.clientY,
      startFreq: h.freq,
      startGain: h.gain,
      hasGain: h.hasGain,
    };
    setActiveHandle(h.bandId);

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !onBandChange) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      // Freq: log-scale drag — map pixel delta to frequency multiplier
      const freqScale = Math.pow(FREQ_MAX / FREQ_MIN, dx / plotW);
      const newFreq = Math.round(Math.max(FREQ_MIN, Math.min(FREQ_MAX, d.startFreq * freqScale)));
      // Always include enabled:true so dragging a disabled band activates it immediately
      const patch: { freq?: number; gain?: number; enabled: boolean } = { freq: newFreq, enabled: true };
      if (d.hasGain) {
        const dbPerPx = (DB_MAX - DB_MIN) / plotH;
        const newGain = parseFloat(Math.max(DB_MIN, Math.min(DB_MAX, d.startGain - dy * dbPerPx)).toFixed(1));
        patch.gain = newGain;
      }
      onBandChange(d.bandId, patch);
    };
    const onUp = () => {
      dragRef.current = null;
      setActiveHandle(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onBandChange, plotW, plotH]);

  const handleWheel = useCallback((e: React.WheelEvent, h: HandleDef) => {
    if (!onBandChange) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    // Shelves + HP/LP adjust Q; peaking bands adjust BW
    if (h.bandId === 'p0' || h.bandId === 'p1' || h.bandId === 'p2' || h.bandId === 'p3') {
      const idx = parseInt(h.bandId[1]);
      const currentBw = params.p[idx].bw;
      onBandChange(h.bandId, { bw: parseFloat(Math.max(0.05, currentBw + delta).toFixed(2)) });
    } else {
      const currentQ = h.bandId === 'hp' ? params.hp.q
        : h.bandId === 'lp' ? params.lp.q
        : h.bandId === 'ls' ? params.ls.q
        : params.hs.q;
      onBandChange(h.bandId, { q: parseFloat(Math.max(0.1, currentQ + delta).toFixed(2)) });
    }
  }, [onBandChange, params]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width, height, display: 'inline-block' }}>
      <canvas ref={canvasRef} width={width} height={height}
        className="block rounded" style={{ background: COLOR_BG }} />
      {onBandChange && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {handles.map(h => {
            const x = freqToX(h.freq, plotW);
            const y = dbToY(h.gain, plotH);
            const isActive = activeHandle === h.bandId;
            return (
              <div
                key={h.bandId}
                onMouseDown={e => handleMouseDown(e, h)}
                onWheel={e => handleWheel(e, h)}
                style={{
                  position: 'absolute',
                  left: x - 6,
                  top: y - 6,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: h.color,
                  opacity: h.enabled ? 1 : 0.5,
                  cursor: 'grab',
                  pointerEvents: 'auto',
                  border: isActive ? '2px solid white' : '2px solid transparent',
                  boxSizing: 'border-box',
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
