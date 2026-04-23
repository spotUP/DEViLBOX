/**
 * SIDDubSynths — Authentic SID-chip dub effects using the GoatTracker Ultra
 * WASM engine. When a SID file is loaded in DEViLBOX, dub moves use REAL
 * SID emulation (6581/8580) instead of WebAudio Tone.js synths.
 *
 * The GTUltra engine is lazy-loaded on first use and kept alive for the
 * session. Its 3 SID voices are allocated:
 *   Ch 0: Siren (hold — sweeping pulse wave)
 *   Ch 1: Hold-style bass (oscBass, crushBass)
 *   Ch 2: One-shots (ping, snare, subSwell, riser)
 *
 * Output connects to DubBus.input so echo + spring process the sound.
 */

import { GTUltraEngine } from '../gtultra/GTUltraEngine';

// SID waveform | gate bit (bit 0 = gate on)
const PULSE_GATE = 0x41;  // Pulse wave + gate
const SAW_GATE = 0x21;    // Sawtooth + gate
const TRI_GATE = 0x11;    // Triangle + gate
const NOISE_GATE = 0x81;  // Noise + gate

/** Pack two 4-bit nibbles into one byte (attack/decay or sustain/release). */
const adsr = (hi: number, lo: number) => ((hi & 0xF) << 4) | (lo & 0xF);

// Channel allocation
const CH_SIREN = 0;
const CH_BASS = 1;
const CH_ONESHOT = 2;

// Table type constants (match GoatTracker defines)
const PTBL = 1; // Pulse table

// Pulse table layout (0-based row → 1-based pointer)
// Wide pulse (50% duty cycle = classic square wave)
const PTBL_WIDE_ROW = 0;   // ptr = 1
// Narrow pulse (12.5% duty = buzzy, gritty)
const PTBL_NARROW_ROW = 2; // ptr = 3

// Instrument indices (1-based; index 0 is unused in GT)
const INST = {
  // ── Sirens (ch 0) ──
  SIREN: 1,             // Pulse wave — classic police siren sweep
  SIREN_SAW: 8,         // Sawtooth — aggressive buzzing siren
  SIREN_TRI: 9,         // Triangle — mellow, smooth siren
  SIREN_WARBLE: 10,     // Pulse with fast modulation feel
  // ── One-shots (ch 2) ──
  PING: 2,              // Triangle — sharp sonar ping
  SNARE: 3,             // Noise — snare crack burst
  SUB_SWELL: 6,         // Triangle — slow sub-bass swell
  RISER: 7,             // Noise — filter-sweep riser
  LASER: 11,            // Sawtooth — fast-decay laser zap
  HIHAT: 12,            // Noise — short hi-hat tick
  CLAP: 13,             // Noise — medium-decay clap burst
  BELL: 14,             // Triangle — metallic bell ping (longer decay)
  // ── Bass (ch 1) ──
  OSC_BASS: 4,          // Sawtooth — resonant bass drone
  CRUSH_BASS: 5,        // Pulse (narrow) — gritty bass
  SUB_BASS: 15,         // Triangle — pure sub, no harmonics
  STAB: 16,             // Pulse — short staccato stab
} as const;

/**
 * Instrument definitions: [firstwave, AD, SR]
 *
 * SID ADSR timing reference:
 *   Attack:        0=2ms  1=8ms  2=16ms  …  9=250ms  A=500ms  B=800ms  F=8s
 *   Decay/Release: 0=6ms  1=24ms 2=48ms  …  9=750ms  A=1.5s   B=2.4s   F=24s
 */
