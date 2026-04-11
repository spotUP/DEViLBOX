/**
 * MusicLine.worklet.js — AudioWorklet processor for MusicLine Editor WASM replayer
 *
 * Song player mode: WASM renders at 28150 Hz (INTERNAL_RATE); worklet runs at
 * AudioContext sample rate (typically 48000 Hz). Linear interpolation resampling
 * bridges the two rates.
 *
 * Preview mode: single-note instrument audition, also resampled.
 */

class MusicLineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.wasm = null;
    this.initialized = false;
    this.playing = false;
    this.songLoaded = false;
    this.previewing = false;

    // Resampling state — updated after WASM init via ml_get_sample_rate()
    this._srcRate = 28150;        // WASM native output rate (INTERNAL_RATE)
    this._dstRate = sampleRate;   // AudioContext rate (48000 Hz typically)
    this._resampPos = 0.0;        // fractional read position into source buffer
    this._previewResampPos = 0.0; // fractional read position for preview resampler

    // Position reporting (~66ms intervals, ~15fps — matches Hively)
    this._reportCounter = 0;
    this._reportInterval = Math.ceil(sampleRate * 0.066 / 128);

    // WASM heap pointers for audio buffers
    this._renderPtr = 0;     // song render buffer (stereo interleaved F32)
    this._renderFrames = 0;  // size of _renderPtr in frames
    this._previewPtr = 0;    // preview render buffer (stereo interleaved F32)
    this._previewFrames = 0; // size of _previewPtr in frames

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  // --------------------------------------------------------------------------
  // Message handling
  // --------------------------------------------------------------------------

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;

      case 'load':
        this.loadSong(data.buffer);
        break;

      case 'play':
        this.playing = true;
        this._resampPos = 0.0;
        // Reset per-channel tracking
        if (this._prevChRows) this._prevChRows.fill(-1);
        if (this._prevChPos) this._prevChPos.fill(-1);
        break;

      case 'stop':
        this.playing = false;
        this._resampPos = 0.0;
        if (this.wasm && this.songLoaded) {
          this.wasm._ml_stop();
          this.songLoaded = false;
        }
        break;

      case 'set-subsong':
        if (this.wasm && this.songLoaded) {
          this.wasm._ml_set_subsong(data.subsong || 0);
          this._resampPos = 0.0;
        }
        break;

      case 'preview-load':
        this.loadPreview(data.buffer);
        break;

      case 'preview-note-on':
        if (this.wasm) {
          this.wasm._ml_preview_note_on(
            data.instIdx || 0,
            data.midiNote || 60,
            data.velocity || 100
          );
          this.previewing = true;
        }
        break;

      case 'preview-note-off':
        if (this.wasm) {
          this.wasm._ml_preview_note_off(data.instIdx || 0);
        }
        break;

      case 'preview-stop':
        if (this.wasm) {
          this.wasm._ml_preview_stop();
          this.previewing = false;
        }
        break;

      // Pattern data access — read/write forwarded to WASM bridge
      case 'get-pattern-data': {
        if (!this.wasm || !this.songLoaded) break;
        const { partIdx, requestId } = data;
        const rows = [];
        for (let r = 0; r < 128; r++) {
          const note = this.wasm._ml_get_part_note(partIdx, r);
          const inst = this.wasm._ml_get_part_inst(partIdx, r);
          const fx = [];
          for (let f = 0; f < 5; f++) {
            fx.push(this.wasm._ml_get_part_fx(partIdx, r, f));
          }
          rows.push({ note, inst, fx });
        }
        this.port.postMessage({ type: 'pattern-data', requestId, partIdx, rows });
        break;
      }

      case 'set-pattern-cell': {
        if (!this.wasm || !this.songLoaded) break;
        const { partIdx: pi, row: rw, note: nt, inst: ins, fx: fxArr } = data;
        if (nt !== undefined) this.wasm._ml_set_part_note(pi, rw, nt);
        if (ins !== undefined) this.wasm._ml_set_part_inst(pi, rw, ins);
        if (fxArr) {
          for (let f = 0; f < fxArr.length && f < 5; f++) {
            if (fxArr[f] !== undefined) this.wasm._ml_set_part_fx(pi, rw, f, fxArr[f]);
          }
        }
        break;
      }

      case 'get-song-info': {
        if (!this.wasm || !this.songLoaded) break;
        const numParts = this.wasm._ml_get_num_parts();
        const numChannels = this.wasm._ml_get_num_channels();
        const numInstruments = this.wasm._ml_get_num_instruments();
        this.port.postMessage({
          type: 'song-info',
          numParts,
          numChannels,
          numInstruments,
        });
        break;
      }

      // Instrument parameter access
      case 'read-inst-all': {
        if (!this.wasm) break;
        const { instIdx, offsets, sizes } = data;
        const result = {};
        for (const [name, off] of Object.entries(offsets)) {
          const sz = sizes && sizes[name] === 2 ? 2 : 1;
          if (sz === 2) {
            result[name] = this.wasm._ml_read_inst_u16(instIdx, off);
          } else {
            result[name] = this.wasm._ml_read_inst_u8(instIdx, off);
          }
        }
        this.port.postMessage({ type: 'inst-all', instIdx, data: result });
        break;
      }

      case 'get-inst-offsets': {
        if (!this.wasm) break;
        const bufSize = 128;
        const ptr = this.wasm._malloc(bufSize * 4);
        const count = this.wasm._ml_dump_inst_offsets(ptr);
        const arr = [];
        for (let i = 0; i < count; i++) {
          arr.push(this.wasm.getValue(ptr + i * 4, 'i32'));
        }
        this.wasm._free(ptr);
        const instSizeof = this.wasm._ml_get_inst_sizeof();
        this.port.postMessage({ type: 'inst-offsets', offsets: arr, instSizeof });
        break;
      }

      case 'write-inst-field': {
        if (!this.wasm) break;
        const { instIdx: wi, offset: wo, size: ws, value: wv } = data;
        if (ws === 1) this.wasm._ml_write_inst_u8(wi, wo, wv);
        else if (ws === 2) this.wasm._ml_write_inst_u16(wi, wo, wv);
        break;
      }

      case 'set-effect-flag': {
        if (!this.wasm) break;
        this.wasm._ml_set_effect_flag(data.instIdx, data.fxIndex, data.value);
        break;
      }

      case 'get-inst-arp-config': {
        if (!this.wasm || !this.songLoaded) break;
        const { instIdx: iaci } = data;
        this.port.postMessage({
          type: 'inst-arp-config',
          instIdx: iaci,
          table: this.wasm._ml_get_inst_arp_table(iaci),
          speed: this.wasm._ml_get_inst_arp_speed(iaci),
          groove: this.wasm._ml_get_inst_arp_groove(iaci),
          numArps: this.wasm._ml_get_num_arps(),
        });
        break;
      }

      case 'get-arp-data': {
        if (!this.wasm || !this.songLoaded) break;
        const { arpIdx, requestId: arpReqId } = data;
        const length = this.wasm._ml_get_arp_length(arpIdx);
        const rows = [];
        for (let r = 0; r < length; r++) {
          rows.push({
            note:    this.wasm._ml_get_arp_entry(arpIdx, r, 0),
            smpl:    this.wasm._ml_get_arp_entry(arpIdx, r, 1),
            fx1:     this.wasm._ml_get_arp_entry(arpIdx, r, 2),
            param1:  this.wasm._ml_get_arp_entry(arpIdx, r, 3),
            fx2:     this.wasm._ml_get_arp_entry(arpIdx, r, 4),
            param2:  this.wasm._ml_get_arp_entry(arpIdx, r, 5),
          });
        }
        this.port.postMessage({ type: 'arp-data', requestId: arpReqId, arpIdx, length, rows });
        break;
      }

      case 'set-arp-entry': {
        if (!this.wasm || !this.songLoaded) break;
        const { arpIdx: ai, row: ar, fieldIdx: af, value: av } = data;
        this.wasm._ml_set_arp_entry(ai, ar, af, av);
        break;
      }

      case 'set-channel-on': {
        if (!this.wasm || !this.songLoaded) break;
        if (typeof this.wasm._ml_set_channel_on === 'function') {
          this.wasm._ml_set_channel_on(data.channel, data.on ? 1 : 0);
        }
        break;
      }

      case 'setMuteMask':
        this.muteMask = data.mask;
        if (this.wasm && typeof this.wasm._ml_set_channel_on === 'function') {
          for (let ch = 0; ch < 8; ch++) {
            const active = (data.mask & (1 << ch)) !== 0;
            this.wasm._ml_set_channel_on(ch, active ? 1 : 0);
          }
        }
        break;

      case 'get-channels-on': {
        if (!this.wasm || !this.songLoaded) break;
        const mask = this.wasm._ml_get_channels_on();
        this.port.postMessage({ type: 'channels-on', mask });
        break;
      }

      default:
        break;
    }
  }

  // --------------------------------------------------------------------------
  // WASM initialization — mirrors Hively.worklet.js exactly
  // --------------------------------------------------------------------------

  async initWasm(wasmBinary, jsCode) {
    try {
      // Polyfill browser globals that Emscripten expects in a non-window context
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({
            setAttribute: () => {},
            appendChild: () => {},
            style: {},
            addEventListener: () => {},
          }),
          head: { appendChild: () => {} },
          body: { appendChild: () => {} },
          createTextNode: () => ({}),
          getElementById: () => null,
          querySelector: () => null,
        };
      }
      if (typeof globalThis.location === 'undefined') {
        globalThis.location = { href: '.', pathname: '/' };
      }
      if (typeof globalThis.performance === 'undefined') {
        globalThis.performance = { now: () => Date.now() };
      }

      // Execute Emscripten JS via Function constructor
      // (import() is not available inside AudioWorklet processors)
      if (jsCode && !globalThis.createMusicLine) {
        const wrappedCode = jsCode + '\nreturn createMusicLine;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createMusicLine = result;
        }
      }

      if (!globalThis.createMusicLine) {
        throw new Error('createMusicLine factory not available');
      }

      // Instantiate WASM module
      this.wasm = await globalThis.createMusicLine({
        wasmBinary: wasmBinary,
      });

      // Initialize the song engine (pass AudioContext rate; WASM will still
      // output at INTERNAL_RATE = 28150 Hz internally)
      this.wasm._ml_init(Math.floor(sampleRate));

      // Query the actual native output rate from the WASM
      this._srcRate = this.wasm._ml_get_sample_rate(); // 28150

      // Pre-allocate a render buffer large enough for one block's worth of
      // source frames plus two guard frames for the interpolation look-ahead.
      // Worst case: ceil(128 * srcRate / dstRate) + 2
      const maxSrcFrames = Math.ceil(128 * this._srcRate / this._dstRate) + 4;
      const songBufBytes = maxSrcFrames * 2 * 4; // stereo F32
      this._renderPtr = this.wasm._malloc(songBufBytes);
      this._renderFrames = maxSrcFrames;

      // Allocate a separate buffer for preview (same size is fine)
      this._previewPtr = this.wasm._malloc(songBufBytes);
      this._previewFrames = maxSrcFrames;

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[MusicLine Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // Song loading
  // --------------------------------------------------------------------------

  loadSong(buffer) {
    if (!this.wasm || !this.initialized) return;

    // Re-init the backend before loading — FreeMod() leaves stale ring buffer
    // state that LoadMod+InitTune don't reset. Fresh MlineBackend fixes this.
    this.wasm._ml_init(Math.floor(sampleRate));

    const data = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(data.length);
    new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length).set(data);

    const ok = this.wasm._ml_load(ptr, data.length);
    this.wasm._free(ptr);

    if (ok) {
      this.songLoaded = true;
      this.numChannels = this.wasm._ml_get_num_channels ? this.wasm._ml_get_num_channels() : 0;
      this.playing = false;
      this._resampPos = 0.0;

      // Pre-allocate per-channel buffers for position reporting (reused in process())
      this._prevChRows = new Array(this.numChannels).fill(-1);
      this._prevChPos = new Array(this.numChannels).fill(-1);
      this._channelRowsBuf = new Array(this.numChannels);
      this._channelPosBuf = new Array(this.numChannels);

      const title  = this.wasm.UTF8ToString(this.wasm._ml_get_title());
      const author = this.wasm.UTF8ToString(this.wasm._ml_get_author());
      const subsongs = this.wasm._ml_get_subsong_count();

      this.port.postMessage({
        type: 'loaded',
        title,
        author,
        subsongs,
      });
    } else {
      this.port.postMessage({ type: 'error', message: 'Failed to load MusicLine module' });
    }
  }

  // --------------------------------------------------------------------------
  // Preview loading
  // --------------------------------------------------------------------------

  loadPreview(buffer) {
    if (!this.wasm || !this.initialized) return;

    const data = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(data.length);
    new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length).set(data);

    const ok = this.wasm._ml_preview_load(ptr, data.length);
    this.wasm._free(ptr);

    if (!ok) {
      this.port.postMessage({ type: 'error', message: 'Failed to load preview module' });
    }
  }

  // --------------------------------------------------------------------------
  // Resampling helper — linear interpolation from srcRate → dstRate
  //
  // srcBuf: Float32Array view of stereo-interleaved source (frames * 2 elements)
  // srcFrames: number of valid frames in srcBuf
  // outL/outR: destination Float32Arrays of length `count`
  // count: number of output frames to fill
  // posRef: { pos: number } — fractional read position, updated in place
  // --------------------------------------------------------------------------
  _resample(srcBuf, srcFrames, outL, outR, count, posRef) {
    const ratio = this._srcRate / this._dstRate;
    let pos = posRef.pos;

    for (let i = 0; i < count; i++) {
      const srcIdx = Math.floor(pos);
      const frac   = pos - srcIdx;

      const i0 = srcIdx * 2;
      const i1 = Math.min((srcIdx + 1) * 2, (srcFrames - 1) * 2);

      outL[i] = srcBuf[i0]     + frac * (srcBuf[i1]     - srcBuf[i0]);
      outR[i] = srcBuf[i0 + 1] + frac * (srcBuf[i1 + 1] - srcBuf[i0 + 1]);

      pos += ratio;
    }

    // Retain only the fractional part so next block starts at the right offset
    posRef.pos = pos - Math.floor(pos);
  }

  // --------------------------------------------------------------------------
  // process() — called every 128 samples by the Web Audio engine
  // --------------------------------------------------------------------------

  process(inputs, outputs, parameters) {
    if (!this.initialized) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outL = output[0];
    const outR = output[1] || output[0];
    const numOut = outL.length; // always 128

    outL.fill(0);
    outR.fill(0);

    // ── Song playback ──────────────────────────────────────────────────────
    if (this.playing && this.songLoaded) {
      // How many source frames we need to produce `numOut` destination frames
      // given the fractional position already consumed.
      const srcNeeded = Math.min(
        Math.ceil(numOut * this._srcRate / this._dstRate) + 2,
        this._renderFrames
      );

      // Render srcNeeded native-rate frames from WASM
      const framesWritten = this.wasm._ml_render(this._renderPtr, srcNeeded);

      if (framesWritten === 0 || this.wasm._ml_is_finished()) {
        // Song ended — emit event, stop playing, then fall through so the
        // rest of process() can still output silence and report position.
        this.port.postMessage({ type: 'ended' });
        this.playing = false;
        this._resampPos = 0.0;
        // (no early return — fall through to preview mixing and position report)
      }

      if (framesWritten > 0) {
        // Build a typed view directly into WASM heap (no copy needed)
        const heapF32 = this.wasm.HEAPF32;
        const off = this._renderPtr >> 2;
        const srcBuf = heapF32.subarray(off, off + framesWritten * 2);

        const posRef = { pos: this._resampPos };
        this._resample(srcBuf, framesWritten, outL, outR, numOut, posRef);
        this._resampPos = posRef.pos;
      }
    }

    // ── Instrument preview ─────────────────────────────────────────────────
    if (this.previewing) {
      const srcNeeded = Math.min(
        Math.ceil(numOut * this._srcRate / this._dstRate) + 2,
        this._previewFrames
      );

      const framesWritten = this.wasm._ml_preview_render(this._previewPtr, srcNeeded);

      if (framesWritten > 0) {
        const heapF32 = this.wasm.HEAPF32;
        const off = this._previewPtr >> 2;
        const srcBuf = heapF32.subarray(off, off + framesWritten * 2);

        // Preview resampler has its own independent position
        const posRef = { pos: this._previewResampPos };

        // Mix preview into output (additive)
        const tmpL = new Float32Array(numOut);
        const tmpR = new Float32Array(numOut);
        this._resample(srcBuf, framesWritten, tmpL, tmpR, numOut, posRef);
        this._previewResampPos = posRef.pos;

        for (let i = 0; i < numOut; i++) {
          outL[i] += tmpL[i];
          outR[i] += tmpR[i];
        }
      }
    }

    // ── Position reporting (on row change, not timer) ───────────────────────
    // Report whenever ANY channel's row or position changes. This gives
    // tick-accurate updates for smooth per-channel scrolling instead of
    // jumping N rows at fixed poll intervals.
    if (this.songLoaded) {
      const numCh = this.numChannels || 0;
      let changed = false;

      if (!this._prevChRows || this._prevChRows.length !== numCh) {
        this._prevChRows = new Array(numCh).fill(-1);
        this._prevChPos = new Array(numCh).fill(-1);
        this._channelRowsBuf = new Array(numCh);
        this._channelPosBuf = new Array(numCh);
      }

      const channelRows = this._channelRowsBuf;
      const channelPositions = this._channelPosBuf;
      for (let ch = 0; ch < numCh; ch++) {
        channelRows[ch] = this.wasm._ml_get_channel_row(ch);
        channelPositions[ch] = this.wasm._ml_get_channel_position(ch);
        if (channelRows[ch] !== this._prevChRows[ch] || channelPositions[ch] !== this._prevChPos[ch]) {
          changed = true;
        }
      }

      if (changed) {
        for (let ch = 0; ch < numCh; ch++) {
          this._prevChRows[ch] = channelRows[ch];
          this._prevChPos[ch] = channelPositions[ch];
        }
        this.port.postMessage({
          type: 'position',
          position: this.wasm._ml_get_position(),
          row:      this.wasm._ml_get_row(),
          speed:    this.wasm._ml_get_speed(),
          channelRows: channelRows.slice(),
          channelPositions: channelPositions.slice(),
        });
      }
    }

    return true;
  }
}

registerProcessor('musicline-processor', MusicLineProcessor);
