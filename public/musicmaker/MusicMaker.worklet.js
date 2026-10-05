/**
 * MusicMaker.worklet.js - MusicMaker V8 (Thomas Winischhofer) replayer, no WASM.
 *
 * The spec is the author's own player source (BSD), MusicMaker4.asm (STD,
 * 4 voices on 4 Paula channels) and MusicMaker8.asm (EXT, 8 voices mixed in
 * pairs onto 4 Paula channels), in third-party/uade-3.05/amigasrc/players/
 * music_maker. Notes: thoughts/shared/research/2026-10-05_musicmaker-native-replayer.md.
 *
 * MusicMakerEngine decodes the song (src/lib/import/formats/MusicMakerParser.ts)
 * and posts each voice's compiled timeline: the melody walk is fixed by the
 * data, so this worklet only does what the players do per tick in
 * setallchanneldata (volume and period slides, tremolo/vibrato, the HULL
 * envelope, loudness, fades) and plays each voice's sample at its period.
 * The EXT mixer's period approximations (hightable) are not reproduced: every
 * voice is resampled at its exact period.
 *
 * Messages in: init {sampleRate}, loadModule {module}, play, stop, setMuteMask {mask}.
 * Messages out: ready, moduleLoaded {kind, voices}, error {message}.
 */

const PAULA_HZ = 3546895;
const CIA_HZ = 709379;
const INSTNUM = 36;
const OP = { NOTE: 1, OFF: 2, LOUDNESS: 3, FADE: 4, FADE_STATE: 5, PER_SLIDE: 6, VOL_SLIDE: 7, TREMOLO: 8, VIBRATO: 9, HULL: 10, SPEED: 11, NOP: 12 };
const NOTE_PERIODS = [
  856, 832, 808, 784, 760, 740, 720, 700, 680, 660, 640, 622,
  604, 588, 572, 556, 540, 524, 508, 494, 480, 466, 452, 440,
  428, 416, 404, 392, 380, 370, 360, 350, 340, 330, 320, 311,
  302, 294, 286, 278, 270, 262, 254, 247, 240, 233, 226, 220,
  214, 208, 202, 196, 190, 185, 180, 175, 170, 160, 151, 143,
  135, 127, 120, 113,
];
const VOLUMES = [0, 1, 2, 3, 5, 7, 11, 16, 22, 28, 34, 40, 46, 52, 58, 64];
const LOUDNESS = [
  256, 264, 268, 273, 277, 287, 292, 297, 303, 309, 315, 321, 327, 334, 341,
  348, 356, 364, 372, 372, 381, 390, 399, 399,
  409, 420, 420, 431, 431, 442, 442, 455, 468, 468, 468, 481, 481, 481, 496,
  496, 496, 512, 512, 512, 512, 512, 512, 512,
  512, 512, 512, 512, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
  511,
];
/** Paula channel side: 0 and 3 left, 1 and 2 right. */
const PAULA_LEFT = [true, false, false, true];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

class Voice {
  constructor(index, timeline) {
    this.index = index;
    this.tl = timeline;
    this.inCycle = false;
    this.ev = 0;
    this.base = 0;            // tick the current phase started
    this.reset();
  }

  /** lastperiods / lastvolumes / SOFTMOD / VIBRATO as setbacklaststuff leaves them. */
  reset() {
    this.period = 0;          // lastperiods+0
    this.note = 0;            // lastperiods+2 (note index)
    this.fade = 256;          // lastperiods+4
    this.hullTable = -1;      // lastperiods+8
    this.hullPos = 0;         // +14
    this.hullEnd = 0;         // +16
    this.hullOn = false;      // +18
    this.hullLoop = false;    // +19
    this.hullLoopLen = 0;     // +20
    this.vol2 = 0;            // lastvolumes: volume in half steps (0..128)
    this.slidePer = 0;        // SOFTMOD
    this.slideVol = 0;
    this.vibMode = 0;         // VIBRATO byte 0: >0 tremolo, <0 vibrato
    this.vibFlip = 0;         // VIBRATO byte 1
    this.loudness = false;
    this.fadeIn = false;
    this.fadeOut = false;
    this.stopSample();
    this.backup = null;
    this.outVol = 0;
    this.outPeriod = 0;
  }

  /**
   * countatzero after the 999 loop (internfinished): the voice is silenced
   * and its lastperiods/lastvolumes start over; EXT also clears its slides.
   */
  loopReset(ext) {
    this.fadeIn = false; this.fadeOut = false;
    this.vol2 = 0;
    this.period = 0; this.note = 0; this.fade = 256;
    this.hullTable = -1; this.hullPos = 0; this.hullEnd = 0;
    this.hullOn = false; this.hullLoop = false; this.hullLoopLen = 0;
    this.stopSample();
    if (ext) { this.slidePer = 0; this.slideVol = 0; }
  }

