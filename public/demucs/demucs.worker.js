/**
 * DemucsWorker — Web Worker for Demucs WASM stem separation
 *
 * Loads the demucs WASM module, accepts stereo PCM audio, and returns
 * separated stem buffers (drums, bass, other, vocals, +guitar, +piano for 6s).
 *
 * Protocol:
 *   Main → Worker:
 *     { type: 'init', modelData: ArrayBuffer }
 *     { type: 'separate', id: string, left: Float32Array, right: Float32Array }
 *
 *   Worker → Main:
 *     { type: 'ready' }
 *     { type: 'progress', id: string, progress: number, message: string }
 *     { type: 'complete', id: string, stems: Record<string, {left, right}> }
 *     { type: 'error', id: string, error: string }
 *     { type: 'log', message: string }
 */

/* global importScripts, libdemucs */

let wasmModule = null;
let isModelLoaded = false;
let numTargets = 4; // 4 for htdemucs, 6 for htdemucs_6s
const MAX_TARGETS = 7; // WASM function accepts up to 7 target pairs

const STEM_NAMES_4S = ['drums', 'bass', 'other', 'vocals'];
const STEM_NAMES_6S = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'];

function allocateFloat32(module, data) {
  const bytes = data.length * data.BYTES_PER_ELEMENT;
  const ptr = module._malloc(bytes);
  if (ptr === 0) throw new Error('WASM malloc failed');
  module.HEAPF32.set(data, ptr / data.BYTES_PER_ELEMENT);
  return ptr;
}

onmessage = async function (e) {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      importScripts('/demucs/demucs.js');
      wasmModule = await libdemucs();

      const modelBytes = new Uint8Array(msg.modelData);
      const modelPtr = wasmModule._malloc(modelBytes.byteLength);
      if (modelPtr === 0) throw new Error('Failed to allocate memory for model');
      wasmModule.HEAPU8.set(modelBytes, modelPtr);

      wasmModule._modelInit(modelPtr, modelBytes.byteLength);
      wasmModule._free(modelPtr);

      // Detect model type from model size (6s model is ~53 MB, 4s is ~81 MB)
      // The WASM code sets model.is_4sources internally; we infer from weight size
      numTargets = msg.modelData.byteLength < 60_000_000 ? 6 : 4;

      isModelLoaded = true;
      postMessage({ type: 'ready' });
    } catch (err) {
      postMessage({ type: 'error', id: 'init', error: 'Model init failed: ' + err.message });
    }
    return;
  }

  if (msg.type === 'separate') {
    if (!isModelLoaded) {
      postMessage({ type: 'error', id: msg.id, error: 'Model not loaded' });
      return;
    }

    try {
      const { id, left, right } = msg;
      const N = left.length;
      const stemNames = numTargets === 6 ? STEM_NAMES_6S : STEM_NAMES_4S;

      // Estimate total chunks for progress tracking
      // Demucs splits audio into overlapping chunks of CHUNK_SIZE with CHUNK_STRIDE step
      const CHUNK_SIZE = 343980;
      const CHUNK_STRIDE = Math.round(CHUNK_SIZE * 0.75); // 257985
      _totalChunks = N <= CHUNK_SIZE ? 1 : Math.ceil((N - CHUNK_SIZE) / CHUNK_STRIDE) + 1;
      _currentChunk = 0;
      _stageInChunk = 0;
      _separationActive = true;

      // Allocate input buffers
      const leftPtr = allocateFloat32(wasmModule, left);
      const rightPtr = allocateFloat32(wasmModule, right);

      // Allocate output buffers for each target (up to 7 pairs L/R)
      const targetPtrs = [];
      for (let i = 0; i < MAX_TARGETS; i++) {
        if (i < numTargets) {
          const ptrL = wasmModule._malloc(N * 4);
          const ptrR = wasmModule._malloc(N * 4);
          if (ptrL === 0 || ptrR === 0) throw new Error('Output buffer malloc failed');
          targetPtrs.push(ptrL, ptrR);
        } else {
          targetPtrs.push(0, 0);
        }
      }

      // Call modelDemixSegment(leftPtr, rightPtr, length, L0,R0, L1,R1, ... L6,R6, batchMode)
      wasmModule._modelDemixSegment(
        leftPtr, rightPtr, N,
        ...targetPtrs,
        false // batch_mode
      );

      // Extract results
      const stems = {};
      for (let i = 0; i < numTargets; i++) {
        const ptrL = targetPtrs[i * 2];
        const ptrR = targetPtrs[i * 2 + 1];
        stems[stemNames[i]] = {
          left: new Float32Array(wasmModule.HEAPF32.buffer.slice(ptrL, ptrL + N * 4)),
          right: new Float32Array(wasmModule.HEAPF32.buffer.slice(ptrR, ptrR + N * 4)),
        };
      }

      // Free all pointers
      wasmModule._free(leftPtr);
      wasmModule._free(rightPtr);
      for (const ptr of targetPtrs) {
        if (ptr !== 0) wasmModule._free(ptr);
      }

      // Transfer buffers for zero-copy (marks them as detached in this context)
      const transferable = [];
      for (const stem of Object.values(stems)) {
        transferable.push(stem.left.buffer, stem.right.buffer);
      }

      _separationActive = false;
      postMessage({ type: 'complete', id, stems }, transferable);
    } catch (err) {
      _separationActive = false;
      postMessage({ type: 'error', id: msg.id, error: 'Separation failed: ' + err.message });
    }
    return;
  }

  if (msg.type === 'terminate') {
    close();
  }
};

