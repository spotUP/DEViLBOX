/**
 * PianoKeyboardCanvas - Canvas-based vertical piano keyboard sidebar
 *
 * Features: octave labels, black/white key shading, active note highlighting,
 * scale dimming, mouse preview, hover highlight, drag target highlight.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { isBlackKey, getNoteNameFromMidi } from '../../types/pianoRoll';

const KEYBOARD_WIDTH = 72;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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
  visibleNotes,
  containerHeight,
  activeNotes = new Set(),
  scaleNotes,
  dragTargetMidi = null,
  onNotePreview,
  onNoteRelease,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(true);
  const prevKeyRef = useRef('');
  const isPressedRef = useRef(false);
  const hoveredMidiRef = useRef<number | null>(null);

  // Mark dirty on prop changes
  useEffect(() => {
    const key = `${verticalZoom}_${scrollY}_${visibleNotes}_${containerHeight}_${[...activeNotes].join(',')}_${scaleNotes ? [...scaleNotes].join(',') : 'chr'}_${dragTargetMidi}_${hoveredMidiRef.current}`;
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      dirtyRef.current = true;
    }
  });

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    if (!dirtyRef.current) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    dirtyRef.current = false;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const bufferW = Math.ceil(KEYBOARD_WIDTH * dpr);
    const bufferH = Math.ceil(containerHeight * dpr);

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW;
      canvas.height = bufferH;
      canvas.style.width = `${KEYBOARD_WIDTH}px`;
      canvas.style.height = `${containerHeight}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, KEYBOARD_WIDTH, containerHeight);

    const noteCenter = 60;
    const topMidi = scrollY + noteCenter;
    const startNote = Math.min(127, Math.ceil(topMidi) + 2);
    const endNote = Math.max(0, Math.floor(topMidi) - Math.ceil(containerHeight / verticalZoom) - 2);

    for (let midi = startNote; midi >= endNote; midi--) {
      const y = (scrollY + noteCenter - midi) * verticalZoom;
      if (y + verticalZoom < 0 || y > containerHeight) continue;

      const h = verticalZoom;
      const black = isBlackKey(midi);
      const isC = midi % 12 === 0;
      const isActive = activeNotes.has(midi);
      const isDragTarget = dragTargetMidi === midi;
      const noteInOctave = midi % 12;
      const outOfScale = scaleNotes !== undefined && !scaleNotes.has(noteInOctave);
      const isHovered = hoveredMidiRef.current === midi;

      // Key fill
      const keyWidth = black ? Math.floor(KEYBOARD_WIDTH * 0.66) : KEYBOARD_WIDTH;
      
      if (isActive || isDragTarget) {
        ctx.fillStyle = '#06b6d4';
      } else if (black) {
        ctx.fillStyle = outOfScale ? '#1a1a1c' : '#22242a';
      } else {
        ctx.fillStyle = outOfScale ? '#333338' : '#e8e8ec';
      }
      ctx.fillRect(0, y, keyWidth, h);

      // Border between keys
      ctx.fillStyle = black ? '#333' : '#888';
      ctx.fillRect(0, y + h - 0.5, keyWidth, 0.5);

      // Dim out-of-scale keys
      if (outOfScale && !isActive && !isDragTarget) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, y, keyWidth, h);
        ctx.globalAlpha = 1;
      }

      // Hover highlight (blue tint)
      if (isHovered && !isActive && !isDragTarget) {
        ctx.fillStyle = 'rgba(59,130,246,0.15)';
        ctx.fillRect(0, y, keyWidth, h);
      }

      // Note labels
      const showAllLabels = verticalZoom >= 14;
      if (isC || (showAllLabels && !black)) {
        const name = isC ? getNoteNameFromMidi(midi) : NOTE_NAMES[noteInOctave];
        ctx.fillStyle = isActive || isDragTarget ? '#fff' : (black ? '#888' : '#333');
        ctx.font = `${isC ? 'bold ' : ''}${Math.min(10, h - 2)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 6, y + h / 2);
      }

      // Active/drag-target key pressed effect
      if (isActive || isDragTarget) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(2, y + 1, keyWidth - 4, h - 2);
      }
    }

    // Right border
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(KEYBOARD_WIDTH - 1, 0, 1, containerHeight);

    rafRef.current = requestAnimationFrame(renderFrame);
  }, [verticalZoom, scrollY, visibleNotes, containerHeight, activeNotes, scaleNotes, dragTargetMidi]);

  useEffect(() => {
    dirtyRef.current = true;
    rafRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [renderFrame]);

  // Mouse handlers for note preview + hover
  const getMidiNote = useCallback((e: React.MouseEvent): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 60;
    const y = e.clientY - rect.top;
    const midi = scrollY + 60 - Math.floor(y / verticalZoom);
    return Math.max(0, Math.min(127, midi));
  }, [scrollY, verticalZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isPressedRef.current = true;
    const midi = getMidiNote(e);
    onNotePreview?.(midi);
  }, [getMidiNote, onNotePreview]);

  const handleMouseUp = useCallback(() => {
    isPressedRef.current = false;
    onNoteRelease?.();
  }, [onNoteRelease]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const midi = getMidiNote(e);
    if (hoveredMidiRef.current !== midi) {
      hoveredMidiRef.current = midi;
      dirtyRef.current = true;
    }
    // Play note while dragging across keys
    if (isPressedRef.current) {
      onNotePreview?.(midi);
    }
  }, [getMidiNote, onNotePreview]);

  const handleMouseLeave = useCallback(() => {
    if (hoveredMidiRef.current !== null) {
      hoveredMidiRef.current = null;
      dirtyRef.current = true;
    }
    if (isPressedRef.current) {
      isPressedRef.current = false;
      onNoteRelease?.();
    }
  }, [onNoteRelease]);

  return (
    <canvas
      ref={canvasRef}
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
