/**
 * GME AudioWorklet — Game_Music_Emu playback in Web Audio.
 *
 * Receives file data from main thread, loads via WASM, renders
 * audio in 128-sample blocks using a ring buffer bridge.
 *
 * Messages IN:  init, loadFile, startTrack, play, stop, pause,
 *               setTempo, muteVoice, seek, enableRegisterLog
 * Messages OUT: ready, loaded, trackInfo, position, trackEnded,
 *               registerLog, error
 */

/* global currentTime, sampleRate, registerProcessor */

const RENDER_FRAMES = 960; // WASM renders this many stereo frames at once
const RING_SIZE = RENDER_FRAMES * 4; // 2x buffer for ring

class GMEWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._module = null;
    this._playing = false;
    this._ring = new Float32Array(RING_SIZE);
    this._ringRead = 0;
    this._ringWrite = 0;
    this._ringAvail = 0;
    this._i16Buf = null;
    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'init':
        this._initWASM(msg.wasmUrl);
        break;
      case 'loadFile':
        this._loadFile(msg.data);
        break;
      case 'startTrack':
        this._startTrack(msg.track || 0);
        break;
      case 'play':
        this._playing = true;
        break;
      case 'stop':
        this._playing = false;
        this._ringRead = 0;
        this._ringWrite = 0;
        this._ringAvail = 0;
        break;
      case 'pause':
        this._playing = false;
        break;
      case 'setTempo':
        if (this._module) this._module._gme_bridge_set_tempo(msg.tempo);
        break;
      case 'muteVoice':
        if (this._module) this._module._gme_bridge_mute_voice(msg.index, msg.mute ? 1 : 0);
        break;
      case 'seek':
        if (this._module) this._module._gme_bridge_seek(msg.msec);
        break;
      case 'enableRegisterLog':
        if (this._module) this._module._gme_bridge_enable_register_log(msg.enable ? 1 : 0);
        break;
      case 'getRegisterLog':
        this._sendRegisterLog();
        break;
    }
  }

  async _initWASM(wasmUrl) {
    try {
      // Import the factory from the WASM JS glue
      const wasmModule = await import(wasmUrl || '/gme/GME.js');
      const factory = wasmModule.default || wasmModule.createGME || wasmModule;
      this._module = await (typeof factory === 'function' ? factory() : factory);

      // Pre-allocate i16 buffer for WASM rendering
      const bytes = RENDER_FRAMES * 2 * 2; // stereo * sizeof(int16)
      this._i16Ptr = this._module._malloc(bytes);
      this._i16Buf = new Int16Array(this._module.HEAP16.buffer, this._i16Ptr, RENDER_FRAMES * 2);

      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'WASM init failed: ' + err.message });
    }
  }

  _loadFile(arrayBuffer) {
    if (!this._module) return;
    const u8 = new Uint8Array(arrayBuffer);
    const ptr = this._module._malloc(u8.length);
    this._module.HEAPU8.set(u8, ptr);

    const result = this._module._gme_bridge_open(ptr, u8.length);
    this._module._free(ptr);

    if (result < 0) {
      this.port.postMessage({ type: 'error', message: 'Failed to open file' });
      return;
    }

    const trackCount = this._module._gme_bridge_track_count();
    this.port.postMessage({ type: 'loaded', trackCount });
  }

  _startTrack(track) {
    if (!this._module) return;
    const result = this._module._gme_bridge_start_track(track);
    if (result < 0) {
      this.port.postMessage({ type: 'error', message: 'Failed to start track ' + track });
      return;
    }

    // Reset ring buffer
    this._ringRead = 0;
    this._ringWrite = 0;
    this._ringAvail = 0;

    // Send track info
    const title = this._module.UTF8ToString(this._module._gme_bridge_get_title());
    const author = this._module.UTF8ToString(this._module._gme_bridge_get_author());
    const game = this._module.UTF8ToString(this._module._gme_bridge_get_game());
    const system = this._module.UTF8ToString(this._module._gme_bridge_get_system());
    const length = this._module._gme_bridge_get_length();
    const voiceCount = this._module._gme_bridge_voice_count();

    this.port.postMessage({
      type: 'trackInfo',
      title, author, game, system, length, voiceCount, track
    });
  }

  _renderToRing() {
    if (!this._module || !this._i16Buf) return;
    if (this._ringAvail >= RING_SIZE - RENDER_FRAMES * 2) return; // ring full enough

    // Re-bind in case of memory growth
    if (this._i16Buf.buffer !== this._module.HEAP16.buffer) {
      this._i16Buf = new Int16Array(this._module.HEAP16.buffer, this._i16Ptr, RENDER_FRAMES * 2);
    }

    const err = this._module._gme_bridge_play(this._i16Ptr >> 1, RENDER_FRAMES * 2);
    if (err < 0) return;

    // Convert i16 → float and write to ring
    const count = RENDER_FRAMES * 2;
    for (let i = 0; i < count; i++) {
      this._ring[this._ringWrite] = this._i16Buf[i] / 32768.0;
      this._ringWrite = (this._ringWrite + 1) % RING_SIZE;
    }
    this._ringAvail += count;
  }

  _sendRegisterLog() {
    if (!this._module) return;
    const count = this._module._gme_bridge_get_register_log_count();
    if (count === 0) {
      this.port.postMessage({ type: 'registerLog', entries: [] });
      return;
    }

    const ptr = this._module._gme_bridge_get_register_log();
    const entries = [];
    // Each RegLogEntry is 4 ints = 16 bytes
    for (let i = 0; i < count; i++) {
      const base = (ptr >> 2) + i * 4;
      const heap32 = new Int32Array(this._module.HEAPU8.buffer);
      entries.push({
        chip: heap32[base],
        addr: heap32[base + 1],
        data: heap32[base + 2],
        timestamp: heap32[base + 3],
      });
    }

    this.port.postMessage({ type: 'registerLog', entries });
    this._module._gme_bridge_clear_register_log();
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const left = output[0];
    const right = output.length > 1 ? output[1] : left;
    const blockSize = left.length; // 128

    if (!this._playing || !this._module) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    // Ensure ring has enough data
    while (this._ringAvail < blockSize * 2) {
      this._renderToRing();
      if (this._module._gme_bridge_track_ended()) {
        this.port.postMessage({ type: 'trackEnded' });
        this._playing = false;
        break;
      }
    }

    // Read from ring buffer (interleaved L/R)
    const available = Math.min(this._ringAvail >> 1, blockSize);
    for (let i = 0; i < available; i++) {
      left[i] = this._ring[this._ringRead];
      this._ringRead = (this._ringRead + 1) % RING_SIZE;
      right[i] = this._ring[this._ringRead];
      this._ringRead = (this._ringRead + 1) % RING_SIZE;
    }
    this._ringAvail -= available * 2;

    // Zero-fill remainder
    for (let i = available; i < blockSize; i++) {
      left[i] = 0;
      right[i] = 0;
    }

    // Report position periodically (~4x per second)
    if (this._posCounter === undefined) this._posCounter = 0;
    this._posCounter += blockSize;
    if (this._posCounter >= sampleRate / 4) {
      this._posCounter = 0;
      this.port.postMessage({
        type: 'position',
        msec: this._module._gme_bridge_tell()
      });
    }

    return true;
  }
}

registerProcessor('gme-worklet', GMEWorklet);
