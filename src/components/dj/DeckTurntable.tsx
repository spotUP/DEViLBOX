/**
 * DeckTurntable - Interactive spinning vinyl record visualizer for DJ decks.
 *
 * Canvas 2D rendered turntable that:
 *  - Spins proportional to effectiveBPM during normal playback
 *  - Responds to pointer drag (jog wheel) — tangential motion = scratch velocity
 *  - Shows "SCR" in center label while actively scratching
 *  - Decelerates smoothly on pointer release (momentum decay)
 *  - Deck A = blue accents, Deck B = red accents
 *
 * Velocity calculation: tangential component of pointer motion relative to disc center.
 * Fader automation is independent (AudioParam) and continues unaffected during jog-wheel.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckTurntableProps {
  deckId: 'A' | 'B';
}

const SIZE = 96;

const DECK_COLORS = {
  A: { label: '#1e2a3f', marker: '#60a5fa', scrLabel: '#60a5fa' },
  B: { label: '#3f1e2a', marker: '#f87171', scrLabel: '#f87171' },
} as const;

// 33⅓ RPM = 0.5556 rev/s. Normalize so ~120 BPM ≈ real vinyl speed.
const BASE_RPS = 0.5556;
const BASE_BPM = 120;

// Momentum decay: ease scratch velocity back to 1.0 over this duration (ms)
const MOMENTUM_DECAY_MS = 500;

// Sensitivity: tangential pixels per unit of velocity deviation from 1.0
const SCRATCH_SENSITIVITY = 0.06;

export const DeckTurntable: React.FC<DeckTurntableProps> = ({ deckId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Scratch state refs (not in state to avoid re-renders)
  const scratchVelocityRef = useRef(1);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const momentumDecayRafRef = useRef<number>(0);
  const momentumStartTimeRef = useRef(0);
  const momentumStartVelocityRef = useRef(1);

  const [isScratchActive, setIsScratchActive] = useState(false);

  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);

  const colors = DECK_COLORS[deckId];

  // Get the deck engine safely
  const getDeck = useCallback(() => {
    return getDJEngine().getDeck(deckId);
  }, [deckId]);

  // ── Momentum decay on pointer release ──────────────────────────────────────
  const startMomentumDecay = useCallback((fromVelocity: number) => {
    if (momentumDecayRafRef.current) {
      cancelAnimationFrame(momentumDecayRafRef.current);
    }
    momentumStartTimeRef.current = performance.now();
    momentumStartVelocityRef.current = fromVelocity;

    const animate = () => {
      const t = Math.min(1, (performance.now() - momentumStartTimeRef.current) / MOMENTUM_DECAY_MS);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      const v = momentumStartVelocityRef.current + (1 - momentumStartVelocityRef.current) * ease;
      scratchVelocityRef.current = v;

      if (t < 1) {
        momentumDecayRafRef.current = requestAnimationFrame(animate);
      } else {
        scratchVelocityRef.current = 1;
        momentumDecayRafRef.current = 0;
      }
    };
    momentumDecayRafRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Pointer event handlers (jog wheel) ────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    // Cancel any momentum decay in progress
    if (momentumDecayRafRef.current) {
      cancelAnimationFrame(momentumDecayRafRef.current);
      momentumDecayRafRef.current = 0;
    }

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    scratchVelocityRef.current = 1;

    setIsScratchActive(true);
    useDJStore.getState().setDeckScratchActive(deckId, true);

    try {
      getDeck().startScratch();
    } catch {
      // Engine not ready
    }
  }, [deckId, getDeck]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!lastPointerRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + SIZE / 2;
    const cy = rect.top + SIZE / 2;

    // Tangential velocity: cross product of radius vector and delta vector
    const rx = e.clientX - cx;
    const ry = e.clientY - cy;
    const radius = Math.sqrt(rx * rx + ry * ry);

    if (radius > 4) {
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      // Cross product (rx, ry) × (dx, dy) = rx*dy - ry*dx (tangential component)
      const tangential = (rx * dy - ry * dx) / radius;
      const velocity = Math.max(-4, Math.min(4, 1 + tangential * SCRATCH_SENSITIVITY));
      scratchVelocityRef.current = velocity;

      try {
        getDeck().setScratchVelocity(velocity);
      } catch {
        // Engine not ready
      }
    }

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [getDeck]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    lastPointerRef.current = null;

    const fromVelocity = scratchVelocityRef.current;

    setIsScratchActive(false);
    useDJStore.getState().setDeckScratchActive(deckId, false);

    // Start momentum decay (visual only — engine stopScratch does its own decay)
    startMomentumDecay(fromVelocity);

    try {
      getDeck().stopScratch(200);
    } catch {
      // Engine not ready
    }
  }, [deckId, getDeck, startMomentumDecay]);

  // ── Canvas draw loop ───────────────────────────────────────────────────────
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

    // Update rotation angle — during scratch, use scratchVelocityRef; otherwise effectiveBPM
    if (lastTimeRef.current > 0 && isPlaying) {
      const dt = (timestamp - lastTimeRef.current) / 1000;
      const scratchV = scratchVelocityRef.current;
      const bpmRps = (effectiveBPM / BASE_BPM) * BASE_RPS;
      // During scratch or momentum decay, scale spin by scratch velocity
      const rps = bpmRps * scratchV;
      angleRef.current += rps * 2 * Math.PI * dt;
    }
    lastTimeRef.current = timestamp;

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 2;
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
      const alpha = 0.25 + 0.15 * Math.sin(i * 1.7);
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

    // ── "SCR" label while scratching ──
    if (isScratchActive) {
      ctx.font = `bold ${Math.round(labelRadius * 0.45)}px monospace`;
      ctx.fillStyle = colors.scrLabel;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SCR', cx, cy);
    }

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
  }, [isPlaying, effectiveBPM, colors, isScratchActive]);

  useEffect(() => {
    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [draw]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (momentumDecayRafRef.current) {
        cancelAnimationFrame(momentumDecayRafRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 rounded"
      style={{ width: SIZE, height: SIZE }}
    >
      <canvas
        ref={canvasRef}
        className="block rounded"
        style={{
          width: SIZE,
          height: SIZE,
          cursor: isScratchActive ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
};
