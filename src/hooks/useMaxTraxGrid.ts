import { useFormatStore } from '@/stores/useFormatStore';
import {
  deriveGrid,
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
  };
} {
  // Subscribe to maxTraxData — Immer creates new references on every mutateMaxTraxScore
  // call, so this selector re-runs the hook whenever the score is edited.
  const data = useFormatStore((s) => s.maxTraxData);
  const mutate = useFormatStore((s) => s.mutateMaxTraxScore);
  const score: MaxTraxScore | null = data?.scores[scoreIndex] ?? null;
  const grid: MaxTraxGrid | null = score !== null ? deriveGrid(score, ticksPerRow) : null;

  /**
   * Apply a pure-op result to the store and project ALL changed events to the WASM engine.
   *
   * We diff `current.events` vs `next.events` to find every index changed by the op —
   * `moveNote` changes TWO deltas (events[i] and events[i+1]), so a single-event push
   * would leave the live audio half-applied. The diff ensures every changed index gets
   * its own `setEvent` worklet message, then a single `recook` rewinds the player.
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

    // Project each changed event to the live WASM engine for immediate audio update.
    const engine = MaxTraxEngine.getInstance();
    for (const idx of changedIndices) {
      engine.setEvent(scoreIndex, idx, next.events[idx]);
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
  };

  return { grid, edit };
}
