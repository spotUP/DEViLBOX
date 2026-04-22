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

// Instrument indices (1-based; index 0 is unused in GT)
const INST = {
  SIREN: 1,       // Pulse wave — police siren sweep
  PING: 2,        // Triangle — sharp sonar ping
  SNARE: 3,       // Noise — snare crack burst
  OSC_BASS: 4,    // Sawtooth — resonant bass drone
  CRUSH_BASS: 5,  // Pulse (narrow) — gritty bass
  SUB_SWELL: 6,   // Triangle — slow sub-bass swell
  RISER: 7,       // Noise — filter-sweep riser
} as const;

/**
 * Instrument definitions: [firstwave, AD, SR]
 *
 * SID ADSR timing reference:
 *   Attack:        0=2ms  1=8ms  2=16ms  …  9=250ms  A=500ms  B=800ms  F=8s
 *   Decay/Release: 0=6ms  1=24ms 2=48ms  …  9=750ms  A=1.5s   B=2.4s   F=24s
 */
const INSTRUMENTS: Record<number, [number, number, number]> = {
  //                   firstwave       AD                  SR
  [INST.SIREN]:      [PULSE_GATE,  adsr(0, 0),   adsr(15, 0)],   // Instant atk, full sustain
  [INST.PING]:       [TRI_GATE,    adsr(0, 9),   adsr(0, 0)],    // Instant atk, 750ms decay
  [INST.SNARE]:      [NOISE_GATE,  adsr(0, 5),   adsr(0, 0)],    // Instant atk, 168ms decay
  [INST.OSC_BASS]:   [SAW_GATE,    adsr(0, 0),   adsr(15, 0)],   // Instant atk, full sustain
  [INST.CRUSH_BASS]: [PULSE_GATE,  adsr(0, 4),   adsr(10, 0)],   // Instant atk, 114ms decay, medium sustain
  [INST.SUB_SWELL]:  [TRI_GATE,    adsr(9, 0),   adsr(15, 6)],   // 250ms atk, full sustain, 204ms release
  [INST.RISER]:      [NOISE_GATE,  adsr(11, 0),  adsr(15, 9)],   // 800ms atk, 750ms release
};

export class SIDDubSynths {
  private engine: GTUltraEngine | null = null;
  private _readyResolve!: () => void;
  private _ready: Promise<void>;
  private _initStarted = false;
  private _disposed = false;
  private _sirenInterval: ReturnType<typeof setInterval> | null = null;
  private _sirenPhase = 0;
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

    for (const [idx, [firstwave, ad, sr]] of Object.entries(INSTRUMENTS)) {
      const i = Number(idx);
      e.setInstrumentFirstwave(i, firstwave);
      e.setInstrumentAD(i, ad);
      e.setInstrumentSR(i, sr);
      // Table pointers stay at 0 (no wave/pulse/filter modulation tables).
      // This gives us raw static waveforms — perfectly authentic for dub FX.
      e.setInstrumentTablePtr(i, 0, 0); // wave table
      e.setInstrumentTablePtr(i, 1, 0); // pulse table
      e.setInstrumentTablePtr(i, 2, 0); // filter table
      e.setInstrumentTablePtr(i, 3, 0); // speed table
    }
  }

  // ── Siren: Sweeping pulse wave ────────────────────────────────────────
  /**
   * Start a classic dub siren — SID pulse wave sweeping through a note range.
   * The stepped frequency is MORE authentic than a smooth sweep (real C64
   * demos sweep the frequency register in discrete steps).
   *
   * @returns Dispose function that stops the siren.
   */
  startSiren(baseNote = 0x80, range = 24, rateHz = 1.2): () => void {
    const engine = this.engine;
    if (!engine) return () => {};

    this._sirenPhase = 0;
    const step = (rateHz * 2 * Math.PI) / 20; // 20 Hz update → smooth-ish steps

    // Trigger the first note immediately
    engine.jamNoteOn(CH_SIREN, baseNote, INST.SIREN);

    this._sirenInterval = setInterval(() => {
      const offset = Math.sin(this._sirenPhase) * range;
      const note = Math.round(baseNote + offset);
      const clamped = Math.max(0x60, Math.min(0xBC, note));
      engine.jamNoteOn(CH_SIREN, clamped, INST.SIREN);
      this._sirenPhase += step;
    }, 50);

    return () => {
      if (this._sirenInterval) {
        clearInterval(this._sirenInterval);
        this._sirenInterval = null;
      }
      engine.jamNoteOff(CH_SIREN);
    };
  }

  // ── Sonar Ping: Short triangle burst ──────────────────────────────────
  firePing(note = 0x80, durationMs = 500): void {
    const engine = this.engine;
    if (!engine) return;
    engine.jamNoteOn(CH_ONESHOT, note, INST.PING);
    setTimeout(() => engine.jamNoteOff(CH_ONESHOT), durationMs);
  }

  // ── Snare Crack: Noise burst ──────────────────────────────────────────
  fireSnare(durationMs = 200): void {
    const engine = this.engine;
    if (!engine) return;
    engine.jamNoteOn(CH_ONESHOT, 0x80, INST.SNARE);
    setTimeout(() => engine.jamNoteOff(CH_ONESHOT), durationMs);
  }

  // ── Osc Bass: Sustaining sawtooth ─────────────────────────────────────
  startOscBass(note = 0x60): () => void {
    const engine = this.engine;
    if (!engine) return () => {};
    engine.jamNoteOn(CH_BASS, note, INST.OSC_BASS);
    return () => engine.jamNoteOff(CH_BASS);
  }

  // ── Crush Bass: Narrow pulse wave (gritty) ────────────────────────────
  startCrushBass(note = 0x60): () => void {
    const engine = this.engine;
    if (!engine) return () => {};
    engine.jamNoteOn(CH_BASS, note, INST.CRUSH_BASS);
    return () => engine.jamNoteOff(CH_BASS);
  }

  // ── Sub Swell: Slow triangle swell ────────────────────────────────────
  fireSubSwell(note = 0x60, durationMs = 2000): void {
    const engine = this.engine;
    if (!engine) return;
    engine.jamNoteOn(CH_ONESHOT, note, INST.SUB_SWELL);
    setTimeout(() => engine.jamNoteOff(CH_ONESHOT), durationMs);
  }

  // ── Radio Riser: Noise with slow attack ───────────────────────────────
  fireRadioRiser(durationMs = 3000): void {
    const engine = this.engine;
    if (!engine) return;
    engine.jamNoteOn(CH_ONESHOT, 0x80, INST.RISER);
    setTimeout(() => engine.jamNoteOff(CH_ONESHOT), durationMs);
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
