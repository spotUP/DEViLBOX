/**
 * DX7 AudioWorklet Processor — VDX7 cycle-accurate DX7 emulation
 * WASM JS code passed as string from main thread.
 * Includes linear-interpolation resampler (49096 Hz → host rate).
 */

// A voice report every ~10 ms at 48 kHz.
const REPORT_EVERY_FRAMES = 512;
// EGS envelope level of a silent operator (Envelope::level 0xFF0).
const EG_SILENT = 0xff0;

class DX7Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.module = null;
    this.outPtrL = 0;
    this.outPtrR = 0;

    // Resampler state
    this.nativeRate = 49096.354;
    this.hostRate = 48000;
    this.resampleRatio = 1.0;
    this.resamplePhase = 0.0;
    this.nativeBufSize = 0;
    this.nativeBufL = null;
    this.nativeBufR = null;
    this.nativeBufFilled = 0;
    this.nativeReadIdx = 0;
    this.prevSampleL = 0;
    this.prevSampleR = 0;
    this.curSampleL = 0;
    this.curSampleR = 0;

    // Live voice report for the editor's curve markers (message 'watchVoices'): the EGS envelope state of every voice.
    this.watchVoices = false;
    this.framesSinceReport = 0;
    this.framesProcessed = 0;
    this.pendingNotes = [];          // notes keyed since the last voice start was matched to a note
    // Note events with a future `time` (AudioContext seconds), oldest first. The replayer schedules
    // rows ahead; a main-thread stall delivers them late and bunched, so they wait here for their frame.
    this.eventQueue = [];
    this.voiceActive = new Array(16).fill(false);
    this.voiceStartFrame = new Array(16).fill(0);
    this.voiceReleaseFrame = new Array(16).fill(-1);
    this.voiceNote = new Array(16).fill(-1);
    this.envPtr = 0;
    this.regPtr = 0;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        await this.initWasm(msg.sampleRate, msg.wasmBinary, msg.jsCode);
        break;
      case 'loadFirmware':
        if (this.module) this.loadFirmware(msg.data);
        break;
      case 'loadVoices':
        if (this.ready) this.loadVoices(msg.data);
        break;
      case 'loadSysex':
        if (this.ready) this.loadSysex(msg.data);
        break;
      case 'noteOn':
      case 'noteOff':
        if (this.ready) this.scheduleNoteEvent(msg);
        break;
      case 'allNotesOff':
        // All Notes Off cancels the notes scheduled at or after it: on Stop the replayer has already
        // sent the coming rows, and those must not sound after the release.
        if (this.ready) {
          const at = msg.time ?? currentTime;
          this.eventQueue = this.eventQueue.filter((e) => e.time < at);
          this.scheduleNoteEvent(msg);
        }
        break;
      case 'sustain':
        if (this.ready) this.module._dx7Sustain(msg.value ? 1 : 0);
        break;
      case 'pitchBend':
        if (this.ready) this.module._dx7PitchBend(msg.value);
        break;
      case 'modWheel':
        if (this.ready) this.module._dx7ModWheel(msg.value);
        break;
      case 'setBank':
        if (this.ready) this.module._dx7SetBank(msg.bank);
        break;
      case 'programChange':
        if (this.ready) this.module._dx7ProgramChange(msg.program);
        break;
      case 'setVolume':
        if (this.ready) this.module._dx7SetVolume(msg.volume);
        break;
      case 'watchVoices':
        this.watchVoices = !!msg.on;
        this.pendingNotes = [];
        this.framesSinceReport = REPORT_EVERY_FRAMES; // report at once
        break;
      case 'getVced':
        // The 155-byte voice the firmware is playing (its edit buffer at 0x2000), so the editor shows the sounding voice.
        if (this.ready && typeof this.module._dx7ReadMemory === 'function') {
          const ptr = this.module._malloc(155);
          this.module._dx7ReadMemory(0x2000, 155, ptr);
          const values = Array.from(this.module.HEAPU8.slice(ptr, ptr + 155));
          this.module._free(ptr);
          this.port.postMessage({ type: 'vced', values });
        }
        break;
      case 'getPatchName': {
        if (this.ready) {
          const ptr = this.module._dx7GetPatchName(msg.index);
          const name = this.module.UTF8ToString(ptr);
          this.port.postMessage({ type: 'patchName', index: msg.index, name });
        }
        break;
      }
      case 'destroy':
        if (this.ready) { this.module._dx7Destroy(); this.ready = false; }
        break;
    }
  }

  /** Apply a note event now when its time has come (or it has none), otherwise queue it in time order.
   *  A time that is not a finite number never comes due: queued, it would sit at the head and block
   *  every event after it, so it plays at once like an untimed event. */
  scheduleNoteEvent(msg) {
    if (!Number.isFinite(msg.time) || msg.time <= currentTime) { this.applyNoteEvent(msg); return; }
    let i = this.eventQueue.length;
    while (i > 0 && this.eventQueue[i - 1].time > msg.time) i--;
    this.eventQueue.splice(i, 0, msg);
  }

  applyNoteEvent(msg) {
    switch (msg.type) {
      case 'noteOn':
        if (this.watchVoices) this.pendingNotes.push(msg.note);
        this.module._dx7NoteOn(msg.note, msg.velocity);
        break;
      case 'noteOff':
        this.module._dx7NoteOff(msg.note);
        break;
      case 'allNotesOff':
        this.module._dx7AllNotesOff();
        break;
    }
  }

  loadFirmware(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.length !== 16384) {
      this.port.postMessage({ type: 'error', message: `Invalid ROM size: ${bytes.length} (expected 16384)` });
      return;
    }
    const ptr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, ptr);
    const result = this.module._dx7LoadFirmware(ptr, bytes.length);
    this.module._free(ptr);
    if (result === 0) {
      this.ready = true;
      // Get native sample rate from WASM
      this.nativeRate = this.module._dx7GetNativeSamplerate();
      this.resampleRatio = this.nativeRate / this.hostRate;
      this.port.postMessage({ type: 'ready' });
    } else {
      this.port.postMessage({ type: 'error', message: `ROM load failed: ${result}` });
    }
  }

  loadVoices(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    const ptr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, ptr);
    const result = this.module._dx7LoadVoices(ptr, bytes.length);
    this.module._free(ptr);
    this.port.postMessage({ type: 'voicesLoaded', success: result === 0, size: bytes.length });
  }

  loadSysex(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    const ptr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, ptr);
    this.module._dx7LoadSysex(ptr, bytes.length);
    this.module._free(ptr);
    this.port.postMessage({ type: 'sysexLoaded' });
  }

  async initWasm(sampleRate, wasmBinary, jsCode) {
    this.hostRate = sampleRate;
    try {
      if (jsCode && !globalThis.createDX7Module) {
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV' }),
            getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [], getElementsByTagName: () => [],
            head: { appendChild: () => {} },
            addEventListener: () => {}, removeEventListener: () => {}
          };
        }
        if (typeof globalThis.window === 'undefined') {
          globalThis.window = {
            addEventListener: () => {}, removeEventListener: () => {},
            location: { href: '', pathname: '' }
          };
        }

        const wrappedCode = jsCode + '\nreturn createDX7Module;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') globalThis.createDX7Module = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load DX7 JS' }); return; }
      }

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; }
          }
        }
        return result;
      };

      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      try { this.module = await globalThis.createDX7Module(config); }
      finally { WebAssembly.instantiate = origInstantiate; }

      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;

      this.module._dx7Init();

      // Allocate native-rate buffer (~2x host buffer for safety)
      this.nativeBufSize = 512;
      this.outPtrL = this.module._malloc(this.nativeBufSize * 4);
      this.outPtrR = this.module._malloc(this.nativeBufSize * 4);
      this.nativeBufL = new Float32Array(this.nativeBufSize);
      this.nativeBufR = new Float32Array(this.nativeBufSize);
      this.nativeBufFilled = 0;

      this.resampleRatio = this.nativeRate / this.hostRate;

      // Tell main thread WASM is loaded (but not ready until ROM is loaded)
      this.port.postMessage({ type: 'wasmLoaded' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: `DX7 init failed: ${err.message || err}` });
    }
  }

  // Generate native-rate samples into internal buffer
  fillNativeBuffer(count) {
    const n = Math.min(count, this.nativeBufSize);
    this.module._dx7Process(this.outPtrL, this.outPtrR, n);
    const heap = this.module.HEAPF32 || new Float32Array(this.module.wasmMemory.buffer);
    const offL = this.outPtrL >> 2;
    const offR = this.outPtrR >> 2;
    for (let i = 0; i < n; i++) {
      this.nativeBufL[i] = heap[offL + i];
      this.nativeBufR[i] = heap[offR + i];
    }
    this.nativeReadIdx = 0;
    this.nativeBufFilled = n;
    return n;
  }

  /**
   * Post the voices that are sounding: per operator the EG level (1/256 octave attenuation), segment and key-up flag,
   * the voice pitch, and the LFO modulation registers. dx7GetEnvelopeState layout: 16 voices x 6 ops x 4 bytes.
   */
  postVoiceStatus() {
    const m = this.module;
    if (typeof m._dx7GetEnvelopeState !== 'function' || typeof m._dx7GetEgsRegisters !== 'function') return;
    if (!this.envPtr) { this.envPtr = m._malloc(384); this.regPtr = m._malloc(256); }
    if (m._dx7GetEnvelopeState(this.envPtr) === 0) return;
    m._dx7GetEgsRegisters(this.regPtr);
    const heap = m.HEAPU8;
    const env = heap.subarray(this.envPtr, this.envPtr + 384);
    const reg = heap.subarray(this.regPtr, this.regPtr + 256);
    const dv = new DataView(env.buffer, env.byteOffset, 384);
    const voices = [];
    for (let v = 0; v < 16; v++) {
      const ops = [];
      let anyDown = false;
      let loudest = EG_SILENT;
      for (let o = 0; o < 6; o++) {
        const b = (v * 6 + o) * 4;
        const level = dv.getUint16(b, true);
        const released = (env[b + 3] & 1) === 1;
        if (!released) anyDown = true;
        if (level < loudest) loudest = level;
        ops.push({ level, stage: env[b + 2], released });
      }
      const sounding = anyDown || loudest < EG_SILENT - 64;
      if (sounding && !this.voiceActive[v]) {
        this.voiceActive[v] = true;
        this.voiceStartFrame[v] = this.framesProcessed;
        this.voiceReleaseFrame[v] = -1;
        this.voiceNote[v] = this.pendingNotes.length ? this.pendingNotes.shift() : -1;
      } else if (!sounding) {
        this.voiceActive[v] = false;
      }
      if (!sounding) continue;
      if (!anyDown && this.voiceReleaseFrame[v] < 0) this.voiceReleaseFrame[v] = this.framesProcessed;
      if (anyDown) this.voiceReleaseFrame[v] = -1;
      voices.push({
        voice: v,
        note: this.voiceNote[v],
        ops,
        pitch: ((reg[2 * v] << 8) | reg[2 * v + 1]) >> 2,
        elapsedSeconds: (this.framesProcessed - this.voiceStartFrame[v]) / this.hostRate,
        releasedSeconds: this.voiceReleaseFrame[v] < 0 ? null : (this.framesProcessed - this.voiceReleaseFrame[v]) / this.hostRate,
      });
    }
    this.port.postMessage({
      type: 'voiceStatus',
      voices,
      // int16 pitch modulation (LFO, 1/16 of a 1024-per-octave unit) and the amplitude modulation byte
      lfo: { pitchMod: ((reg[0xf2] << 8) | reg[0xf3]) << 16 >> 16, ampMod: reg[0xf0] },
    });
  }

  // Get next native sample, generating more if needed
  nextNativeSample() {
    if (this.nativeReadIdx >= this.nativeBufFilled) {
      // Generate a batch of native samples (128 at a time for efficiency)
      this.fillNativeBuffer(128);
    }
    const idx = this.nativeReadIdx++;
    return { l: this.nativeBufL[idx], r: this.nativeBufR[idx] };
  }

  process(inputs, outputs) {
    if (!this.ready || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outL = output[0], outR = output[1];
    const n = outL.length;

    // No worklet gain — VDX7 raw output peaks ~0.3, registry volumeOffsetDb handles boost
    const gain = 1.0;

    // Linear interpolation resampler: native rate → host rate
    const frameSec = 1 / sampleRate;
    for (let i = 0; i < n; i++) {
      // Queued note events reach the firmware at the host frame they are due
      const frameTime = currentTime + i * frameSec;
      while (this.eventQueue.length > 0 && this.eventQueue[0].time <= frameTime) {
        this.applyNoteEvent(this.eventQueue.shift());
      }
      this.resamplePhase += this.resampleRatio;

      // Consume native samples as needed
      while (this.resamplePhase >= 1.0) {
        this.resamplePhase -= 1.0;
        this.prevSampleL = this.curSampleL;
        this.prevSampleR = this.curSampleR;
        const s = this.nextNativeSample();
        this.curSampleL = s.l;
        this.curSampleR = s.r;
      }

      // Linear interpolation
      const frac = this.resamplePhase;
      outL[i] = gain * (this.prevSampleL + frac * (this.curSampleL - this.prevSampleL));
      outR[i] = gain * (this.prevSampleR + frac * (this.curSampleR - this.prevSampleR));
    }

    this.framesProcessed += n;
    if (this.watchVoices) {
      this.framesSinceReport += n;
      if (this.framesSinceReport >= REPORT_EVERY_FRAMES) {
        this.framesSinceReport = 0;
        this.postVoiceStatus();
      }
    }
    return true;
  }
}

registerProcessor('dx7-processor', DX7Processor);
