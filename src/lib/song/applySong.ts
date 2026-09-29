/**
 * applySong - THE way a whole song enters the app.
 *
 * Every full song load (module import, project load, restore, tab, sync, tour,
 * MCP) goes through here; loaders differ only in how they PARSE. The song
 * used to be applied by hand in each loader, and each copy forgot something:
 * importTrackerModule's libopenmpt fallback never set the editor mode, so a
 * MOD dragged in after an AHX opened the AHX editor (2026-09-29; audit in
 * thoughts/shared/research/2026-09-29_load-save-export-paths.md).
 *
 * Keeps the user's master FX chain (a performance setup, not part of a song);
 * resets everything per song - transport, automation, instruments, dub sends,
 * undo history (owner decisions, plan 2026-09-29-single-load-save-path).
 */
import type { InstrumentConfig } from '@/types/instrument';
import type { Pattern } from '@/types';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useHistoryStore } from '@/stores/useHistoryStore';
import { getToneEngine } from '@/engine/ToneEngine';

type FormatState = ReturnType<typeof useFormatStore.getState>;

/** The editor-mode / native-engine fields of a song (what applyEditorMode reads). */
export type SongEngineData = Parameters<FormatState['applyEditorMode']>[0];

/** Where a song came from - for logs and the few source-specific choices. */
export type SongSource = 'import' | 'project' | 'recovery' | 'revision' | 'tab' | 'sync' | 'tour' | 'mcp';

export interface SongToApply {
  instruments: InstrumentConfig[];
  patterns: Pattern[];
  /** Pattern order; empty keeps the store's default single-entry order. */
  order: number[];
  bpm: number;
  speed: number;
  metadata: { name: string; author?: string; description?: string };
  /** The original module bytes/format for re-export, or null. */
  originalModuleData: Parameters<FormatState['setOriginalModuleData']>[0] | null;
  /**
   * The WHOLE song's editor-mode and native-engine fields - never a
   * hand-picked subset, so a field is never dropped on the way to the engine.
   */
  engine: SongEngineData;
}

/** Stop everything that plays the outgoing song. */
async function stopOutgoingSong(): Promise<void> {
  useTransportStore.getState().stop();
  getToneEngine().releaseAll();
  try {
    const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
    getTrackerReplayer().stop();
  } catch { /* replayer not initialized yet */ }
  try {
    const { getAdPlugPlayer } = await import('@/lib/import/AdPlugPlayer');
    getAdPlugPlayer().stop();
  } catch { /* player may not be initialized */ }
}

/** Replace the current song with `song`. */
export async function applySong(song: SongToApply, source: SongSource): Promise<void> {
  const engine = getToneEngine();
  await stopOutgoingSong();

  // Per-song state. The dub sends are fader positions for one song, written
  // back from the audio graph - a new song inherited the last one's moves
  // (2026-09-22, jennipha.ahx opening the Dub Deck at 45 / 25 / 43 / 25 %).
  useMixerStore.getState().resetDubSends();
  useAutomationStore.getState().reset();
  useTransportStore.getState().reset();
  useInstrumentStore.getState().reset();
  engine.disposeAllInstruments();

  const tracker = useTrackerStore.getState();
  useInstrumentStore.getState().loadInstruments(song.instruments, { skipPreload: true });
  tracker.loadPatterns(song.patterns);
  tracker.setCurrentPattern(0);
  if (song.order.length > 0) tracker.setPatternOrder(song.order);

  const format = useFormatStore.getState();
  format.setOriginalModuleData(song.originalModuleData);
  format.applyEditorMode(song.engine);

  const transport = useTransportStore.getState();
  transport.setBPM(song.bpm);
  transport.setSpeed(song.speed);
  useProjectStore.getState().setMetadata({
    name: song.metadata.name,
    author: song.metadata.author ?? '',
    description: song.metadata.description ?? '',
  });

  // Undoing into the previous song is not meaningful.
  useHistoryStore.getState().clearHistory();

  if (song.instruments.some((i) => i.synthType && i.synthType !== 'Synth')) {
    await engine.preloadInstruments(song.instruments);
  }
  console.log(`[applySong] ${source}: "${song.metadata.name}" - ${song.patterns.length} patterns, ${song.instruments.length} instruments, editor ${useFormatStore.getState().editorMode}`);
}
