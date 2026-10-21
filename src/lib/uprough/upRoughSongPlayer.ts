/**
 * Plays the rendered Up Rough mix as ONE whole-song source (plan 2026-10-20 O6k2), the way a whole-song synth owns the
 * mix: the replayer keeps its scheduler for the playhead but its per-channel notes are suppressed for this song.
 * start() begins at (order, row); a new mix that lands while playing replaces the source at the same playhead sample.
 */
import * as Tone from 'tone';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUpRoughRenderStore } from '@stores/useUpRoughRenderStore';
import { startSample } from './currentSongRender';
import {
  currentPartialMix, currentPartialRate, ensureUpRoughSong, onUpRoughSongPartial, onUpRoughSongRendered, type RenderedSong,
} from './upRoughSongService';

export interface PlayerAudio {
  context: Pick<AudioContext, 'currentTime' | 'createBuffer' | 'createBufferSource'>;
  destination: AudioNode;
}

let audioOverride: PlayerAudio | null = null;
export function setPlayerAudioForTests(a: PlayerAudio | null): void { audioOverride = a; }
function audio(): PlayerAudio {
  if (audioOverride) return audioOverride;
  const ctx = Tone.getContext().rawContext as AudioContext;
  return { context: ctx, destination: Tone.getDestination().input as unknown as AudioNode };
}

let source: AudioBufferSourceNode | null = null;
/** ctx time at which sample `playingFrom` was (virtually) at the buffer start. */
let startedAt = 0;
let playingFrom = 0;
let playing = false;
let gen = 0;
let unsub: (() => void) | null = null;
let lastMix: Float64Array | null = null;
let rate = 22050;

/** Listen while building (R2f-33): 'preview' = pre-master sections playing, 'mastered' = the final mix took over, 'idle' = neither. */
export type UpRoughPreviewState = 'idle' | 'preview' | 'mastered';
let previewState: UpRoughPreviewState = 'idle';
/** Preview segments still audible or pending, with the ctx time each ends. */
let previewSegments: { src: AudioBufferSourceNode; endsAt: number }[] = [];
/** Samples of the joined song scheduled so far (the next section must start here). */
let previewCursor = 0;
let previewT0Set = false;
let previewUnsubPartial: (() => void) | null = null;
const previewListeners = new Set<(s: UpRoughPreviewState) => void>();
function setPreviewState(s: UpRoughPreviewState): void {
  if (s === previewState) return;
  previewState = s;
  for (const fn of previewListeners) fn(s);
}
export function upRoughPreviewState(): UpRoughPreviewState { return previewState; }
export function isUpRoughPreviewPlaying(): boolean { return previewState === 'preview'; }
/** Fires on every change: 'preview' when the first section starts, 'mastered' at the swap, 'idle' on stop. */
export function onUpRoughPreviewState(fn: (s: UpRoughPreviewState) => void): () => void { previewListeners.add(fn); return () => previewListeners.delete(fn); }

/** True when the tracker's play must go through this player instead of the per-channel notes. */
export function upRoughSongOwnsPlayback(): boolean { return useTrackerStore.getState().upRoughMeta !== null; }

export function isUpRoughSongPlaying(): boolean { return playing; }
export function upRoughMixPlayed(): Float64Array | null { return lastMix; }

/** Sample of the mix under the playhead now (before the buffer's end). */
export function upRoughPlayheadSample(): number {
  if (previewState === 'preview') {
    if (!previewT0Set) return playingFrom;
    // Never past what has been scheduled: a render slower than playback leaves the playhead waiting at the cursor.
    return Math.min(playingFrom + Math.max(0, Math.round((audio().context.currentTime - startedAt) * rate)), previewCursor);
  }
  if (!playing || !lastMix) return 0;
  return (playingFrom + Math.round((audio().context.currentTime - startedAt) * rate)) % lastMix.length;
}

function begin(song: RenderedSong, fromSample: number): void {
  const { context, destination } = audio();
  const buf = context.createBuffer(1, song.mix.length, song.rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < song.mix.length; i++) ch[i] = song.mix[i]!;
  const src = context.createBufferSource();
  src.buffer = buf;
  src.loop = true; // the transport loops the song; restartPosition 0 for an Up Rough song
  src.connect(destination);
  const from = Math.max(0, Math.min(fromSample, song.mix.length - 1));
  const old = source;
  startedAt = context.currentTime;
  src.start(startedAt, from / song.rate);
  if (old) { try { old.stop(startedAt); old.disconnect(); } catch { /* already ended */ } }
  for (const seg of previewSegments) { // the preview segments still sounding end where the mastered mix begins
    if (seg.endsAt > startedAt) { try { seg.src.stop(startedAt); } catch { /* already ended */ } }
    try { seg.src.disconnect(); } catch { /* already ended */ }
  }
  previewSegments = [];
  previewUnsubPartial?.(); previewUnsubPartial = null;
  source = src; playingFrom = from; rate = song.rate; lastMix = song.mix; playing = true;
}