const INSTRUMENTS: Record<number, [number, number, number]> = {
  //                          firstwave       AD                  SR
  // ── Sirens ──
  [INST.SIREN]:            [PULSE_GATE,  adsr(0, 0),   adsr(15, 0)],   // Instant atk, full sustain
  [INST.SIREN_SAW]:        [SAW_GATE,    adsr(0, 0),   adsr(15, 0)],   // Saw siren — buzzy, aggressive
  [INST.SIREN_TRI]:        [TRI_GATE,    adsr(0, 0),   adsr(15, 0)],   // Tri siren — mellow, flute-like
  [INST.SIREN_WARBLE]:     [PULSE_GATE,  adsr(0, 2),   adsr(12, 0)],   // Rapid re-trigger feel (16ms decay, S=12)
  // ── One-shots ──
  [INST.PING]:             [TRI_GATE,    adsr(0, 9),   adsr(0, 0)],    // 750ms decay — sonar ping
  [INST.SNARE]:            [NOISE_GATE,  adsr(0, 5),   adsr(0, 0)],    // 168ms decay — snare crack
  [INST.SUB_SWELL]:        [TRI_GATE,    adsr(9, 0),   adsr(15, 6)],   // 250ms atk, 204ms release — slow swell
  [INST.RISER]:            [NOISE_GATE,  adsr(11, 0),  adsr(15, 9)],   // 800ms atk, 750ms release — noise riser
  [INST.LASER]:            [SAW_GATE,    adsr(0, 3),   adsr(0, 0)],    // 72ms decay — fast laser zap
  [INST.HIHAT]:            [NOISE_GATE,  adsr(0, 2),   adsr(0, 0)],    // 48ms decay — tight hi-hat
  [INST.CLAP]:             [NOISE_GATE,  adsr(0, 7),   adsr(0, 0)],    // 315ms decay — clap/rimshot
  [INST.BELL]:             [TRI_GATE,    adsr(0, 11),  adsr(0, 0)],    // 2.4s decay — metallic bell ring
  // ── Bass ──
  [INST.OSC_BASS]:         [SAW_GATE,    adsr(0, 0),   adsr(15, 0)],   // Full sustain — saw bass drone
  [INST.CRUSH_BASS]:       [PULSE_GATE,  adsr(0, 4),   adsr(10, 0)],   // 114ms decay, S=10 — gritty pulse bass
  [INST.SUB_BASS]:         [TRI_GATE,    adsr(0, 0),   adsr(15, 2)],   // Full sustain, 48ms release — pure sub
  [INST.STAB]:             [PULSE_GATE,  adsr(0, 6),   adsr(0, 0)],    // 204ms decay — short staccato stab
};

// ── Siren presets ─────────────────────────────────────────────────────────────
// Each preset defines: instrument, base note, sweep range, and sweep rate.
// Selected via setSirenPreset() — auto-dub and UI can cycle through these.

export interface SIDSirenPreset {
  id: string;
  name: string;
  inst: number;
  baseNote: number;   // MIDI-ish (0x60=low, 0x80=mid, 0xA0=high)
  range: number;      // Sweep range in semitones
  rateHz: number;     // Sweep speed
}

export const SID_SIREN_PRESETS: SIDSirenPreset[] = [
  { id: 'classic',    name: 'Classic Pulse',      inst: INST.SIREN,        baseNote: 0x80, range: 24, rateHz: 1.2 },
  { id: 'saw-buzz',   name: 'Saw Buzz',           inst: INST.SIREN_SAW,    baseNote: 0x78, range: 20, rateHz: 1.5 },
  { id: 'mellow-tri', name: 'Mellow Triangle',    inst: INST.SIREN_TRI,    baseNote: 0x88, range: 30, rateHz: 0.8 },
  { id: 'fast-warble',name: 'Fast Warble',        inst: INST.SIREN_WARBLE, baseNote: 0x80, range: 16, rateHz: 3.0 },
  { id: 'deep-pulse', name: 'Deep Pulse',         inst: INST.SIREN,        baseNote: 0x68, range: 12, rateHz: 0.6 },
  { id: 'screamer',   name: 'Screamer',           inst: INST.SIREN_SAW,    baseNote: 0x90, range: 36, rateHz: 2.5 },
  { id: 'slow-tri',   name: 'Slow Triangle Sweep',inst: INST.SIREN_TRI,    baseNote: 0x70, range: 40, rateHz: 0.3 },
  { id: 'stutter',    name: 'Stutter Pulse',      inst: INST.SIREN_WARBLE, baseNote: 0x88, range: 8,  rateHz: 6.0 },
];

export class SIDDubSynths {
  private engine: GTUltraEngine | null = null;
  private _readyResolve!: () => void;
  private _ready: Promise<void>;
  private _initStarted = false;
  private _disposed = false;
  private _sirenInterval: ReturnType<typeof setInterval> | null = null;
  private _sirenPhase = 0;
  private _sirenPreset: SIDSirenPreset = SID_SIREN_PRESETS[0];
  /** Exposed so DubBus can connect to its input. */
  private _outputGain: GainNode | null = null;

  constructor() {
    this._ready = new Promise(resolve => { this._readyResolve = resolve; });
  }

