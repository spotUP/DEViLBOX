/**
 * DJ render for the retro platform formats, each on the engine the tracker view plays it with:
 *  - KSS (MSX): game-music-emu (Gme.wasm), the same path as the console formats (renderWithConsole).
 *  - AY (ZXAYEMUL) and PT3: aylet (Aylet.wasm, AyletEngine). A PT3 module plays through the S.V. Bulba player in
 *    the .ay wrapper the C++ PT3 module builds (pt3Grid -> ay), exactly as the tracker loads it.
 *    Per-voice signal: one more aylet instance per AY channel runs in lock-step with only that channel audible
 *    (aylet_wasm_set_mute_mask before the load), as consoleRender does for single-mix emulators.
 *  - SC68 (Atari ST): sc68 (Sc68.wasm, Sc68Engine). Mix only: sc68_wasm_set_channel_gain only stores the gain
 *    (sc68_wrapper.c), so the wasm has no per-voice tap or mute to render a voice from.
 * Every other retro extension throws a "not yet rendered" error naming the format.
 */
import {
  ChannelScopeTrackBuilder, ChannelStemsBuilder,
  type ChannelScopeTrack, type MonoStem,
} from '@/engine/dj/channelScopeTrack';
import { pt3Grid } from '@/engine/pt3/pt3EditWasm';
import { renderWithConsole } from './consoleRender';

export interface RetroRenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  channelScopes?: ChannelScopeTrack;
  monoStems?: MonoStem[];
}

const AY_RATE = 44100;
/** sc68_wasm_init fixes the rate at 48000 (sc68_wrapper.c). */
const SC68_RATE = 48000;
const CHUNK = 4096;
/** The play length when the engine gives none (game-music-emu's own default, consoleRender). */
const DEFAULT_SECONDS = 150;
const END_SILENCE_SECONDS = 4;
const AY_VOICES = 3;

interface AyletModule {
  HEAPU8: Uint8Array; HEAPF32: Float32Array;
  _malloc(n: number): number; _free(p: number): void;
  _aylet_wasm_init(rate: number): void;
  _aylet_wasm_load(p: number, n: number, track: number): number;
  _aylet_wasm_render(out: number, frames: number): number;
  _aylet_wasm_set_mute_mask(mask: number): void;
  _aylet_wasm_is_finished(): number;
  _aylet_wasm_stop(): void;
}

interface Sc68Module {
  HEAPU8: Uint8Array; HEAPF32: Float32Array;
  _malloc(n: number): number; _free(p: number): void;
  _sc68_wasm_init(p: number, n: number): number;
  _sc68_wasm_render(out: number, frames: number): number;
  _sc68_wasm_stop(): void;
}

const files = new Map<string, Promise<{ js: string; wasm: ArrayBuffer }>>();

