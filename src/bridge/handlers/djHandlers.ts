/**
 * MCP Bridge — DJ Handlers
 *
 * Handles DJ control commands from the iPhone controller (and MCP).
 * Each handler maps to a DJActions function or reads from useDJStore.
 */

import { setMasterDeck, useDJStore, type DeckState } from '../../stores/useDJStore';
import { useDJPlaylistStore } from '../../stores/useDJPlaylistStore';
import { scratchRenderModeOf } from '../../engine/dj/scratch/scratchStyles';

/**
 * dj_load_file: put a file's bytes on a deck through the DJ file browser's own
 * load (parseDeckFile + loadFileToDeck in DJTrackLoader). The server reads the
 * file from disk and sends base64. Returns the deck's resulting state: the
 * render engine (a nuade player id, else the default render path) and the
 * number of per-channel scopes the deck now shows.
 */
export async function djLoadFile(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deck = params.deck as string;
  const fileName = params.filename as string;
  const data = params.data as string;
  if (deck !== 'A' && deck !== 'B' && deck !== 'C') return { error: "deck must be 'A', 'B' or 'C'" };
  if (!fileName || !data) return { error: 'Missing required params: filename, data (base64)' };
  try {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const buffer = bytes.buffer as ArrayBuffer;
    const [{ getDJEngine }, loader, { hashFile }, { renderPlayerOf }] = await Promise.all([
      import('../../engine/dj/DJEngine'),
      import('../../engine/dj/DJTrackLoader'),
      import('../../engine/dj/DJAudioCache'),
      import('../../engine/dj/djRenderEngine'),
    ]);
    const file = await loader.parseDeckFile(fileName, buffer);
    await loader.loadFileToDeck(getDJEngine(), deck, file);
    const nuadePlayer = file.song ? renderPlayerOf(await hashFile(buffer)) : null;
    const d = useDJStore.getState().decks[deck];
    return {
      ok: true,
      deck,
      fileName: d.fileName || fileName,
      engine: !file.song ? 'audio file' : nuadePlayer ? `nuade:${nuadePlayer}` : file.isUADE ? 'uade' : 'default render',
      channelScopeCount: d.channelScopeCount,
      detectedBPM: d.detectedBPM,
      durationMs: d.durationMs,
    };
  } catch (e) {
    return { error: `dj_load_file failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

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
      C: deckSnapshot(s.decks.C),
    },
    /** The set's master clock (the deck Deck C's tempo follows while it has no track of its own). */
    masterDeck: setMasterDeck(s),
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
    /** Channels the deck has a moving per-channel scope for (0 = the deck shows its one all-channel scope). */
    channelScopeCount: d.channelScopeCount,
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

/**
 * Auto DJ explanation (plan sections 44, 45): the telemetry the debug view
 * shows, the structured decision log ("why did you do that?") and the DJ FX
 * fire log (which pad actions the Auto DJ fired, as Auto Dub's fire log).
 */
export async function getAutoDJExplain(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const limit = typeof params.limit === 'number' ? params.limit : 30;
  const { getDecisionLog } = await import('../../engine/dj/autodj/decisionLog');
  const { getDjFxFireLog } = await import('../../engine/drumpad/DjFxActions');
  const s = useDJStore.getState();
  return {
    enabled: s.autoDJEnabled,
    status: s.autoDJStatus,
    style: s.autoDJStyle,
    sessionOrder: s.autoDJSessionOrder,
    telemetry: s.autoDJTelemetry,
    juggle: { mode: s.autoDJJuggleMode, intensity: s.autoDJJuggleIntensity, telemetry: s.autoDJJuggleTelemetry },
    decisions: getDecisionLog().list(limit),
    decisionCounts: { ...getDecisionLog().counts },
    fxFireLog: getDjFxFireLog().slice(-limit),
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

/** The Auto DJ performer settings (the panel's selects): Auto Scratch Render / mode / style / Records, Auto Juggle mode. */
export async function setAutoDJConfig(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const keys = ['scratchRender', 'scratchMode', 'scratchStyle', 'scratchRecords', 'juggleMode'] as const;
  const config: Partial<Record<(typeof keys)[number], string | string[]>> = {};
  for (const k of keys) if (params[k] !== undefined) config[k] = params[k] as string | string[];
  const s = useDJStore.getState();
  s.setAutoDJConfig(config as Parameters<typeof s.setAutoDJConfig>[0]);
  const n = useDJStore.getState();
  return {
    scratchRender: scratchRenderModeOf(n.autoDJScratchRender), scratchMode: n.autoDJScratchMode, scratchStyle: n.autoDJScratchStyle,
    scratchRecords: n.autoDJScratchRecords, juggleMode: n.autoDJJuggleMode,
  };
}

/** Juggle Now (owner decision 2026-10-12): the debug panel button's path - one juggle tick now, timing gates skipped. */
export async function djAutoDJJuggleNow(): Promise<Record<string, unknown>> {
  const actions = await getActions();
  const request = await actions.juggleNowAutoDJ();
  return { request, telemetry: useDJStore.getState().autoDJJuggleTelemetry };
}

/**
 * Three Deck Showcase (owner decision 2026-10-13): the DJ view button's path - the demo's whole three_deck render
 * (Deck C's routine and its own A/B juggle layer) while the set holds; a second call ends it and the set resumes.
 */
export async function djThreeDeckShowcase(): Promise<Record<string, unknown>> {
  const actions = await getActions();
  const state = await actions.toggleThreeDeckShowcase();
  return { ...state };
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
