import { useMemo } from 'react';
import { useFormatStore } from '@/stores/useFormatStore';
import {
  deriveGrid,
  absoluteTicksOf,
  setNoteDuration,
  moveNote,
  setNoteField,
  setEffectField,
} from '@/lib/maxtrax/maxtraxGrid';
import type { MaxTraxGrid } from '@/lib/maxtrax/maxtraxGrid.types';
import { MaxTraxEngine } from '@/engine/maxtrax/MaxTraxEngine';
import type { MaxTraxScore } from '@/lib/import/formats/maxtrax/maxtraxFormat';

export function useMaxTraxGrid(
  scoreIndex: number,
  ticksPerRow: number,
): {
  grid: MaxTraxGrid | null;
  edit: {
    setNoteDuration(eventIndex: number, dur: number): void;
    moveNote(eventIndex: number, absTick: number): void;
    setNoteField(eventIndex: number, patch: Parameters<typeof setNoteField>[2]): void;
    setEffectField(eventIndex: number, patch: Parameters<typeof setEffectField>[2]): void;
    setNoteOffset(eventIndex: number, newOffset: number): void;
  };
} {
  // Primary re-render signal: maxTraxRev increments on every mutateMaxTraxScore call.
  void useFormatStore((s) => s.maxTraxRev);
  // maxTraxData provides the score content for grid derivation.
  const data = useFormatStore((s) => s.maxTraxData);
  const mutate = useFormatStore((s) => s.mutateMaxTraxScore);
  const score: MaxTraxScore | null = data?.scores[scoreIndex] ?? null;
  // deriveGrid rebuilds the entire grid model (rows x columns x cells) — expensive
  // on large scores. An edit replaces `score` with a fresh immer object, so keying
  // the memo on the score identity recomputes exactly when the content changes and
  // reuses the model across unrelated re-renders (cursor moves, cell-edit typing).
  const grid: MaxTraxGrid | null = useMemo(
    () => (score !== null ? deriveGrid(score, ticksPerRow) : null),
    [score, ticksPerRow],
  );

  /**
   * Apply a pure-op result to the store and project ALL changed events to the WASM worklet.
   *
   * The store is written EXACTLY ONCE per edit (one rev bump, one React re-render).
   * We diff `current.events` vs `next.events` to find every index changed by the op —
   * `moveNote` changes TWO indices (events[i] and events[i+1]), so a single-event push
   * would leave the live audio half-applied. The diff ensures every changed index gets
   * its own worklet message via `projectEventToWorklet` (worklet-only, no store write),
   * then a single `recook` rewinds the player.
   */
  function apply(current: MaxTraxScore, next: MaxTraxScore): void {
    const changedIndices: number[] = [];
    for (let i = 0; i < next.events.length; i++) {
      const c = current.events[i];
      const n = next.events[i];
      if (
        !c ||
        c.command !== n.command ||
        c.data !== n.data ||
        c.startTime !== n.startTime ||
        c.stopTime !== n.stopTime
      ) {
        changedIndices.push(i);
      }
    }

    // Single atomic store update (one rev bump, one React re-render).
    mutate(scoreIndex, (s) => {
      s.events.length = 0;
      s.events.push(...next.events);
    });

    // Project each changed event to the live WASM worklet only — the store write above
    // is the single authority update; projectEventToWorklet skips the store entirely.
    const engine = MaxTraxEngine.getInstance();
    for (const idx of changedIndices) {
      engine.projectEventToWorklet(scoreIndex, idx, next.events[idx]);
    }
    engine.recook(scoreIndex);
  }

  const edit = {
    setNoteDuration: (eventIndex: number, dur: number) => {
      if (score !== null) apply(score, setNoteDuration(score, eventIndex, dur));
    },
    moveNote: (eventIndex: number, absTick: number) => {
      if (score !== null) apply(score, moveNote(score, eventIndex, absTick));
    },
    setNoteField: (eventIndex: number, patch: Parameters<typeof setNoteField>[2]) => {
      if (score !== null) apply(score, setNoteField(score, eventIndex, patch));
    },
    setEffectField: (eventIndex: number, patch: Parameters<typeof setEffectField>[2]) => {
      if (score !== null) apply(score, setEffectField(score, eventIndex, patch));
    },
    setNoteOffset: (i: number, newOffset: number) => {
      if (!score) return;
      const cur = absoluteTicksOf(score)[i];            // current absolute start tick of event i
      const rowBase = cur - (cur % ticksPerRow);         // start tick of the row it sits in
      const newAbs = rowBase + Math.max(0, newOffset);   // same row, new sub-row offset
      apply(score, moveNote(score, i, newAbs));           // moveNote clamps + dispatches
    },
  };

  return { grid, edit };
}
