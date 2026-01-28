/**
 * NoteActivityDisplay - Mini piano keyboard showing active notes
 *
 * Features:
 * - Compact piano keyboard display
 * - Color-coded by velocity (dim to bright)
 * - Shows multiple simultaneous notes
 * - Supports filtering by channel
 * - 30fps animation
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { useVisualizationStore } from '@stores/useVisualizationStore';

interface NoteActivityDisplayProps {
  channelIndex?: number; // Optional: filter to specific channel
  octaveStart?: number; // Start octave (default: 2)
  octaveEnd?: number; // End octave (default: 6)
  width?: number;
  height?: number;
  whiteKeyColor?: string;
  blackKeyColor?: string;
  activeColor?: string;
  backgroundColor?: string;
  className?: string;
}

// Note names for parsing
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
const BLACK_NOTES = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#

// Parse note string to MIDI number
function noteToMidi(note: string): number {
  const match = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return -1;

  const noteName = match[1];
  const octave = parseInt(match[2], 10);
  const noteIndex = NOTE_NAMES.indexOf(noteName);

  if (noteIndex === -1) return -1;

  return (octave + 1) * 12 + noteIndex;
}

export const NoteActivityDisplay: React.FC<NoteActivityDisplayProps> = ({
  channelIndex,
  octaveStart = 2,
  octaveEnd = 6,
  width = 200,
  height = 32,
  whiteKeyColor = '#f5f5f5',
  blackKeyColor = '#1a1a1a',
  activeColor = '#4ade80',
  backgroundColor = '#0a0a0a',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Subscribe to visualization store
  const activeNotes = useVisualizationStore((state) => state.activeNotes);

  // Calculate key dimensions
  const numOctaves = octaveEnd - octaveStart;
  const numWhiteKeys = numOctaves * 7;
  const whiteKeyWidth = width / numWhiteKeys;
  const blackKeyWidth = whiteKeyWidth * 0.6;
  const blackKeyHeight = height * 0.6;

  // Calculate MIDI range
  const midiStart = (octaveStart + 1) * 12; // C of start octave
  const midiEnd = (octaveEnd + 1) * 12; // C of end octave

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    contextRef.current = ctx;
  }, []);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return false;

    // Collect active MIDI notes with velocities
    const activeMap = new Map<number, number>(); // MIDI note -> velocity

    if (channelIndex !== undefined) {
      // Single channel
      const notes = activeNotes.get(channelIndex) || [];
      for (const note of notes) {
        const midi = noteToMidi(note.note);
        if (midi >= midiStart && midi < midiEnd) {
          activeMap.set(midi, Math.max(activeMap.get(midi) || 0, note.velocity));
        }
      }
    } else {
      // All channels
      activeNotes.forEach((notes) => {
        for (const note of notes) {
          const midi = noteToMidi(note.note);
          if (midi >= midiStart && midi < midiEnd) {
            activeMap.set(midi, Math.max(activeMap.get(midi) || 0, note.velocity));
          }
        }
      });
    }

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw white keys first
    let whiteKeyIndex = 0;
    for (let octave = octaveStart; octave < octaveEnd; octave++) {
      for (const noteInOctave of WHITE_NOTES) {
        const midi = (octave + 1) * 12 + noteInOctave;
        const x = whiteKeyIndex * whiteKeyWidth;
        const velocity = activeMap.get(midi);

        if (velocity !== undefined) {
          // Active key - interpolate color based on velocity
          const alpha = 0.4 + velocity * 0.6;
          ctx.fillStyle = activeColor;
          ctx.globalAlpha = alpha;
          ctx.fillRect(x + 0.5, 0, whiteKeyWidth - 1, height - 1);
          ctx.globalAlpha = 1;

          // Glow
          ctx.shadowColor = activeColor;
          ctx.shadowBlur = 4;
          ctx.fillRect(x + 0.5, 0, whiteKeyWidth - 1, height - 1);
          ctx.shadowBlur = 0;
        } else {
          // Inactive key
          ctx.fillStyle = whiteKeyColor;
          ctx.fillRect(x + 0.5, 0, whiteKeyWidth - 1, height - 1);
        }

        // Key border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, 0.5, whiteKeyWidth - 1, height - 1);

        whiteKeyIndex++;
      }
    }

    // Draw black keys on top
    whiteKeyIndex = 0;
    for (let octave = octaveStart; octave < octaveEnd; octave++) {
      for (let i = 0; i < WHITE_NOTES.length; i++) {
        const x = whiteKeyIndex * whiteKeyWidth;

        // Check if there's a black key after this white key
        const nextNoteInOctave = WHITE_NOTES[i] + 1;
        if (BLACK_NOTES.includes(nextNoteInOctave)) {
          const blackMidi = (octave + 1) * 12 + nextNoteInOctave;
          const blackX = x + whiteKeyWidth - blackKeyWidth / 2;
          const velocity = activeMap.get(blackMidi);

          if (velocity !== undefined) {
            // Active black key
            const alpha = 0.4 + velocity * 0.6;
            ctx.fillStyle = activeColor;
            ctx.globalAlpha = alpha;
            ctx.fillRect(blackX, 0, blackKeyWidth, blackKeyHeight);
            ctx.globalAlpha = 1;

            // Glow
            ctx.shadowColor = activeColor;
            ctx.shadowBlur = 4;
            ctx.fillRect(blackX, 0, blackKeyWidth, blackKeyHeight);
            ctx.shadowBlur = 0;
          } else {
            // Inactive black key
            ctx.fillStyle = blackKeyColor;
            ctx.fillRect(blackX, 0, blackKeyWidth, blackKeyHeight);
          }

          // Black key border
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          ctx.strokeRect(blackX, 0, blackKeyWidth, blackKeyHeight);
        }

        whiteKeyIndex++;
      }
    }

    return activeMap.size > 0;
  }, [
    activeNotes,
    channelIndex,
    midiStart,
    midiEnd,
    numWhiteKeys,
    whiteKeyWidth,
    blackKeyWidth,
    blackKeyHeight,
    whiteKeyColor,
    blackKeyColor,
    activeColor,
    backgroundColor,
    height,
    octaveStart,
    octaveEnd,
  ]);

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
  });

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`rounded ${className}`}
      style={{ backgroundColor }}
    />
  );
};
