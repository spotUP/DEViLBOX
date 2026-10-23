/**
 * CZ101 AudioWorklet Processor
 * Wraps the UPD933 WASM emulation (Emscripten build, CZ101Module factory) for
 * the Casio CZ-101 synthesizer. Loaded the house way (as Klystrack.worklet.js):
 * the main thread sends the WASM bytes and the Emscripten glue source, the glue
 * runs via the Function constructor and instantiates the module itself, so the
 * minified import/export names are the glue's business, not ours.
 */

import { TimedEventQueue } from '../shared/timedEventQueue.js';

// The chip's pitch table assumes a 40 kHz sample clock (4.48 MHz / 112 clocks
// per sample); the chip renders at that rate and process() resamples it.
const CHIP_CLOCK = 4480000;
const CHIP_RATE = CHIP_CLOCK / 112;
const CHUNK = 64;
const RELEASE_RATE = 40; // chip rate data for a key-off with no release stages // chip samples rendered per refill (chip buffer holds 4096)

class CZ101Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.isInitialized = false;
    this.bufferPtr = 0;
    this.pendingWrites = [];
    // Register writes and envelopes sent ahead with a `time` wait here for their frame (see shared/timedEventQueue.js)
    this.noteEvents = new TimedEventQueue();
    // Envelope stage sequencers, one per (envelope kind, voice): the CZ-101's
    // firmware loads each next step when the chip raises its stage interrupt;
    // the chip alone only runs the single step it was last given.
    this.seq = [0, 1, 2].map(() => Array.from({ length: 8 }, () => null));
    // Linear resampler state: chip-rate samples -> output rate
    this.phase = 0;
    this.prev = 0;
    this.next = 0;
    this.chipBuf = new Float32Array(CHUNK);
    this.chipIdx = 0;
    this.chipLen = 0;

    this.port.onmessage = (event) => { this.handleMessage(event.data); };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;

      case 'writeReg':
        // Untimed or past: queued, applied at the start of the next process() block. Ahead: applied at its frame.
        if (this.noteEvents.push(data, currentTime)) this.pendingWrites.push({ register: data.register, value: data.value });
        break;

      case 'envelope':
      case 'keyOff':
        if (this.noteEvents.push(data, currentTime)) this.pendingWrites.push(data);
        break;

      case 'cancelFrom':
        // All Notes Off: the rows already sent for later never sound
        this.noteEvents.cancelFrom(data.time ?? currentTime);
        break;
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      if (jsCode && !globalThis.CZ101Module) {
        const factory = new Function(jsCode + '\nreturn CZ101Module;');
        const result = factory();
        if (typeof result === 'function') globalThis.CZ101Module = result;
      }
      if (!globalThis.CZ101Module) throw new Error('CZ101Module factory not available');

      this.wasm = await globalThis.CZ101Module({ wasmBinary });
      this.wasm._upd933_create(CHIP_CLOCK);
      this.wasm._upd933_set_cs(0); // chip select is active low; reset leaves it deselected
      this.bufferPtr = this.wasm._upd933_get_buffer();

      this.isInitialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[CZ101.worklet] Init error:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  /** One register write = 3 bytes on the chip's serial bus: register, high, low. */
  writeRegister(register, value) {
    this.wasm._upd933_write(register & 0xFF);
    this.wasm._upd933_write((value >> 8) & 0xFF);
    this.wasm._upd933_write(value & 0xFF);
  }

  /**
   * Envelope stages are {rate, level} in chip units (rate 0-127, level 0-127; DCO 0-63).
   * A stage with rate 0 (after the first) is the sustain point: the envelope holds
   * the previous level until key-off, which then runs the stages after it. With no
   * sustain point, key-off falls to zero at RELEASE_RATE.
   */
  startEnvelope(kind, voice, stages) {
    // A new note starts every envelope from zero. The chip keeps each envelope where the last
    // note left it (a released pitch or waveform envelope rests at its last level), so without
    // this the second note began from the first note's leftovers.
    this.wasm._upd933_env_reset(kind, voice & 7);
    const sustainIdx = stages.findIndex((st, i) => i > 0 && st.rate === 0);
    const seq = { stages, idx: -1, sustainIdx, held: false, releasing: false, done: false };
    this.seq[kind][voice & 7] = seq;
    this.loadStage(kind, voice & 7, seq, 0);
  }

  keyOff(voice) {
    for (let kind = 0; kind < 3; kind++) {
      const seq = this.seq[kind][voice];
      if (!seq) continue;
      if (seq.releasing) continue;
      seq.releasing = true;
      const first = seq.sustainIdx >= 0 ? seq.sustainIdx + 1 : seq.stages.length;
      if (seq.idx < first) this.loadStage(kind, voice, seq, first);
      else if (seq.done) this.endRelease(kind, voice, seq); // ran out of stages while held on the last level
    }
  }

  /**
   * The patch has no release stage left. Only the amplitude falls to silence; the waveform and
   * pitch envelopes stay where they are (gliding them to zero was an audible pitch "boing" and
   * a timbre sweep on every key-off of a patch that ends on a sustain stage).
   */
  endRelease(kind, voice, seq) {
    if (kind === 0) this.loadStep(kind, voice, seq, RELEASE_RATE, 0);
  }

  /** Program stage `idx`, or end/hold the sequence when there is none left. */
  loadStage(kind, voice, seq, idx) {
    seq.idx = idx;
    if (idx >= seq.stages.length) {
      seq.done = true;
      // Key-off with no stage left to run
      if (seq.releasing) this.endRelease(kind, voice, seq);
      return;
    }
    const st = seq.stages[idx];
    if (!seq.releasing && idx > 0 && st.rate === 0 && idx === seq.sustainIdx) {
      seq.held = true; // sustain point: hold until key-off
      return;
    }
    seq.held = false;
    this.loadStep(kind, voice, seq, st.rate, st.level, st.coarse);
  }

  /**
   * Write one step register; direction comes from where the envelope actually is.
   * DCO levels are 6 bits, and `coarse` switches the unit from 6.25 cents to 2 semitones;
   * env_level() reports the DCO in the finest unit, so compare in that unit.
   */
  loadStep(kind, voice, seq, rate, level, coarse) {
    const current = this.wasm._upd933_env_level(kind, voice);
    const maxLevel = kind === 2 ? 0x3F : 0x7F;
    const field = Math.min(level, maxLevel) & maxLevel;
    const target = kind === 2 && coarse ? field << 5 : field;
    const direction = target < current ? 1 : 0;
    let word = (direction << 15) | ((rate & 0x7F) << 8) | field;
    if (kind === 2 && coarse) word |= 0x40;
    this.writeRegister((kind === 0 ? 0x00 : kind === 1 ? 0x20 : 0x10) + voice, word);
  }

  /** Advance every sequencer whose current step the chip reports as reached. */
  pollEnvelopes() {
    for (let kind = 0; kind < 3; kind++) {
      for (let voice = 0; voice < 8; voice++) {
        const seq = this.seq[kind][voice];
        if (!seq || seq.done || seq.held) continue;
        if (!this.wasm._upd933_env_irq(kind, voice)) continue;
        this.loadStage(kind, voice, seq, seq.idx + 1);
      }
    }
  }

  /** Next chip-rate sample; renders a chunk when the queue runs dry (chip buffer holds 4096). */
  pullChipSample() {
    if (this.chipIdx >= this.chipLen) {
      this.wasm._upd933_render(CHUNK);
      const offset = this.bufferPtr / 4;
      this.chipBuf.set(this.wasm.HEAPF32.subarray(offset, offset + CHUNK));
      this.chipIdx = 0;
      this.chipLen = CHUNK;
      this.pollEnvelopes();
    }
    return this.chipBuf[this.chipIdx++];
  }

  /** Apply one queued message to the chip */
  applyMsg(msg) {
    if (msg.type === 'envelope') this.startEnvelope(msg.kind, msg.voice, msg.stages);
    else if (msg.type === 'keyOff') this.keyOff(msg.voice & 7);
    else this.writeRegister(msg.register, msg.value);
  }

  /** Render output frames [from, to) */
  renderRange(left, right, from, to) {
    // Streaming linear resample from the chip's rate to the context rate
    const step = CHIP_RATE / sampleRate;
    for (let i = from; i < to; i++) {
      this.phase += step;
      while (this.phase >= 1) {
        this.phase -= 1;
        this.prev = this.next;
        this.next = this.pullChipSample();
      }
      const s = this.prev + (this.next - this.prev) * this.phase;
      left[i] = s;
      right[i] = s;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] || left;

    if (!this.isInitialized) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    while (this.pendingWrites.length > 0) this.applyMsg(this.pendingWrites.shift());

    // Render in segments so a queued write or key-off lands at its own frame, not at the block start
    let done = 0;
    while (done < left.length) {
      const now = currentTime + done / sampleRate;
      this.noteEvents.drain(now, (ev) => this.applyMsg(ev));
      const off = this.noteEvents.nextOffset(now, left.length - done, sampleRate);
      const len = off > 0 ? off : left.length - done;
      this.renderRange(left, right, done, done + len);
      done += len;
    }
    return true;
  }
}

registerProcessor('cz101-processor', CZ101Processor);
