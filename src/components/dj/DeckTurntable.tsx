/**
 * DeckTurntable - Spinning vinyl record visualizer for DJ decks.
 *
 * Canvas 2D rendered turntable that spins proportional to effectiveBPM.
 * Stops when paused. Shows BPM + pitch% as center label text.
 * Deck A = blue accents, Deck B = red accents.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';

interface DeckTurntableProps {
  deckId: 'A' | 'B';
}

const SIZE = 64;

// Colors — will be resolved from CSS variables at render time

const DECK_COLORS = {
  A: { label: '#1e2a3f', marker: '#60a5fa' },
  B: { label: '#3f1e2a', marker: '#f87171' },
} as const;

// 33⅓ RPM = 0.5556 rev/s. Normalize so ~120 BPM ≈ real vinyl speed.
const BASE_RPS = 0.5556;
const BASE_BPM = 120;

export const DeckTurntable: React.FC<DeckTurntableProps> = ({ deckId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);

  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);

  const colors = DECK_COLORS[deckId];

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Update rotation angle
    if (lastTimeRef.current > 0 && isPlaying) {
      const dt = (timestamp - lastTimeRef.current) / 1000;
      const rps = (effectiveBPM / BASE_BPM) * BASE_RPS;
      angleRef.current += rps * 2 * Math.PI * dt;
    }
    lastTimeRef.current = timestamp;

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 2; // leave 2px for border
    const angle = angleRef.current;

    // Read CSS variables for design system colors
    const cs = getComputedStyle(container);
    const bgColor = cs.getPropertyValue('--color-bg').trim() || '#0b0909';
    const bgSecondary = cs.getPropertyValue('--color-bg-secondary').trim() || '#131010';
    const bgTertiary = cs.getPropertyValue('--color-bg-tertiary').trim() || '#1d1818';
    const borderColor = cs.getPropertyValue('--color-border').trim() || '#2f2525';
    const borderLight = cs.getPropertyValue('--color-border-light').trim() || '#403535';

    // ── Background ──
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // ── Platter ring (outer) ──
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = bgSecondary;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Vinyl disc ──
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // ── Grooves (concentric rings) ──
    const labelRadius = radius * 0.38;
    const grooveStart = labelRadius + 4;
    const grooveEnd = radius - 6;
    const grooveCount = 14;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < grooveCount; i++) {
      const t = i / (grooveCount - 1);
      const r = grooveStart + t * (grooveEnd - grooveStart);
      const alpha = 0.25 + 0.15 * Math.sin(i * 1.7); // subtle variation
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = bgTertiary;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── Groove marker line (rotates) ──
    const markerInner = labelRadius;
    const markerOuter = radius - 4;
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(angle) * markerInner,
      cy + Math.sin(angle) * markerInner,
    );
    ctx.lineTo(
      cx + Math.cos(angle) * markerOuter,
      cy + Math.sin(angle) * markerOuter,
    );
    ctx.strokeStyle = colors.marker;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Center label ──
    ctx.beginPath();
    ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
    ctx.fillStyle = colors.label;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // ── Center spindle dot ──
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = borderLight;
    ctx.fill();

    // ── Outer border ──
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    animFrameRef.current = requestAnimationFrame(draw);
  }, [isPlaying, effectiveBPM, colors]);

  useEffect(() => {
    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 rounded"
      style={{ width: SIZE, height: SIZE }}
    >
      <canvas
        ref={canvasRef}
        className="block rounded"
        style={{ width: SIZE, height: SIZE }}
      />
    </div>
  );
};
