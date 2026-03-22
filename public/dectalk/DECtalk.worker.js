/**
 * DECtalk synthesis worker — single-threaded WASM build (no pthreads).
 * Uses DECtalkMini compiled with SINGLE_THREADED + DISABLE_AUDIO.
 */

let mod = null;
let speakFn = null;
let getWavSizeFn = null;
let getWavFn = null;
let setVoiceFn = null;
let setRateFn = null;

console.log('[DECtalk Worker] Started');

async function ensureLoaded() {
  if (mod) return;
  console.log('[DECtalk Worker] Loading WASM...');

  const scriptUrl = new URL('dectalk_mini.js', self.location.href).href;
  const resp = await fetch(scriptUrl);
  let jsText = await resp.text();
  jsText = jsText.replace(/import\.meta\.url/g, `"${scriptUrl}"`);
  const blob = new Blob([jsText], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  const m = await import(blobUrl);

  mod = await m.default({
    locateFile: (path) => new URL(path, scriptUrl).href,
  });

  mod._synth_init();

  // Create cwrap'd functions for convenience
  speakFn = mod.cwrap('synth_speak', 'number', ['string']);
  getWavSizeFn = mod.cwrap('synth_get_wav_size', 'number', []);
  getWavFn = mod._synth_get_wav;
  setVoiceFn = mod.cwrap('synth_set_voice', 'number', ['number']);
  setRateFn = mod.cwrap('synth_set_rate', null, ['number']);

  console.log('[DECtalk Worker] WASM initialized');
}

self.onmessage = async (e) => {
  const { id, text, voice, rate } = e.data;

  try {
    await ensureLoaded();

    // Set voice and rate
    setVoiceFn(voice);
    setRateFn(rate);

    // Synthesize
    const numSamples = speakFn(text);
    console.log(`[DECtalk Worker] Synthesized ${numSamples} samples`);

    if (numSamples <= 0) {
      self.postMessage({ id, error: 'No audio produced' });
      return;
    }

    // Get WAV data
    const wavSize = getWavSizeFn();
    const wavPtr = mod._malloc(wavSize);
    mod._synth_get_wav(wavPtr, wavSize);

    // Copy out of WASM heap
    const wavData = new Uint8Array(mod.HEAPU8.buffer, wavPtr, wavSize).slice();
    mod._free(wavPtr);

    console.log(`[DECtalk Worker] WAV: ${wavSize} bytes`);
    self.postMessage({ id, wav: wavData }, [wavData.buffer]);
  } catch (err) {
    console.error('[DECtalk Worker] Error:', err);
    self.postMessage({ id, error: err.message || String(err) });
  }
};
