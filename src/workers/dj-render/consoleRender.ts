/**
 * DJ render for the console formats (NSF/NSFE, GBS, SPC, VGM/VGZ, GYM): game-music-emu, the same Gme.wasm the
 * tracker view plays them with (GmeEngine / Gme.worklet.js), here instantiated in the DJ render worker.
 *
 * Per-voice signal, two ways, both from game-music-emu itself:
 *  - Multi-channel emulators (NSF, GBS, PSG-only VGM): one pass, gme_wasm_render_channels gives the mix and every
 *    voice's own mono signal (gme_wasm_scope_count voices).
 *  - The rest (SPC, GYM, FM VGM) render one mix only: one more instance per voice runs in lock-step with that voice
 *    alone audible (gme_wasm_set_mute_mask before the load), so each voice's stereo signal comes from the same emulation.
 */
import {
  ChannelScopeTrackBuilder, ChannelStemsBuilder, DECK_SCOPE_CHANNELS,
  type ChannelScopeTrack, type MonoStem,
} from '@/engine/dj/channelScopeTrack';

/** The gme_wasm_* exports (game-music-emu-wasm/src/gme_wasm.cpp) the render uses. */
interface GmeModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  UTF8ToString(p: number): string;
  _malloc(n: number): number;
  _free(p: number): void;
  _gme_wasm_load(p: number, n: number, track: number, sampleRate: number): number;
  _gme_wasm_render(out: number, frames: number): number;
  _gme_wasm_render_channels(out: number, ch: number, frames: number, stride: number): number;
  _gme_wasm_set_mute_mask(mask: number): void;
  _gme_wasm_free(): void;
  _gme_wasm_voice_count(): number;
  _gme_wasm_scope_count(): number;
  _gme_wasm_loaded_track(): number;
  _gme_wasm_info(track: number, which: number): number;
}

export interface ConsoleRenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  channelScopes?: ChannelScopeTrack;
  monoStems?: MonoStem[];
}

const SAMPLE_RATE = 44100;
const CHUNK = 4096;
/** game-music-emu's own play length when the file gives none (gme_info_t.play_length). */
const DEFAULT_LENGTH_MS = 150_000;
/** A track that has gone fully silent this long after sounding has ended (libgme stops the emulation there too). */
const END_SILENCE_FRAMES = SAMPLE_RATE * 4;
// shortcut: lock-step solo instances cost one Gme.wasm (16 MB heap) each; capped at 8 voices (SPC's 8 DSP voices),
// raise when a single-mix emulator with more voices needs every scope.
const MAX_SOLO_VOICES = 8;

let gmeFiles: Promise<{ js: string; wasm: ArrayBuffer }> | null = null;

async function newGme(): Promise<GmeModule> {
  const base = import.meta.env.BASE_URL || '/';
  gmeFiles ??= Promise.all([
    fetch(`${base}gme/Gme.js`).then((r) => { if (!r.ok) throw new Error(`Gme.js: HTTP ${r.status}`); return r.text(); }),
    fetch(`${base}gme/Gme.wasm`).then((r) => { if (!r.ok) throw new Error(`Gme.wasm: HTTP ${r.status}`); return r.arrayBuffer(); }),
  ]).then(([js, wasm]) => ({ js, wasm }));
  const { js, wasm } = await gmeFiles;
  const factory = new Function(`${js}\nreturn createGme;`)() as (cfg: object) => Promise<GmeModule>;
  return factory({ wasmBinary: wasm.slice(0) });
}

/** One emulator instance with its song loaded and its output buffers. */
interface Player { m: GmeModule; out: number; ch: number; scopes: number }

function loadSong(m: GmeModule, bytes: Uint8Array, track: number, mask: number): number {
  m._gme_wasm_set_mute_mask(mask >>> 0);
  const p = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, p);
  const rc = m._gme_wasm_load(p, bytes.length, track, SAMPLE_RATE);
  m._free(p);
  return rc;
}

const LOAD_ERRORS: Record<number, string> = {
  [-1]: 'not a game-music-emu file', [-2]: 'out of memory', [-3]: 'game-music-emu refused the file', [-4]: 'the track would not start',
};

async function openPlayer(bytes: Uint8Array, track: number, mask: number, filename: string, withTaps: boolean): Promise<Player> {
  const m = await newGme();
  const rc = loadSong(m, bytes, track, mask);
  if (rc <= 0) throw new Error(`game-music-emu could not load ${filename}: code ${rc} (${LOAD_ERRORS[rc] ?? 'unknown'})`);
  const scopes = withTaps ? m._gme_wasm_scope_count() : 0;
  return { m, out: m._malloc(CHUNK * 2 * 4), ch: scopes > 0 ? m._malloc(CHUNK * 8 * 4) : 0, scopes };
}

function closePlayer(p: Player): void {
  p.m._gme_wasm_free();
  p.m._free(p.out);
  if (p.ch) p.m._free(p.ch);
  p.m._gme_wasm_set_mute_mask(0xffffffff);
}

