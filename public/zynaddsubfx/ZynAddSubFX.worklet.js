/**
 * ZynAddSubFX AudioWorklet Processor
 * 
 * Loads the ZynAddSubFX WASM module and processes audio in the worklet thread.
 * Maps the TypeScript parameter indices (0-69) to WASM bridge indices (0-127).
 *
 * WASM Bridge parameter layout:
 *   0-9:   Global/Master      30-49:  ADDsynth voice 0   70-79:  Filter
 *   10-29: ADDsynth global    50-59:  SUBsynth           80-89:  Amp envelope
 *   60-69: PADsynth           90-99:  Filter envelope    110-119: LFO
 *   100-109: Freq envelope    120-127: Effects
 */

// Map TypeScript param index (0-69) to [WASM bridge index, valueTransform]
// valueTransform: 'bool01'=0/1->0/127, 'uni'=0-1->0-127, 'bi'=-1..1->0-127,
//                 'oct'=octave->PCoarseDetune, 'detune'=-1..1->0..16383,
//                 'wave'=waveform, 'raw'=pass value*127, 'sub_harm'=0-1->0-127
const PARAM_MAP = [
  // ADDsynth global (TS 0-4)
  [10, 'bool01'],  // 0:  ADD_ENABLE -> P_ADD_ENABLE
  [11, 'uni'],     // 1:  ADD_VOLUME -> P_ADD_VOLUME
  [12, 'bi'],      // 2:  ADD_PANNING -> P_ADD_PANNING
  [13, 'detune'],  // 3:  ADD_DETUNE -> P_ADD_DETUNE
  [14, 'oct'],     // 4:  ADD_OCTAVE -> P_ADD_COARSE_DETUNE
  // ADDsynth Voice 0 (TS 5-7)
  [35, 'wave'],    // 5:  ADD_V1_WAVE -> P_ADDV0_OSCIL_SHAPE
  [31, 'uni'],     // 6:  ADD_V1_VOLUME -> P_ADDV0_VOLUME
  [33, 'detune'],  // 7:  ADD_V1_DETUNE -> P_ADDV0_DETUNE
  // ADDsynth Voice 1 (TS 8-11)
  [134, 'wave'],   // 8:  ADD_V2_WAVE -> P_ADDV1_OSCIL_SHAPE
  [131, 'uni'],    // 9:  ADD_V2_VOLUME -> P_ADDV1_VOLUME
  [132, 'detune'], // 10: ADD_V2_DETUNE -> P_ADDV1_DETUNE
  [133, 'oct'],    // 11: ADD_V2_OCTAVE -> P_ADDV1_COARSE_DETUNE
  // ADDsynth Voice 2 (TS 12-15)
  [144, 'wave'],   // 12: ADD_V3_WAVE -> P_ADDV2_OSCIL_SHAPE
  [141, 'uni'],    // 13: ADD_V3_VOLUME -> P_ADDV2_VOLUME
  [142, 'detune'], // 14: ADD_V3_DETUNE -> P_ADDV2_DETUNE
  [143, 'oct'],    // 15: ADD_V3_OCTAVE -> P_ADDV2_COARSE_DETUNE
  // ADDsynth Voice 3 (TS 16-19)
  [154, 'wave'],   // 16: ADD_V4_WAVE -> P_ADDV3_OSCIL_SHAPE
  [151, 'uni'],    // 17: ADD_V4_VOLUME -> P_ADDV3_VOLUME
  [152, 'detune'], // 18: ADD_V4_DETUNE -> P_ADDV3_DETUNE
  [153, 'oct'],    // 19: ADD_V4_OCTAVE -> P_ADDV3_COARSE_DETUNE
  // SUBsynth (TS 20-34)
  [50, 'bool01'],  // 20: SUB_ENABLE
  [51, 'uni'],     // 21: SUB_VOLUME
  [52, 'bi'],      // 22: SUB_PANNING
  [56, 'oct'],     // 23: SUB_OCTAVE -> P_SUB_COARSE_DETUNE
  [55, 'detune'],  // 24: SUB_DETUNE -> P_SUB_DETUNE
  [53, 'uni'],     // 25: SUB_BANDWIDTH
  [54, 'uni'],     // 26: SUB_BANDWIDTH_SCALE
  [57, 'raw8'],    // 27: SUB_NUM_HARMONICS -> P_SUB_NUM_STAGES
  [58, 'raw4'],    // 28: SUB_MAG_TYPE
  [160, 'uni'],    // 29: SUB_HARM_1 -> P_SUB_HMAG0
  [161, 'uni'],    // 30: SUB_HARM_2 -> P_SUB_HMAG1
  [162, 'uni'],    // 31: SUB_HARM_3 -> P_SUB_HMAG2
  [163, 'uni'],    // 32: SUB_HARM_4 -> P_SUB_HMAG3
  [164, 'uni'],    // 33: SUB_HARM_5 -> P_SUB_HMAG4
  [165, 'uni'],    // 34: SUB_HARM_6 -> P_SUB_HMAG5
  // PADsynth (TS 35-44)
  [60, 'bool01'],  // 35: PAD_ENABLE
  [61, 'uni'],     // 36: PAD_VOLUME
  [62, 'bi'],      // 37: PAD_PANNING
  [65, 'uni'],     // 38: PAD_BANDWIDTH
  [66, 'uni'],     // 39: PAD_BANDWIDTH_SCALE
  null,            // 40: PAD_PROFILE_WIDTH (no separate WASM param — use padQuality)
  null,            // 41: PAD_PROFILE_STRETCH (no separate WASM param — use padQuality)
  [64, 'oct'],     // 42: PAD_OCTAVE -> P_PAD_COARSE_DETUNE
  [63, 'detune'],  // 43: PAD_DETUNE
  [67, 'raw4'],    // 44: PAD_QUALITY
  // Global filter (TS 45-54)
  [70, 'raw8'],    // 45: FILTER_TYPE
  [72, 'uni'],     // 46: FILTER_CUTOFF
  [73, 'uni'],     // 47: FILTER_RESONANCE
  [94, 'uni'],     // 48: FILTER_ENV_AMOUNT -> P_FILTENV_DEPTH
  [78, 'uni'],     // 49: FILTER_VELOCITY -> P_FILTER_VELSCALE
  [90, 'uni'],     // 50: FILTER_ATTACK -> P_FILTENV_ATTACK
  [91, 'uni'],     // 51: FILTER_DECAY -> P_FILTENV_DECAY
  [92, 'uni'],     // 52: FILTER_SUSTAIN -> P_FILTENV_SUSTAIN
  [93, 'uni'],     // 53: FILTER_RELEASE -> P_FILTENV_RELEASE
  [76, 'uni'],     // 54: FILTER_KEY_TRACK -> P_FILTER_TRACKING
  // Amp envelope (TS 55-58)
  [80, 'uni'],     // 55: AMP_ATTACK -> P_AMPENV_ATTACK
  [81, 'uni'],     // 56: AMP_DECAY -> P_AMPENV_DECAY
  [82, 'uni'],     // 57: AMP_SUSTAIN -> P_AMPENV_SUSTAIN
  [83, 'uni'],     // 58: AMP_RELEASE -> P_AMPENV_RELEASE
  // Effects (TS 59-69)
  // ZynAddSubFX effects are preset-based: type selects the effect, preset selects variant.
  // Individual params (size, damp, rate, depth) don't have separate WASM indices.
  [126, 'uni'],    // 59: REVERB_WET -> P_REVERB_MIX
  [121, 'raw8'],   // 60: REVERB_SIZE -> P_EFX1_PRESET (selects reverb variant 0-7)
  null,            // 61: REVERB_DAMP (no separate WASM param — baked into preset)
  [120, 'raw8'],   // 62: CHORUS_WET -> P_EFX1_TYPE (effect slot 1 type: 0=off,1=rev,2=echo,3=chorus...)
  [123, 'raw8'],   // 63: CHORUS_RATE -> P_EFX2_PRESET (selects chorus variant)
  null,            // 64: CHORUS_DEPTH (no separate WASM param)
  [124, 'raw8'],   // 65: DISTORTION_WET -> P_EFX3_TYPE (effect slot 3 type)
  [125, 'raw8'],   // 66: DISTORTION_DRIVE -> P_EFX3_PRESET (selects distortion variant)
  null,            // 67: DISTORTION_TYPE (no separate WASM param)
  null,            // 68: EQ_LOW (no separate WASM param)
  null,            // 69: EQ_HIGH (no separate WASM param)
];

