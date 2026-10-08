/**
 * HippelST.worklet.js - AudioWorklet for the native Jochen Hippel ST player.
 *
 * hippelst-wasm/: the Wanted Team player transpiled to C (the song's tick: the YM2149 register
 * values) with Furnace's YM2149 core behind it. Two instances of the module run here: the song,
 * and a keyboard instance over the same song with its sequencer parked, on which a key starts
 * a note on voice A through the player's own note-start code (hst_key_on).
 */
class HippelStProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.song = null;      // { mod, out }  the song being played
    this.key = null;       // { mod, out }  the keyboard voice
    this.factory = null;
    this.initPromise = null;
    this.songSlot = null;
    this.keySlot = null;
    this.playing = false;
    this.keyOn = false;
    this.tune = null;      // { image, flags, sub, ticks } to reload on edit
    this.sinceReport = 0;
    this.muteMask = 0;
    this.port.onmessage = (e) => { this.handleMessage(e.data); };
  }

  async handleMessage(d) {
    switch (d.type) {
      case 'init': await this.init(d); break;
      case 'loadTune': await this.initPromise; this.loadTune(d); break;
      case 'reloadModule': await this.initPromise; this.reload(d); break;
      case 'play': this.playing = !!this.song; break;
      case 'stop': this.stop(); break;
      case 'setMuteMask': this.muteMask = d.mask & 7; this.restoreMute(); break;
      case 'keyLoad': await this.initPromise; this.keyLoad(d); break;
      case 'keyNote': this.keyNote(d); break;
      case 'keyOff': this.keyOff(); break;
      case 'dispose': this.playing = false; this.song = null; this.key = null; break;
    }
  }

  /** Stop is back to the start: the next play begins the subsong over. */
  stop() {
    this.playing = false;
    if (!this.song || !this.tune) return;
    const m = this.song.mod;
    m._hst_ym_reset();
    m._hst_start((this.tune.d.subsong | 0) + 1);
    m._hst_set_mute(this.muteMask);
  }

  restoreMute() {
    if (this.song) this.song.mod._hst_set_mute(this.muteMask);
  }

  async init(d) {
    this.sampleRateHz = d.sampleRate || sampleRate;
    this.initPromise = (async () => {
      try {
        if (d.jsCode && !globalThis.HippelStFactory) {
          if (typeof globalThis.document === 'undefined') {
            globalThis.document = {
              createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV', rel: '', addEventListener: () => {}, removeEventListener: () => {} }),
              getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
              getElementsByTagName: () => [], head: { appendChild: () => {} },
              addEventListener: () => {}, removeEventListener: () => {},
            };
          }
          if (typeof globalThis.window === 'undefined') {
            globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, location: { href: '', pathname: '' } };
          }
          if (typeof globalThis.URL === 'undefined') globalThis.URL = class { constructor(p) { this.href = p; } };
          const f = new Function(d.jsCode + '\nreturn createHippelST;');
          globalThis.HippelStFactory = f();
        }
        this.factory = globalThis.HippelStFactory;
        this.wasmBinary = d.wasmBinary;
        // Both players are made now: the module is instantiated once, at init, and a load only resets one.
        this.songSlot = await this.newInstance();
        this.keySlot = await this.newInstance();
        this.port.postMessage({ type: 'ready' });
      } catch (err) {
        this.port.postMessage({ type: 'error', message: String(err && err.message || err) });
      }
    })();
    await this.initPromise;
  }

  async newInstance() {
    const mod = await this.factory({ wasmBinary: this.wasmBinary });
    const frames = 128;
    const out = mod._malloc(frames * 4);
    return { mod, out, frames };
  }

  upload(inst, d) {
    const bytes = new Uint8Array(d.image);
    const p = inst.mod._malloc(bytes.length);
    inst.mod.HEAPU8.set(bytes, p);
    const ok = inst.mod._hst_load(p, bytes.length, d.shortPointers ? 1 : 0, d.laterPlayer ? 1 : 0, d.newSid ? 1 : 0);
    inst.mod._free(p);
    return ok;
  }

  async loadTune(d) {
    try {
      const inst = this.songSlot;
      if (!this.upload(inst, d)) throw new Error('hst_load failed');
      inst.mod._hst_ym_init(this.sampleRateHz);
      inst.mod._hst_start((d.subsong | 0) + 1);
      inst.mod._hst_set_gate(1);
      inst.mod._hst_set_mute(this.muteMask);
      this.song = inst;
      this.tune = { d };
      this.playing = false;
      this.port.postMessage({ type: 'tuneLoaded', subsongs: d.subsongs | 0 });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  }

  /** A new image of the same song (a live edit): play on from the tick the old one had reached. */
  async reload(d) {
    if (!this.song || !this.tune) return;
    const ticks = this.song.mod._hst_ticks();
    const wasPlaying = this.playing;
    this.playing = false;
    const merged = Object.assign({}, this.tune.d, d);
    if (!this.upload(this.song, merged)) { this.port.postMessage({ type: 'error', message: 'hst_load failed (reload)' }); return; }
    const m = this.song.mod;
    m._hst_ym_reset();
    m._hst_start((merged.subsong | 0) + 1);
    for (let t = 0; t < ticks; t++) m._hst_tick();
    m._hst_set_mute(this.muteMask);
    this.tune = { d: merged };
    this.playing = wasPlaying;
    this.port.postMessage({ type: 'reloaded' });
    // keyboard instance: the instruments may have changed too
    if (this.key) this.keyLoad(merged);
  }

  async keyLoad(d) {
    try {
      if (!this.key) this.key = this.keySlot;
      if (!this.upload(this.key, d)) throw new Error('hst_load failed (keys)');
      const m = this.key.mod;
      m._hst_ym_init(this.sampleRateHz);
      m._hst_start(1);
      m._hst_key_prepare();
      m._hst_set_mute(6);    // voice A only
      m._hst_set_gate(0);
      this.keyOn = false;
      this.port.postMessage({ type: 'keyLoaded' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  }

  keyNote(d) {
    if (!this.key) return;
    const m = this.key.mod;
    // a fresh start per note: the player's voice records are module-global
    m._hst_ym_reset();
    m._hst_start(1);
    m._hst_key_prepare();
    m._hst_set_mute(6);
    m._hst_key_on(d.note | 0, d.instrument | 0, 0, 0);
    m._hst_set_gate(1);
    this.keyOn = true;
    this.port.postMessage({ type: 'keyStarted', instrument: d.instrument, note: d.note });
  }

  keyOff() {
    if (!this.key) return;
    this.key.mod._hst_set_gate(0);
  }

  render(inst, frames) {
    inst.mod._hst_render(inst.out, frames);
    return inst.mod.HEAPF32.subarray(inst.out >> 2, (inst.out >> 2) + frames);
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length < 1) return true;
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    if (n > 128) return true;
    let any = false;
    if (this.playing && this.song) {
      const buf = this.render(this.song, n);
      for (let i = 0; i < n; i++) L[i] = buf[i];
      any = true;
      this.sinceReport += n;
      if (this.sinceReport >= 2048) {
        this.sinceReport = 0;
        this.port.postMessage({ type: 'position', step: this.song.mod._hst_pos_step(), row: this.song.mod._hst_pos_row(), ticks: this.song.mod._hst_ticks() });
      }
    }
    if (this.keyOn && this.key) {
      const buf = this.render(this.key, n);
      for (let i = 0; i < n; i++) L[i] += buf[i];
      any = true;
    }
    if (!any) { L.fill(0); }
    if (R !== L) R.set(L);
    return true;
  }
}

registerProcessor('hippelst-processor', HippelStProcessor);