  stopSample() { this.cur = null; this.next = null; this.pos = 0; }

  /** The event due at `tick`, or null. Steps into the loop cycle at the intro's end. */
  due(tick) {
    for (;;) {
      const list = this.inCycle ? this.tl.cycle : this.tl.intro;
      if (this.ev < list.length) {
        const e = list[this.ev];
        if (this.base + e.t !== tick) return null;
        this.ev++;
        return e;
      }
      const len = this.inCycle ? this.tl.cycleTicks : this.tl.introTicks;
      if (len <= 0 || this.tl.cycle.length === 0) return null;
      this.base += len;
      this.inCycle = true;
      this.ev = 0;
    }
  }
}

class MusicMakerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mod = null;
    this.voices = [];
    this.playing = false;
    this.muteMask = 0xff;
    this.outRate = sampleRate;
    // Sentinels a test reads: ticks run and events applied since load.
    this.ticksPlayed = 0;
    this.eventsApplied = 0;
    this.port.onmessage = (e) => { void this.handleMessage(e.data); };
  }

  async handleMessage(d) {
    switch (d && d.type) {
      case 'init':
        if (d.sampleRate) this.outRate = d.sampleRate;
        this.port.postMessage({ type: 'ready' });
        break;
      case 'loadModule':
        try {
          this.load(d.module);
          this.port.postMessage({ type: 'moduleLoaded', kind: this.mod.kind, voices: this.mod.voices });
        } catch (err) {
          this.mod = null;
          this.port.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
        }
        break;
      case 'play': if (this.mod) this.playing = true; break;
      case 'stop': this.playing = false; break;
      case 'setMuteMask': this.muteMask = d.mask | 0; break;
    }
  }

  load(m) {
    if (!m || !Array.isArray(m.timelines) || !m.instruments) throw new Error('MusicMaker module message is missing its timelines or instruments');
    const ext = m.kind === 'ext';
    const ins = m.instruments;
    // calculateinstruments: the EXT player halves every sample for two-voice mixing.
    const samples = ins.samples.map((s) => {
      const a = s instanceof Int8Array ? s : new Int8Array(s);
      if (!ext) return a;
      const h = new Int8Array(a.length);
      for (let i = 0; i < a.length; i++) h[i] = a[i] >> 1;
      return h;
    });
    this.mod = {
      kind: m.kind, ext, voices: m.voices, samples, lens: ins.lens, count: ins.count,
      lfoData: ins.lfoData, lfoOffsets: ins.lfoOffsets,
    };
    this.speed = m.speed;          // speed / origspeed
    this.calcSpeed = m.speed;      // calcspeed: the tick length now
    this.newSpeed = 0;             // EXT: applied at the next tick
    this.fadeSpeedIn = 63;
    this.fadeSpeedOut = 21;
    this.currLfo = new Int32Array(INSTNUM + 1).fill(-1);
    this.voices = m.timelines.map((tl, i) => new Voice(i, tl));
    this.tick = 0;
    this.tickFrac = 0;
    this.ticksPlayed = 0;
    this.eventsApplied = 0;
    this.playing = true;
  }

  tickSamples() { return this.calcSpeed * 23 / CIA_HZ * this.outRate; }

  lfoByte(at) { const d = this.mod.lfoData; return at >= 0 && at < d.length ? (d[at] << 24 >> 24) : 0; }

  /** Start instrument `inst` on voice `v` (handle_channel's sample setup). */
  trigger(v, e) {
    const m = this.mod;
    if (m.ext && e.inst === INSTNUM) {
      // setCONTFROMBREAK: carry on from where the voice was cut.
      if (v.backup) { v.cur = v.backup.cur; v.pos = v.backup.pos; v.next = null; }
      else v.stopSample();
      return v.cur ? v.cur.len : 0;
    }
    const i = e.inst;
    const sample = i < m.count ? m.samples[i] : null;
    const w0 = i < m.count ? m.lens[i * 4] : 0, w1 = i < m.count ? m.lens[i * 4 + 1] : 0;
    const w2 = i < m.count ? m.lens[i * 4 + 2] : 0, w3 = i < m.count ? m.lens[i * 4 + 3] : 0;
    let first, next = null;
    if (m.ext) {
      if (e.loop && w3) { first = w1; next = { start: w2, len: w3 * 2 }; }
      else first = w0;
    } else {
      // STD lengths go to Paula in words.
      if (e.loop && w1) { first = (w1 >> 1) * 2; next = { start: w2, len: w3 * 2 }; }
      else first = (w0 >> 1) * 2;
    }
    if (!sample || !sample.length || first <= 0) { v.stopSample(); return 0; }
    v.cur = { s: sample, start: 0, len: Math.min(first, sample.length) };
    v.next = next && next.len > 0 ? { s: sample, start: next.start, len: Math.min(next.len, Math.max(0, sample.length - next.start)) } : null;
    v.pos = 0;
    return first;
  }

  /** One countatzero for voice `v`. */
  apply(v, e) {
    const m = this.mod;
    this.eventsApplied++;
    if (e.reset) v.loopReset(m.ext);
    switch (e.op) {
      case OP.NOTE: {
        v.slidePer = 0; v.slideVol = 0; v.vibMode = 0; v.vibFlip = 0;
        if (e.legato) {
          if (m.ext) v.backup = v.cur ? { cur: v.cur, pos: v.pos } : null;
          if (e.slide) { v.slidePer = e.slide[0]; v.slideVol = e.slide[1]; }
          v.vol2 = 2 * VOLUMES[e.vol];
          v.period = NOTE_PERIODS[e.note];
          v.note = e.note;
          break;
        }
        // STD: an empty instrument slot is a note off.
        if (!m.ext && !(e.inst < m.count && m.lens[e.inst * 4])) { this.noteOff(v, e.note); break; }
        const first = this.trigger(v, e);
        v.hullOn = false; v.hullLoop = false;
        const table = this.currLfo[Math.min(e.inst, INSTNUM)];
        if (table >= 0) { v.hullTable = table; v.hullOn = true; v.hullPos = 0; v.hullEnd = first & 0xffff; }
        v.vol2 = 2 * VOLUMES[e.vol];
        v.period = NOTE_PERIODS[e.note];
        v.note = e.note;
        v.hullArm = true;
        break;
      }
      case OP.OFF:
        if (m.ext) v.backup = v.cur ? { cur: v.cur, pos: v.pos } : null;
        v.slidePer = 0; v.slideVol = 0; v.vibMode = 0; v.vibFlip = 0;
        this.noteOff(v, v.note);
        break;
      case OP.LOUDNESS: v.loudness = !!e.value; break;
      case OP.FADE:
        v.fadeIn = false; v.fadeOut = false;
        if (e.value > 0) { this.fadeSpeedOut = e.value & 0xff; v.fadeOut = true; }
        else if (e.value < 0) { this.fadeSpeedIn = (-e.value) & 0xff; v.fadeIn = true; }
        break;
      case OP.FADE_STATE: v.fade = e.value; break;
      case OP.PER_SLIDE: v.slidePer = e.value; if (v.vibMode < 0) v.vibMode = 0; break;
      case OP.VOL_SLIDE: v.slideVol = e.value; if (v.vibMode > 0) v.vibMode = 0; break;
      case OP.TREMOLO: if (v.vibMode < 0) v.slidePer = 0; v.slideVol = e.value; v.vibMode = 1; v.vibFlip = 0; break;
      case OP.VIBRATO: if (v.vibMode > 0) v.slideVol = 0; v.slidePer = e.value; v.vibMode = -1; v.vibFlip = 0; break;
      case OP.HULL: {
        // $FA: the table belongs to an instrument only when its first word says so.
        const inst = e.value, n = e.value2;
        if (inst > INSTNUM) break;
        const off = n > 0 ? m.lfoOffsets[n] : -1;
        const d = m.lfoData;
        const owner = off >= 0 && off + 1 < d.length ? (d[off] << 8) | d[off + 1] : -1;
        this.currLfo[inst] = owner === inst ? off + 2 : -1;
        break;
      }
      case OP.SPEED: {
        const f1 = e.value, f2 = e.value2;
        if (!f2) break;
        if (m.ext) {
          this.newSpeed = clamp(Math.floor(this.speed * f1 / f2), 600, Math.max(600, this.speed));
          if (this.newSpeed > this.speed) this.newSpeed = this.speed;
        } else {
          this.calcSpeed = clamp(Math.floor(this.speed * f1 / f2), 300, 2800);
        }
        break;
      }
      default: break;
    }
  }

  noteOff(v, note) {
    v.stopSample();
    v.hullOn = false; v.hullLoop = false;
    v.vol2 = 0;
    v.period = NOTE_PERIODS[note & 63];
    v.note = note & 63;
  }

  /** setallchanneldata for one voice: the volume and period Paula gets this tick. */
  update(v) {
    const m = this.mod;
    // Per-voice fades ($F6), toward 256 (in) or 8192 (out).
    if (v.fadeIn) {
      if (v.fade > 4096) { v.fade = 4096; if (m.ext) v.fade -= this.fadeSpeedIn; }
      else if (v.fade === 256) { if (m.ext) v.fadeIn = false; }
      else if (v.fade < 256) { v.fade = 256; if (m.ext) v.fadeIn = false; }
      else v.fade -= this.fadeSpeedIn;
    } else if (v.fadeOut) {
      if (v.fade === 8192) { if (m.ext) v.fadeOut = false; }
      else if (v.fade > 8192) { v.fade = 8192; if (m.ext) v.fadeOut = false; }
      else v.fade += this.fadeSpeedOut;
    }
    // Tremolo flips the volume slide every second tick.
    if (v.vibMode > 0) { v.vibFlip ^= 0xff; if (!v.vibFlip) v.slideVol = -v.slideVol; }
    v.vol2 = clamp(v.vol2 + v.slideVol, 0, 128);
    let vol = v.vol2 >> 1;
    let perMod = 0;
    if (v.hullOn) {
      const at = v.hullTable + Math.floor((v.hullPos & 0xffff) / 40) * 2;
      const dv = this.lfoByte(at);
      perMod = this.lfoByte(at + 1);
      if (dv) vol = clamp(vol + ((dv * vol) >> 5), 0, 64);
    }
    if (v.loudness) vol = Math.floor((vol << 8) / LOUDNESS[v.note & 63]);
    if (v.fade !== 256) vol = Math.floor((vol << 8) / v.fade);
    vol = clamp(vol, 0, 64);
    // Vibrato flips the period slide every second tick; the slide persists.
    if (v.vibMode < 0) { v.vibFlip ^= 0xff; if (!v.vibFlip) v.slidePer = -v.slidePer; }
    let per = clamp(v.period + v.slidePer, 113, 856);
    v.period = per;
    if (v.hullOn) {
      if (perMod) per = clamp(per + ((per * perMod) >> 8), 113, 856);
      // The envelope runs at the sample's own pace: bytes played this tick.
      const step = Math.floor(this.calcSpeed * 115 / per) & 0xffff;
      const sum = v.hullPos + step;
      v.hullPos = sum & 0xffff;
      if (sum > 0xffff || v.hullPos > v.hullEnd) {
        if (v.hullLoop) v.hullPos = (v.hullPos - v.hullLoopLen) & 0xffff;
        else v.hullOn = false;
      }
    }
    // The loop segment arms the envelope's wrap once the note is running.
    if (v.hullArm) {
      v.hullArm = false;
      if (v.hullOn && v.next) { v.hullLoop = true; v.hullLoopLen = v.next.len & 0xffff; }
    }
    v.outVol = vol;
    v.outPeriod = per;
  }

  runTick() {
    const m = this.mod;
    if (m.ext && this.newSpeed) { this.calcSpeed = this.newSpeed; this.newSpeed = 0; }
    // The players walk the channels from the last to the first.
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      const e = v.due(this.tick);
      if (e) this.apply(v, e);
      this.update(v);
    }
    this.tick++;
    this.ticksPlayed++;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    L.fill(0); if (R !== L) R.fill(0);
    if (!this.mod || !this.playing) return true;
    const ext = this.mod.ext;
    for (let i = 0; i < L.length; i++) {
      if (this.tickFrac <= 0) { this.runTick(); this.tickFrac += this.tickSamples(); }
      this.tickFrac -= 1;
      let l = 0, r = 0;
      for (const v of this.voices) {
        const c = v.cur;
        if (!c || !v.outPeriod) continue;
        const s = c.s[c.start + (v.pos | 0)] || 0;
        if (v.outVol && (this.muteMask >> v.index) & 1) {
          const x = s * v.outVol;
          if (PAULA_LEFT[ext ? v.index >> 1 : v.index]) l += x; else r += x;
        }
        v.pos += PAULA_HZ / v.outPeriod / this.outRate;
        while (v.cur && v.pos >= v.cur.len) {
          v.pos -= v.cur.len;
          if (v.next && v.next.len > 0) v.cur = v.next;
          else { v.stopSample(); }
        }
      }
      // Two Paula channels per side at full scale (128 * 64 each).
      L[i] = l / (128 * 64 * 2);
      R[i] = r / (128 * 64 * 2);
    }
    return true;
  }
}

registerProcessor('musicmaker-processor', MusicMakerProcessor);
