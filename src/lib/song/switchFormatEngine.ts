/**
 * Switch the engine one format plays on (plan D7): the store takes the choice, and when the loaded song is of that
 * format it is opened again through the one load path (openSong) from the module the next play would load - the
 * edited one when the grid was edited - and put back at the order and row it was at.
 */
import type { FormatEngineChoice } from '@/types/formatEngine';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { nuadeFormatsByPrefKey, type NuadeFormat } from '@/engine/nuade/nuadeFormats';
import { engineChoicesFor, storedChoiceFor } from '@/engine/nuade/nuadeRouting';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { liveTrackerSong } from './liveSong';

export interface SwitchDeps {
  getSong(): TrackerSong;
  isPlaying(): boolean;
  position(): { position: number; row: number };
  restorePosition(p: { position: number; row: number }): void;
  /** The playing engine's module for the song, the edited one when the grid was edited. */
  moduleFor(song: TrackerSong): Promise<ArrayBuffer | Uint8Array | null>;
  open(name: string, bytes: ArrayBuffer, companions: Map<string, ArrayBuffer> | undefined, start: false | 'song'): Promise<{ ok: boolean; error?: string }>;
  setChoice(prefKey: string, choice: FormatEngineChoice): void;
  /** Forget the stored choice: the key plays on its table default. */
  clearChoice(prefKey: string): void;
}

export type SwitchResult =
  | { switched: true; reopened: boolean; stored: FormatEngineChoice }
  | { switched: false; error: string };

const fileNameOf = (song: TrackerSong): string =>
  song.nuadeFileName ?? song.uadeEditableFileName ?? song.eaglePlayerFileName ?? song.name;

/** Whether the loaded song is a song of this row: nuade names its player, otherwise the file name / registry say. */
export function songBelongsTo(song: TrackerSong, row: NuadeFormat): boolean {
  if (song.nuadePlayerId) return song.nuadePlayerId === row.id;
  const name = fileNameOf(song).toLowerCase();
  const first = name.indexOf('.');
  if (first < 0) return false;
  const tags = [name.slice(0, first), name.slice(name.lastIndexOf('.') + 1)];
  return row.extensions.some((e) => tags.includes(e));
}

export async function switchFormatEngine(prefKey: string, choice: FormatEngineChoice | 'default', deps: SwitchDeps = defaultDeps()): Promise<SwitchResult> {
  const rows = nuadeFormatsByPrefKey(prefKey);
  if (rows.length === 0) return { switched: false, error: `no format engine choice named ${prefKey}` };
  let stored: FormatEngineChoice;
  if (choice === 'default') {
    deps.clearChoice(prefKey);
    stored = rows[0]!.defaultEngine;
  } else {
    if (!engineChoicesFor(rows[0]!).includes(choice)) return { switched: false, error: `${rows[0]!.label} cannot play on ${choice}` };
    stored = storedChoiceFor(rows[0]!, choice);
    deps.setChoice(prefKey, stored);
  }

  const song = deps.getSong();
  const row = rows.find((r) => songBelongsTo(song, r));
  if (!row) return { switched: true, reopened: false, stored };
  const bytes = await deps.moduleFor(song);
  if (!bytes) return { switched: true, reopened: false, stored };
  const at = deps.position();
  const copy = (bytes instanceof Uint8Array ? bytes.slice().buffer : bytes.slice(0)) as ArrayBuffer;
  const wasPlaying = deps.isPlaying();
  const r = await deps.open(fileNameOf(song), copy, song.uadeCompanionFiles, wasPlaying ? 'song' : false);
  if (!r.ok) return { switched: false, error: r.error ?? 'the song could not be opened again' };
  deps.restorePosition(at);
  return { switched: true, reopened: true, stored };
}

function defaultDeps(): SwitchDeps {
  return {
    getSong: () => liveTrackerSong(),
    isPlaying: () => useTransportStore.getState().isPlaying,
    position: () => ({
      position: useTrackerStore.getState().currentPositionIndex,
      row: useTransportStore.getState().currentRow,
    }),
    restorePosition: ({ position, row }) => {
      useTrackerStore.getState().setCurrentPosition(position);
      useTransportStore.getState().setCurrentRow(row);
    },
    moduleFor: async (song) => {
      const { playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
      const desc = playingDescriptor(song);
      if (!desc) return null;
      const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
      return (await editedModuleForPlay(song, desc)) ?? ((song[desc.fileDataKey] as ArrayBuffer | Uint8Array | undefined) ?? null);
    },
    open: async (name, bytes, companions, start) => {
      const { openSong } = await import('./openSong');
      const r = await openSong({ kind: 'bytes', name, bytes, companions }, { origin: 'subsong', start, interactive: false });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    setChoice: (key, choice) => useSettingsStore.getState().setFormatEngine(key as never, choice),
    clearChoice: (key) => useSettingsStore.getState().resetFormatEngine(key as never),
  };
}
