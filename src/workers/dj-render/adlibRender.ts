/**
 * DJ render for the AdLib/OPL formats: AdPlug, the same AdPlugPlayer.wasm the tracker view plays them with
 * (AdPlugPlayer.ts / AdPlugPlayer.worklet.js), here instantiated in the DJ render worker. One fresh module per
 * render: the AdPlug glue (adplug-wasm/src/adplug_wasm.cpp) keeps its player and OPL emulator in globals.
 *
 * Output is exactly what the worklet plays: adplug_render's interleaved S16 stereo / 32768. CEmuopl starts as
 * one OPL2 (chip 0 on both channels) and switches to dual OPL2 (chip 0 left, chip 1 right) on the first chip-1 write.
 *
 * Per-voice signal comes from the emulator itself: fmopl.c's scope capture (adplug_enable_scope) writes every OPL
 * channel's own contribution per output sample into a 1024-sample ring per chip; each CHUNK (= the ring size) is
 * read back after its render, so no sample is lost or read twice.
 */
import {
  ChannelScopeTrackBuilder, ChannelStemsBuilder, DECK_SCOPE_CHANNELS,
  type ChannelScopeTrack, type MonoStem,
} from '@/engine/dj/channelScopeTrack';

/** The adplug_* exports (adplug-wasm/src/adplug_wasm.cpp) the render uses. */
interface AdPlugModule {
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  UTF8ToString(p: number): string;
  _malloc(n: number): number;
  _free(p: number): void;
  _adplug_init(sampleRate: number): number;
  _adplug_shutdown(): void;
  _adplug_alloc(n: number): number;
  _adplug_free(p: number): void;
  _adplug_add_companion(p: number, n: number, name: number): void;
  _adplug_load(p: number, n: number, filename: number): number;
  _adplug_rewind(subsong: number): void;
  _adplug_render(out: number, frames: number): number;
  _adplug_get_type(): number;
  _adplug_get_subsongs(): number;
  _adplug_enable_scope(enable: number): void;
  _adplug_get_scope_data(chip: number, channel: number, out: number, n: number): number;
  _adplug_get_scope_buffer_size(): number;
}

export interface AdPlugRenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  channelScopes?: ChannelScopeTrack;
  monoStems?: MonoStem[];
}

const SAMPLE_RATE = 44100;
/** Frames per render call; must not exceed the scope ring (FMOPL_SCOPE_BUFFER_SIZE, checked at run time). */
const CHUNK = 1024;
/** OPL2 melodic channels per chip (FMOPL_SCOPE_NUM_CHANNELS); CEmuopl runs two chips. */
const CHANNELS_PER_CHIP = 9;
// shortcut: dual OPL2 has 18 channels but the deck shows DECK_SCOPE_CHANNELS (16); chip 1's channels 7-8 get no
// scope or stem. Raise when the deck takes 18.
const TAPS = Math.min(CHANNELS_PER_CHIP * 2, DECK_SCOPE_CHANNELS);
/** A song that has gone fully silent this long after sounding has ended. */
const END_SILENCE_FRAMES = SAMPLE_RATE * 4;

let adplugFiles: Promise<{ js: string; wasm: ArrayBuffer }> | null = null;

async function newAdPlug(): Promise<AdPlugModule> {
  const base = import.meta.env.BASE_URL || '/';
  adplugFiles ??= Promise.all([
    fetch(`${base}adplug/AdPlugPlayer.js`).then((r) => { if (!r.ok) throw new Error(`AdPlugPlayer.js: HTTP ${r.status}`); return r.text(); }),
    fetch(`${base}adplug/AdPlugPlayer.wasm`).then((r) => { if (!r.ok) throw new Error(`AdPlugPlayer.wasm: HTTP ${r.status}`); return r.arrayBuffer(); }),
  ]).then(([js, wasm]) => ({ js, wasm }));
  let files: { js: string; wasm: ArrayBuffer };
  try {
    files = await adplugFiles;
  } catch (e) {
    adplugFiles = null; // a failed fetch is retried on the next render
    throw e;
  }
  const factory = new Function(`${files.js}\nreturn createAdPlugPlayer;`)() as (cfg: object) => Promise<AdPlugModule>;
  return factory({ wasmBinary: files.wasm.slice(0), print: () => {}, printErr: () => {} });
}

function cString(m: AdPlugModule, s: string): number {
  const bytes = new TextEncoder().encode(`${s}\0`);
  const p = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, p);
  return p;
}

function copyIn(m: AdPlugModule, bytes: Uint8Array): number {
  const p = m._adplug_alloc(bytes.length);
  m.HEAPU8.set(bytes, p);
  return p;
}

/**
 * Render `filename` once through AdPlug: the stereo mix and one scope and stem per OPL channel.
 * `subsong` is the 0-based AdPlug subsong; `companions` are the extra files a format loads beside the song
 * (e.g. SCI patch.003), registered before the load as the worklet does.
 */
