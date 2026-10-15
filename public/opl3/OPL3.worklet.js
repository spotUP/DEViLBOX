/**
 * OPL3 AudioWorklet Processor — Nuked OPL3 (YMF262) FM synth
 * WASM JS code passed as string from main thread.
 */

// A voice report every ~10 ms at 48 kHz.
const REPORT_EVERY_FRAMES = 512;

class OPL3Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.module = null;
    this.outPtrL = 0;
    this.outPtrR = 0;
    // Live voice report for the editor's curve markers: posted while the editor watches (message 'watchVoices').
    this.watchVoices = false;
    this.voicePtr = 0;
    this.framesSinceReport = 0;
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        await this.initWasm(msg.sampleRate, msg.wasmBinary, msg.jsCode);
        break;
      case 'noteOn':
        if (this.ready) this.module._oplNoteOn(msg.note, msg.velocity);
        break;
      case 'noteOff':
        if (this.ready) this.module._oplNoteOff(msg.note);
        break;
      case 'sustainPedal':
        if (this.ready) this.module._oplSustainPedal(msg.value ? 1 : 0);
        break;
      case 'pitchBend':
        if (this.ready) this.module._oplPitchBend(msg.semitones);
        break;
      case 'allNotesOff':
        if (this.ready) this.module._oplAllNotesOff();
        break;
      case 'loadSbi':
        if (this.ready) this.loadSbiData(msg.data);
        break;
      case 'setPatch':
        if (this.ready) {
          const r = msg.regs;
          this.module._oplSetPatchRegisters(r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9],r[10]);
        }
        break;
      // Channel-addressed API for multi-timbral tracker playback
      case 'chSetPatch':
        if (this.ready) {
          const r = msg.regs;
          this.module._oplChannelSetPatch(msg.ch, r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9],r[10]);
        }
        break;
      case 'chNoteOn':
        if (this.ready) this.module._oplChannelNoteOn(msg.ch, msg.note, msg.velocity);
        break;
      case 'chNoteOff':
        if (this.ready) this.module._oplChannelNoteOff(msg.ch);
        break;
      case 'watchVoices':
        this.watchVoices = !!msg.on;
        this.framesSinceReport = REPORT_EVERY_FRAMES; // report at once, so the marker does not wait for the next interval
        break;
      case 'destroy':
        if (this.ready) { this.module._oplDestroy(); this.ready = false; }
        break;
    }
  }

  /** Post the envelope state of the sounding chip channels (oplGetChannelEnvelopes, 12 bytes per channel, then the chip LFO positions). */
  postVoiceStatus() {
    if (!this.voicePtr) this.voicePtr = this.module._malloc(18 * 12 + 4);
    const got = this.module._oplGetChannelEnvelopes(this.voicePtr);
    if (got === 0) return;
    const dv = new DataView(this.module.HEAPU8.buffer, this.voicePtr, got);
    const channels = [];
    for (let c = 0; c < 18; c++) {
      const b = c * 12;
      if (dv.getUint8(b) !== 1) continue;
      channels.push({
        channel: c,
        note: dv.getUint8(b + 1),
        modulatorStage: dv.getUint8(b + 2),
        carrierStage: dv.getUint8(b + 3),
        modulatorAttenuation: dv.getUint16(b + 4, true),
        carrierAttenuation: dv.getUint16(b + 6, true),
        age: dv.getUint32(b + 8, true),
      });
    }
    const lfoBase = 18 * 12;
    this.port.postMessage({
      type: 'voiceStatus',
      channels,
      lfo: { tremoloPosition: dv.getUint8(lfoBase), vibratoPosition: dv.getUint8(lfoBase + 1), timer: dv.getUint16(lfoBase + 2, true) },
    });
  }

  loadSbiData(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    const ptr = this.module._malloc(bytes.length);
    const heap = this.module.HEAPU8;
    heap.set(bytes, ptr);
    const result = this.module._oplLoadSbi(ptr, bytes.length);
    this.module._free(ptr);
    this.port.postMessage({ type: 'sbiLoaded', success: result === 0 });
  }

  async initWasm(sampleRate, wasmBinary, jsCode) {
    try {
      if (jsCode && !globalThis.createOPL3Module) {
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

        const wrappedCode = jsCode + '\nreturn createOPL3Module;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') globalThis.createOPL3Module = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load OPL3 JS' }); return; }
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
      try { this.module = await globalThis.createOPL3Module(config); }
      finally { WebAssembly.instantiate = origInstantiate; }

      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;

      this.module._oplInit(sampleRate);
      this.outPtrL = this.module._malloc(128 * 4);
      this.outPtrR = this.module._malloc(128 * 4);
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: `OPL3 init failed: ${err.message || err}` });
    }
  }

  process(inputs, outputs) {
    if (!this.ready || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outL = output[0], outR = output[1];
    const n = outL.length;

    this.module._oplProcess(this.outPtrL, this.outPtrR, n);

    const heap = this.module.HEAPF32 || new Float32Array(this.module.wasmMemory.buffer);
    outL.set(heap.subarray(this.outPtrL >> 2, (this.outPtrL >> 2) + n));
    outR.set(heap.subarray(this.outPtrR >> 2, (this.outPtrR >> 2) + n));

    if (this.watchVoices && typeof this.module._oplGetChannelEnvelopes === 'function') {
      this.framesSinceReport += n;
      if (this.framesSinceReport >= REPORT_EVERY_FRAMES) {
        this.framesSinceReport = 0;
        this.postVoiceStatus();
      }
    }
    return true;
  }
}

registerProcessor('opl3-processor', OPL3Processor);