export function stopUpRoughSong(): void {
  gen++;
  if (source) { try { source.stop(); source.disconnect(); } catch { /* already ended */ } }
  source = null; playing = false;
  for (const seg of previewSegments) { try { seg.src.stop(); seg.src.disconnect(); } catch { /* already ended */ } }
  previewSegments = []; previewCursor = 0; previewT0Set = false;
  previewUnsubPartial?.(); previewUnsubPartial = null;
  setPreviewState('idle');
  unsub?.(); unsub = null;
}

/** Start (or restart, for a seek) at pattern-order index `orderIndex`, row `row`. */
export async function startUpRoughSong(orderIndex: number, row: number): Promise<void> {
  const mine = ++gen;
  const song = await ensureUpRoughSong();
  if (mine !== gen) return; // stopped or restarted while rendering
  const { patterns, patternOrder } = useTrackerStore.getState();
  begin(song, startSample(patterns.map((p) => p.length), patternOrder, orderIndex, row, song.rate, song.bpm));
  unsub?.();
  unsub = onUpRoughSongRendered((next) => {
    if (!playing || next.mix === lastMix) return;
    begin(next, upRoughPlayheadSample()); // same playhead sample, no restart of the transport
  });
}

/** Schedules one pre-master section at its place on the timeline (gapless: it starts where the previous one ends). */
function schedulePreviewSection(mix: Float64Array, start: number, songRate: number): void {
  if (start !== previewCursor) return; // sections land in order; a stale or re-rendered one is not ours
  const { context, destination } = audio();
  const end = start + mix.length;
  previewCursor = end;
  rate = songRate;
  if (end <= playingFrom) return; // wholly before the start sample
  const skip = Math.max(0, playingFrom - start);
  const buf = context.createBuffer(1, mix.length, songRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < mix.length; i++) ch[i] = mix[i]!;
  const src = context.createBufferSource();
  src.buffer = buf;
  src.loop = false;
  src.connect(destination);
  let when: number;
  if (!previewT0Set) { startedAt = context.currentTime; previewT0Set = true; when = startedAt; }
  else {
    when = startedAt + (start + skip - playingFrom) / songRate;
    if (when < context.currentTime) { startedAt += context.currentTime - when; when = context.currentTime; } // the render fell behind: a gap, not a drift
  }
  src.start(when, skip / songRate);
  previewSegments.push({ src, endsAt: when + (mix.length - skip) / songRate });
  setPreviewState('preview');
}

/**
 * Listen while building (R2f-33c): plays the pre-master sections of the render in flight as they land, gapless, from
 * `fromSample` of the joined song, then swaps the mastered mix in at the same playhead sample when the render finishes
 * (the same begin() the edit swap uses). The preview has no texture or master bus, so its level differs from the final.
 * Call while a render is in flight; stopUpRoughSong() ends it. Watch it with onUpRoughPreviewState.
 */
export function startUpRoughPreview(fromSample = 0): void {
  stopUpRoughSong();
  playingFrom = Math.max(0, fromSample); previewCursor = 0; previewT0Set = false; playing = true; lastMix = null;
  const landed = currentPartialMix(); // sections that landed before the preview started play as one segment
  if (landed) schedulePreviewSection(landed, 0, currentPartialRate());
  previewUnsubPartial = onUpRoughSongPartial((p) => schedulePreviewSection(p.mix, p.start, p.rate));
  unsub = onUpRoughSongRendered((next) => {
    if (next.mix === lastMix) return;
    const at = upRoughPlayheadSample();
    begin(next, at); // same playhead sample, mastered level takes over
    setPreviewState('mastered');
  });
}

/**
 * The Listen while building switch (R2f-33d). The one place its state lives is the render store; this is the only
 * writer. Switching on during a render starts the preview now, and every later render (Generate, an edit's re-render)
 * starts it as the render begins; switching off ends a preview in progress.
 */
export function setListenWhileBuilding(on: boolean): void {
  useUpRoughRenderStore.getState().set({ listenWhileBuilding: on });
  if (on && useUpRoughRenderStore.getState().status === 'rendering') startUpRoughPreview(0);
  else if (!on && previewState === 'preview') stopUpRoughSong();
}
useUpRoughRenderStore.subscribe((s, prev) => {
  if (s.listenWhileBuilding && s.status === 'rendering' && prev.status !== 'rendering') startUpRoughPreview(0);
});
