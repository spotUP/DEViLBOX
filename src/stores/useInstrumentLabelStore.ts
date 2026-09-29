/**
 * The owner's word on what an instrument IS - drums (kick / snare / hat /
 * perc), bass, lead, harmony or fx - per song, persisted.
 *
 * The song analyzer (bridge/analysis/songAnalyzer.ts) takes a label as
 * explicit evidence, so a labelled song classifies as labelled at once, and
 * the labels are the answer key the classifier is scored against
 * (instrument-labels.json in the corpus, pulled through the
 * get_instrument_labels MCP tool).
 *
 * Keyed by song: the project name plus the instrument count, since the same
 * instrument ids mean something else in every song.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InstrumentRole, DrumPart } from '@/bridge/analysis/songAnalyzer';

export interface InstrumentLabel {
  role: InstrumentRole;
  drumPart?: DrumPart;
}

interface InstrumentLabelState {
  /** songKey -> instrument id -> label */
  labels: Record<string, Record<number, InstrumentLabel>>;
  setLabel: (songKey: string, instrumentId: number, label: InstrumentLabel | null) => void;
  labelsFor: (songKey: string) => Record<number, InstrumentLabel>;
}

/** The key a song's labels are stored under. */
export function songLabelKey(songName: string | undefined, instrumentCount: number): string {
  return `${(songName ?? '').trim().toLowerCase() || 'untitled'}|${instrumentCount}`;
}

export const useInstrumentLabelStore = create<InstrumentLabelState>()(
  persist(
    (set, get) => ({
      labels: {},
      setLabel: (songKey, instrumentId, label) => set((state) => {
        const song = { ...(state.labels[songKey] ?? {}) };
        if (label) song[instrumentId] = label; else delete song[instrumentId];
        return { labels: { ...state.labels, [songKey]: song } };
      }),
      labelsFor: (songKey) => get().labels[songKey] ?? {},
    }),
    { name: 'devilbox-instrument-labels', version: 1 },
  ),
);