  /** The GainNode to connect to DubBus.input. Available after init(). */
  get output(): GainNode | null {
    return this._outputGain;
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  get isReady(): boolean {
    return this.engine !== null && this._outputGain !== null;
  }

  /**
   * Lazy-load the GTUltra WASM engine. Safe to call multiple times —
   * subsequent calls return the same ready promise.
   */
  async init(audioCtx: AudioContext): Promise<void> {
    if (this._initStarted) return this._ready;
    this._initStarted = true;

    try {
      // Create a gain node to tap the engine output before it reaches DubBus
      this._outputGain = audioCtx.createGain();
      this._outputGain.gain.value = 0.7; // SID is hot — pull back slightly

      this.engine = new GTUltraEngine(audioCtx, {
        onReady: () => {
          this._setupInstruments();
          this._readyResolve();
        },
        onError: (err: string) => {
          console.error('[SIDDubSynths] GTUltra init failed:', err);
        },
      });

      await this.engine.init(0); // 6581 model — the classic

      // Route engine output through our gain node
      this.engine.output.connect(this._outputGain);

      return this._ready;
    } catch (err) {
      console.error('[SIDDubSynths] init error:', err);
      this._readyResolve(); // Unblock waiters even on failure
    }
  }

  /** Program all instrument slots with dub effect patches. */
  private _setupInstruments(): void {
    const e = this.engine;
    if (!e) return;

    // Set up pulse table entries (required for pulse-wave instruments).
    // Without these, pulse width = 0 → pulse wave output is always silent.
    //
    // Wide pulse (50% duty = symmetric square): row 0-1, ptr 1
    e.setTableEntry(PTBL, 0, PTBL_WIDE_ROW, 0x88);     // left: set cmd, hi nibble 8 → 0x800
    e.setTableEntry(PTBL, 1, PTBL_WIDE_ROW, 0x00);     // right: lo byte 0x00
    e.setTableEntry(PTBL, 0, PTBL_WIDE_ROW + 1, 0xFF); // left: jump/stop
    e.setTableEntry(PTBL, 1, PTBL_WIDE_ROW + 1, 0x00); // right: target 0 = stop
    //
    // Narrow pulse (12.5% duty = buzzy/gritty): row 2-3, ptr 3
    e.setTableEntry(PTBL, 0, PTBL_NARROW_ROW, 0x82);     // left: set cmd, hi nibble 2 → 0x200
    e.setTableEntry(PTBL, 1, PTBL_NARROW_ROW, 0x00);     // right: lo byte 0x00
    e.setTableEntry(PTBL, 0, PTBL_NARROW_ROW + 1, 0xFF); // left: jump/stop
    e.setTableEntry(PTBL, 1, PTBL_NARROW_ROW + 1, 0x00); // right: target 0 = stop

    // Instruments that use pulse waveform need a pulse table pointer
    const pulseInstruments: Record<number, number> = {
      [INST.SIREN]:        PTBL_WIDE_ROW + 1,   // ptr 1 → wide 50%
      [INST.SIREN_WARBLE]: PTBL_WIDE_ROW + 1,   // ptr 1 → wide 50%
      [INST.CRUSH_BASS]:   PTBL_NARROW_ROW + 1,  // ptr 3 → narrow 12.5%
      [INST.STAB]:         PTBL_WIDE_ROW + 1,   // ptr 1 → wide 50%
    };

    for (const [idx, [firstwave, ad, sr]] of Object.entries(INSTRUMENTS)) {
      const i = Number(idx);
      e.setInstrumentFirstwave(i, firstwave);
      e.setInstrumentAD(i, ad);
      e.setInstrumentSR(i, sr);
      e.setInstrumentTablePtr(i, 0, 0); // wave table — no modulation
      e.setInstrumentTablePtr(i, 1, pulseInstruments[i] ?? 0); // pulse table
      e.setInstrumentTablePtr(i, 2, 0); // filter table
      e.setInstrumentTablePtr(i, 3, 0); // speed table
    }
  }

  // ── Siren preset selection ─────────────────────────────────────────
  /** Set the active siren preset by ID. */
  setSirenPreset(presetId: string): void {
    const preset = SID_SIREN_PRESETS.find(p => p.id === presetId);
    if (preset) this._sirenPreset = preset;
  }

  /** Get the current siren preset ID. */
  get sirenPresetId(): string {
    return this._sirenPreset.id;
  }

  /** Get all available siren presets. */
  static get sirenPresets(): readonly SIDSirenPreset[] {
    return SID_SIREN_PRESETS;
  }

  // ── Siren: Sweeping waveform ─────────────────────────────────────────
  /**
   * Start a dub siren using the active preset. The stepped frequency is
   * MORE authentic than a smooth sweep (real C64 demos sweep the frequency
   * register in discrete steps).
   *
   * @returns Dispose function that stops the siren.
   */
  startSiren(baseNote?: number, range?: number, rateHz?: number): () => void {
    const engine = this.engine;
    if (!engine) {
      return () => {};
    }

    const p = this._sirenPreset;
    const bn = baseNote ?? p.baseNote;
    const rn = range ?? p.range;
    const rate = rateHz ?? p.rateHz;
    const inst = p.inst;

    this._sirenPhase = 0;
    const step = (rate * 2 * Math.PI) / 20; // 20 Hz update → smooth-ish steps

    // playTestNote works even when no song is loaded (jamNoteOn doesn't)
    engine.playTestNote(CH_SIREN, bn, inst);

    this._sirenInterval = setInterval(() => {
      const offset = Math.sin(this._sirenPhase) * rn;
      const note = Math.round(bn + offset);
      const clamped = Math.max(0x60, Math.min(0xBC, note));
      engine.playTestNote(CH_SIREN, clamped, inst);
      this._sirenPhase += step;
    }, 50);

    return () => {
      if (this._sirenInterval) {
        clearInterval(this._sirenInterval);
        this._sirenInterval = null;
      }
      engine.releaseTestNote(CH_SIREN);
    };
  }

  // ── Sonar Ping: Short triangle burst ──────────────────────────────────
  firePing(note = 0x80, durationMs = 500): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, note, INST.PING);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Snare Crack: Noise burst ──────────────────────────────────────────
  fireSnare(durationMs = 200): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, 0x80, INST.SNARE);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Osc Bass: Sustaining sawtooth ─────────────────────────────────────
  startOscBass(note = 0x60): () => void {
    const engine = this.engine;
    if (!engine) return () => {};
    engine.playTestNote(CH_BASS, note, INST.OSC_BASS);
    return () => engine.releaseTestNote(CH_BASS);
  }

  // ── Crush Bass: Narrow pulse wave (gritty) ────────────────────────────
  startCrushBass(note = 0x60): () => void {
    const engine = this.engine;
    if (!engine) return () => {};
    engine.playTestNote(CH_BASS, note, INST.CRUSH_BASS);
    return () => engine.releaseTestNote(CH_BASS);
  }

  // ── Sub Swell: Slow triangle swell ────────────────────────────────────
  fireSubSwell(note = 0x60, durationMs = 2000): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, note, INST.SUB_SWELL);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Radio Riser: Noise with slow attack ───────────────────────────────
  fireRadioRiser(durationMs = 3000): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, 0x80, INST.RISER);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Laser Zap: Fast sawtooth burst ────────────────────────────────────
  fireLaser(note = 0xA0, durationMs = 150): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, note, INST.LASER);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Hi-Hat: Tight noise tick ──────────────────────────────────────────
  fireHiHat(durationMs = 80): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, 0x80, INST.HIHAT);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Clap: Medium noise burst ──────────────────────────────────────────
  fireClap(durationMs = 350): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, 0x80, INST.CLAP);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Bell: Long triangle ring ──────────────────────────────────────────
  fireBell(note = 0x90, durationMs = 2500): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, note, INST.BELL);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  // ── Sub Bass: Pure triangle sub ───────────────────────────────────────
  startSubBass(note = 0x60): () => void {
    const engine = this.engine;
    if (!engine) return () => {};
    engine.playTestNote(CH_BASS, note, INST.SUB_BASS);
    return () => engine.releaseTestNote(CH_BASS);
  }

  // ── Stab: Short pulse staccato ────────────────────────────────────────
  fireStab(note = 0x70, durationMs = 250): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_BASS, note, INST.STAB);
    setTimeout(() => engine.releaseTestNote(CH_BASS), durationMs);
  }

  /**
   * Short sub-blip on the one-shot channel for sub-harmonic boosting.
   * Uses SUB_BASS (instant-attack triangle, 48 ms release) on CH_ONESHOT
   * so it doesn't steal the CH_BASS voice from ongoing oscBass/crushBass
   * throws. Designed to be re-triggered rapidly (every kick).
   */
  fireSubBooster(note = 0x50, durationMs = 120): void {
    const engine = this.engine;
    if (!engine) return;
    engine.playTestNote(CH_ONESHOT, note, INST.SUB_BASS);
    setTimeout(() => engine.releaseTestNote(CH_ONESHOT), durationMs);
  }

  /**
   * Spring-slam excitation: two-voice SID impulse designed to hit a spring
   * tank. Fires a noise snare (the metallic shang) on CH_ONESHOT in
   * parallel with a pure-triangle sub blip on CH_BASS (the tank whump).
   * Used in SID mode to replace the WebAudio 55 Hz sine + bandpass-noise
   * tandem that gave the slam a modern flavor.
   */
  fireSlam(durationMs = 250): void {
    const engine = this.engine;
    if (!engine) return;
    // Metal shang: short noise burst on CH_ONESHOT
    engine.playTestNote(CH_ONESHOT, 0x80, INST.SNARE);
    // Tank whump: low triangle on CH_BASS (instant attack, full sustain)
    engine.playTestNote(CH_BASS, 0x48, INST.SUB_BASS);
    setTimeout(() => {
      engine.releaseTestNote(CH_ONESHOT);
      engine.releaseTestNote(CH_BASS);
    }, durationMs);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._sirenInterval) {
      clearInterval(this._sirenInterval);
      this._sirenInterval = null;
    }
    if (this._outputGain) {
      try { this._outputGain.disconnect(); } catch { /* ok */ }
    }
    if (this.engine) {
      try { this.engine.dispose(); } catch { /* ok */ }
      this.engine = null;
    }
  }
}
