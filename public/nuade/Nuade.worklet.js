/**
 * Nuade.worklet.js - AudioWorklet processor for nuade (emoon/nuade: native C ports of the UADE players, compiled with
 * our shim nuade-wasm/src/nuade_wasm.c into Nuade.wasm). Protocol: src/engine/nuade/nuadeProtocol.ts.
 *
 * nw_render() mixes the stereo output and fills one mono buffer per voice. The voice buffers feed the per-channel dub
 * sends and isolation slots (worklets/channel-outputs.js) and the scopes (worklets/channel-stream.js). A voice that is
 * muted or isolated leaves the main mix inside the shim (nw_set_mute_mask); its buffer stays full for the scopes, and a
 * muted one is kept off the isolation slots and dub sends here.
 */

const MAX_VOICES = 64;
const QUANTUM = 128;
const SNAPSHOT_WORDS = 10 + 32 * 5;
const VU_EVERY = 16; // quanta between vu messages: about 23 Hz at 48 kHz
// An edited module is caught up to the playing position at most this long per render quantum (128 frames = 2.67 ms
// at 48 kHz), see stepNext.
const CATCH_UP_MS_PER_QUANTUM = 0.75;
const CATCH_UP_MIN_FRAMES = 1024;
const CATCH_UP_MAX_FRAMES = 4 * 48000;
const now = () => (globalThis.performance && typeof globalThis.performance.now === 'function' ? globalThis.performance.now() : Date.now());

class NuadeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.outPtr = 0;      // interleaved stereo, QUANTUM frames
    this.voicePtr = 0;    // MAX_VOICES planar buffers of QUANTUM floats
    this.panPtr = 0;      // MAX_VOICES floats
    this.snapPtr = 0;     // SNAPSHOT_WORDS int32
    this.vuPtr = 0;       // MAX_VOICES floats
    this.outBuf = null;
    this.voiceBufs = [];
    this.lastHeapBuffer = null;
    this.initialized = false;
    this.initializing = false;
    this.loaded = false;
    this.playing = false;
    this.songEndSent = false;
    this.voices = 0;
    this.subsong = 0;
    this.userMask = 0xFFFFFFFF;
    this.appliedMask = -1;
    this.latencyFrames = 0;
    this.fileName = 'song';
    this.lastRowKey = '';
    this.quanta = 0;
    // The edited module being caught up to the playing position (see swap / stepNext), null when none.
    this.next = null;
    // Measured cost of rendering forward without output, ms per frame (starts at 1 ms per second of song).
    this.catchUpMsPerFrame = 1 / 48000;
    this._outs = globalThis.DevilboxChannelOutputs ? new globalThis.DevilboxChannelOutputs() : null;
    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    if (this._outs && this._outs.handleMessage(data)) return;
    if (data.type !== 'init' && !this.module && this.initializing) return;
    switch (data.type) {
      case 'init':
        await this.initModule(data.wasmBinary, data.jsCode, data.sampleRate);
        break;
      case 'loadModule':
        this.load(data);
        break;
      case 'play':
        if (typeof data.latencyFrames === 'number') this.latencyFrames = Math.max(0, data.latencyFrames | 0);
        this.playing = this.loaded;
        break;
      case 'pause':
        this.playing = false;
        break;
      case 'stop':
        this.playing = false;
        // Rewind: the next play starts the subsong from its beginning.
        if (this.module && this.loaded) this.module._nw_start(this.subsong);
        this.songEndSent = false;
        this.lastRowKey = '';
        this.port.postMessage({ type: 'stopped' });
        break;
      case 'setMuteMask':
        this.userMask = data.mask >>> 0;
        break;
      case 'setSubsong':
        this.port.postMessage({ type: 'subsongStarted', index: this.startSubsong(data.index | 0) });
        break;
      case 'seek':
        if (this.module && this.loaded) this.module._nw_seek(Math.max(0, Number(data.frame) || 0));
        break;
      case 'swapModule':
        this.swap(data.bytes);
        break;
      case 'setStereoSeparation':
        if (this.module) this.module._nw_set_separation(Number(data.value));
        break;
      case 'requestState':
        this.readState(data.offset | 0, data.len | 0);
        break;
      case 'cellWrite':
        this.writeCell(data);
        break;
      case 'instrumentWrite':
        if (this.module && this.loaded) {
          this.port.postMessage({ type: 'writeResult', op: 'instrument', status: this.module._nw_instrument_write(data.instrument | 0, data.param | 0, data.value | 0) });
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

  cstr(text) { return this.writeBytes(new TextEncoder().encode(text), true); }

  /** Start subsong `index` (0-based); returns it, or -1 outside the range. */
  startSubsong(index) {
    const m = this.module;
    if (!m || !this.loaded || index < 0 || index >= m._nw_subsong_count()) return -1;
    if (!m._nw_start(index)) return -1;
    if (this.next) m._nw_next_start(index);
    this.subsong = index;
    this.songEndSent = false;
    this.lastRowKey = '';
    return index;
  }

  openModule(bytes, playerId, fileName) {
    const m = this.module;
    const data = new Uint8Array(bytes);
    const ptr = this.writeBytes(data, false);
    const name = this.cstr(fileName || 'song');
    const id = this.cstr(playerId || '');
    const r = m._nw_open(ptr, data.length, name, id);
    m._free(ptr); m._free(name); m._free(id);
    if (r !== 0) throw new Error('nuade open failed (' + r + '): ' + m.UTF8ToString(m._nw_last_error()));
  }

  load(data) {
    const m = this.module;
    if (!m) return;
    try {
      this.loaded = false;
      this.playing = false;
      this.next = null; // nw_close drops the next song too
      this.songEndSent = false;
      this.lastRowKey = '';
      m._nw_close();
      m._nw_init(Math.round(sampleRate));
      m._nw_clear_files();
      for (const f of data.companions || []) {
        const name = this.cstr(f.name);
        const bytes = new Uint8Array(f.data);
        const ptr = this.writeBytes(bytes, false);
        if (name && ptr) m._nw_add_file(name, ptr, bytes.length);
        if (name) m._free(name);
        if (ptr) m._free(ptr);
      }
      this.fileName = data.fileName;
      this.openModule(data.bytes, data.playerId, data.fileName);
      this.voices = Math.min(m._nw_voice_count(), MAX_VOICES);
      const subsongs = m._nw_subsong_count();
      const def = m._nw_default_subsong();
      const wanted = typeof data.subsong === 'number' && data.subsong >= 0 && data.subsong < subsongs ? data.subsong : def;
      if (!m._nw_start(wanted)) throw new Error('nuade start failed for subsong ' + wanted);
      this.subsong = wanted;
      this.appliedMask = -1;
      this.loaded = true;
      const meta = {};
      for (const key of ['title', 'artist', 'format', 'tool', 'message']) {
        const k = this.cstr(key);
        const v = m.UTF8ToString(m._nw_meta(k));
        m._free(k);
        if (v) meta[key] = v;
      }
      const instruments = [];
      for (let i = 0, n = m._nw_instrument_count(); i < n; i++) {
        instruments.push({ index: m._nw_instrument_index(i), name: m.UTF8ToString(m._nw_instrument_name(i)) });
      }
      this.port.postMessage({
        type: 'moduleLoaded',
        voices: this.voices, subsongs, defaultSubsong: def, startedSubsong: wanted,
        playerId: m.UTF8ToString(m._nw_player_id()), playerName: m.UTF8ToString(m._nw_player_name()),
        meta, instruments, caps: m._nw_caps(),
      });
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  /**
   * The edited module while it plays. nuade has no copy of a player's state: the edited module reaches the played frame
   * only by rendering forward to it without output (about 1 ms per second already played). That runs here as the next
   * song (nw_next_*), a bounded slice per render quantum (stepNext), while the playing module keeps playing; at the
   * frame where both stand the next song takes over, so the output continues sample for sample. A newer edit replaces
   * a next song still catching up.
   */
  swap(bytes) {
    const m = this.module;
    if (!m || !this.loaded || !bytes) return;
    try {
      const data = new Uint8Array(bytes);
      const ptr = this.writeBytes(data, false);
      const name = this.cstr(this.fileName || 'song');
      const id = this.cstr(m.UTF8ToString(m._nw_player_id())); // the same player; the companions stay in the file table
      const r = m._nw_next_open(ptr, data.length, name, id, this.subsong);
      m._free(ptr); m._free(name); m._free(id);
      if (r !== 0) {
        this.next = null;
        throw new Error('nuade open failed (' + r + '): ' + m.UTF8ToString(m._nw_last_error()));
      }
      this.next = { t0: Date.now(), quanta: 0, frames: 0, ms: 0 };
    } catch (error) {
      this.port.postMessage({ type: 'error', message: 'swapModule: ' + error.message });
    }
  }

  /** One slice of the next song's catch-up; hands over when it stands at the playing song's frame. */
  stepNext() {
    const m = this.module, next = this.next;
    if (!next) return;
    const target = m._nw_position();
    const before = m._nw_next_position();
    const frames = Math.max(CATCH_UP_MIN_FRAMES, Math.min(CATCH_UP_MAX_FRAMES,
      Math.floor(CATCH_UP_MS_PER_QUANTUM / this.catchUpMsPerFrame)));
    const t = now();
    const at = m._nw_next_advance(target, frames);
    next.ms += now() - t;
    next.frames += Math.abs(at - before);
    next.quanta++;
    // The rate this machine renders forward at, once the slices add up to a measurable time.
    if (next.ms >= 5 && next.frames > 0) this.catchUpMsPerFrame = next.ms / next.frames;
    // Handed over at the same frame, or where the edited module ends when it ends before it (nothing more to reach).
    if (at === target || (at === before && at < target) || at < 0) {
      m._nw_next_commit();
      this.next = null;
      this.voices = Math.min(m._nw_voice_count(), MAX_VOICES);
      this.appliedMask = -1;
      this.port.postMessage({ type: 'swapDone', ms: Date.now() - next.t0 });
    }
  }

  writeCell(data) {
    const m = this.module;
    if (!m || !this.loaded) return;
    const values = Int32Array.from(data.values || []);
    const ptr = m._malloc(values.length * 4 || 4);
    new Int32Array(m.HEAPU8.buffer, ptr, values.length).set(values);
    const status = m._nw_cell_write(data.pattern | 0, data.row | 0, data.channel | 0, ptr, values.length);
    m._free(ptr);
    this.port.postMessage({ type: 'writeResult', op: 'cell', status });
  }

  readState(offset, len) {
    const m = this.module;
    if (!m || !this.loaded || len <= 0 || len > 65536) return;
    const ptr = m._malloc(len);
    const got = m._nw_state_read(offset, len, ptr);
    if (got === len) {
      this.port.postMessage({ type: 'state', offset, bytes: m.HEAPU8.slice(ptr, ptr + len).buffer });
    } else {
      this.port.postMessage({ type: 'error', message: 'requestState: ' + len + ' bytes at ' + offset + ' are outside the player state' });
    }
    m._free(ptr);
  }

  async initModule(wasmBinary, jsCode, rate) {
    this.initializing = true;
    try {
      this.cleanup();
      if (jsCode && !globalThis.NuadeFactory) {
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
        const factory = new Function(jsCode + '\nreturn createNuade;');
        const result = factory();
        if (typeof result !== 'function') {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
        globalThis.NuadeFactory = result;
      }
      if (typeof globalThis.NuadeFactory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Nuade factory not available' });
        return;
      }
      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      this.module = await globalThis.NuadeFactory(config);
      const m = this.module;
      m._nw_init(Math.round(rate || sampleRate));
      this.outPtr = m._malloc(QUANTUM * 2 * 4);
      this.voicePtr = m._malloc(MAX_VOICES * QUANTUM * 4);
      this.panPtr = m._malloc(MAX_VOICES * 4);
      this.snapPtr = m._malloc(SNAPSHOT_WORDS * 4);
      this.vuPtr = m._malloc(MAX_VOICES * 4);
      if (!this.outPtr || !this.voicePtr || !this.panPtr || !this.snapPtr || !this.vuPtr) {
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
    this.outBuf = new Float32Array(heapF32.buffer, this.outPtr, QUANTUM * 2);
    this.voiceBufs = Array.from({ length: MAX_VOICES }, (_, v) =>
      new Float32Array(heapF32.buffer, this.voicePtr + v * QUANTUM * 4, QUANTUM));
    this.lastHeapBuffer = heapF32.buffer;
  }

  cleanup() {
    if (this.module) {
      try { this.module._nw_close(); } catch (e) { /* ignore */ }
      for (const p of [this.outPtr, this.voicePtr, this.panPtr, this.snapPtr, this.vuPtr]) if (p) this.module._free(p);
    }
    this.outPtr = this.voicePtr = this.panPtr = this.snapPtr = this.vuPtr = 0;
    this.outBuf = null;
    this.voiceBufs = [];
    this.module = null;
    this.initialized = false;
    this.loaded = false;
    this.playing = false;
    this.next = null;
    this.lastHeapBuffer = null;
  }

  /** Post the position (and what each voice plays) at the frame being heard, when its row changed. */
  postPosition() {
    const m = this.module;
    const heard = Math.max(0, m._nw_position() - this.latencyFrames);
    if (!m._nw_snapshot(heard, this.snapPtr)) return;
    const w = new Int32Array(m.HEAPU8.buffer, this.snapPtr, SNAPSHOT_WORDS);
    const key = w[1] + ':' + w[2] + ':' + w[3] + ':' + w[4];
    if (key === this.lastRowKey) return;
    this.lastRowKey = key;
    const f = new Float32Array(m.HEAPU8.buffer, this.snapPtr, SNAPSHOT_WORDS);
    const voices = [];
    for (let v = 0; v < w[7]; v++) {
      const i = 10 + v * 5;
      voices.push({ note: w[i], instrument: w[i + 1], volume: f[i + 2], pan: f[i + 3], active: w[i + 4] === 1 });
    }
    this.port.postMessage({
      type: 'position', frame: heard, order: w[1], pattern: w[2], row: w[3], tick: w[4], speed: w[5], tempo: w[6], voices,
    });
  }

  postVu() {
    const m = this.module;
    const n = m._nw_vu(this.vuPtr, this.voices);
    this.port.postMessage({ type: 'vu', levels: Array.from(new Float32Array(m.HEAPU8.buffer, this.vuPtr, n)) });
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.module || !this.loaded) return true;
    if (!this.playing) { this.stepNext(); return true; }
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const m = this.module;
    const outL = output[0], outR = output[1];
    const n = Math.min(outL.length, QUANTUM);
    this.updateBufferViews();
    if (!this.outBuf) return true;
    const o = this._outs;
    // A voice in an isolation slot leaves the main mix like a muted one.
    const mask = (o && o.isolatedMask ? this.userMask & ~o.isolatedMask : this.userMask) >>> 0;
    if (mask !== this.appliedMask) { m._nw_set_mute_mask(mask | 0); this.appliedMask = mask; }
    const rendered = m._nw_render(this.outPtr, this.voicePtr, n, QUANTUM);
    for (let i = 0; i < rendered; i++) {
      outL[i] = this.outBuf[i * 2];
      outR[i] = this.outBuf[i * 2 + 1];
    }
    for (let i = rendered; i < n; i++) { outL[i] = 0; outR[i] = 0; }
    const voices = this.voiceBufs.slice(0, this.voices).map((b) => b.subarray(0, rendered));
    if (o && rendered > 0) {
      // Each voice sits where the mixer put it: side = (1 + pan) / 2, at its level in the mix. A voice the mixer muted
      // (mute or another channel's solo) feeds no isolation slot and no dub send: its buffer stays full for the scopes,
      // so it is left out here, or a solo is undone for every channel an effect isolates.
      m._nw_pans(this.panPtr, this.voices);
      const pans = new Float32Array(m.HEAPU8.buffer, this.panPtr, Math.max(1, this.voices));
      const audible = voices.map((b, v) => (v >= 32 || (this.userMask >>> v) & 1 ? b : null));
      o.write(outputs, audible, rendered, (ch) => (1 + (pans[ch] || 0)) / 2, 1);
    }
    // Every sample of each voice, for the oscilloscopes and per-channel role classifiers (worklets/channel-stream.js).
    if (globalThis.DevilboxChannelStream && rendered > 0) {
      this._stream ||= new globalThis.DevilboxChannelStream(this.port, sampleRate);
      this._stream.writeFloat32(voices, rendered);
    }
    if (rendered > 0) this.postPosition();
    if ((++this.quanta % VU_EVERY) === 0) this.postVu();
    if (!this.songEndSent && (m._nw_last_flags() & 2)) {
      this.songEndSent = true;
      this.port.postMessage({ type: 'songEnd' });
    }
    this.stepNext();
    return true;
  }
}

registerProcessor('nuade-processor', NuadeProcessor);
