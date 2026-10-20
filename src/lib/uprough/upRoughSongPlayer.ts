/**
 * Plays the rendered Up Rough mix as ONE whole-song source (plan 2026-10-20 O6k2), the way a whole-song synth owns the
 * mix: the replayer keeps its scheduler for the playhead but its per-channel notes are suppressed for this song.
 * start() begins at (order, row); a new mix that lands while playing replaces the source at the same playhead sample.
 */
import * as Tone from 'tone';
import { useTrackerStore } from '@stores/useTrackerStore';
import { startSample } from './currentSongRender';
import { ensureUpRoughSong, onUpRoughSongRendered, type RenderedSong } from './upRoughSongService';

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

/** True when the tracker's play must go through this player instead of the per-channel notes. */
export function upRoughSongOwnsPlayback(): boolean { return useTrackerStore.getState().upRoughMeta !== null; }

export function isUpRoughSongPlaying(): boolean { return playing; }
export function upRoughMixPlayed(): Float64Array | null { return lastMix; }

/** Sample of the mix under the playhead now (before the buffer's end). */
export function upRoughPlayheadSample(): number {
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
  source = src; playingFrom = from; rate = song.rate; lastMix = song.mix; playing = true;
}

export function stopUpRoughSong(): void {
  gen++;
  if (source) { try { source.stop(); source.disconnect(); } catch { /* already ended */ } }
  source = null; playing = false;
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
