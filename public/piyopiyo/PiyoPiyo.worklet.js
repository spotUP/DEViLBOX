/**
 * PiyoPiyo.worklet.js - Studio Pixel PiyoPiyo (.pmd) replayer, no WASM.
 *
 * A port of piyopiyo-rs (crumblingstatue, 0BSD; src/player.rs, song.rs,
 * track.rs, track/melody.rs, track/percussion.rs) to the AudioWorklet. The
 * drum samples it embeds come with it (public/piyopiyo/drums, 0BSD) and are
 * posted by the engine with 'init'.
 *
 * The file: "PMD" + flag, track-data offset, wait (ms per event), repeat
 * start, repeat end, record count; three melody tracks (octave, icon, 2
 * unused, length, volume, 8 unused, 256-byte signed waveform, 64-byte
 * envelope); the drum track's volume; then, per track, `records` events of
 * 4 bytes: bits 0-23 = the 24 piano keys down, bits 24-31 = pan (0 = keep).
 *
 * Messages in: init {sampleRate, drums}, loadModule {moduleData}, play, stop,
 * setMuteMask {mask: bit0-2 melody tracks, bit3 drums}.
 * Messages out: ready, moduleLoaded {records, waitMs}, error {message}.
 */

const N_KEYS = 24;
const FREQ_TABLE = [1551, 1652, 1747, 1848, 1955, 2074, 2205, 2324, 2461, 2616, 2770, 2938];
const PAN_TABLE = [2560, 1600, 760, 320, 0, -320, -760, -1640];
/** Drum sample per piano key (track P), as piyopiyo-rs maps them. */
const DRUM_KEYS = ['bass1', 'bass1', 'bass2', 'bass2', 'snare', 'snare', 'snare', 'snare', 'hat1', 'hat1', 'hat2', 'hat2',
  'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal', 'cymbal'];

function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/** Parse a .pmd into the player's song structure. Throws on a bad file. */
function parsePmd(b) {
  if (b.length < 0x418 || b[0] !== 0x50 || b[1] !== 0x4d || b[2] !== 0x44) throw new Error('not a PiyoPiyo file (PMD magic)');
  let o = 8;
  const waitMs = readU32(b, o); o += 4;
  const repeatStart = readU32(b, o); o += 4;
  const repeatEnd = readU32(b, o); o += 4;
  const records = readU32(b, o); o += 4;
  const melody = [];
  for (let t = 0; t < 3; t++) {
    const octave = b[o]; o += 4;
    const len = readU32(b, o) & 0xffff; o += 4;
    const vol = readU32(b, o) & 0xffff; o += 4;
    o += 8;
    const waveform = new Int8Array(b.buffer, b.byteOffset + o, 256).slice(); o += 256;
    const envelope = b.slice(o, o + 64); o += 64;
    melody.push({ octave, len, vol, waveform, envelope });
  }
  const drumVol = readU32(b, o) & 0xffff; o += 4;
  if (o + records * 4 * 4 > b.length) throw new Error(`PiyoPiyo file is short: ${records} records announced, ${(b.length - o) / 16 | 0} present`);
  const events = [];
  for (let t = 0; t < 4; t++) {
    const ev = new Uint32Array(records);
    for (let i = 0; i < records; i++) ev[i] = readU32(b, o + i * 4);
    o += records * 4;
    events.push(ev);
  }
  return { waitMs, repeatStart, repeatEnd, records, melody, drumVol, events };
}

class TrackState {
  constructor(vol, events) {
    this.vol = vol; this.events = events;
    this.volLeft = 1; this.volRight = 1; this.volMix = 0;
    this.timers = new Float64Array(N_KEYS); this.phases = new Float64Array(N_KEYS);
  }
  /** track.rs do_event: start the keys that are down, refresh the mix and pan. */
  doEvent(ev, noteDuration) {
    for (let k = 0; k < N_KEYS; k++) if (ev & (1 << k)) { this.timers[k] = noteDuration(k); this.phases[k] = 0; }
    this.volMix = Math.pow(10, ((this.vol - 300) * 8) / 2000);
    if ((ev & 0xff000000) !== 0) {
      const pan = PAN_TABLE[(ev >>> 24) & 7];
      this.volLeft = Math.pow(10, Math.min(pan, 0) / 2000);
      this.volRight = Math.pow(10, Math.min(-pan, 0) / 2000);
    }
  }
}

class PiyoPiyoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rate = sampleRate;
    this.drums = null;
    this.song = null;
    this.tracks = null;
    this.playing = false;
    this.muteMask = 0xf;
    this.waitTimer = 0;
    this.cursor = 0;
    this.port.onmessage = (e) => { this.handleMessage(e.data); };
  }

  async handleMessage(d) {
    switch (d.type) {
      case 'init':
        this.rate = d.sampleRate || sampleRate;
        this.drums = {};
        for (const name of Object.keys(d.drums || {})) this.drums[name] = new Uint8Array(d.drums[name]);
        this.port.postMessage({ type: 'ready' });
        break;
      case 'loadModule':
        try {
          this.song = parsePmd(new Uint8Array(d.moduleData));
          this.reset();
          this.playing = true;
          this.port.postMessage({ type: 'moduleLoaded', records: this.song.records, waitMs: this.song.waitMs });
        } catch (err) {
          this.song = null;
          this.port.postMessage({ type: 'error', message: String(err && err.message || err) });
        }
        break;
      case 'play': if (this.song) this.playing = true; break;
      case 'stop': this.playing = false; this.reset(); break;
      case 'setMuteMask': this.muteMask = d.mask; break;
      default: break;
    }
  }

  reset() {
    if (!this.song) { this.tracks = null; return; }
    const s = this.song;
    this.tracks = s.melody.map((m, i) => new TrackState(m.vol, s.events[i]));
    this.tracks.push(new TrackState(s.drumVol, s.events[3]));
    this.drumVolMixLow = Math.pow(10, ((((7 * s.drumVol) / 10 | 0) - 300) * 8) / 2000);
    this.waitTimer = 0;
    this.cursor = 0;
  }

  drumSample(k) { return this.drums ? this.drums[DRUM_KEYS[k]] : null; }

  /** player.rs tick: every waitMs, fire the next event on all four tracks. */
  tick() {
    const s = this.song;
    if (this.waitTimer === 0) {
      this.waitTimer = Math.floor(this.rate * s.waitMs / 1000);
      if (this.cursor < s.records) {
        for (let t = 0; t < 3; t++) {
          const m = s.melody[t];
          this.tracks[t].doEvent(this.tracks[t].events[this.cursor], () => m.len);
        }
        this.tracks[3].doEvent(this.tracks[3].events[this.cursor], (k) => { const d = this.drumSample(k); return d ? d.length : 0; });
      }
      this.cursor += 1;
      if (this.cursor >= s.repeatEnd) this.cursor = s.repeatStart;
    } else {
      this.waitTimer -= 1;
    }
  }

  /** melody.rs sample_of_key, in i16 units. */
  melodySample(t, k, sampPhase, out) {
    const tr = this.tracks[t]; const m = this.song.melody[t];
    if (tr.timers[k] < 0) tr.timers[k] = 0;
    let idx = m.len > 0 ? Math.floor(64 * Math.max(0, m.len - Math.floor(tr.timers[k])) / m.len) : 0;
    if (idx >= 64) idx = 63;
    const env = 2 * m.envelope[idx];
    const octShift = 1 << m.octave;
    const phase = octShift * (k < 12 ? FREQ_TABLE[k] / 16 : FREQ_TABLE[k - 12] / 8) * sampPhase;
    tr.phases[k] += phase;
    const tp = Math.floor(tr.phases[k] / 256) & 0xff;
    const s = m.waveform[tp] * env;
    out[0] += s * tr.volMix * tr.volLeft;
    out[1] += s * tr.volMix * tr.volRight;
  }

  /** percussion.rs sample_of_key: unsigned 8-bit at 22050 Hz, linear interpolation. */
  drumSampleOf(k, sampPhase, out) {
    const tr = this.tracks[3];
    const d = this.drumSample(k);
    if (!d) return;
    tr.phases[k] += sampPhase;
    const ph = Math.floor(tr.phases[k]);
    if (ph >= d.length) return;
    const ph2 = ph + (ph + 1 !== d.length ? 1 : 0);
    const fract = tr.phases[k] - ph;
    const v0 = d[ph] - 128, v1 = d[ph2] - 128;
    const volMix = (k & 1) === 0 ? tr.volMix : this.drumVolMixLow;
    const p = (v0 + fract * (v1 - v0)) * 256 * volMix;
    out[0] += p * tr.volLeft;
    out[1] += p * tr.volRight;
  }

  process(_inputs, outputs) {
    const outL = outputs[0][0];
    const outR = outputs[0][1] || outL;
    if (!this.playing || !this.song || !this.tracks) { outL.fill(0); if (outR !== outL) outR.fill(0); return true; }
    const sampPhase = 22050 / this.rate;
    const acc = [0, 0];
    for (let i = 0; i < outL.length; i++) {
      this.tick();
      acc[0] = 0; acc[1] = 0;
      for (let t = 0; t < 3; t++) {
        if (!(this.muteMask & (1 << t))) continue;
        const tr = this.tracks[t];
        for (let k = 0; k < N_KEYS; k++) {
          if (tr.timers[k] <= 0) continue;
          tr.timers[k] -= sampPhase;
          this.melodySample(t, k, sampPhase, acc);
        }
      }
      if (this.muteMask & 8) {
        const tr = this.tracks[3];
        for (let k = 0; k < N_KEYS; k++) {
          if (tr.timers[k] <= 0) continue;
          tr.timers[k] -= sampPhase;
          this.drumSampleOf(k, sampPhase, acc);
        }
      }
      // i16 saturation, as the Rust player's saturating_add, then to float.
      const l = Math.max(-32768, Math.min(32767, acc[0]));
      const r = Math.max(-32768, Math.min(32767, acc[1]));
      outL[i] = l / 32768;
      if (outR !== outL) outR[i] = r / 32768;
    }
    return true;
  }
}

registerProcessor('piyopiyo-processor', PiyoPiyoProcessor);