/**
 * Render `filename` once through game-music-emu: the stereo mix and one scope and stem per voice.
 * `subsong` is the 0-based track; the load starts the first audible track from it (gme_wasm_load).
 */
export async function renderWithConsole(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  postProgress: (progress: number) => void,
  maxSeconds = 600,
  withStems = true,
): Promise<ConsoleRenderResult> {
  const bytes = new Uint8Array(fileBuffer);
  const mix = await openPlayer(bytes, Math.max(0, subsong), 0xffffffff, filename, true);
  const solos: Player[] = [];
  try {
    const track = mix.m._gme_wasm_loaded_track();
    const voices = mix.m._gme_wasm_voice_count();
    // A single-mix emulator: one solo instance per voice, loaded on the track the mix plays.
    if (mix.scopes === 0 && voices > 1) {
      for (let v = 0; v < Math.min(voices, MAX_SOLO_VOICES, DECK_SCOPE_CHANNELS); v++) {
        solos.push(await openPlayer(bytes, track, 1 << v, filename, false));
      }
    }
    postProgress(10);
    const tapCount = Math.min(mix.scopes > 0 ? mix.scopes : solos.length, DECK_SCOPE_CHANNELS);
    const scopes = tapCount > 0 ? new ChannelScopeTrackBuilder(tapCount, SAMPLE_RATE) : null;
    const stems = withStems && tapCount > 0 ? new ChannelStemsBuilder(tapCount) : null;

    const lengthMs = Number(mix.m.UTF8ToString(mix.m._gme_wasm_info(track, 5)));
    const maxFrames = Math.floor(SAMPLE_RATE * Math.min(maxSeconds, (lengthMs > 0 ? lengthMs : DEFAULT_LENGTH_MS) / 1000));
    const chunks: { left: Float32Array; right: Float32Array }[] = [];
    let totalFrames = 0, lastSound = -1;
    const tPass = Date.now();
    while (totalFrames < maxFrames) {
      const want = Math.min(CHUNK, maxFrames - totalFrames);
      const n = mix.scopes > 0
        ? mix.m._gme_wasm_render_channels(mix.out, mix.ch, want, CHUNK)
        : mix.m._gme_wasm_render(mix.out, want);
      if (n <= 0) break;
      const heap = mix.m.HEAPF32;
      const o = mix.out >> 2;
      const left = new Float32Array(n), right = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        left[i] = heap[o + 2 * i]; right[i] = heap[o + 2 * i + 1];
        if (left[i] !== 0 || right[i] !== 0) lastSound = totalFrames + i;
      }
      chunks.push({ left, right });
      if (mix.scopes > 0 && scopes) {
        const c = mix.ch >> 2;
        const tap = (ch: number, i: number) => heap[c + ch * CHUNK + i];
        scopes.push(n, tap);
        // shortcut: the multi-channel tap is each voice's (L + R) / 2, so a voice's stem is centred (exact for NSF,
        // which is mono; GBS's hard-panned voices fold to the middle); write a stereo tap in gme_wasm.cpp to keep pans.
        stems?.push(n, tap, tap);
      } else if (scopes) {
        const outs = solos.map((s) => { s.m._gme_wasm_render(s.out, n); return { h: s.m.HEAPF32, o: s.out >> 2 }; });
        scopes.push(n, (ch, i) => 0.5 * (outs[ch].h[outs[ch].o + 2 * i] + outs[ch].h[outs[ch].o + 2 * i + 1]));
        stems?.push(n, (ch, i) => outs[ch].h[outs[ch].o + 2 * i], (ch, i) => outs[ch].h[outs[ch].o + 2 * i + 1]);
      }
      totalFrames += n;
      if (totalFrames % (SAMPLE_RATE * 5) < CHUNK) postProgress(Math.min(80, 15 + (totalFrames / maxFrames) * 65));
      if (lastSound >= 0 && totalFrames - lastSound > END_SILENCE_FRAMES) break; // the track ended
    }
    if (lastSound < 0) throw new Error(`game-music-emu rendered only silence for ${filename}`);
    const left = new Float32Array(totalFrames), right = new Float32Array(totalFrames);
    let offset = 0;
    for (const c of chunks) { left.set(c.left, offset); right.set(c.right, offset); offset += c.left.length; }
    postProgress(85);
    const channelScopes = scopes?.finish();
    const monoStems = channelScopes && stems ? stems.finishMono(totalFrames) : undefined;
    console.log(`[DJRenderWorker/gme] ${filename}: track ${track + 1}, ${voices} voices, ${tapCount} ${mix.scopes > 0 ? 'voice taps' : 'solo instances'}, ${totalFrames} frames in ${Date.now() - tPass} ms, ${monoStems?.length ?? 0} mono stems`);
    return { left, right, sampleRate: SAMPLE_RATE, channelScopes, monoStems };
  } finally {
    closePlayer(mix);
    solos.forEach(closePlayer);
  }
}
