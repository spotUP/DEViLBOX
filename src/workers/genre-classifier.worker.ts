/**
 * Genre Classifier Worker — CED ONNX (mispeech/ced-base, 527 AudioSet classes)
 *
 * Reuses the same CED model already downloaded for instrument classification.
 * Processes 2-second waveform chunks across the song and aggregates the
 * music-genre-specific AudioSet classes (Rock, Pop, Jazz, Electronic, etc.)
 *
 * Protocol:
 *   Main → Worker: { type: 'classify', id, pcm, sampleRate }
 *   Worker → Main: { type: 'result', id, tags, primary, subgenre, mood }
 *   Worker → Main: { type: 'error', id, error }
 *   Worker → Main: { type: 'ready' }
 *
 * Model: mispeech/ced-base (already cached from instrument classification)
 * Input:  [1, num_samples]  float32  raw waveform at 16 kHz
 * Output: [527]             float32  sigmoid per-class scores
 */

import * as ort from 'onnxruntime-web/wasm';

ort.env.wasm.wasmPaths = 'http://localhost:3011/onnx-wasm/';

// ── Model (same as CED instrument classifier) ─────────────────────────────────
const MODEL_URL_PRIMARY  = '/models/ced/model.onnx';
const MODEL_URL_FALLBACK = 'https://huggingface.co/mispeech/ced-base/resolve/main/model.onnx';
const CONFIG_URL_PRIMARY  = '/models/ced/config.json';
const CONFIG_URL_FALLBACK = 'https://huggingface.co/mispeech/ced-base/resolve/main/config.json';
const CACHE_NAME = 'instrument-classifier-ced-v1'; // shared cache with CED worker
const MIN_MODEL_BYTES = 1_000_000;

// Chunk size: 2 seconds at 16 kHz — proven safe within WASM heap limits
const CHUNK_SAMPLES = 32_000;
// Max chunks to process per song (spread evenly, ~30s of audio = 15 chunks)
const MAX_CHUNKS = 15;

// ── AudioSet genre class indices present in ced-base ─────────────────────────
// (confirmed from config.json id2label)
const GENRE_INDICES: Record<number, string> = {
  216: 'Pop music',
  217: 'Hip hop music',
  219: 'Rock music',
  220: 'Heavy metal',
  221: 'Punk rock',
  223: 'Progressive rock',
  224: 'Rock and roll',
  225: 'Psychedelic rock',
  226: 'Rhythm and blues',
  227: 'Soul music',
  228: 'Reggae',
  229: 'Country',
  232: 'Funk',
  233: 'Folk music',
  235: 'Jazz',
  237: 'Classical music',
  239: 'Electronic music',
  240: 'House music',
  241: 'Techno',
  243: 'Drum and bass',
  244: 'Electronica',
  245: 'Electronic dance music',
  246: 'Ambient music',
  247: 'Trance music',
  251: 'Blues',
  274: 'Dance music',
};

// ── Genre tag → display mapping ───────────────────────────────────────────────

const GENRE_MAP: Array<{
  labels: string[]; primary: string; sub: string; mood: string;
}> = [
  { labels: ['Heavy metal','Punk rock'],                      primary: 'Rock',       sub: 'Metal / Punk',       mood: 'Dark & Intense' },
  { labels: ['Progressive rock','Psychedelic rock'],          primary: 'Rock',       sub: 'Progressive Rock',   mood: 'Driving' },
  { labels: ['Rock and roll','Rock music'],                   primary: 'Rock',       sub: 'Rock',               mood: 'Energetic' },
  { labels: ['Blues'],                                        primary: 'Blues',      sub: 'Blues',              mood: 'Melancholic' },
  { labels: ['Jazz'],                                         primary: 'Jazz',       sub: 'Jazz',               mood: 'Chill' },
  { labels: ['Classical music'],                              primary: 'Classical',  sub: 'Classical',          mood: 'Uplifting' },
  { labels: ['Folk music','Country'],                         primary: 'Folk',       sub: 'Folk / Country',     mood: 'Chill' },
  { labels: ['Reggae'],                                       primary: 'Reggae',     sub: 'Reggae',             mood: 'Chill' },
  { labels: ['Hip hop music'],                                primary: 'Hip-Hop',    sub: 'Hip-Hop',            mood: 'Driving' },
  { labels: ['Rhythm and blues','Soul music','Funk'],         primary: 'R&B / Soul', sub: 'Soul / R&B',         mood: 'Uplifting' },
  { labels: ['Pop music'],                                    primary: 'Pop',        sub: 'Pop',                mood: 'Uplifting' },
  { labels: ['House music','Dance music','Electronic dance music'], primary: 'Electronic', sub: 'Dance / House', mood: 'Euphoric' },
  { labels: ['Techno','Drum and bass'],                       primary: 'Electronic', sub: 'Techno / D&B',       mood: 'Energetic' },
  { labels: ['Trance music','Electronica'],                   primary: 'Electronic', sub: 'Trance',             mood: 'Euphoric' },
  { labels: ['Ambient music','Electronic music'],             primary: 'Electronic', sub: 'Ambient / Electronic', mood: 'Atmospheric' },
];

// ── State ─────────────────────────────────────────────────────────────────────
let session: ort.InferenceSession | null = null;
let _loadPromise: Promise<void> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithCache(primary: string, fallback: string): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  for (const url of [primary, fallback]) {
    try {
      const cached = await cache.match(url);
      if (cached) {
        const buf = await cached.arrayBuffer();
        if (buf.byteLength >= MIN_MODEL_BYTES) return buf;
        await cache.delete(url);
      }
      const res = await fetch(url);
      if (!res.ok) continue;
      await cache.put(url, res.clone());
      return res.arrayBuffer();
    } catch { /* try next */ }
  }
  throw new Error('Failed to fetch model');
}

