/**
 * MCP Bridge — DJ Handlers
 *
 * Handles DJ control commands from the iPhone controller (and MCP).
 * Each handler maps to a DJActions function or reads from useDJStore.
 */

import { useDJStore, type DeckState } from '../../stores/useDJStore';
import { useDJPlaylistStore } from '../../stores/useDJPlaylistStore';

// Lazy-import DJ actions to avoid loading DJEngine at bridge init
async function getActions() {
  return import('../../engine/dj/DJActions');
}

// ─── Read: DJ State ─────────────────────────────────────────────────────────

export function getDJState(): Record<string, unknown> {
  const s = useDJStore.getState();
  return {
    decks: {
      A: deckSnapshot(s.decks.A),
      B: deckSnapshot(s.decks.B),
    },
    crossfaderPosition: s.crossfaderPosition,
    crossfaderCurve: s.crossfaderCurve,
    masterVolume: s.masterVolume,
    autoDJEnabled: s.autoDJEnabled,
    autoDJStatus: s.autoDJStatus,
    autoDJCurrentTrackIndex: s.autoDJCurrentTrackIndex,
    autoDJNextTrackIndex: s.autoDJNextTrackIndex,
  };
}

function deckSnapshot(d: DeckState) {
  return {
    isPlaying: d.isPlaying,
    fileName: d.fileName,
    trackName: d.trackName,
    detectedBPM: d.detectedBPM,
    effectiveBPM: d.effectiveBPM,
    elapsedMs: d.elapsedMs,
    durationMs: d.durationMs,
    audioPosition: d.audioPosition,
    volume: d.volume,
    eqLow: d.eqLow,
    eqMid: d.eqMid,
    eqHigh: d.eqHigh,
    eqLowKill: d.eqLowKill,
    eqMidKill: d.eqMidKill,
    eqHighKill: d.eqHighKill,
    filterPosition: d.filterPosition,
    pitchOffset: d.pitchOffset,
    keyLockEnabled: d.keyLockEnabled,
    playbackMode: d.playbackMode,
    musicalKey: d.musicalKey,
  };
}

export function getDJPlaylistState(): Record<string, unknown> {
  const s = useDJPlaylistStore.getState();
  const active = s.playlists.find(p => p.id === s.activePlaylistId);
  return {
    activePlaylistId: s.activePlaylistId,
    playlistName: active?.name ?? null,
    trackCount: active?.tracks.length ?? 0,
  };
}

// ─── Write: Transport ───────────────────────────────────────────────────────

export async function djTogglePlay(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const actions = await getActions();
  await actions.togglePlay(deckId as 'A' | 'B');
  return { ok: true };
}

export async function djStop(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const actions = await getActions();
  actions.stopDeck(deckId as 'A' | 'B');
  return { ok: true };
}

export async function djCue(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const position = (params.position as number) ?? 0;
  const actions = await getActions();
  actions.cueDeck(deckId as 'A' | 'B', position);
  return { ok: true };
}

export async function djSync(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const actions = await getActions();
  actions.syncDeckBPM(deckId as 'A' | 'B');
  return { ok: true };
}

// ─── Write: Crossfader ──────────────────────────────────────────────────────

export async function djCrossfader(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const position = params.position as number;
  const actions = await getActions();
  actions.setCrossfader(position);
  return { ok: true };
}

export async function djCrossfaderCurve(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const curve = params.curve as 'linear' | 'cut' | 'smooth';
  const actions = await getActions();
  actions.setCrossfaderCurve(curve);
  return { ok: true };
}

// ─── Write: EQ ──────────────────────────────────────────────────────────────

export async function djEQ(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const band = params.band as 'low' | 'mid' | 'high';
  const dB = params.dB as number;
  const actions = await getActions();
  actions.setDeckEQ(deckId as 'A' | 'B', band, dB);
  return { ok: true };
}

export async function djEQKill(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const band = params.band as 'low' | 'mid' | 'high';
  const kill = params.kill as boolean;
  const actions = await getActions();
  actions.setDeckEQKill(deckId as 'A' | 'B', band, kill);
  return { ok: true };
}

// ─── Write: Filter ──────────────────────────────────────────────────────────

export async function djFilter(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const position = params.position as number;
  const actions = await getActions();
  actions.setDeckFilter(deckId as 'A' | 'B', position);
  return { ok: true };
}

// ─── Write: Volume & Gain ───────────────────────────────────────────────────

export async function djVolume(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const volume = params.volume as number;
  const actions = await getActions();
  actions.setDeckVolume(deckId as 'A' | 'B', volume);
  return { ok: true };
}

export async function djMasterVolume(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const volume = params.volume as number;
  const actions = await getActions();
  actions.setMasterVolume(volume);
  return { ok: true };
}

// ─── Write: Pitch ───────────────────────────────────────────────────────────

export async function djPitch(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const semitones = params.semitones as number;
  const actions = await getActions();
  actions.setDeckPitch(deckId as 'A' | 'B', semitones);
  return { ok: true };
}

export async function djKeyLock(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const enabled = params.enabled as boolean;
  const actions = await getActions();
  actions.setDeckKeyLock(deckId as 'A' | 'B', enabled);
  return { ok: true };
}

// ─── Write: Nudge ───────────────────────────────────────────────────────────

export async function djNudge(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const offset = (params.offset as number) ?? 1;
  const actions = await getActions();
  actions.nudgeDeck(deckId as 'A' | 'B', offset);
  return { ok: true };
}

// ─── Write: Loop ────────────────────────────────────────────────────────────

export async function djLoop(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const size = (params.size as number) ?? 4;
  const actions = await getActions();
  actions.setDeckLineLoop(deckId as 'A' | 'B', size);
  return { ok: true };
}

export async function djLoopClear(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deckId = (params.deckId as string) || 'A';
  const actions = await getActions();
  actions.clearDeckLineLoop(deckId as 'A' | 'B');
  return { ok: true };
}

// ─── Write: Auto DJ ─────────────────────────────────────────────────────────

export async function djAutoDJEnable(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const startIndex = params.startIndex as number | undefined;
  const actions = await getActions();
  await actions.enableAutoDJ(startIndex);
  return { ok: true };
}

export async function djAutoDJDisable(): Promise<Record<string, unknown>> {
  const actions = await getActions();
  actions.disableAutoDJ();
  return { ok: true };
}

export async function djAutoDJSkip(): Promise<Record<string, unknown>> {
  const actions = await getActions();
  await actions.skipAutoDJ();
  return { ok: true };
}

// ─── Write: Ducking ─────────────────────────────────────────────────────────

export async function djDuck(): Promise<Record<string, unknown>> {
  const { getDJEngineIfActive } = await import('../../engine/dj/DJEngine');
  getDJEngineIfActive()?.mixer.duck();
  return { ok: true };
}

export async function djUnduck(): Promise<Record<string, unknown>> {
  const { getDJEngineIfActive } = await import('../../engine/dj/DJEngine');
  getDJEngineIfActive()?.mixer.unduck();
  return { ok: true };
}
