/**
 * One programme at a time (owner decision 2026-10-10): the tracker transport
 * and the DJ decks never play together. Starting either one stops the other;
 * switching views alone changes nothing, so a DJ set keeps running while the
 * tracker is on screen.
 *
 * Both sides are watched at the store, not at their buttons, so every way of
 * starting playback is covered: transport bar, keyboard, MCP, Auto DJ.
 * Before this, nothing related the two: playing a song in the tracker while a
 * DJ set ran left both audible.
 */
import { useTransportStore } from '@/stores/useTransportStore';
import { useDJStore } from '@/stores/useDJStore';

const DECK_IDS = ['A', 'B', 'C'] as const;
type DeckId = (typeof DECK_IDS)[number];

function playingDecks(): DeckId[] {
  const decks = useDJStore.getState().decks;
  return DECK_IDS.filter((id) => decks[id].isPlaying);
}

/** The tracker started: Auto DJ off first (it would load and start the next deck), then every deck stops. */
async function stopDJ(): Promise<void> {
  const decks = playingDecks();
  if (decks.length === 0 && !useDJStore.getState().autoDJEnabled) return;
  const { disableAutoDJ, stopDeck } = await import('@/engine/dj/DJActions');
  if (useDJStore.getState().autoDJEnabled) disableAutoDJ();
  for (const id of decks) stopDeck(id);
}

/**
 * The output passes to the DJ decks: the tracker stops, its notes release, and
 * the tracker's global pitch and rate go back to neutral - they are ToneEngine
 * globals and would otherwise leak into DJ audio (wrong speed). Runs when a
 * deck starts while the tracker plays, and on entering the DJ view when the
 * tracker is silent; never on a view switch alone while the tracker plays.
 */
export async function handOverToDJ(): Promise<void> {
  const transport = useTransportStore.getState();
  if (transport.isPlaying) transport.stop();
  const { getToneEngine } = await import('@/engine/ToneEngine');
  const engine = getToneEngine();
  engine.releaseAll();
  engine.setGlobalPlaybackRate(1.0);
  engine.setGlobalDetune(0);
  useTransportStore.getState().setGlobalPitch(0);
}

let unsubscribe: (() => void) | null = null;

/** Call once at startup. Returns the uninstaller (tests). */
export function installOneProgrammeAtATime(): () => void {
  if (unsubscribe) return unsubscribe;
  const offTransport = useTransportStore.subscribe((state, prev) => {
    if (state.isPlaying && !prev.isPlaying) void stopDJ();
  });
  const offDecks = useDJStore.subscribe(
    (s) => DECK_IDS.map((id) => s.decks[id].isPlaying),
    (now, before) => {
      const started = now.some((playing, i) => playing && !before[i]);
      if (started && useTransportStore.getState().isPlaying) void handOverToDJ();
    },
    { equalityFn: (a, b) => a.every((v, i) => v === b[i]) },
  );
  unsubscribe = () => { offTransport(); offDecks(); unsubscribe = null; };
  return unsubscribe;
}