function transformValue(value, type) {
  switch (type) {
    case 'bool01': return value > 0.5 ? 127 : 0;
    case 'uni': return value * 127;                    // 0..1 -> 0..127
    case 'bi': return (value + 1) * 63.5;             // -1..1 -> 0..127
    case 'oct': {                                      // -4..4 octave -> PCoarseDetune encoding
      // PCoarseDetune: octave = value/1024, cdetune = value%1024
      // octave * 1024 encodes the octave shift; negative uses 16-octave wrap
      const oct = Math.round(value);
      return oct >= 0 ? oct * 1024 : (oct + 16) * 1024;
    }
    case 'detune': return 8192 + value * 8191;        // -1..1 -> 0..16383 (fine detune)
    case 'wave': return Math.round(value);             // waveform index
    case 'raw4': return Math.round(value * 3);         // 0..3 range
    case 'raw8': return Math.round(value * 7);         // 0..7 range
    default: return value * 127;
  }
}

class ZynAddSubFXProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.ready = false;
    this.instance = null;
    this.module = null;
    this.leftPtr = 0;
    this.rightPtr = 0;
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init': {
        try {
          // Polyfills for DOM objects that Emscripten expects
          if (typeof globalThis.document === 'undefined') {
            globalThis.document = {
              createElement: () => ({
                relList: { supports: () => false },
                tagName: 'DIV', rel: '',
                addEventListener: () => {}, removeEventListener: () => {}
              }),
              getElementById: () => null,
              querySelector: () => null,
              querySelectorAll: () => [],
              getElementsByTagName: () => [],
              head: { appendChild: () => {} },
              addEventListener: () => {}, removeEventListener: () => {}
            };
          }
          if (typeof globalThis.window === 'undefined') {
            globalThis.window = {
              addEventListener: () => {}, removeEventListener: () => {},
              dispatchEvent: () => {},
              customElements: { whenDefined: () => Promise.resolve() },
              location: { href: '', pathname: '' }
            };
          }
          if (typeof globalThis.MutationObserver === 'undefined') {
            globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
          }
          if (typeof globalThis.DOMParser === 'undefined') {
            globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; } };
          }

          if (data.jsCode && !globalThis.ZynAddSubFXFactory) {
            const wrappedCode = data.jsCode + '\nreturn createZynAddSubFX;';
            const factory = new Function(wrappedCode);
            const result = factory();
            if (typeof result === 'function') {
              globalThis.ZynAddSubFXFactory = result;
            } else {
              this.port.postMessage({ type: 'error', error: 'Failed to load ZynAddSubFX JS module' });
              return;
            }
          }

          if (typeof globalThis.ZynAddSubFXFactory !== 'function') {
            this.port.postMessage({ type: 'error', error: 'ZynAddSubFX factory not available' });
            return;
          }

          const moduleOpts = {};
          if (data.wasmBinary) {
            moduleOpts.wasmBinary = data.wasmBinary;
          } else {
            moduleOpts.locateFile = (path) => {
              if (path.endsWith('.wasm')) return data.wasmUrl || '/zynaddsubfx/ZynAddSubFX.wasm';
              return path;
            };
          }

          this.module = await globalThis.ZynAddSubFXFactory(moduleOpts);

          const sr = data.sampleRate || sampleRate;
          this.instance = this.module._zasfx_create(sr);
          if (!this.instance) {
            this.port.postMessage({ type: 'error', error: 'zasfx_create returned null' });
            return;
          }
          this.leftPtr = this.module._malloc(128 * 4);
          this.rightPtr = this.module._malloc(128 * 4);
          this.ready = true;
          this.port.postMessage({ type: 'ready', numParams: 70 });
        } catch (err) {
          this.port.postMessage({ type: 'error', error: String(err.stack || err.message || err) });
        }
        break;
      }
      case 'noteOn':
        if (this.ready) this.module._zasfx_note_on(this.instance, data.note, data.velocity);
        break;
      case 'noteOff':
        if (this.ready) this.module._zasfx_note_off(this.instance, data.note);
        break;
      case 'allNotesOff':
        if (this.ready) this.module._zasfx_all_notes_off(this.instance);
        break;
      case 'setParam': {
        if (!this.ready) break;
        const mapping = PARAM_MAP[data.index];
        if (mapping) {
          const wasmIdx = mapping[0];
          const wasmVal = transformValue(data.value, mapping[1]);
          this.module._zasfx_set_param(this.instance, wasmIdx, wasmVal);
        }
        break;
      }
      case 'setParamRaw': {
        if (!this.ready) break;
        this.module._zasfx_set_param(this.instance, data.index, data.value);
        break;
      }
      case 'loadPresetXML': {
        if (!this.ready || !data.xmlBytes) {
          console.warn('[ZASFX Worklet] loadPresetXML: not ready or no xmlBytes', this.ready, !!data.xmlBytes);
          break;
        }
        try {
          const xmlBytes = data.xmlBytes;
          const xmlLen = xmlBytes.length;
          const xmlPtr = this.module._malloc(xmlLen + 1);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          heap.set(xmlBytes, xmlPtr);
          heap[xmlPtr + xmlLen] = 0; // null-terminate
          const result = this.module._zasfx_load_preset_xml(this.instance, xmlPtr, xmlLen);
          this.module._free(xmlPtr);
          this.port.postMessage({ type: 'presetLoaded', result, name: data.name || '' });
        } catch (err) {
          this.port.postMessage({ type: 'presetError', error: String(err.message || err) });
        }
        break;
      }
      case 'getParam': {
        if (!this.ready) break;
        const mapping = PARAM_MAP[data.index];
        if (mapping) {
          const val = this.module._zasfx_get_param(this.instance, mapping[0]);
          this.port.postMessage({ type: 'paramValue', index: data.index, value: val });
        }
        break;
      }
      case 'dispose':
      case 'destroy':
        if (this.instance && this.module) {
          this.module._zasfx_destroy(this.instance);
          if (this.leftPtr) this.module._free(this.leftPtr);
          if (this.rightPtr) this.module._free(this.rightPtr);
          this.instance = null;
          this.ready = false;
        }
        break;
    }
  }

  process(inputs, outputs) {
    if (!this.ready || !this.instance) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const left = output[0];
    const right = output[1];
    const n = left.length;

    this.module._zasfx_process(this.instance, this.leftPtr, this.rightPtr, n);

    const heap = this.module.HEAPF32 ||
      (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heap || heap.length === 0) return true;

    const lo = this.leftPtr >> 2;
    const ro = this.rightPtr >> 2;
    const gain = 5.0;
    for (let i = 0; i < n; i++) {
      left[i] = heap[lo + i] * gain;
      right[i] = heap[ro + i] * gain;
    }
    return true;
  }
}

registerProcessor('zynaddsubfx-processor', ZynAddSubFXProcessor);
