/**
 * ortSession.ts - the one ONNX Runtime Web setup every model in the app uses.
 *
 * Runtime files come from Express, NOT from Vite: Vite's module server adds
 * ?import to dynamic imports, which breaks Emscripten's pthread sub-worker
 * creation (import.meta.url gets mangled, nested Workers fail). Express
 * serves the .mjs files with clean URLs. The path follows the API URL
 * (`/onnx-wasm` is mounted on the same Express app as `/api`,
 * server/src/index.ts); a hardcoded localhost path once shipped to
 * production and made every visitor fetch the runtime from their own machine
 * (found 2026-09-18).
 *
 * One thread: inference is background work with no deadline, and ORT's
 * default pool took three extra cores at ~88 % each while a song played
 * (2026-09-28 trace), competing with the audio thread and the UI.
 */
import * as ort from 'onnxruntime-web/wasm';
import { API_URL } from '@lib/apiBase';

ort.env.wasm.wasmPaths = `${API_URL.replace(/\/api\/?$/, '')}/onnx-wasm/`;
ort.env.wasm.numThreads = 1;

export { ort };

/** A WASM-backed session from model bytes or a model URL. */
export function createOrtSession(
  model: Uint8Array | string,
  options: ort.InferenceSession.SessionOptions = {},
): Promise<ort.InferenceSession> {
  const opts = { ...options, executionProviders: ['wasm'] };
  // Model bytes go in as Uint8Array: some ORT versions reject a raw ArrayBuffer.
  return typeof model === 'string' ? ort.InferenceSession.create(model, opts) : ort.InferenceSession.create(model, opts);
}
