/**
 * EaglePlayer.worklet.js - AudioWorklet processor for the generic eagleplayer
 * runner (eagleplayer-wasm: UADE's sound core `score` driving any UADE
 * eagleplayer on the shared Musashi host, musashi-host/).
 *
 * loadModule takes the module, the eagleplayer binary and the name the player
 * sees; ep_wasm_render_voices() renders the stereo mix plus the four Paula
 * voices, which feed the per-channel dub sends / isolation slots
 * (worklets/channel-outputs.js) and the scopes (worklets/channel-stream.js).
 */

class EaglePlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.outPtr = 0;          // interleaved stereo, bufferSize frames
    this.voicePtr = 0;        // 4 planar voice buffers of bufferSize floats
    this.outBuf = null;
    this.voiceBufs = [];
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initialized = false;
    this.initializing = false;
    this.loaded = false;
    this.playing = false;
    this.songEndSent = false;
    // Per-channel dub sends + isolation slots (worklets/channel-outputs.js).
    this._outs = globalThis.DevilboxChannelOutputs ? new globalThis.DevilboxChannelOutputs() : null;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (this._outs && this._outs.handleMessage(data)) return;
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initModule(data.wasmBinary, data.jsCode);
        break;
      case 'loadModule':
        this.load(data);
        break;
      case 'play':
        this.playing = this.loaded;
        break;
      case 'pause':
        this.playing = false;
        break;
      case 'stop':
        this.playing = false;
        this.loaded = false;
        if (this.module) this.module._ep_wasm_stop();
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'setMuteMask':
        // Bit N set = Paula voice N audible (DEViLBOX mixer convention).
        if (this.module) this.module._ep_wasm_set_voice_mask(data.mask >>> 0);
        break;
      case 'setSubsong':
        if (this.module && this.loaded) {
          this.module._ep_wasm_set_subsong(data.subsong | 0);
          this.songEndSent = false;
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  writeBytes(bytes, zeroTerminate) {
    const m = this.module;
    const ptr = m._malloc(bytes.length + (zeroTerminate ? 1 : 0) || 1);
    if (!ptr) return 0;
    m.HEAPU8.set(bytes, ptr);
    if (zeroTerminate) m.HEAPU8[ptr + bytes.length] = 0;
    return ptr;
  }

  load(data) {
    const m = this.module;
    if (!m) return;
    try {
      this.loaded = false;
      this.playing = false;
      this.songEndSent = false;
      m._ep_wasm_stop();
      m._ep_wasm_init(Math.round(sampleRate));
      m._ep_wasm_clear_files();
      for (const f of data.files || []) {
        const name = this.writeBytes(new TextEncoder().encode(f.name), true);
        const bytes = new Uint8Array(f.data);
        const ptr = this.writeBytes(bytes, false);
        if (name && ptr) m._ep_wasm_add_file(name, ptr, bytes.length);
        if (name) m._free(name);
        if (ptr) m._free(ptr);
      }
      const mod = new Uint8Array(data.moduleData);
      const player = new Uint8Array(data.playerData);
      const modPtr = this.writeBytes(mod, false);
      const playerPtr = this.writeBytes(player, false);
      const namePtr = this.writeBytes(new TextEncoder().encode(data.moduleName || 'module'), true);
      const optPtr = data.options ? this.writeBytes(new TextEncoder().encode(data.options), true) : 0;
      if (!modPtr || !playerPtr || !namePtr) {
        this.port.postMessage({ type: 'error', message: 'malloc failed for module data' });
        return;
      }
      const subsong = typeof data.subsong === 'number' ? data.subsong : -1;
      const r = m._ep_wasm_load(playerPtr, player.length, modPtr, mod.length, namePtr, subsong, optPtr);
      m._free(modPtr); m._free(playerPtr); m._free(namePtr);
      if (optPtr) m._free(optPtr);
      if (r !== 0) {
        const why = { '-1': 'bad arguments or no room', '-2': 'the player is not an AmigaOS executable',
          '-3': 'the eagleplayer refused the module', '-4': 'the player crashed', '-5': 'the player never started its sound' }[String(r)] || '';
        this.port.postMessage({ type: 'error', message: 'ep_wasm_load failed with code ' + r + (why ? ' (' + why + ')' : '') + ': ' + m.UTF8ToString(m._ep_wasm_log()) });
        return;
      }
      this.loaded = true;
      this.port.postMessage({
        type: 'moduleLoaded',
        player: m.UTF8ToString(m._ep_wasm_player_name()),
        subsongMin: m._ep_wasm_subsong_min(),
        subsongMax: m._ep_wasm_subsong_max(),
        subsongCurrent: m._ep_wasm_subsong_current(),
      });
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  async initModule(wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();
      if (jsCode && !globalThis.EaglePlayerFactory) {
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV', rel: '', addEventListener: () => {}, removeEventListener: () => {} }),
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            getElementsByTagName: () => [], head: { appendChild: () => {} },
            addEventListener: () => {}, removeEventListener: () => {}
          };
        }
        if (typeof globalThis.window === 'undefined') {
          globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, customElements: { whenDefined: () => Promise.resolve() }, location: { href: '', pathname: '' } };
        }
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class { constructor(path) { this.href = path; } };
        }
        const factory = new Function(jsCode + '\nreturn createEaglePlayer;');
        const result = factory();
        if (typeof result !== 'function') {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
        globalThis.EaglePlayerFactory = result;
      }
      if (typeof globalThis.EaglePlayerFactory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'EaglePlayer factory not available' });
        return;
      }
      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      this.module = await globalThis.EaglePlayerFactory(config);
      this.outPtr = this.module._malloc(this.bufferSize * 2 * 4);
      this.voicePtr = this.module._malloc(this.bufferSize * 4 * 4);
      if (!this.outPtr || !this.voicePtr) {
        this.port.postMessage({ type: 'error', message: 'malloc failed for output buffers' });
        return;
      }
      this.updateBufferViews();
      this.initialized = true;
      this.initializing = false;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outPtr) return;
    const heapF32 = this.module.HEAPF32;
    if (!heapF32 || this.lastHeapBuffer === heapF32.buffer) return;
    this.outBuf = new Float32Array(heapF32.buffer, this.outPtr, this.bufferSize * 2);
    this.voiceBufs = Array.from({ length: 4 }, (_, v) =>
      new Float32Array(heapF32.buffer, this.voicePtr + v * this.bufferSize * 4, this.bufferSize));
    this.lastHeapBuffer = heapF32.buffer;
  }

  cleanup() {
    if (this.module) {
      try { this.module._ep_wasm_stop(); } catch (e) { /* ignore */ }
      if (this.outPtr) this.module._free(this.outPtr);
      if (this.voicePtr) this.module._free(this.voicePtr);
    }
    this.outPtr = this.voicePtr = 0;
    this.outBuf = null;
    this.voiceBufs = [];
    this.module = null;
    this.initialized = false;
    this.loaded = false;
    this.playing = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.module || !this.loaded || !this.playing) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outL = output[0], outR = output[1];
    const n = Math.min(outL.length, this.bufferSize);
    this.updateBufferViews();
    if (!this.outBuf) return true;
    const rendered = this.module._ep_wasm_render_voices(this.outPtr, this.voicePtr, n, this.bufferSize);
    const o = this._outs;
    if (o && o.isolatedMask) {
      // A voice in an isolation slot leaves the main mix (Amiga panning:
      // voices 0 and 3 left, 1 and 2 right, halved - as the host mixes).
      const v = this.voiceBufs;
      const k = [0, 1, 2, 3].map((c) => (o.isIsolated(c) ? 0 : 0.5));
      for (let i = 0; i < rendered; i++) {
        outL[i] = k[0] * v[0][i] + k[3] * v[3][i];
        outR[i] = k[1] * v[1][i] + k[2] * v[2][i];
      }
    } else {
      for (let i = 0; i < rendered; i++) {
        outL[i] = this.outBuf[i * 2];
        outR[i] = this.outBuf[i * 2 + 1];
      }
    }
    const voices = this.voiceBufs.map((b) => b.subarray(0, rendered));
    // Dub sends + isolation slots carry each voice at its level in the mix.
    if (o) o.write(outputs, voices, rendered, (ch) => (ch === 1 || ch === 2 ? 1 : 0), 0.5);
    // Every sample of each voice, for the oscilloscopes, VU meters and the
    // per-channel role classifiers (worklets/channel-stream.js).
    if (globalThis.DevilboxChannelStream) {
      this._stream ||= new globalThis.DevilboxChannelStream(this.port, sampleRate);
      this._stream.writeFloat32(voices, rendered);
    }
    if (!this.songEndSent && this.module._ep_wasm_song_ended()) {
      this.songEndSent = true;
      this.port.postMessage({ type: 'songEnd' });
    }
    return true;
  }
}

registerProcessor('eagleplayer-processor', EaglePlayerProcessor);
