/**
 * audioEncoders — FLAC + OGG Vorbis encoding for the export router.
 *
 * Both encoders are LAZY-LOADED (dynamic import) so the wasm/asm.js payloads
 * never touch the main bundle — they load only when the user actually exports
 * FLAC or OGG. Pure Float32Array[] + sampleRate API (no AudioBuffer) so the
 * round-trip regression tests run in plain node.
 *
 * FLAC: libflacjs 'min' variant (pure asm.js — works identically in browser
 * and node, no wasm-path plumbing). 16- or 24-bit, compression level 5
 * (libFLAC default, same as FXCP quotes).
 * OGG: wasm-media-encoders Vorbis, quality -1..10 (q3/q5/q7 ≈ 112/160/224 kbps).
 */

export type FlacBitDepth = 16 | 24;

// ── FLAC ─────────────────────────────────────────────────────────────────────

interface FlacApi {
  isReady(): boolean;
  on(event: string, cb: () => void): void;
}

let flacReadyPromise: Promise<FlacApi> | null = null;

const isNode = typeof process !== 'undefined' && !!process.versions?.node;

/** Browser path: load the self-contained wasm UMD build from /flac/ (public
 * static asset). The libflacjs npm entry point is a NODE factory (uses
 * __dirname/path.resolve) and crashes in the browser — regression 2026-07-21:
 * "Export failed: ReferenceError: __dirname is not defined". */
function loadFlacBrowser(): Promise<FlacApi> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Flac?: FlacApi; FLAC_SCRIPT_LOCATION?: string };
    const finish = () => {
      const Flac = w.Flac!;
      if (Flac.isReady()) resolve(Flac);
      else Flac.on('ready', () => resolve(Flac));
    };
    if (w.Flac) { finish(); return; }
    w.FLAC_SCRIPT_LOCATION = '/flac/'; // where the UMD finds its .wasm
    const script = document.createElement('script');
    script.src = '/flac/libflac.min.wasm.js';
    script.onload = () => (w.Flac ? finish() : reject(new Error('libflac.min.wasm.js loaded but window.Flac missing')));
    script.onerror = () => reject(new Error('Failed to load /flac/libflac.min.wasm.js'));
    document.head.appendChild(script);
  });
}

/** node/vitest path: the npm factory works (asm.js 'min' variant). */
async function loadFlacNode(): Promise<FlacApi> {
  const factoryMod = await import('libflacjs');
  const factory = (factoryMod as unknown as { default?: (v: string) => FlacApi }).default
    ?? (factoryMod as unknown as (v: string) => FlacApi);
  const Flac = factory('min');
  if (!Flac.isReady()) {
    await new Promise<void>((resolve) => Flac.on('ready', () => resolve()));
  }
  return Flac;
}

async function loadFlac(): Promise<FlacApi> {
  if (!flacReadyPromise) {
    flacReadyPromise = (async () => {
      if (isNode) {
        // vitest runs jsdom (window exists), so detect node by process, and in
        // ambiguous environments fall back to the browser loader on throw.
        try {
          return await loadFlacNode();
        } catch {
          return loadFlacBrowser();
        }
      }
      return loadFlacBrowser();
    })();
  }
  return flacReadyPromise;
}

/**
 * Encode planar float channels to a FLAC file (Uint8Array).
 * Samples outside [-1,1] are clamped.
 */
export async function encodeFlac(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: FlacBitDepth = 16,
): Promise<Uint8Array> {
  if (channels.length === 0 || channels[0].length === 0) {
    throw new Error('encodeFlac: no audio data');
  }
  const Flac = await loadFlac();
  const { Encoder } = await import('libflacjs/lib/encoder');

  const numChannels = Math.min(channels.length, 2);
  const numSamples = channels[0].length;
  const scale = bitDepth === 16 ? 0x7fff : 0x7fffff;

  const intChannels: Int32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    const src = channels[c];
    const dst = new Int32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const s = src[i] < -1 ? -1 : src[i] > 1 ? 1 : src[i];
      dst[i] = Math.round(s * scale);
    }
    intChannels.push(dst);
  }

  const encoder = new Encoder(Flac as never, {
    sampleRate,
    channels: numChannels,
    bitsPerSample: bitDepth,
    compression: 5,
    totalSamples: numSamples,
    verify: false,
  });
  try {
    if (!encoder.encode(intChannels, numSamples, false)) {
      throw new Error('FLAC encode failed');
    }
    encoder.encode(); // finish
    return encoder.getSamples();
  } finally {
    encoder.destroy();
  }
}

// ── OGG Vorbis ───────────────────────────────────────────────────────────────

/**
 * Encode planar float channels to an OGG Vorbis file (Uint8Array).
 * `quality` is Vorbis VBR -1..10; q3/q5/q7 ≈ 112/160/224 kbps.
 */
export async function encodeOgg(
  channels: Float32Array[],
  sampleRate: number,
  quality = 5,
): Promise<Uint8Array> {
  if (channels.length === 0 || channels[0].length === 0) {
    throw new Error('encodeOgg: no audio data');
  }
  const mod = await import('wasm-media-encoders');
  let encoder: Awaited<ReturnType<typeof mod.createOggEncoder>>;
  try {
    // Browser path: the library's own loader (inline wasm via fetch).
    encoder = await mod.createOggEncoder();
  } catch {
    // node/vitest: the loader's fetch(dataURL) trips node's Response type
    // check — read the wasm payload from the package directly instead.
    const { readFile } = await import('node:fs/promises');
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const wasmBytes = await readFile(req.resolve('wasm-media-encoders/wasm/ogg.wasm'));
    encoder = await mod.createEncoder('audio/ogg', wasmBytes);
  }
  const numChannels = Math.min(channels.length, 2) as 1 | 2;
  encoder.configure({ channels: numChannels, sampleRate, vbrQuality: quality });

  // Encode in ~1s chunks to bound peak memory on long renders.
  const CHUNK = sampleRate;
  const total = channels[0].length;
  const parts: Uint8Array[] = [];
  for (let off = 0; off < total; off += CHUNK) {
    const end = Math.min(off + CHUNK, total);
    const slice = channels.slice(0, numChannels).map((ch) => ch.subarray(off, end));
    const out = encoder.encode(slice);
    if (out.length > 0) parts.push(out.slice());
  }
  const tail = encoder.finalize();
  if (tail.length > 0) parts.push(tail.slice());

  const merged = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let off = 0;
  for (const p of parts) { merged.set(p, off); off += p.length; }
  return merged;
}
