/**
 * CurveCanvas - draws one CurveDescriptor: grid, filled or stroked series, and the live voice marker.
 * The series are recomputed by the caller as the knobs move; the marker is drawn from an engine subscription
 * without re-rendering React. High-DPI, sized to its container.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { CurveDescriptor, CurveSeries } from '@/types/synthPanel';
import { toPixel, xFraction, xGridValues, type PlotBox } from './curveGeometry';

const PAD = { padLeft: 4, padRight: 4, padTop: 4, padBottom: 4 };

interface CurveCanvasProps {
  curve: CurveDescriptor;
  series: CurveSeries[];
  accent: string;
}

export const CurveCanvas: React.FC<CurveCanvasProps> = ({ curve, series, accent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);
  const height = curve.height ?? 72;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const draw = useRef<() => void>(() => {});
  draw.current = () => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = width * dpr;
    cvs.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const box: PlotBox = { width, height, ...PAD };
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (const gx of xGridValues(curve)) {
      const [px] = toPixel(curve, box, gx, curve.yDomain[0]);
      ctx.beginPath(); ctx.moveTo(px + 0.5, PAD.padTop); ctx.lineTo(px + 0.5, height - PAD.padBottom); ctx.stroke();
    }

    for (const s of series) {
      if (s.points.length < 2) continue;
      const color = s.color ?? accent;
      ctx.beginPath();
      s.points.forEach(([x, y], i) => {
        const [px, py] = toPixel(curve, box, x, y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      if (s.fill) {
        const last = toPixel(curve, box, s.points[s.points.length - 1][0], curve.yDomain[0]);
        const first = toPixel(curve, box, s.points[0][0], curve.yDomain[0]);
        ctx.lineTo(last[0], last[1]); ctx.lineTo(first[0], first[1]); ctx.closePath();
        ctx.fillStyle = `${color}33`; ctx.fill();
      }
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    }

    const m = markerRef.current;
    if (m !== null) {
      const px = PAD.padLeft + xFraction(curve, m) * (width - PAD.padLeft - PAD.padRight);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 0.5, PAD.padTop); ctx.lineTo(px + 0.5, height - PAD.padBottom); ctx.stroke();
    }
  };

  useEffect(() => { draw.current(); }, [series, width, height, curve, accent]);

  useEffect(() => {
    if (!curve.marker) return undefined;
    return curve.marker.subscribe((x) => { markerRef.current = x; draw.current(); });
  }, [curve.marker]);

  return (
    <div ref={hostRef} className="w-full">
      <div className="text-[8px] text-text-muted uppercase tracking-wider mb-1">{curve.label}</div>
      <canvas ref={canvasRef} style={{ width: '100%', height }} className="block rounded" />
    </div>
  );
};