/** An Emscripten MODULARIZE build from public/<dir>, one fresh instance (own globals) per call. */
async function instantiate<T>(dir: string, name: string): Promise<T> {
  const base = import.meta.env.BASE_URL || '/';
  const get = (f: string) => fetch(`${base}${dir}/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r; });
  let p = files.get(dir);
  if (!p) {
    p = Promise.all([get(`${name}.js`).then((r) => r.text()), get(`${name}.wasm`).then((r) => r.arrayBuffer())])
      .then(([js, wasm]) => ({ js, wasm }));
    files.set(dir, p);
  }
  const { js, wasm } = await p;
  const factory = new Function(`${js}\nreturn create${name};`)() as (cfg: object) => Promise<T>;
  // Some builds (Sc68.wasm) export no HEAP views on Module: take the instance's memory and read the views per access.
  let memory: WebAssembly.Memory | null = null;
  const m = await factory({
    wasmBinary: wasm.slice(0), print() {}, printErr() {},
    instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, mod: WebAssembly.Module) => void) {
      void WebAssembly.instantiate(wasm.slice(0), imports).then((r) => {
        const mem = r.instance.exports.memory;
        if (mem instanceof WebAssembly.Memory) memory = mem;
        done(r.instance, r.module);
      });
      return {};
    },
  }) as T & { HEAPU8?: Uint8Array; HEAPF32?: Float32Array };
  if (!m.HEAPU8 && memory) {
    const mem: WebAssembly.Memory = memory;
    Object.defineProperty(m, 'HEAPU8', { get: () => new Uint8Array(mem.buffer) });
    Object.defineProperty(m, 'HEAPF32', { get: () => new Float32Array(mem.buffer) });
  }
  return m;
}

function concat(chunks: { left: Float32Array; right: Float32Array }[], total: number) {
  const left = new Float32Array(total), right = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { left.set(c.left, o); right.set(c.right, o); o += c.left.length; }
  return { left, right };
}

interface AyPlayer { m: AyletModule; data: number; out: number }

async function openAylet(ay: Uint8Array, track: number, mask: number, filename: string): Promise<AyPlayer> {
  const m = await instantiate<AyletModule>('aylet', 'Aylet');
  m._aylet_wasm_init(AY_RATE);
  m._aylet_wasm_set_mute_mask(mask >>> 0);
  const data = m._malloc(ay.length);
  m.HEAPU8.set(ay, data);
  const rc = m._aylet_wasm_load(data, ay.length, track);
  if (rc !== 0) { m._free(data); throw new Error(`aylet could not load ${filename}: code ${rc}`); }
  return { m, data, out: m._malloc(CHUNK * 2 * 4) };
}

function closeAylet(p: AyPlayer): void {
  p.m._aylet_wasm_stop();
  p.m._free(p.data);
  p.m._free(p.out);
}

async function renderAylet(
  ay: Uint8Array, filename: string, subsong: number, postProgress: (p: number) => void, maxSeconds: number, withStems: boolean,
): Promise<RetroRenderResult> {
  const track = subsong > 0 ? subsong : -1; // negative = the file's FirstSong
  const mix = await openAylet(ay, track, 0xffffffff, filename);
  const solos: AyPlayer[] = [];
  try {
    for (let v = 0; v < AY_VOICES; v++) solos.push(await openAylet(ay, track, 1 << v, filename));
    postProgress(10);
    const scopes = new ChannelScopeTrackBuilder(AY_VOICES, AY_RATE);
    const stems = withStems ? new ChannelStemsBuilder(AY_VOICES) : null;
    const maxFrames = Math.floor(AY_RATE * Math.min(maxSeconds, DEFAULT_SECONDS));
    const chunks: { left: Float32Array; right: Float32Array }[] = [];
    let total = 0, lastSound = -1;
    while (total < maxFrames && !mix.m._aylet_wasm_is_finished()) {
      const n = Math.min(CHUNK, maxFrames - total);
      mix.m._aylet_wasm_render(mix.out, n);
      const h = mix.m.HEAPF32, o = mix.out >> 2;
      const left = new Float32Array(n), right = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        left[i] = h[o + 2 * i]; right[i] = h[o + 2 * i + 1];
        if (left[i] !== 0 || right[i] !== 0) lastSound = total + i;
      }
      chunks.push({ left, right });
      const outs = solos.map((s) => { s.m._aylet_wasm_render(s.out, n); return { h: s.m.HEAPF32, o: s.out >> 2 }; });
      scopes.push(n, (ch, i) => 0.5 * (outs[ch].h[outs[ch].o + 2 * i] + outs[ch].h[outs[ch].o + 2 * i + 1]));
      stems?.push(n, (ch, i) => outs[ch].h[outs[ch].o + 2 * i], (ch, i) => outs[ch].h[outs[ch].o + 2 * i + 1]);
      total += n;
      if (total % (AY_RATE * 5) < CHUNK) postProgress(Math.min(80, 15 + (total / maxFrames) * 65));
      if (lastSound >= 0 && total - lastSound > AY_RATE * END_SILENCE_SECONDS) break;
    }
    if (lastSound < 0) throw new Error(`aylet rendered only silence for ${filename}`);
    const { left, right } = concat(chunks, total);
    postProgress(85);
    const channelScopes = scopes.finish();
    const monoStems = stems ? stems.finishMono(total) : undefined;
    console.log(`[DJRenderWorker/aylet] ${filename}: ${AY_VOICES} solo instances, ${total} frames, ${monoStems?.length ?? 0} mono stems`);
    return { left, right, sampleRate: AY_RATE, channelScopes, monoStems };
  } finally {
    closeAylet(mix);
    solos.forEach(closeAylet);
  }
}

async function renderSc68(bytes: Uint8Array, filename: string, postProgress: (p: number) => void, maxSeconds: number): Promise<RetroRenderResult> {
  const m = await instantiate<Sc68Module>('sc68', 'Sc68');
  const data = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, data);
  const out = m._malloc(CHUNK * 2 * 4);
  try {
    const rc = m._sc68_wasm_init(data, bytes.length);
    if (rc !== 0) throw new Error(`sc68 could not load ${filename}: code ${rc}`);
    postProgress(10);
    // shortcut: sc68_wasm_render loops the track forever and the wasm exposes no length; the render stops at
    // DEFAULT_SECONDS or after END_SILENCE_SECONDS of silence. Export the track time from sc68_wrapper.c to cut at the end.
    const maxFrames = Math.floor(SC68_RATE * Math.min(maxSeconds, DEFAULT_SECONDS));
    const chunks: { left: Float32Array; right: Float32Array }[] = [];
    let total = 0, lastSound = -1;
    while (total < maxFrames) {
      const n = m._sc68_wasm_render(out, Math.min(512, maxFrames - total)); // the wrapper renders at most 512 per call
      if (n <= 0) break;
      const h = m.HEAPF32, o = out >> 2;
      const left = new Float32Array(n), right = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        left[i] = h[o + 2 * i]; right[i] = h[o + 2 * i + 1];
        if (left[i] !== 0 || right[i] !== 0) lastSound = total + i;
      }
      chunks.push({ left, right });
      total += n;
      if (total % (SC68_RATE * 5) < 512) postProgress(Math.min(80, 15 + (total / maxFrames) * 65));
      if (lastSound >= 0 && total - lastSound > SC68_RATE * END_SILENCE_SECONDS) break;
    }
    if (lastSound < 0) throw new Error(`sc68 rendered only silence for ${filename}`);
    postProgress(85);
    console.log(`[DJRenderWorker/sc68] ${filename}: mix only (no per-voice tap in Sc68.wasm), ${total} frames`);
    return { ...concat(chunks, total), sampleRate: SC68_RATE };
  } finally {
    m._sc68_wasm_stop();
    m._free(data);
    m._free(out);
  }
}

/** Render a retro platform file once on its tracker engine: the stereo mix and, where the engine allows, one scope and stem per voice. */
export async function renderWithRetro(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  postProgress: (progress: number) => void,
  maxSeconds = 600,
  withStems = true,
): Promise<RetroRenderResult> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const bytes = new Uint8Array(fileBuffer);
  switch (ext) {
    case 'kss': return renderWithConsole(fileBuffer, filename, subsong, postProgress, maxSeconds, withStems);
    case 'ay': return renderAylet(bytes, filename, subsong, postProgress, maxSeconds, withStems);
    case 'pt3': return renderAylet(new Uint8Array((await pt3Grid(bytes)).ay), filename, -1, postProgress, maxSeconds, withStems);
    case 'sc68': return renderSc68(bytes, filename, postProgress, maxSeconds);
    default: throw new Error(`.${ext} (${filename}) is not yet rendered in the DJ renderer: no retro engine wired for it (use the main tracker)`);
  }
}
