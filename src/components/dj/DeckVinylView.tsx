/**
 * DeckVinylView — Large spinning vinyl for DJ mode.
 *
 * Renders a 250px vinyl record with grooves, label, and tonearm.
 * Pointer drag = hand-on-record grab routed through TurntablePhysics
 * for proper inertia/motor/friction simulation.
 * Scroll wheel = nudge impulse through TurntablePhysics.
 *
 * Physics output drives DeckEngine scratch API (startScratch/setScratchVelocity/stopScratch).
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { TurntablePhysics, OMEGA_NORMAL } from '@/engine/turntable/TurntablePhysics';

interface DeckVinylViewProps {
  deckId: 'A' | 'B' | 'C';
  size?: number;
}

// ── Rendering constants ─────────────────────────────────────────────────────

const DEFAULT_SIZE = 250;
const GROOVE_COUNT = 28;

const DECK_ACCENT: Record<string, string> = { A: '#60a5fa', B: '#f87171', C: '#34d399' };
const DECK_LABEL_BG: Record<string, string> = { A: '#1e2a3f', B: '#3f1e2a', C: '#1e3f2a' };

// ── Component ────────────────────────────────────────────────────────────────

export const DeckVinylView: React.FC<DeckVinylViewProps> = ({ deckId, size = DEFAULT_SIZE }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const physicsRef = useRef(new TurntablePhysics());
  const rafIdRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const angleRef = useRef(0);

  // Scratch state
  const isScratchActiveRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTimeRef = useRef(0);
  const [isScratchActive, setIsScratchActive] = useState(false);

  // Store subscriptions
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const trackName = useDJStore((s) => s.decks[deckId].trackName);
  const patternName = useDJStore((s) => s.decks[deckId].activePatternName);

  // Theme colors
  const accentColor = DECK_ACCENT[deckId] ?? '#60a5fa';
  const labelBg = DECK_LABEL_BG[deckId] ?? '#1e2a3f';

  // ── Physics rAF loop — drives scratch velocity to DeckEngine ──────────────

  useEffect(() => {
    const physics = physicsRef.current;
    let prevRate = 1;

    const tick = (now: number) => {
      const dt = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      // Always advance angle for visual rotation
      const baseBPM = effectiveBPM || 120;
      const rps = (baseBPM / 120) * 0.5556; // 33⅓ RPM normalized

      if (isPlaying || isScratchActiveRef.current) {
        // If scratching, use physics rate; otherwise normal playback
        let rate = 1;
        if (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive) {
          rate = physics.tick(dt);
        }

        angleRef.current += rps * rate * 2 * Math.PI * dt;

        // Forward physics rate to DeckEngine scratch API
        if (isScratchActiveRef.current && Math.abs(rate - prevRate) > 0.01) {
          try { getDJEngine().getDeck(deckId).setScratchVelocity(rate); } catch { /* not ready */ }
          prevRate = rate;
        }

        // Check if physics has settled back to normal — exit scratch
        if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
          if (Math.abs(rate - 1.0) < 0.02) {
            isScratchActiveRef.current = false;
            setIsScratchActive(false);
            try { getDJEngine().getDeck(deckId).stopScratch(50); } catch { /* not ready */ }
            useDJStore.getState().setDeckScratchActive(deckId, false);
            prevRate = 1;
          }
        }
      }
      // When not playing (and not scratching), platter is stationary

      // Render
      renderVinyl();
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  // Intentionally depend only on deckId to keep the closure stable.
  // isPlaying and effectiveBPM are read from refs in the loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // Keep isPlaying/effectiveBPM accessible in the rAF closure via a ref pattern
  const playStateRef = useRef({ isPlaying, effectiveBPM });
  playStateRef.current = { isPlaying, effectiveBPM };

  // ── Canvas rendering ──────────────────────────────────────────────────────

  const renderVinyl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size;
    const h = size;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 4;
    const labelRadius = radius * 0.32;
    const angle = angleRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Get CSS colors from computed style
    const el = canvas.parentElement;
    const cs = el ? getComputedStyle(el) : null;
    const bgColor = cs?.getPropertyValue('--color-bg').trim() || '#0b0909';
    const bgSecondary = cs?.getPropertyValue('--color-bg-secondary').trim() || '#131010';
    const bgTertiary = cs?.getPropertyValue('--color-bg-tertiary').trim() || '#1d1818';
    const borderColor = cs?.getPropertyValue('--color-border').trim() || '#2f2525';
    const borderLight = cs?.getPropertyValue('--color-border-light').trim() || '#403535';

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Platter ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = bgSecondary;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Vinyl disc
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Grooves
    const grooveStart = labelRadius + 6;
    const grooveEnd = radius - 8;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < GROOVE_COUNT; i++) {
      const r = grooveStart + (i / (GROOVE_COUNT - 1)) * (grooveEnd - grooveStart);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = bgTertiary;
      ctx.globalAlpha = 0.2 + 0.12 * Math.sin(i * 1.5 + angle * 0.3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Rotating marker line
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (labelRadius + 2), cy + Math.sin(angle) * (labelRadius + 2));
    ctx.lineTo(cx + Math.cos(angle) * (radius - 6), cy + Math.sin(angle) * (radius - 6));
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center label
    ctx.beginPath();
    ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
    ctx.fillStyle = labelBg;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Track name on label
    const displayName = trackName || `Deck ${deckId}`;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.font = `bold ${Math.round(labelRadius * 0.28)}px monospace`;
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Truncate name to fit label
    const maxChars = Math.floor(labelRadius * 2 / (labelRadius * 0.17));
    const truncName = displayName.length > maxChars ? displayName.slice(0, maxChars - 1) + '…' : displayName;
    ctx.fillText(truncName, 0, -labelRadius * 0.18);
    // BPM
    ctx.font = `${Math.round(labelRadius * 0.22)}px monospace`;
    ctx.fillStyle = borderLight;
    const bpmText = effectiveBPM ? `${effectiveBPM.toFixed(1)} BPM` : '';
    ctx.fillText(bpmText, 0, labelRadius * 0.22);
    ctx.restore();

    // "SCR" indicator while scratching
    if (isScratchActiveRef.current) {
      ctx.font = `bold ${Math.round(labelRadius * 0.35)}px monospace`;
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.5;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SCR', cx, cy + labelRadius + 14);
      ctx.globalAlpha = 1;
    }

    // Pattern name overlay
    if (patternName) {
      ctx.font = `bold 10px monospace`;
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.6;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(patternName, cx, h - 4);
      ctx.globalAlpha = 1;
    }

    // Spindle dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = borderLight;
    ctx.fill();
  }, [size, accentColor, labelBg, deckId, trackName, effectiveBPM, patternName]);

  // ── Canvas setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }, [size]);

  // ── Pointer handlers (scratch grab) ───────────────────────────────────────

  const enterScratch = useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    setIsScratchActive(true);
    useDJStore.getState().setDeckScratchActive(deckId, true);
    try { getDJEngine().getDeck(deckId).startScratch(); } catch { /* not ready */ }
  }, [deckId]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    if (!playStateRef.current.isPlaying) return;

    enterScratch();

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    lastPointerTimeRef.current = performance.now();

    // Tell physics: hand on record
    physicsRef.current.setTouching(true);
    physicsRef.current.setHandVelocity(0); // Just placed hand, no velocity yet
  }, [enterScratch]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!lastPointerRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + size / 2;
    const cy = rect.top + size / 2;
    const rx = e.clientX - cx;
    const ry = e.clientY - cy;
    const radius = Math.sqrt(rx * rx + ry * ry);

    if (radius > 4) {
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      // Tangential component of pointer movement relative to center
      const tangential = (rx * dy - ry * dx) / radius;

      // Convert tangential pixels to angular velocity
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastPointerTimeRef.current) / 1000);
      lastPointerTimeRef.current = now;

      // Scale: tangential px/s → angular velocity in rad/s
      // At the edge of a 250px vinyl, a full drag across = ~400px = ~2π
      const pixelVelocity = tangential / dt;
      const omega = (pixelVelocity / (size * 0.8)) * OMEGA_NORMAL;

      // Pure hand velocity — no bias. With slipmat physics, holding still = stopped.
      // The motor platter keeps spinning underneath through slipmat coupling.
      physicsRef.current.setHandVelocity(omega);
    }

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [size]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    lastPointerRef.current = null;

    // Release hand from record — motor will pull platter back to normal
    physicsRef.current.setTouching(false);
  }, []);

  // ── Wheel handler (nudge) ─────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      if (!playStateRef.current.isPlaying) return;
      e.preventDefault();

      if (!isScratchActiveRef.current) {
        enterScratch();
      }

      const impulse = TurntablePhysics.deltaToImpulse(e.deltaY, e.deltaMode);
      physicsRef.current.applyImpulse(impulse);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [enterScratch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas
        ref={canvasRef}
        className="rounded-lg"
        style={{
          width: size,
          height: size,
          cursor: isScratchActive ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
};
