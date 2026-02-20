/**
 * PianoKeyboardCanvas - Canvas-based vertical piano keyboard sidebar
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Mouse interaction (hover, note preview) stays on the main thread.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import KeyboardWorkerFactory from '@/workers/piano-keyboard.worker.ts?worker';

const KEYBOARD_WIDTH = 72;

interface KeyboardState {
  verticalZoom: number;
  scrollY: number;
  containerHeight: number;
  activeNotes: number[];
  scaleNotes: number[] | null;
  dragTargetMidi: number | null;
}

type KeyboardMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number; state: KeyboardState }
  | { type: 'state'; state: KeyboardState }
  | { type: 'hover'; midi: number | null }
  | { type: 'resize'; h: number; dpr: number };

interface PianoKeyboardCanvasProps {
  verticalZoom: number;
  scrollY: number;
  visibleNotes: number;
  containerHeight: number;
  activeNotes?: Set<number>;
  scaleNotes?: Set<number>;
  dragTargetMidi?: number | null;
  onNotePreview?: (midiNote: number) => void;
  onNoteRelease?: () => void;
}

const PianoKeyboardCanvasComponent: React.FC<PianoKeyboardCanvasProps> = ({
  verticalZoom,
  scrollY,
  containerHeight,
  activeNotes = new Set(),
  scaleNotes,
  dragTargetMidi = null,
  onNotePreview,
  onNoteRelease,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<KeyboardMsg, { type: string }> | null>(null);

  // Refs for mouse interaction (computed on main thread)
  const isPressedRef   = useRef(false);
  const hoveredMidiRef = useRef<number | null>(null);

  // ── Bridge init ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:${KEYBOARD_WIDTH}px;height:${containerHeight}px;`;
    container.appendChild(canvas);

    const dpr = window.devicePixelRatio || 1;
    const offscreen = canvas.transferControlToOffscreen();

    const bridge = new OffscreenBridge<KeyboardMsg, { type: string }>(
      KeyboardWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init', canvas: offscreen, dpr,
      state: snapshotState(),
    }, [offscreen]);

    return () => {
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Forward prop changes ─────────────────────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({ type: 'state', state: snapshotState() });
    // Update canvas CSS height when containerHeight changes
    const canvas = containerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (canvas) canvas.style.height = `${containerHeight}px`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalZoom, scrollY, containerHeight, activeNotes, scaleNotes, dragTargetMidi]);

  function snapshotState(): KeyboardState {
    return {
      verticalZoom,
      scrollY,
      containerHeight,
      activeNotes:   Array.from(activeNotes),
      scaleNotes:    scaleNotes ? Array.from(scaleNotes) : null,
      dragTargetMidi,
    };
  }

  // ── Mouse handlers (main thread — compute midi note, post hover to worker) ───

  const getMidiNote = useCallback((e: React.MouseEvent): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 60;
    const y = e.clientY - rect.top;
    const midi = scrollY + 60 - Math.floor(y / verticalZoom);
    return Math.max(0, Math.min(127, midi));
  }, [scrollY, verticalZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isPressedRef.current = true;
    onNotePreview?.(getMidiNote(e));
  }, [getMidiNote, onNotePreview]);

  const handleMouseUp = useCallback(() => {
    isPressedRef.current = false;
    onNoteRelease?.();
  }, [onNoteRelease]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const midi = getMidiNote(e);
    if (hoveredMidiRef.current !== midi) {
      hoveredMidiRef.current = midi;
      bridgeRef.current?.post({ type: 'hover', midi });
    }
    if (isPressedRef.current) onNotePreview?.(midi);
  }, [getMidiNote, onNotePreview]);

  const handleMouseLeave = useCallback(() => {
    if (hoveredMidiRef.current !== null) {
      hoveredMidiRef.current = null;
      bridgeRef.current?.post({ type: 'hover', midi: null });
    }
    if (isPressedRef.current) {
      isPressedRef.current = false;
      onNoteRelease?.();
    }
  }, [onNoteRelease]);

  return (
    <div
      ref={containerRef}
      className="shrink-0"
      style={{ width: KEYBOARD_WIDTH, height: containerHeight }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      role="group"
      aria-label="Piano keyboard"
    />
  );
};

export const PianoKeyboardCanvas = React.memo(PianoKeyboardCanvasComponent);
export default PianoKeyboardCanvas;
