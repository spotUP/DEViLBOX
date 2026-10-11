/**
 * Per-channel scope track - the DJ decks' per-channel oscilloscope source.
 *
 * A deck plays a module as audio the DJ render worker pre-rendered (DJPipeline
 * renders every tracker file and the deck switches to audio mode), so no
 * engine runs live per deck and no live per-channel tap exists. The render
 * pass reads each channel's signal from the engine's own per-channel tap -
 * the same taps the tracker scopes stream from (UADE's Paula channel FIFO,
 * libopenmpt solo instances, Hively's split render, WebSID's voice trace
 * streams) - and stores it beside the WAV, decimated, as this track. The deck
 * reads the window that ends at the position the listener hears.
 *
 * One source of truth: the track travels with the rendered WAV bytes it was
 * rendered with (attachChannelScopes / channelScopesFor), into the audio cache
 * and onto the deck, so no load path has to carry it separately.
 */

/** Channels a deck shows scopes for (DeckScopes draws CH1..CH4). */
export const DECK_SCOPE_CHANNELS = 4;
/** The render rate is divided by this for storage (44100 -> 11025 Hz). */
export const DECK_SCOPE_DECIMATION = 4;
/** Stored samples per drawn scope window (~23 ms at 11025 Hz). */
export const DECK_SCOPE_WINDOW = 256;

export interface ChannelScopeTrack {
  /** Rate of the stored samples (render rate / DECK_SCOPE_DECIMATION). */
  sampleRate: number;
  /** One array per channel; sample = value / 127 * scales[ch]. */
  channels: Int8Array[];
  /** Peak of each channel over the whole render (0 = silent channel). */
  scales: number[];
}

/**
 * Collects one render pass's per-channel signal: push every rendered sample
 * of every channel in render order, then finish. Each stored sample is the
 * mean of DECK_SCOPE_DECIMATION rendered ones.
 */
export class ChannelScopeTrackBuilder {
  private readonly blocks: Int16Array[][];
  private fill = 0;
  private acc: Float64Array;
  private accN = 0;
  private stored = 0;
  private static readonly BLOCK = 1 << 16;

  readonly numChannels: number;
  readonly renderRate: number;

  constructor(numChannels: number, renderRate: number) {
    this.numChannels = numChannels;
    this.renderRate = renderRate;
    this.blocks = Array.from({ length: numChannels }, () => [new Int16Array(ChannelScopeTrackBuilder.BLOCK)]);
    this.acc = new Float64Array(numChannels);
  }

  /** Append n rendered samples; read(ch, i) returns sample i of channel ch in -1..1. */
  push(n: number, read: (ch: number, i: number) => number): void {
    const nc = this.numChannels;
    for (let i = 0; i < n; i++) {
      for (let ch = 0; ch < nc; ch++) this.acc[ch] += read(ch, i);
      if (++this.accN === DECK_SCOPE_DECIMATION) this.flush();
    }
  }

  private flush(): void {
    const BLOCK = ChannelScopeTrackBuilder.BLOCK;
    if (this.fill === BLOCK) {
      for (const list of this.blocks) list.push(new Int16Array(BLOCK));
      this.fill = 0;
    }
    for (let ch = 0; ch < this.numChannels; ch++) {
      const v = this.acc[ch] / this.accN;
      const list = this.blocks[ch];
      list[list.length - 1][this.fill] = v >= 1 ? 32767 : v <= -1 ? -32767 : Math.round(v * 32767);
      this.acc[ch] = 0;
    }
    this.fill++;
    this.stored++;
    this.accN = 0;
  }

  finish(): ChannelScopeTrack {
    if (this.accN > 0) this.flush();
    const channels: Int8Array[] = [];
    const scales: number[] = [];
    for (let ch = 0; ch < this.numChannels; ch++) {
      const flat = new Int16Array(this.stored);
      let off = 0;
      for (const b of this.blocks[ch]) {
        const take = Math.min(b.length, this.stored - off);
        flat.set(b.subarray(0, take), off);
        off += take;
      }
      let peak = 0;
      for (let i = 0; i < flat.length; i++) { const a = Math.abs(flat[i]); if (a > peak) peak = a; }
      const out = new Int8Array(flat.length);
      if (peak > 0) {
        const k = 127 / peak;
        for (let i = 0; i < flat.length; i++) out[i] = Math.round(flat[i] * k);
      }
      channels.push(out);
      scales.push(peak / 32767);
    }
    return { sampleRate: this.renderRate / DECK_SCOPE_DECIMATION, channels, scales };
  }
}

/**
 * The scope window that ends at `positionSec`: DECK_SCOPE_WINDOW samples per
 * channel in -1..1, zero before the start and past the end of the render.
 */
export function channelScopeWindow(track: ChannelScopeTrack, positionSec: number, maxChannels = DECK_SCOPE_CHANNELS): Float32Array[] {
  const end = Math.floor(positionSec * track.sampleRate);
  const start = end - DECK_SCOPE_WINDOW;
  const n = Math.min(maxChannels, track.channels.length);
  const out: Float32Array[] = [];
  for (let ch = 0; ch < n; ch++) {
    const src = track.channels[ch];
    const k = track.scales[ch] / 127;
    const w = new Float32Array(DECK_SCOPE_WINDOW);
    for (let i = 0; i < DECK_SCOPE_WINDOW; i++) {
      const j = start + i;
      if (j >= 0 && j < src.length) w[i] = src[j] * k;
    }
    out.push(w);
  }
  return out;
}

/** The ArrayBuffers a track holds, for postMessage transfer lists. */
export function channelScopeTransferables(track: ChannelScopeTrack | undefined): ArrayBuffer[] {
  return track ? track.channels.map((c) => c.buffer as ArrayBuffer) : [];
}

// The scope track of each rendered WAV, keyed by the WAV bytes the deck loads.
const byWav = new WeakMap<ArrayBuffer, ChannelScopeTrack>();

/** Record that `wav` was rendered with `track` as its per-channel signal. */
export function attachChannelScopes(wav: ArrayBuffer, track: ChannelScopeTrack | undefined): void {
  if (track && track.channels.length > 0) byWav.set(wav, track);
}

/** The per-channel scope track rendered with `wav`, if the render had one. */
export function channelScopesFor(wav: ArrayBuffer): ChannelScopeTrack | undefined {
  return byWav.get(wav);
}
