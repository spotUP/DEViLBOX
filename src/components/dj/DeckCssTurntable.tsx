/**
 * DeckCssTurntable — Realistic CSS turntable for DJ mode.
 *
 * Based on the Technics SL-1200 CSS turntable by dmsr (CodePen).
 * Uses sprite images for photorealistic rendering with CSS transforms
 * for platter/record/tonearm rotation synced to audio position.
 *
 * Pointer drag on the record = scratch (routed through engine-owned TurntablePhysics).
 * Scroll wheel = nudge impulse through TurntablePhysics.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { TurntablePhysics, OMEGA_NORMAL } from '@/engine/turntable/TurntablePhysics';
import * as DJActions from '@/engine/dj/DJActions';
import './DeckCssTurntable.css';

interface DeckCssTurntableProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckCssTurntable: React.FC<DeckCssTurntableProps> = ({ deckId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const platterRef = useRef<HTMLDivElement>(null);
  const recordRef = useRef<HTMLDivElement>(null);
  const groovesRef = useRef<HTMLDivElement>(null);
  const slipmatRef = useRef<HTMLDivElement>(null);
  const spindleRef = useRef<HTMLDivElement>(null);
  const tonearmRef = useRef<HTMLDivElement>(null);

  const physicsRef = useRef<TurntablePhysics | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const angleRef = useRef(0); // radians

  // Scratch state
  const isScratchActiveRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTimeRef = useRef(0);
  const [isScratchActive, setIsScratchActive] = useState(false);

  // Store subscriptions
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);

  // Keep isPlaying/effectiveBPM accessible in the rAF closure via a ref
  const playStateRef = useRef({ isPlaying, effectiveBPM });
  playStateRef.current = { isPlaying, effectiveBPM };

  // ── Apply rotation to CSS elements ────────────────────────────────────────

  const applyRotation = useCallback((angleDeg: number) => {
    const rot = `rotate(${angleDeg}deg)`;
    if (platterRef.current) platterRef.current.style.transform = rot;
    if (recordRef.current) recordRef.current.style.transform = rot;
    if (groovesRef.current) groovesRef.current.style.transform = rot;
    if (slipmatRef.current) slipmatRef.current.style.transform = rot;
    if (spindleRef.current) spindleRef.current.style.transform = rot;
  }, []);

  const applyTonearm = useCallback((angleDeg: number) => {
    // Tonearm wobble: slight rotation based on playback progress
    // Range: 0° (outer groove) to ~25° (inner groove / end)
    if (tonearmRef.current) {
      tonearmRef.current.style.transform = `rotate(${angleDeg}deg)`;
    }
  }, []);

  // ── Physics rAF loop ──────────────────────────────────────────────────────

  // Cache engine deck ref to avoid repeated lookups in hot loop
  const engineDeckRef = useRef<ReturnType<ReturnType<typeof getDJEngine>['getDeck']> | null>(null);

  useEffect(() => {
    let prevRate = 1;
    let scratchIntegrating = false;

    const tick = (now: number) => {
      if (!containerRef.current || !platterRef.current) {
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      // Lazy-init engine refs (once, not every frame)
      if (!physicsRef.current || !engineDeckRef.current) {
        try {
          const deck = getDJEngine().getDeck(deckId);
          physicsRef.current = deck.physics;
          engineDeckRef.current = deck;
        } catch { /* engine not ready */ }
      }
      const physics = physicsRef.current;
      const engineDeck = engineDeckRef.current;

      const { isPlaying: playing, effectiveBPM: bpm } = playStateRef.current;
      const baseBPM = bpm || 120;
      const rps = (baseBPM / 120) * 0.5556; // 33⅓ RPM normalized
      const omegaNormal = rps * 2 * Math.PI;

      if (playing || isScratchActiveRef.current) {
        if (physics && (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive)) {
          const rate = physics.tick(dt);

          if (isScratchActiveRef.current && !scratchIntegrating) {
            scratchIntegrating = true;
            // Read position directly from engine (no store access)
            let posSec = 0;
            if (engineDeck) {
              try { posSec = engineDeck.playbackMode === 'audio' ? engineDeck.audioPlayer.getPosition() : engineDeck.replayer.getElapsedMs() / 1000; }
              catch { /* fallback 0 */ }
            }
            angleRef.current = posSec * omegaNormal;
          }

          if (isScratchActiveRef.current && Math.abs(rate - prevRate) > 0.01) {
            // Update velocity directly on store without triggering full action chain
            useDJStore.getState().setDeckState(deckId, { scratchVelocity: rate });
            prevRate = rate;
          }

          if (scratchIntegrating) {
            angleRef.current += rate * omegaNormal * dt;
          }

          if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
            if (Math.abs(rate - 1.0) < 0.02) {
              isScratchActiveRef.current = false;
              setIsScratchActive(false);
              scratchIntegrating = false;
              DJActions.stopScratch(deckId, 50);
              prevRate = 1;
            }
          }
        }

        if (!scratchIntegrating && engineDeck) {
          // Read position directly from engine — avoid useDJStore.getState() in hot loop
          let posSec = 0;
          try { posSec = engineDeck.playbackMode === 'audio' ? engineDeck.audioPlayer.getPosition() : engineDeck.replayer.getElapsedMs() / 1000; }
          catch { /* fallback 0 */ }
          angleRef.current = posSec * omegaNormal;
        }
      }

      // Apply CSS rotation
      const angleDeg = (angleRef.current * 180) / Math.PI;
      applyRotation(angleDeg);

      // Tonearm: track from outer groove to inner groove
      // START_DEG = needle at outer groove edge of record
      // END_DEG   = needle at inner groove near the label
      const ARM_START_DEG = 5;
      const ARM_END_DEG = 25;
      const deck = useDJStore.getState().decks[deckId];
      const duration = deck.durationMs > 0 ? deck.durationMs / 1000 : 180;
      // Get LIVE position from audio player (not stale store value)
      let pos: number;
      if (deck.playbackMode === 'audio') {
        try {
          pos = getDJEngine().getDeck(deckId).audioPlayer.getPosition();
        } catch {
          pos = deck.audioPosition;
        }
      } else {
        pos = deck.elapsedMs / 1000;
      }
      const progress = duration > 0 ? Math.min(pos / duration, 1) : 0;
      // Slight wobble when playing
      const wobble = playing && !isScratchActiveRef.current
        ? Math.sin(now * 0.001) * 0.15
        : 0;
      applyTonearm(ARM_START_DEG + progress * (ARM_END_DEG - ARM_START_DEG) + wobble);

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, applyRotation, applyTonearm]);

  // ── Pointer handlers (scratch grab) ───────────────────────────────────────

  const enterScratch = useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    setIsScratchActive(true);
    DJActions.startScratch(deckId);
  }, [deckId]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (!playStateRef.current.isPlaying) return;
    enterScratch();

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    lastPointerTimeRef.current = performance.now();
    physicsRef.current?.setTouching(true);
    physicsRef.current?.setHandVelocity(0);
  }, [enterScratch]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!lastPointerRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // Center of the platter (approximately 41% from left, 50% from top of the turntable)
    const cx = rect.left + rect.width * 0.41;
    const cy = rect.top + rect.height * 0.50;
    const rx = e.clientX - cx;
    const ry = e.clientY - cy;
    const radius = Math.sqrt(rx * rx + ry * ry);

    if (radius > 4) {
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      const tangential = (rx * dy - ry * dx) / radius;

      const now = performance.now();
      const dt = Math.max(0.001, (now - lastPointerTimeRef.current) / 1000);
      lastPointerTimeRef.current = now;

      const pixelVelocity = tangential / dt;
      const platterSize = rect.width * 0.72; // platter is ~72% of turntable width
      const sensitivity = useDJStore.getState().jogWheelSensitivity;
      const omega = (pixelVelocity / (platterSize * 0.8)) * OMEGA_NORMAL * sensitivity;
      physicsRef.current?.setHandVelocity(omega);
    }

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    lastPointerRef.current = null;
    physicsRef.current?.setTouching(false);
  }, []);

  // ── Wheel handler (nudge) ─────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!playStateRef.current.isPlaying) return;
      e.preventDefault();

      if (!isScratchActiveRef.current) enterScratch();
      const impulse = TurntablePhysics.deltaToImpulse(e.deltaY, e.deltaMode);
      physicsRef.current?.applyImpulse(impulse);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enterScratch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="turntable-css-container">
      <div
        ref={containerRef}
        className="turntable-css relative select-none"
        style={{ cursor: isScratchActive ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Table surface */}
        <div className="tt-frame" />
        <div className="tt-table-bg" />

        {/* Body */}
        <div className="tt-bd">
          {/* Platter */}
          <div ref={platterRef} className="tt-platter" />

          {/* Slipmat */}
          <div className="tt-slipmat-holder tt-visible">
            <div ref={slipmatRef} className="tt-slipmat" />
          </div>

          {/* Record */}
          <div className="tt-record-holder tt-visible">
            <div ref={recordRef} className="tt-record" />
            <div ref={groovesRef} className="tt-record-grooves" />
            <div className="tt-label" />
          </div>

          {/* Spindle */}
          <div ref={spindleRef} className="tt-spindle" />

          {/* Power light */}
          <div className="tt-power-light tt-power-on" />

          {/* Controls (visual only) */}
          <div className="tt-power-dial tt-power-on" />
          <div className="tt-start-stop" />
          <div className="tt-speed-33 tt-speed-on" />
          <div className="tt-speed-45" />
          <div className="tt-light" />
          <div className="tt-light-on tt-power-on" />

          {/* Tonearm */}
          <div className="tt-tonearm-holder">
            <div ref={tonearmRef} className="tt-tonearm" />
          </div>
        </div>
      </div>
    </div>
  );
};
