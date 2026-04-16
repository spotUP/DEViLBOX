/**
 * Hively.worklet.js - AudioWorklet processor for HivelyTracker WASM replayer
 *
 * Song player mode: produces ~960 samples/frame at 50Hz, ring-buffered
 * for 128-sample AudioWorklet blocks.
 */

class HivelyProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.initialized = false;
    this.playing = false;
    this.tuneLoaded = false;
    this.looping = true;

    // Ring buffer for bridging 960-sample frames to 128-sample blocks
    this.ringSize = 8192;
    this.ringL = new Float32Array(this.ringSize);
    this.ringR = new Float32Array(this.ringSize);
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;

    // Per-channel isolation ring buffers (4 slots max)
    this.isolationSlots = [null, null, null, null];
    this.isoRings = [null, null, null, null]; // { ringL, ringR, ringWritePos, ringReadPos, ringAvailable }
    this.savedChannelGains = null; // saved gains during isolation render

    // Per-channel oscilloscope
    this.oscEnabled = false;
    this.oscSnapshots = null;   // Int16Array[] per channel, each 256 samples
    this.oscWritePos = null;    // number[] per channel write cursor
    this.oscLastSendTime = 0;
    this.oscNumChannels = 0;

    // WASM float buffers for decode output
    this.decodePtrL = 0;
    this.decodePtrR = 0;
    this.frameSamples = 960; // default for 48kHz

    // Position reporting
    this.reportCounter = 0;
    this.reportInterval = 8; // every ~8 process() calls (~23ms at 128 samples)

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadTune':
        this.loadTune(data.buffer, data.defStereo || 2);
        break;

      case 'freeTune':
        this.freeTune();
        break;

      case 'initSubsong':
        if (this.wasm && this.tuneLoaded) {
          this.wasm._hively_init_subsong(data.nr || 0);
          this.resetRingBuffer();
        }
        break;

      case 'play':
        this.playing = true;
        break;

      case 'stop':
        this.playing = false;
        this.resetRingBuffer();
        break;

      case 'pause':
        this.playing = false;
        break;

      case 'setLooping':
        this.looping = data.value !== false;
        break;

      case 'dispose':
        this.freeTune();
        this.destroyAllPlayers();
        this.playing = false;
        this.initialized = false;
        break;

      // ── Standalone Instrument Player Messages ──

      case 'createPlayer': {
        if (!this.wasm) { this.port.postMessage({ type: 'debug', msg: 'createPlayer: no wasm!' }); break; }
        const h = this.wasm._hively_create_player(Math.floor(sampleRate));
        this.port.postMessage({ type: 'debug', msg: 'createPlayer handle=' + h + ' sr=' + Math.floor(sampleRate) });
        if (h >= 0) {
          if (!this.playerOutPtrs) {
            this.playerOutPtrs = {};
          }
          // Allocate float buffers for this player (128 samples L+R)
          const floatBytes = 128 * 4;
          this.playerOutPtrs[h] = {
            l: this.wasm._malloc(floatBytes),
            r: this.wasm._malloc(floatBytes),
          };
          this.port.postMessage({ type: 'playerCreated', handle: h });
        } else {
          this.port.postMessage({ type: 'error', message: 'hively_create_player failed (max players reached)' });
        }
        break;
      }

      case 'destroyPlayer': {
        if (!this.wasm) break;
        const h = data.handle;
        if (this.playerOutPtrs && this.playerOutPtrs[h]) {
          this.wasm._free(this.playerOutPtrs[h].l);
          this.wasm._free(this.playerOutPtrs[h].r);
          delete this.playerOutPtrs[h];
        }
        this.wasm._hively_destroy_player(h);
        break;
      }

      case 'setInstrument': {
        if (!this.wasm) break;
        const insData = new Uint8Array(data.buffer);
        const ptr = this.wasm._malloc(insData.length);
        const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, insData.length);
        heap.set(insData);
        this.wasm._hively_player_set_instrument(data.handle, ptr, insData.length);
        this.wasm._free(ptr);
        break;
      }

      case 'noteOn':
        if (this.wasm) {
          this.port.postMessage({ type: 'debug', msg: 'noteOn handle=' + data.handle + ' note=' + data.note + ' vel=' + (data.velocity || 127) + ' players=' + JSON.stringify(this.playerOutPtrs ? Object.keys(this.playerOutPtrs) : null) });
          this.wasm._hively_player_note_on(data.handle, data.note, data.velocity || 127);
        }
        break;

      case 'noteOff':
        if (this.wasm) {
          this.wasm._hively_player_note_off(data.handle);
        }
        break;

      case 'setChannelGain':
        if (this.wasm && typeof this.wasm._hively_set_channel_gain === 'function') {
          this.wasm._hively_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'setVoiceParam':
        if (this.wasm && typeof this.wasm._hively_set_voice_param === 'function') {
          this.wasm._hively_set_voice_param(data.channel, data.paramId, data.value);
        }
        break;

      case 'setMuteMask':
        this.muteMask = data.mask;
        if (this.wasm && typeof this.wasm._hively_set_channel_gain === 'function') {
          for (let ch = 0; ch < 16; ch++) {
            const active = (data.mask & (1 << ch)) !== 0;
            this.wasm._hively_set_channel_gain(ch, active ? 1.0 : 0.0);
          }
        }
        break;

      // --- Per-channel effect isolation ---
      case 'addIsolation': {
        const { slotIndex, channelMask } = data;
        if (slotIndex >= 0 && slotIndex < 4) {
          this.isolationSlots[slotIndex] = { channelMask };
          this.isoRings[slotIndex] = {
            ringL: new Float32Array(this.ringSize),
            ringR: new Float32Array(this.ringSize),
            ringWritePos: 0, ringReadPos: 0, ringAvailable: 0,
          };
          this.port.postMessage({ type: 'isolationReady', slotIndex, channelMask });
        }
        break;
      }

      case 'removeIsolation': {
        if (data.slotIndex >= 0 && data.slotIndex < 4) {
          this.isolationSlots[data.slotIndex] = null;
          this.isoRings[data.slotIndex] = null;
        }
        break;
      }

      case 'diagIsolation': {
        const activeSlots = this.isolationSlots
          .map((s, i) => s ? { slot: i, mask: '0x' + s.channelMask.toString(16) } : null)
          .filter(Boolean);
        this.port.postMessage({ type: 'diagIsolation', slots: activeSlots });
        break;
      }

      case 'enableOsc': {
        const nc = this.wasm?._hively_get_channels ? this.wasm._hively_get_channels() : 4;
        this.oscEnabled = true;
        this.oscNumChannels = nc;
        this.oscSnapshots = new Array(nc);
        this.oscWritePos = new Array(nc);
        for (let i = 0; i < nc; i++) {
          this.oscSnapshots[i] = new Int16Array(256);
          this.oscWritePos[i] = 0;
        }
        this.oscLastSendTime = 0;
        break;
      }

      case 'disableOsc':
        this.oscEnabled = false;
        this.oscSnapshots = null;
        this.oscWritePos = null;
        this.oscNumChannels = 0;
        break;

      case 'setTrackStep':
        if (this.wasm) {
          this.wasm._hively_set_track_step(
            data.trackIdx, data.stepIdx,
            data.note, data.instrument,
            data.fx, data.fxParam,
            data.fxb, data.fxbParam
          );
        }
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      // Polyfill document for Emscripten in worker context
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

      // Execute Emscripten JS via Function constructor (can't use import() in worklets)
      if (jsCode && !globalThis.createHively) {
        const wrappedCode = jsCode + '\nreturn createHively;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createHively = result;
        }
      }

      if (!globalThis.createHively) {
        throw new Error('createHively factory not available');
      }

      // Instantiate WASM module
      this.wasm = await globalThis.createHively({
        wasmBinary: wasmBinary,
      });

      // Initialize replayer
      this.wasm._hively_init(Math.floor(sr));

      // Allocate decode buffers in WASM heap
      this.frameSamples = Math.floor(sr / 50);
      const floatBytes = this.frameSamples * 4;
      this.decodePtrL = this.wasm._malloc(floatBytes);
      this.decodePtrR = this.wasm._malloc(floatBytes);

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[Hively Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  loadTune(buffer, defStereo) {
    if (!this.wasm || !this.initialized) return;

    // Clean up any standalone instrument players from previous loads
    this.destroyAllPlayers();

    // Copy tune data to WASM heap
    const data = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(data.length);
    const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length);
    heap.set(data);

    const ok = this.wasm._hively_load_tune(ptr, data.length, defStereo);
    this.wasm._free(ptr);

    if (ok) {
      this.tuneLoaded = true;
      this.resetRingBuffer();

      const meta = {
        type: 'tuneLoaded',
        name: this.wasm.UTF8ToString(this.wasm._hively_get_name()),
        channels: this.wasm._hively_get_channels(),
        positions: this.wasm._hively_get_positions(),
        trackLength: this.wasm._hively_get_track_length(),
        subsongs: this.wasm._hively_get_subsongs(),
        speedMultiplier: this.wasm._hively_get_speed_multiplier(),
        restart: this.wasm._hively_get_restart(),
        mixGain: this.wasm._hively_get_mixgain(),
        stereoMode: this.wasm._hively_get_stereo_mode(),
        version: this.wasm._hively_get_version(),
      };
      this.port.postMessage(meta);
    } else {
      this.port.postMessage({ type: 'error', message: 'Failed to load HVL/AHX tune' });
    }
  }

  freeTune() {
    if (this.wasm && this.tuneLoaded) {
      this.wasm._hively_free_tune();
      this.tuneLoaded = false;
      this.playing = false;
      this.resetRingBuffer();
    }
  }

  resetRingBuffer() {
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;
  }

  destroyAllPlayers() {
    if (!this.wasm || !this.playerOutPtrs) return;
    for (const h of Object.keys(this.playerOutPtrs)) {
      const hi = parseInt(h);
      this.wasm._free(this.playerOutPtrs[hi].l);
      this.wasm._free(this.playerOutPtrs[hi].r);
      this.wasm._hively_destroy_player(hi);
    }
    this.playerOutPtrs = {};
  }

  decodeAndFillRing() {
    if (!this.wasm || !this.tuneLoaded) return;

    // Check for song end
    if (this.wasm._hively_is_song_end()) {
      if (this.looping) {
        this.wasm._hively_init_subsong(0);
      } else {
        this.playing = false;
        this.port.postMessage({ type: 'songEnd' });
        return;
      }
    }

    const hasIsolation = this.isolationSlots.some(s => s !== null);
    const hasSplitApi = typeof this.wasm._hively_tick_frame === 'function';
    const needsSplit = hasIsolation || this.oscEnabled;

    if (!needsSplit || !hasSplitApi) {
      // Fast path: no isolation or oscilloscope, use combined decode
      const samples = this.wasm._hively_decode_frame(this.decodePtrL, this.decodePtrR);
      if (samples <= 0) return;
      this._writeToMainRing(samples);
      return;
    }

    // --- Isolation path: tick once, render N times with different gains ---
    const numChannels = this.wasm._hively_get_channels ? this.wasm._hively_get_channels() : 4;

    // Build combined isolation mask
    let isolatedBits = 0;
    for (let s = 0; s < 4; s++) {
      if (this.isolationSlots[s]) isolatedBits |= this.isolationSlots[s].channelMask;
    }

    // 1. Tick the sequencer (advances song state, does NOT render audio)
    this.wasm._hively_tick_frame();

    // 2. Save voice positions (so we can re-render with different masks)
    this.wasm._hively_save_voice_positions();

    // 3. Save current channel gains
    if (!this.savedChannelGains) this.savedChannelGains = new Float32Array(16);
    // We don't have a getter — assume 1.0 for all unmuted channels, 0 for muted
    // The gains are set to isolate channels below

    // 4. Render main output (with isolated channels muted)
    for (let ch = 0; ch < numChannels; ch++) {
      const muted = (isolatedBits & (1 << ch)) !== 0;
      this.wasm._hively_set_channel_gain(ch, muted ? 0.0 : 1.0);
    }
    const samples = this.wasm._hively_render_frame(this.decodePtrL, this.decodePtrR);
    if (samples <= 0) return;
    this._writeToMainRing(samples);

    // 5. Render each isolation slot
    for (let s = 0; s < 4; s++) {
      const slot = this.isolationSlots[s];
      const ring = this.isoRings[s];
      if (!slot || !ring) continue;

      // Restore voice positions for re-render
      this.wasm._hively_restore_voice_positions();

      // Set gains: only channels in this slot's mask are audible
      for (let ch = 0; ch < numChannels; ch++) {
        const shouldPlay = (slot.channelMask & (1 << ch)) !== 0;
        this.wasm._hively_set_channel_gain(ch, shouldPlay ? 1.0 : 0.0);
      }

      const isoSamples = this.wasm._hively_render_frame(this.decodePtrL, this.decodePtrR);
      if (isoSamples > 0) {
        const heapF32 = this.wasm.HEAPF32;
        const offsetL = this.decodePtrL >> 2;
        const offsetR = this.decodePtrR >> 2;
        for (let i = 0; i < isoSamples; i++) {
          if (ring.ringAvailable >= this.ringSize) break;
          ring.ringL[ring.ringWritePos] = heapF32[offsetL + i];
          ring.ringR[ring.ringWritePos] = heapF32[offsetR + i];
          ring.ringWritePos = (ring.ringWritePos + 1) % this.ringSize;
          ring.ringAvailable++;
        }
      }
    }

    // 6. Per-channel oscilloscope capture
    if (this.oscEnabled && this.oscSnapshots) {
      const nc = this.oscNumChannels;
      for (let ch = 0; ch < nc; ch++) {
        // Solo this channel
        this.wasm._hively_restore_voice_positions();
        for (let c = 0; c < numChannels; c++) {
          this.wasm._hively_set_channel_gain(c, c === ch ? 1.0 : 0.0);
        }
        const oscSamples = this.wasm._hively_render_frame(this.decodePtrL, this.decodePtrR);
        if (oscSamples > 0) {
          const heapF32 = this.wasm.HEAPF32;
          const offL = this.decodePtrL >> 2;
          const offR = this.decodePtrR >> 2;
          const snap = this.oscSnapshots[ch];
          let wp = this.oscWritePos[ch];
          // Sample at most 256 samples from the frame
          const step = Math.max(1, Math.floor(oscSamples / 256));
          for (let i = 0; i < oscSamples; i += step) {
            const mono = (heapF32[offL + i] + heapF32[offR + i]) * 0.5;
            snap[wp] = Math.max(-32768, Math.min(32767, (mono * 32767) | 0));
            wp = (wp + 1) & 255;
          }
          this.oscWritePos[ch] = wp;
        }
      }

      // Send at ~30fps
      if (currentTime - this.oscLastSendTime > 0.033) {
        this.oscLastSendTime = currentTime;
        const out = new Array(nc);
        for (let ch = 0; ch < nc; ch++) {
          const snap = this.oscSnapshots[ch];
          const wp = this.oscWritePos[ch];
          const copy = new Int16Array(256);
          for (let j = 0; j < 256; j++) {
            copy[j] = snap[(wp + j) & 255];
          }
          out[ch] = copy;
        }
        this.port.postMessage({ type: 'oscData', channels: out }, out.map(a => a.buffer));
      }
    }

    // 7. Restore all channel gains to unity
    for (let ch = 0; ch < numChannels; ch++) {
      this.wasm._hively_set_channel_gain(ch, 1.0);
    }
  }

  /** Write decoded samples from WASM heap to main ring buffer */
  _writeToMainRing(samples) {
    const heapF32 = this.wasm.HEAPF32;
    const offsetL = this.decodePtrL >> 2;
    const offsetR = this.decodePtrR >> 2;
    for (let i = 0; i < samples; i++) {
      if (this.ringAvailable >= this.ringSize) break;
      this.ringL[this.ringWritePos] = heapF32[offsetL + i];
      this.ringR[this.ringWritePos] = heapF32[offsetR + i];
      this.ringWritePos = (this.ringWritePos + 1) % this.ringSize;
      this.ringAvailable++;
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = outputL.length;

    // Start silent — song playback and standalone players add into this
    outputL.fill(0);
    outputR.fill(0);

    // ── Song playback (ring-buffer decode) ──
    if (this.playing && this.tuneLoaded) {
      // Refill ring buffer if running low
      while (this.ringAvailable < numSamples + this.frameSamples) {
        const prevAvailable = this.ringAvailable;
        this.decodeAndFillRing();
        // Break if no progress (song ended or error)
        if (this.ringAvailable === prevAvailable) break;
      }

      // Add ring buffer samples into output
      const available = Math.min(numSamples, this.ringAvailable);
      for (let i = 0; i < available; i++) {
        outputL[i] = this.ringL[this.ringReadPos];
        outputR[i] = this.ringR[this.ringReadPos];
        this.ringReadPos = (this.ringReadPos + 1) % this.ringSize;
      }
      this.ringAvailable -= available;

      // ── Isolation slot outputs ──
      for (let s = 0; s < 4; s++) {
        const ring = this.isoRings[s];
        if (!ring || !this.isolationSlots[s]) continue;
        const slotOutput = outputs[s + 1];
        if (!slotOutput || slotOutput.length === 0) continue;
        const slotL = slotOutput[0];
        const slotR = slotOutput[1] || slotOutput[0];
        slotL.fill(0);
        slotR.fill(0);
        const isoAvail = Math.min(numSamples, ring.ringAvailable);
        for (let i = 0; i < isoAvail; i++) {
          slotL[i] = ring.ringL[ring.ringReadPos];
          slotR[i] = ring.ringR[ring.ringReadPos];
          ring.ringReadPos = (ring.ringReadPos + 1) % this.ringSize;
        }
        ring.ringAvailable -= isoAvail;
      }
    }

    // ── Mix in standalone instrument players ──
    if (this.wasm && this.playerOutPtrs) {
      const heapF32 = this.wasm.HEAPF32;
      for (const h of Object.keys(this.playerOutPtrs)) {
        const hi = parseInt(h);
        const ptrs = this.playerOutPtrs[hi];
        if (!ptrs) continue;

        // Re-read HEAPF32 in case render caused memory growth
        const currentHeap = this.wasm.HEAPF32;
        const n = this.wasm._hively_player_render(hi, ptrs.l, ptrs.r, numSamples);
        // Re-read again after render (malloc inside render may grow heap)
        const heapAfter = this.wasm.HEAPF32;
        if (n > 0) {
          const offL = ptrs.l >> 2;
          const offR = ptrs.r >> 2;
          let maxSample = 0;
          for (let i = 0; i < n; i++) {
            const sL = heapAfter[offL + i];
            const sR = heapAfter[offR + i];
            outputL[i] += sL;
            outputR[i] += sR;
            const abs = Math.abs(sL) + Math.abs(sR);
            if (abs > maxSample) maxSample = abs;
          }
          // Log once per second if active
          if (!this._playerDbgCount) this._playerDbgCount = 0;
          this._playerDbgCount++;
          if (this._playerDbgCount % 375 === 1) {
            this.port.postMessage({ type: 'debug', msg: 'render player=' + hi + ' n=' + n + ' max=' + maxSample.toFixed(6) + ' heapStale=' + (currentHeap !== heapAfter) });
          }
        }
      }
    }

    // Report position periodically
    this.reportCounter++;
    if (this.reportCounter >= this.reportInterval) {
      this.reportCounter = 0;
      if (this.tuneLoaded) {
        this.port.postMessage({
          type: 'position',
          position: this.wasm._hively_get_position(),
          row: this.wasm._hively_get_row(),
          speed: this.wasm._hively_get_speed(),
        });
      }
    }

    return true;
  }
}

registerProcessor('hively-processor', HivelyProcessor);
