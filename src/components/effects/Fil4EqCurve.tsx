/**
 * Fil4EqCurve — Canvas frequency-response display for Fil4EqEffect.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Fil4EqEffect, Fil4Params } from '@/engine/effects/Fil4EqEffect';

const W = 600, H = 160;
const PAD_L = 32, PAD_R = 8, PAD_T = 8, PAD_B = 20;
const DB_MIN = -18, DB_MAX = 18;
const FREQ_MIN = 20, FREQ_MAX = 20000;
const N_POINTS = 512;

function freqToX(f: number, plotW: number): number {
  return PAD_L + (Math.log10(f / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN)) * plotW;
}
function dbToY(db: number, plotH: number): number {
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

interface Props {
  effect: Fil4EqEffect;
  width?: number;
  height?: number;
}

export const Fil4EqCurve: React.FC<Props> = ({ effect, width = W, height = H }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [magnitude, setMagnitude] = useState<Float32Array | null>(null);
  const [params, setParams] = useState<Fil4Params>(() => effect.getParams());
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  useEffect(() => {
    const onParams = (p: Fil4Params) => { setParams({ ...p }); dirtyRef.current = true; };
    effect.on('params', onParams);
    return () => { effect.off('params', onParams); /* void */ };
  }, [effect]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    effect.getMagnitude(N_POINTS).then(setMagnitude);
  }, [params, effect]);

  useEffect(() => {
    effect.getMagnitude(N_POINTS).then(setMagnitude);
  }, [effect]);

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

    const handles: Array<{ freq: number; gain: number; color: string; enabled: boolean }> = [
      { freq: params.hp.freq,  gain: 0,              color: COLOR_PASS,  enabled: params.hp.enabled },
      { freq: params.ls.freq,  gain: params.ls.gain, color: COLOR_SHELF, enabled: params.ls.enabled },
      ...params.p.map(p => ({ freq: p.freq, gain: p.gain, color: COLOR_PARA, enabled: p.enabled })),
      { freq: params.hs.freq,  gain: params.hs.gain, color: COLOR_SHELF, enabled: params.hs.enabled },
      { freq: params.lp.freq,  gain: 0,              color: COLOR_PASS,  enabled: params.lp.enabled },
    ];

    for (const h of handles) {
      const x = freqToX(h.freq, plotW);
      const y = dbToY(h.gain, plotH);
      ctx.globalAlpha = h.enabled ? 1 : 0.35;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = h.color; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [magnitude, params, width, height, plotW, plotH]);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  return (
    <canvas ref={canvasRef} width={width} height={height}
      className="block rounded" style={{ background: COLOR_BG }} />
  );
};