// The WASM bridge uses postMessage for progress and logs:
// { msg: 'PROGRESS_UPDATE', data: float }
// { msg: 'WASM_LOG', data: string }
// We intercept these by overriding the worker's postMessage temporarily
// But since the WASM EM_JS directly calls postMessage, we re-route them here.
const _origPostMessage = postMessage;

// ── Log-derived progress tracking ──────────────────────────────────────────
// The WASM emits structured log messages during processing. We parse them to
// derive fine-grained progress since native PROGRESS_UPDATE messages are sparse.
//
// Each chunk goes through ~33 logged stages:
//   normalized(2) → encoder 0-3 interleaved(8) → upsampled(2) →
//   crosstransformer 0-4 interleaved(10) → downsampled(2) →
//   decoder 0-3 interleaved(8) → Mask+istft(1)
const STAGES_PER_CHUNK = 33;
let _totalChunks = 1;
let _currentChunk = 0;
let _stageInChunk = 0;
let _separationActive = false;

function emitDerivedProgress(stage) {
  if (!_separationActive || _totalChunks <= 0) return;
  const chunkFrac = Math.min(_stageInChunk / STAGES_PER_CHUNK, 1);
  const overall = (_currentChunk + chunkFrac) / _totalChunks;
  const clamped = Math.min(Math.max(overall, 0), 1);
  _origPostMessage({
    type: 'progress',
    id: '_current',
    progress: clamped,
    message: stage || '',
  });
}

// eslint-disable-next-line no-global-assign
postMessage = function (msg, transfer) {
  // Intercept WASM bridge messages and re-format
  if (msg && msg.msg === 'PROGRESS_UPDATE') {
    _origPostMessage({ type: 'progress', id: '_current', progress: msg.data, message: '' });
    return;
  }
  if (msg && msg.msg === 'PROGRESS_UPDATE_BATCH') {
    _origPostMessage({ type: 'progress', id: '_current', progress: msg.data, message: '' });
    return;
  }
  if (msg && msg.msg === 'WASM_LOG') {
    const text = msg.data;
    _origPostMessage({ type: 'log', message: text });

    // Parse log messages for fine-grained progress during separation
    if (_separationActive) {
      if (text.includes('apply model w/ split')) {
        // New chunk start — extract chunk info
        if (_currentChunk > 0 || _stageInChunk > 0) {
          _currentChunk++;
        }
        _stageInChunk = 0;
        emitDerivedProgress('Processing chunk ' + (_currentChunk + 1) + '/' + _totalChunks);
      } else if (
        text.includes('encoder ') || text.includes('decoder ') ||
        text.includes('normalized') || text.includes('upsampled') ||
        text.includes('downsampled') || text.includes('crosstransformer') ||
        text.includes('Mask') || text.includes('embedding')
      ) {
        _stageInChunk++;
        // Build a short user-facing label
        let label = 'Processing...';
        if (text.includes('encoder')) label = 'Encoding...';
        else if (text.includes('crosstransformer')) label = 'Transformer...';
        else if (text.includes('decoder')) label = 'Decoding...';
        else if (text.includes('Mask')) label = 'Finalizing chunk...';
        emitDerivedProgress(label);
      }
    }
    return;
  }
  // Pass through our own protocol messages
  _origPostMessage(msg, transfer);
};