async function _doLoadSession(): Promise<void> {
  self.postMessage({ type: 'loading', progress: 0 });
  const buf = await fetchWithCache(MODEL_URL_PRIMARY, MODEL_URL_FALLBACK);
  self.postMessage({ type: 'loading', progress: 85 });
  session = await ort.InferenceSession.create(new Uint8Array(buf), {
    executionProviders: ['wasm'],
  });
  // Also warm up id2label in case config hasn't been fetched yet
  try {
    await fetchWithCache(CONFIG_URL_PRIMARY, CONFIG_URL_FALLBACK);
  } catch { /* non-fatal */ }
  self.postMessage({ type: 'loading', progress: 100 });
  self.postMessage({ type: 'ready' });
}

function ensureSession(): Promise<void> {
  if (session) return Promise.resolve();
  if (!_loadPromise) _loadPromise = _doLoadSession();
  return _loadPromise;
}

function resampleTo16k(pcm: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return pcm;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLen);
  if (ratio > 1) {
    const halfWin = ratio / 2;
    for (let i = 0; i < outLen; i++) {
      const center = i * ratio;
      const start = Math.max(0, Math.floor(center - halfWin));
      const end = Math.min(pcm.length - 1, Math.ceil(center + halfWin));
      let sum = 0;
      for (let j = start; j <= end; j++) sum += pcm[j];
      out[i] = sum / (end - start + 1);
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio;
      const lo = Math.floor(src);
      const hi = Math.min(lo + 1, pcm.length - 1);
      out[i] = pcm[lo] + (pcm[hi] - pcm[lo]) * (src - lo);
    }
  }
  return out;
}

// ── Inference ─────────────────────────────────────────────────────────────────

async function classifySong(
  pcm: Float32Array,
  sampleRate: number,
): Promise<{ tags: Array<{ tag: string; score: number }>; primary: string; subgenre: string; mood: string; confidence: number }> {
  if (!session) throw new Error('Model not loaded');

  const audio = resampleTo16k(pcm, sampleRate);
  if (audio.length < CHUNK_SAMPLES) throw new Error('Audio too short for genre analysis');

  const inputName = session.inputNames[0];
  const accumulated = new Float32Array(527);
  let nChunks = 0;

  // Sample evenly across the song — skip intro/outro bias
  const totalChunks = Math.floor(audio.length / CHUNK_SAMPLES);
  const step = Math.max(1, Math.floor(totalChunks / MAX_CHUNKS));
  // Start from 10% into the song to skip silence/intro
  const startChunk = Math.max(0, Math.floor(totalChunks * 0.1));

  for (let c = startChunk; c < totalChunks && nChunks < MAX_CHUNKS; c += step) {
    const start = c * CHUNK_SAMPLES;
    const chunk = audio.slice(start, start + CHUNK_SAMPLES);
    const tensor = new ort.Tensor('float32', chunk, [1, chunk.length]);
    const result = await session.run({ [inputName]: tensor });
    const scores = result[session.outputNames[0]].data as Float32Array;
    for (let i = 0; i < 527; i++) accumulated[i] += scores[i];
    nChunks++;
  }

  if (nChunks === 0) throw new Error('No chunks processed');

  // Average scores for genre indices only
  const genreTags = Object.entries(GENRE_INDICES).map(([idx, label]) => ({
    tag: label,
    score: accumulated[Number(idx)] / nChunks,
  })).sort((a, b) => b.score - a.score);

  const { primary, subgenre, mood, confidence } = mapToGenre(genreTags);
  return { tags: genreTags.slice(0, 8), primary, subgenre, mood, confidence };
}

function mapToGenre(
  tags: Array<{ tag: string; score: number }>,
): { primary: string; subgenre: string; mood: string; confidence: number } {
  const scoreMap = new Map(tags.map(t => [t.tag, t.score]));

  let bestEntry = GENRE_MAP[GENRE_MAP.length - 1];
  let bestScore = 0;

  for (const entry of GENRE_MAP) {
    const avg = entry.labels.reduce((s, l) => s + (scoreMap.get(l) ?? 0), 0) / entry.labels.length;
    if (avg > bestScore) {
      bestScore = avg;
      bestEntry = entry;
    }
  }

  if (bestScore < 0.03) return { primary: 'Unknown', subgenre: '', mood: 'Driving', confidence: 0 };

  // Scale confidence: 0.03 → 0.4, 0.15+ → 0.9 (sigmoid-like, not hardcoded 0.85)
  const confidence = Math.min(0.9, 0.4 + (bestScore - 0.03) / 0.12 * 0.5);
  return { primary: bestEntry.primary, subgenre: bestEntry.sub, mood: bestEntry.mood, confidence };
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try { await ensureSession(); }
    catch (err) { self.postMessage({ type: 'error', id: 'init', error: String(err) }); }
    return;
  }

  if (msg.type === 'classify') {
    const { id, pcm, sampleRate } = msg as { id: string; pcm: Float32Array; sampleRate: number };
    try {
      await ensureSession();
      const result = await classifySong(pcm, sampleRate);
      self.postMessage({ type: 'result', id, ...result });
    } catch (err) {
      self.postMessage({ type: 'error', id, error: String(err) });
    }
  }
});