export async function renderWithAdPlug(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  postProgress: (progress: number) => void,
  maxSeconds = 600,
  withStems = true,
  companions: Array<{ filename: string; buffer: ArrayBuffer }> = [],
): Promise<AdPlugRenderResult> {
  const m = await newAdPlug();
  if (m._adplug_init(SAMPLE_RATE) !== 0) throw new Error('AdPlug would not initialise');
  const scopeRing = m._adplug_get_scope_buffer_size();
  if (scopeRing < CHUNK) throw new Error(`AdPlug scope ring ${scopeRing} is shorter than the render chunk ${CHUNK}`);
  const out = m._malloc(CHUNK * 2 * 2);
  const tap = m._malloc(CHUNK * TAPS * 4);
  try {
    for (const c of companions) {
      const cp = copyIn(m, new Uint8Array(c.buffer));
      const np = cString(m, c.filename);
      m._adplug_add_companion(cp, c.buffer.byteLength, np);
      m._free(np);
      m._adplug_free(cp);
    }
    const bytes = new Uint8Array(fileBuffer);
    const sp = copyIn(m, bytes);
    const fp = cString(m, filename);
    const rc = m._adplug_load(sp, bytes.length, fp);
    m._free(fp);
    m._adplug_free(sp);
    if (rc !== 0) throw new Error(`AdPlug could not load ${filename}: code ${rc}`);
    const subsongs = m._adplug_get_subsongs();
    const track = subsong > 0 && subsong < subsongs ? subsong : 0;
    if (track > 0) m._adplug_rewind(track);
    m._adplug_enable_scope(1);
    postProgress(10);

    const scopes = new ChannelScopeTrackBuilder(TAPS, SAMPLE_RATE);
    const stems = withStems ? new ChannelStemsBuilder(TAPS) : null;
    // fmopl.c captures only the channels it computes as melodic: in rhythm mode channels 6-8 are skipped and their
    // ring stops moving, so a read returns the same block again. A block equal to the one before it is stale: zero.
    const prev = Array.from({ length: TAPS }, () => new Float32Array(CHUNK));
    const zero = new Float32Array(CHUNK);
    const blocks: Float32Array[] = new Array<Float32Array>(TAPS);

    const maxFrames = Math.floor(SAMPLE_RATE * maxSeconds);
    const chunks: { left: Float32Array; right: Float32Array }[] = [];
    let totalFrames = 0, lastSound = -1;
    const tPass = Date.now();
    while (totalFrames < maxFrames) {
      // Always CHUNK frames, so each scope read is exactly this call's samples; a short last chunk is trimmed below.
      const n = m._adplug_render(out, CHUNK);
      if (n <= 0) break; // the song ended (AdPlug's update() returned false)
      const keep = Math.min(n, maxFrames - totalFrames);
      const h16 = m.HEAP16;
      const o = out >> 1;
      const left = new Float32Array(keep), right = new Float32Array(keep);
      for (let i = 0; i < keep; i++) {
        left[i] = h16[o + 2 * i] / 32768; right[i] = h16[o + 2 * i + 1] / 32768;
        if (left[i] !== 0 || right[i] !== 0) lastSound = totalFrames + i;
      }
      chunks.push({ left, right });

      for (let ch = 0; ch < TAPS; ch++) {
        const p = tap + ch * CHUNK * 4;
        m._adplug_get_scope_data(ch < CHANNELS_PER_CHIP ? 0 : 1, ch % CHANNELS_PER_CHIP, p, CHUNK);
        // The glue exports HEAPU8 and HEAP16 only (adplug-wasm EXPORTED_RUNTIME_METHODS): view the floats through HEAPU8.
        const block = new Float32Array(m.HEAPU8.buffer, p, CHUNK);
        let same = true, silent = true;
        for (let i = 0; i < CHUNK; i++) {
          if (block[i] !== prev[ch][i]) same = false;
          if (block[i] !== 0) silent = false;
        }
        prev[ch].set(block);
        blocks[ch] = same && !silent ? zero : block;
      }
      const read = (ch: number, i: number) => blocks[ch][i];
      scopes.push(keep, read);
      // Chip 0 plays on the left, chip 1 on the right (CEmuopl dual OPL2), so each stem keeps its chip's side.
      stems?.push(keep, (ch, i) => (ch < CHANNELS_PER_CHIP ? blocks[ch][i] : 0), (ch, i) => (ch < CHANNELS_PER_CHIP ? 0 : blocks[ch][i]));

      totalFrames += keep;
      if (totalFrames % (SAMPLE_RATE * 5) < CHUNK) postProgress(Math.min(80, 15 + (totalFrames / maxFrames) * 65));
      if (lastSound >= 0 && totalFrames - lastSound > END_SILENCE_FRAMES) break; // the song ended in silence
    }
    if (lastSound < 0) throw new Error(`AdPlug rendered only silence for ${filename}`);
    const left = new Float32Array(totalFrames), right = new Float32Array(totalFrames);
    let offset = 0;
    for (const c of chunks) { left.set(c.left, offset); right.set(c.right, offset); offset += c.left.length; }
    postProgress(85);
    const channelScopes = scopes.finish();
    const monoStems = stems ? stems.finishMono(totalFrames) : undefined;
    console.log(`[DJRenderWorker/adplug] ${filename}: ${m.UTF8ToString(m._adplug_get_type())}, subsong ${track + 1}/${subsongs}, ${totalFrames} frames in ${Date.now() - tPass} ms, ${monoStems?.length ?? 0} mono stems`);
    return { left, right, sampleRate: SAMPLE_RATE, channelScopes, monoStems };
  } finally {
    m._adplug_enable_scope(0);
    m._free(out);
    m._free(tap);
    m._adplug_shutdown();
  }
}
