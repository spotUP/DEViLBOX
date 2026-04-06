/**
 * AutoTuneEffect — Real-time pitch correction effect.
 *
 * Pipeline:
 *   input ──┬─→ Tone.PitchShift ─→ wetGain ─→ output
 *           └─→ AutoTune.worklet (analysis tap, audio passthrough)
 *                     │
 *                     └─ port.message → main thread → updates PitchShift.pitch
 *
 * The worklet runs YIN pitch detection in real-time and posts the detected
 * Hz back here. We compute the nearest scale degree, derive the correction
 * in semitones, and write it to Tone.PitchShift's pitch param. A smoothing
 * factor controls retune speed (higher = T-Pain robotic snap, lower =
 * gentle correction).
 *
 * Parameters:
 *   - key       0..11 (C..B)
 *   - scale     'major' | 'minor' | 'chromatic' | 'pentatonic' | 'blues'
 *   - strength  0..1 (0 = no correction, 1 = full snap)
 *   - speed     0..1 (0 = slow drift, 1 = instant snap)
 *   - wet       0..1
 */

import * as Tone from 'tone';

export type AutoTuneScale = 'major' | 'minor' | 'chromatic' | 'pentatonic' | 'blues';

export interface AutoTuneEffectOptions {
  key?: number;            // 0=C, 1=C#, ..., 11=B
  scale?: AutoTuneScale;
  strength?: number;       // 0..1
  speed?: number;          // 0..1
  wet?: number;            // 0..1
}

const SCALES: Record<AutoTuneScale, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
};

/** Convert frequency to MIDI note number (float) */
function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/** Snap a MIDI note (float) to the nearest scale degree given key + scale */
function snapToScale(midi: number, key: number, scaleNotes: number[]): number {
  const octave = Math.floor(midi / 12);
  const noteInOctave = midi - octave * 12;
  const relative = ((noteInOctave - key) + 120) % 12;

  // Find nearest scale degree
  let best = scaleNotes[0];
  let bestDist = Infinity;
  for (const s of scaleNotes) {
    const candidates = [s, s + 12, s - 12];
    for (const c of candidates) {
      const d = Math.abs(c - relative);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
  }

  return octave * 12 + key + best;
}

export class AutoTuneEffect extends Tone.ToneAudioNode {
  readonly name = 'AutoTuneEffect';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private pitchShift: Tone.PitchShift;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Detection worklet (audio passthrough — only used as analysis tap)
  private detectorNode: AudioWorkletNode | null = null;

  // State
  private _options: Required<AutoTuneEffectOptions>;
  private currentCorrection = 0;   // semitones currently applied
  private targetCorrection = 0;    // smoothed toward
  private smoothTimer: ReturnType<typeof setInterval> | null = null;

  // Static worklet loading state
  private static loadedContexts = new WeakSet<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<AutoTuneEffectOptions> = {}) {
    super();

    this._options = {
      key: options.key ?? 0,
      scale: options.scale ?? 'major',
      strength: options.strength ?? 1.0,
      speed: options.speed ?? 0.7,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Pitch shift on the wet path
    this.pitchShift = new Tone.PitchShift({
      pitch: 0,
      windowSize: 0.05,
      delayTime: 0,
      feedback: 0,
    });

    // Wet path: input → pitchShift → wetGain → output
    this.input.connect(this.pitchShift);
    this.pitchShift.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Dry path: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Smoothing loop — runs at 60Hz, lerps currentCorrection toward targetCorrection
    this.smoothTimer = setInterval(() => this.tickSmooth(), 16);

    this.initWorklet().catch((err) => {
      console.warn('[AutoTuneEffect] worklet init failed:', err);
    });
  }

  // ── Parameter setters ──────────────────────────────────────────────────

  setKey(k: number): void {
    this._options.key = ((k % 12) + 12) % 12;
  }

  setScale(s: AutoTuneScale): void {
    this._options.scale = s;
  }

  setStrength(s: number): void {
    this._options.strength = Math.max(0, Math.min(1, s));
  }

  setSpeed(s: number): void {
    this._options.speed = Math.max(0, Math.min(1, s));
  }

  get wet(): number {
    return this._options.wet;
  }

  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  // ── Worklet init ───────────────────────────────────────────────────────

  private async initWorklet(): Promise<void> {
    const rawContext = Tone.getContext().rawContext as AudioContext;
    await AutoTuneEffect.ensureInitialized(rawContext);

    this.detectorNode = new AudioWorkletNode(rawContext, 'autotune-detector', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });

    this.detectorNode.port.onmessage = (e) => {
      if (e.data && e.data.type === 'pitch') {
        this.handleDetectedPitch(e.data.hz, e.data.clarity);
      }
    };

    // Tap: route a copy of the input audio into the detector
    // (the detector also passes audio through, but we discard its output —
    // only the port messages matter)
    const rawInput = (this.input as unknown as { _gainNode?: GainNode })._gainNode
      ?? (this.input as unknown as GainNode);
    try {
      (rawInput as GainNode).connect(this.detectorNode);
    } catch (err) {
      console.warn('[AutoTuneEffect] failed to tap input into detector:', err);
    }

    // Keepalive — ensure the detector worklet keeps processing
    const keepalive = rawContext.createGain();
    keepalive.gain.value = 0;
    this.detectorNode.connect(keepalive);
    keepalive.connect(rawContext.destination);
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (AutoTuneEffect.loadedContexts.has(context)) return;
    const existing = AutoTuneEffect.initPromises.get(context);
    if (existing) return existing;

    const p = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try {
        await context.audioWorklet.addModule(`${baseUrl}autotune/AutoTune.worklet.js?v=1`);
      } catch { /* may already be registered */ }
      AutoTuneEffect.loadedContexts.add(context);
    })();

    AutoTuneEffect.initPromises.set(context, p);
    return p;
  }

  // ── Detection & correction ────────────────────────────────────────────

  private handleDetectedPitch(hz: number, clarity: number): void {
    if (hz <= 0 || clarity < 0.6) {
      // No clear pitch — drift toward 0 correction
      this.targetCorrection = 0;
      return;
    }

    const detectedMidi = hzToMidi(hz);
    const snapped = snapToScale(
      detectedMidi,
      this._options.key,
      SCALES[this._options.scale],
    );
    const errorSemitones = snapped - detectedMidi;

    // strength scales how much of the error we apply
    this.targetCorrection = errorSemitones * this._options.strength;
  }

  /** Lerp currentCorrection toward targetCorrection at the configured speed */
  private tickSmooth(): void {
    // speed 0..1 → per-frame lerp factor 0.005..0.5 (exponential feel)
    const k = 0.005 + this._options.speed * this._options.speed * 0.495;
    this.currentCorrection += (this.targetCorrection - this.currentCorrection) * k;

    // Apply to PitchShift if it changed meaningfully
    if (Math.abs(this.pitchShift.pitch - this.currentCorrection) > 0.001) {
      this.pitchShift.pitch = this.currentCorrection;
    }
  }

  dispose(): this {
    if (this.smoothTimer) {
      clearInterval(this.smoothTimer);
      this.smoothTimer = null;
    }
    if (this.detectorNode) {
      try { this.detectorNode.port.postMessage({ type: 'dispose' }); } catch { /* ok */ }
      try { this.detectorNode.disconnect(); } catch { /* ok */ }
      this.detectorNode = null;
    }
    this.pitchShift.dispose();
    this.input.dispose();
    this.output.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    return super.dispose();
  }
}
