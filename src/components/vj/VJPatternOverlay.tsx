/**
 * VJPatternOverlay — Semi-transparent pattern data rendered on top of VJ visuals.
 *
 * Shows the current pattern around the playback cursor with channel names,
 * notes, instruments, and effects in a monospace font. Auto-scrolls with
 * playback. The current row is highlighted.
 */

import React, { useRef, useEffect } from 'react';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import type { TrackerCell } from '@/types/tracker';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function fmtNote(note: number): string {
  if (note <= 0) return '\u00B7\u00B7\u00B7';
  if (note === 97 || note === 255) return '===';
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[(note - 1) % 12]}${octave}`;
}

function fmtHex(val: number, digits: number): string {
  if (val <= 0) return '\u00B7'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

function fmtEffect(typ: number, param: number): string {
  if (typ <= 0 && param <= 0) return '\u00B7\u00B7\u00B7';
  const t = typ > 0 ? typ.toString(16).toUpperCase() : '\u00B7';
  const p = param > 0 ? param.toString(16).toUpperCase().padStart(2, '0') : '\u00B7\u00B7';
  return `${t}${p}`;
}

function fmtCell(cell: TrackerCell): string {
  return `${fmtNote(cell.note)} ${fmtHex(cell.instrument, 2)} ${fmtEffect(cell.effTyp, cell.eff)}`;
}

// How many rows above/below the cursor to show
const VISIBLE_ROWS = 16;
const ROW_H = 16;
const CANVAS_W = 1200;
const CANVAS_H = (VISIBLE_ROWS * 2 + 1) * ROW_H + 4;

export const VJPatternOverlay: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const render = () => {
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const { currentRow, isPlaying } = useTransportStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const channels = pattern.channels;
      const numChannels = channels.length;
      const patLen = pattern.length;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Column widths
      const rowNumW = 28;
      const cellW = Math.min(120, (CANVAS_W - rowNumW) / numChannels);

      ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
      ctx.textBaseline = 'middle';

      // Channel headers
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (let ch = 0; ch < numChannels; ch++) {
        const x = rowNumW + ch * cellW;
        const name = channels[ch].shortName || channels[ch].name || `CH${ch + 1}`;
        ctx.fillText(name.slice(0, 8), x + 2, ROW_H * 0.5);
      }

      // Separator line
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(0, ROW_H);
      ctx.lineTo(CANVAS_W, ROW_H);
      ctx.stroke();

      // Rows
      for (let i = -VISIBLE_ROWS; i <= VISIBLE_ROWS; i++) {
        const row = currentRow + i;
        if (row < 0 || row >= patLen) continue;
        const y = ROW_H + (i + VISIBLE_ROWS) * ROW_H;
        const isCurrent = i === 0;

        // Highlight current row
        if (isCurrent) {
          ctx.fillStyle = isPlaying ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.1)';
          ctx.fillRect(0, y, CANVAS_W, ROW_H);
        }

        // Row number
        ctx.fillStyle = isCurrent ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)';
        ctx.fillText(row.toString(16).toUpperCase().padStart(2, '0'), 4, y + ROW_H * 0.5);

        // Cell data
        for (let ch = 0; ch < numChannels; ch++) {
          const cell = channels[ch].rows[row];
          if (!cell) continue;
          const x = rowNumW + ch * cellW;
          const hasNote = cell.note > 0;
          ctx.fillStyle = isCurrent
            ? 'rgba(255,255,255,0.9)'
            : hasNote
              ? 'rgba(255,255,255,0.5)'
              : 'rgba(255,255,255,0.2)';
          ctx.fillText(fmtCell(cell), x + 2, y + ROW_H * 0.5);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none"
      style={{
        maxWidth: '90vw',
        opacity: 0.7,
        mixBlendMode: 'screen',
      }}
    />
  );
});

VJPatternOverlay.displayName = 'VJPatternOverlay';
