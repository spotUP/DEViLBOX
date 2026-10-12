/**
 * DeckChannelMute - the per-channel mute of a deck that plays rendered audio.
 *
 * A rendered module deck plays one buffer of 2 + 2N channels: the stereo mix,
 * then each channel's stereo stem (channelScopeTrack.ts stems, rendered in the
 * same worker pass through the engine's whole output chain). One source plays
 * them all, so the stems stay sample-locked to the mix through seek, loop,
 * pitch, nudge, scratch and doubles by construction.
 *
 *   input (2+2N ch) -> splitter -> mix L/R ------------------------> merger -> output (stereo)
 *                               -> stem k L/R -> gain k (0 | -1) -/
 *
 * Output = mix - sum of the muted channels' stems. Nothing muted = every gain
 * 0 = the mix exactly as before. A mute is a 3 ms ramp: immediate, no click.
 * Key Lock, the deck chain and the scratch capture all sit after this node.
 *
 * Without stems (an audio file, a render without them) the input passes
 * straight through, mono and all.
 */

import * as Tone from 'tone';

/** Anti-click ramp of a channel mute, seconds. */
export const CHANNEL_MUTE_RAMP_S = 0.003;

/** Bit k of a deck channel mask set = channel k audible (TrackerReplayer.setChannelMuteMask convention). */
export function channelAudible(mask: number, channel: number): boolean {
  return ((mask >>> channel) & 1) === 1;
}

export class DeckChannelMute {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private readonly ctx: BaseAudioContext;
  private splitter: ChannelSplitterNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private gains: GainNode[] = []; // [ch0L, ch0R, ch1L, ch1R, ...]
  private _stemCount = 0;
  private _mask = 0xFFFFFFFF;
  /** Calls to setMask that reached a deck with stems (reachability sentinel). */
  stemMaskWrites = 0;

  constructor() {
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.ctx = Tone.getContext().rawContext as unknown as BaseAudioContext;
    this.input.connect(this.output);
  }

  /** Channels the loaded audio carries stems for (0 = pass-through). */
  get stemCount(): number { return this._stemCount; }

  /** The mask last written (bit k set = channel k audible). */
  get mask(): number { return this._mask; }

  /** Rewire for audio with `n` stems after its mix (n = 0: straight through). Keeps the current mask. */
  setStemCount(n: number): void {
    if (n === this._stemCount) return;
    this.teardown();
    this._stemCount = n;
    if (n === 0) {
      this.input.connect(this.output);
      return;
    }
    this.input.disconnect();
    const inNode = this.input.output as unknown as AudioNode;
    const outNode = this.output.input as unknown as AudioNode;
    const splitter = this.ctx.createChannelSplitter(2 + 2 * n);
    const merger = this.ctx.createChannelMerger(2);
    inNode.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    for (let k = 0; k < n; k++) {
      for (let side = 0; side < 2; side++) {
        const g = this.ctx.createGain();
        g.gain.value = channelAudible(this._mask, k) ? 0 : -1;
        splitter.connect(g, 2 + 2 * k + side);
        g.connect(merger, 0, side);
        this.gains.push(g);
      }
    }
    merger.connect(outNode);
    this.splitter = splitter;
    this.merger = merger;
  }

  /** Mute the channels whose bit is clear; channels without a stem are left alone. */
  setMask(mask: number): void {
    this._mask = mask >>> 0;
    if (this._stemCount === 0) return;
    this.stemMaskWrites++;
    const now = this.ctx.currentTime;
    for (let k = 0; k < this._stemCount; k++) {
      const target = channelAudible(this._mask, k) ? 0 : -1;
      for (const g of [this.gains[2 * k], this.gains[2 * k + 1]]) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(target, now + CHANNEL_MUTE_RAMP_S);
      }
    }
  }

  private teardown(): void {
    for (const g of this.gains) { try { g.disconnect(); } catch { /* */ } }
    this.gains = [];
    try { this.splitter?.disconnect(); } catch { /* */ }
    try { this.merger?.disconnect(); } catch { /* */ }
    this.splitter = null;
    this.merger = null;
  }

  dispose(): void {
    this.teardown();
    this.input.dispose();
    this.output.dispose();
  }
}

/** The 16-bit PCM of a rendered WAV (DJPipeline encodeWAV): rate, channels and the interleaved samples. */
function wavPcm16(wav: ArrayBuffer): { sampleRate: number; channels: number; data: Int16Array } | null {
  if (wav.byteLength < 44) return null;
  const v = new DataView(wav);
  if (v.getUint32(0, false) !== 0x52494646 /* RIFF */ || v.getUint32(8, false) !== 0x57415645 /* WAVE */) return null;
  let off = 12;
  let sampleRate = 0, channels = 0, bits = 0;
  while (off + 8 <= wav.byteLength) {
    const id = v.getUint32(off, false);
    const size = v.getUint32(off + 4, true);
    if (id === 0x666d7420 /* fmt */) {
      channels = v.getUint16(off + 10, true);
      sampleRate = v.getUint32(off + 12, true);
      bits = v.getUint16(off + 22, true);
    } else if (id === 0x64617461 /* data */) {
      if (bits !== 16 || channels < 1) return null;
      const n = Math.min(size, wav.byteLength - off - 8) >> 1;
      return { sampleRate, channels, data: new Int16Array(wav.slice(off + 8, off + 8 + n * 2)) };
    }
    off += 8 + size + (size & 1);
  }
  return null;
}

/**
 * The buffer a deck plays for a rendered track with stems: the WAV's stereo
 * mix followed by each channel's stereo stem (decoded from its FLAC,
 * channelStemCodec.ts), all at the render rate and decoded alike (x / 32768),
 * each stem cut or zero-padded to the mix. Built
 * from the WAV itself, not the context-rate decode of it, so mix and stems
 * share one timeline (the context resamples them all the same way). Null when
 * there are no stems or the bytes are not a 16-bit PCM WAV.
 */
export function bufferWithStems(ctx: BaseAudioContext, wav: ArrayBuffer | null, stems: (Float32Array[] | null)[] | undefined): AudioBuffer | null {
  if (!wav || !stems || stems.length === 0) return null;
  const pcm = wavPcm16(wav);
  if (!pcm || pcm.channels !== 2) return null;
  const len = pcm.data.length >> 1;
  const out = ctx.createBuffer(2 + 2 * stems.length, len, pcm.sampleRate);
  const l = new Float32Array(len);
  const r = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    l[i] = pcm.data[2 * i] / 32768;
    r[i] = pcm.data[2 * i + 1] / 32768;
  }
  out.copyToChannel(l, 0);
  out.copyToChannel(r, 1);
  stems.forEach((stem, k) => {
    if (!stem) return; // a channel that never sounds: zeros
    for (let side = 0; side < 2; side++) {
      const src = stem[Math.min(side, stem.length - 1)];
      out.copyToChannel((src.length > len ? src.subarray(0, len) : src) as Float32Array<ArrayBuffer>, 2 + 2 * k + side);
    }
  });
  return out;
}

/** Stems a deck buffer carries after its mix. */
export function stemCountOf(buffer: AudioBuffer | null): number {
  return buffer && buffer.numberOfChannels > 2 ? (buffer.numberOfChannels - 2) >> 1 : 0;
}
