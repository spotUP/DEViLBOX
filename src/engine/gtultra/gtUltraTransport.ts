/**
 * GoatTracker playback has its own engine and store (useGTUltraStore); the
 * shared transport (play / stop / toggle) did not know it, so the Play button
 * in the toolbar started it while the jukebox, the MCP bridge and every other
 * caller of useTransportStore.play() left it silent ("Silent" on all four
 * Goat Tracker Ultra keys, 2026-10-05 broken-formats sweep, B1). The toolbar
 * and the transport store both call these.
 */
import * as Tone from 'tone';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { setFormatPlaybackPlaying, resetFormatPlaybackState } from '@engine/FormatPlaybackState';

/** True when the GTUltra engine owns playback (editor mode goattracker and the engine is up). */
export function gtUltraOwnsTransport(editorMode: string | undefined): boolean {
  return editorMode === 'goattracker' && !!useGTUltraStore.getState().engine;
}

export async function gtUltraPlay(): Promise<boolean> {
  const gtStore = useGTUltraStore.getState();
  const gtEngine = gtStore.engine;
  if (!gtEngine) return false;
  const ctx = Tone.getContext().rawContext as AudioContext;
  if (ctx.state !== 'running') await ctx.resume();
  resetFormatPlaybackState();
  gtEngine.play();
  gtStore.setPlaying(true);
  setFormatPlaybackPlaying(true);
  return true;
}

export function gtUltraStop(): boolean {
  const gtStore = useGTUltraStore.getState();
  const gtEngine = gtStore.engine;
  if (!gtEngine) return false;
  gtEngine.stop();
  gtStore.setPlaying(false);
  setFormatPlaybackPlaying(false);
  return true;
}

export async function gtUltraTogglePlay(): Promise<boolean> {
  const gtStore = useGTUltraStore.getState();
  if (!gtStore.engine) return false;
  return gtStore.playing ? gtUltraStop() : gtUltraPlay();
}
