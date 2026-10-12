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
  /**
   * Each channel's contribution to the rendered mix, rendered through the engine's whole output
   * chain (solo instance, split render or a solo pass): the render worker builds it as stereo
   * interleaved int16 at the render rate, encoded like the WAV (`stems`, worker only), and ships
   * and caches it as one lossless stereo FLAC per channel (`flacStems`, channelStemCodec.ts).
   * One per channel the module has, up to DECK_STEM_CHANNELS; an empty one is a channel that never
   * sounds. The deck subtracts a muted channel's stem from the mix (DeckChannelMute) - the
   * per-channel mute of a rendered deck.
   */
  flacStems?: Uint8Array[];
  /** The raw int16 stems: the render worker's working form (and cache entries of track version 2). */
  stems?: Int16Array[];
}

/**
 * Drop a track's int16 stems once the deck has decoded them into its buffer
 * (DeckChannelMute.bufferWithStems): the persistent copy is the audio cache
 * entry (written before any deck loads the track, and read afresh on every
 * load), so keeping them here would hold every loaded track's stems twice.
 */
export function releaseChannelStems(track: ChannelScopeTrack | undefined): void {
  if (track) { delete track.flacStems; delete track.stems; }
}

/** Most channels a deck can mute: the deck buttons show CH1-4, the pads Mute Ch 1-8. */
export const DECK_STEM_CHANNELS = 8;

/** One sample encoded the way the rendered WAV encodes it (DJPipeline encodeWAV), so stem and mix decode alike. */
function encodeSample(v: number): number {
  const s = v > 1 ? 1 : v < -1 ? -1 : v;
  return s < 0 ? Math.trunc(s * 0x8000) : Math.trunc(s * 0x7FFF);
}

/**
 * Collects stems: push every rendered frame of every channel in render order (L and R), then
 * finish with the mix's frame count.
 */
export class ChannelStemsBuilder {
  private static readonly BLOCK = 1 << 16; // frames per block
  private readonly blocks: Int16Array[][];
  private readonly sounds: boolean[];
  private fill = 0;
  private frames = 0;
  readonly numChannels: number;

  constructor(numChannels: number) {
    this.numChannels = numChannels;
    this.blocks = Array.from({ length: numChannels }, () => [new Int16Array(ChannelStemsBuilder.BLOCK * 2)]);
    this.sounds = new Array<boolean>(numChannels).fill(false);
  }

  push(n: number, readL: (ch: number, i: number) => number, readR: (ch: number, i: number) => number): void {
    const BLOCK = ChannelStemsBuilder.BLOCK;
    for (let i = 0; i < n; i++) {
      if (this.fill === BLOCK) {
        for (const list of this.blocks) list.push(new Int16Array(BLOCK * 2));
        this.fill = 0;
      }
      const o = this.fill * 2;
      for (let ch = 0; ch < this.numChannels; ch++) {
        const block = this.blocks[ch][this.blocks[ch].length - 1];
        const l = encodeSample(readL(ch, i));
        const r = encodeSample(readR(ch, i));
        block[o] = l;
        block[o + 1] = r;
        if (l !== 0 || r !== 0) this.sounds[ch] = true;
      }
      this.fill++;
      this.frames++;
    }
  }

  /** The stems, each exactly `totalFrames` long (cut or zero-padded to the mix). */
  finish(totalFrames: number): Int16Array[] {
    const BLOCK = ChannelStemsBuilder.BLOCK;
    const take = Math.min(this.frames, totalFrames);
    return this.blocks.map((list, ch) => {
      if (!this.sounds[ch]) return new Int16Array(0);
      const flat = new Int16Array(totalFrames * 2);
      for (let b = 0, off = 0; b < list.length && off < take; b++, off += BLOCK) {
        const n = Math.min(BLOCK, take - off);
        flat.set(list[b].subarray(0, n * 2), off * 2);
      }
      return flat;
    });
  }
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
  if (!track) return [];
  return [...track.channels, ...(track.stems ?? []), ...(track.flacStems ?? [])]
    .map((c) => c.buffer as ArrayBuffer).filter((b) => b.byteLength > 0);
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

/**
 * Whether the deck shows the combined ALL scope: only a deck with no per-channel
 * signal (an audio file, or a render from before the scope track existed). A deck
 * with channel scopes shows CH1..CH4 alone - ALL is a sum the channels already show.
 */
export function showsAllScope(channelScopeCount: number): boolean {
  return channelScopeCount <= 0;
}

/**
 * Cache entries written by a render that knew about scope tracks carry this
 * version (CachedAudio.scopeRenderVersion), whether or not the engine had a
 * per-channel tap. An entry with an older one (before e193fc143: no track;
 * version 1: scopes but no stems) is re-rendered once, in the background, for
 * its track.
 */
export const CHANNEL_SCOPE_RENDER_VERSION = 3; // 2: the track carries the channel stems (SCOPE-MUTE); 3: as FLAC

/** What a re-render for scopes needs from a cache entry. */
export interface ScopelessOrigin {
  hash: string;
  filename: string;
  /** Duration of the cached WAV; the re-render must match it to line up with the audio the deck plays. */
  duration: number;
}

/** True when `entry` is an old-shape cache entry that can be re-rendered for its scope track from its own source bytes. */
export function needsChannelScopeRerender(entry: {
  audioData?: ArrayBuffer; sourceData?: ArrayBuffer; channelScopes?: ChannelScopeTrack; scopeRenderVersion?: number;
}): boolean {
  return !!entry.audioData && entry.audioData.byteLength > 0
    && !!entry.sourceData && entry.sourceData.byteLength > 0
    && (entry.scopeRenderVersion ?? 0) < CHANNEL_SCOPE_RENDER_VERSION;
}

// The cache entry each scopeless WAV came from, keyed by the WAV bytes a deck loads.
const scopelessOrigins = new WeakMap<ArrayBuffer, ScopelessOrigin>();

/** Record that `wav` was read from an old-shape cache entry that wants a scope re-render. */
export function noteScopelessWav(wav: ArrayBuffer, origin: ScopelessOrigin): void {
  scopelessOrigins.set(wav, origin);
}

/** The old-shape cache entry `wav` was read from, if it wants a scope re-render. */
export function scopelessOriginOf(wav: ArrayBuffer): ScopelessOrigin | undefined {
  return scopelessOrigins.get(wav);
}
