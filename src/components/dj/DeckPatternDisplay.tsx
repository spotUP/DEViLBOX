/**
 * DeckPatternDisplay - Mini pattern view showing current tracker data
 *
 * Flexible-width pattern display that adapts to the actual channel count
 * of the loaded song. Fills available width in the deck panel.
 * Current row is highlighted, auto-scrolls to keep it centered.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import type { TrackerCell } from '@/types';

interface DeckPatternDisplayProps {
  deckId: 'A' | 'B';
}

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** Convert XM note number to display string (e.g. "C-4", "D#5", "---") */
function formatNote(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return 'OFF';
  if (note < 1 || note > 96) return '---';
  const midi = note + 11;
  const octave = Math.floor(midi / 12) - 1;
  const semitone = midi % 12;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

/** Format effect type + param as hex string (e.g. "F06", "C40", "...") */
function formatEffect(effTyp: number, eff: number): string {
  if (effTyp === 0 && eff === 0) return '...';
  const typChar = effTyp < 10 ? String(effTyp) : String.fromCharCode(55 + effTyp);
  const paramHex = eff.toString(16).toUpperCase().padStart(2, '0');
  return `${typChar}${paramHex}`;
}

export const DeckPatternDisplay: React.FC<DeckPatternDisplayProps> = ({ deckId }) => {
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const pattPos = useDJStore((s) => s.decks[deckId].pattPos);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get pattern data and channel count from the engine
  const { patternData, numChannels } = useMemo(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const song = deck.replayer.getSong();
      if (!song || !song.songPositions || song.songPositions.length === 0) {
        return { patternData: null, numChannels: 4 };
      }

      const patternIndex = song.songPositions[songPos] ?? 0;
      const pattern = song.patterns[patternIndex];
      return {
        patternData: pattern ?? null,
        numChannels: song.numChannels,
      };
    } catch {
      return { patternData: null, numChannels: 4 };
    }
  }, [deckId, songPos]);

  // Auto-scroll to keep current row centered
  useEffect(() => {
    if (!scrollRef.current) return;
    const rowHeight = 18;
    const containerHeight = scrollRef.current.clientHeight;
    const targetScroll = (pattPos * rowHeight) - (containerHeight / 2) + (rowHeight / 2);
    scrollRef.current.scrollTop = Math.max(0, targetScroll);
  }, [pattPos]);

  // Build row data
  const rows = useMemo(() => {
    if (!patternData) {
      // Placeholder grid
      const placeholderRows = [];
      for (let r = 0; r < 64; r++) {
        const cells = [];
        for (let c = 0; c < numChannels; c++) {
          cells.push({ note: '---', effect: '...' });
        }
        placeholderRows.push({ rowNum: r, cells });
      }
      return placeholderRows;
    }

    const numRows = patternData.length;
    const channels = patternData.channels || [];
    const result = [];

    for (let r = 0; r < numRows; r++) {
      const cells = [];
      for (let c = 0; c < numChannels; c++) {
        const cell: TrackerCell | undefined = channels[c]?.rows?.[r];
        if (cell) {
          cells.push({
            note: formatNote(cell.note),
            effect: formatEffect(cell.effTyp, cell.eff),
          });
        } else {
          cells.push({ note: '---', effect: '...' });
        }
      }
      result.push({ rowNum: r, cells });
    }

    return result;
  }, [patternData, numChannels]);

  return (
    <div
      className="bg-dark-bg border border-dark-border rounded-sm overflow-hidden w-full"
      style={{ height: 180 }}
    >
      {/* Header — channel labels stretch to fill */}
      <div
        className="flex items-center px-1 border-b border-dark-border bg-dark-bgSecondary"
        style={{ height: 18 }}
      >
        {/* Row number spacer */}
        <div className="shrink-0" style={{ width: 20 }} />
        {Array.from({ length: numChannels }, (_, i) => (
          <div
            key={i}
            className="flex-1 text-center font-mono text-text-muted truncate"
            style={{ fontSize: 9, minWidth: 0 }}
          >
            {numChannels <= 8 ? `CH${i + 1}` : `${i + 1}`}
          </div>
        ))}
      </div>

      {/* Scrollable pattern rows */}
      <div
        ref={scrollRef}
        className="overflow-hidden"
        style={{ height: 162 }}
      >
        {rows.map((row) => {
          const isCurrent = row.rowNum === pattPos;
          const isHighlightRow = row.rowNum % 16 === 0;
          const isBeatRow = row.rowNum % 4 === 0;

          return (
            <div
              key={row.rowNum}
              className={`flex items-center px-1 ${
                isCurrent
                  ? 'bg-blue-600/40'
                  : isHighlightRow
                    ? 'bg-dark-bgTertiary'
                    : isBeatRow
                      ? 'bg-dark-bgSecondary/50'
                      : ''
              }`}
              style={{ height: 18, minHeight: 18 }}
            >
              {/* Row number */}
              <div
                className="font-mono text-text-muted shrink-0 text-right pr-1"
                style={{ fontSize: 9, width: 20 }}
              >
                {row.rowNum.toString(16).toUpperCase().padStart(2, '0')}
              </div>

              {/* Channel cells — flex to fill available width */}
              {row.cells.map((cell, ci) => (
                <div
                  key={ci}
                  className="flex-1 flex font-mono gap-px overflow-hidden min-w-0"
                  style={{ fontSize: 10 }}
                >
                  <span
                    className={`truncate ${
                      cell.note === '---'
                        ? 'text-text-muted/40'
                        : cell.note === 'OFF'
                          ? 'text-red-400'
                          : 'text-tracker-cell-note'
                    }`}
                  >
                    {cell.note}
                  </span>
                  <span
                    className={`truncate ${
                      cell.effect === '...'
                        ? 'text-text-muted/30'
                        : 'text-tracker-cell-effect'
                    }`}
                    style={{ fontSize: 9 }}
                  >
                    {cell.effect}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
