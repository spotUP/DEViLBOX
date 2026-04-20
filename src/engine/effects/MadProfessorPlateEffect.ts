import * as Tone from 'tone';
import { MVerbEffect } from './MVerbEffect';

/**
 * MadProfessorPlateEffect — MVerb plate reverb tuned to Mad Professor's
 * classic PCM-70 dub voicing. Not a new DSP — it composes the existing
 * MVerb plate with a pre-HPF (keeps low end out of the reverb to
 * preserve the bassline) and a post-LPF (tames the plate's silvery
 * shimmer, matching the rolled-off top of the Lexicon PCM-70).
 *
 * Chain: input → preHpf (@ 200 Hz) → MVerb → postLpf (@ 5 kHz) → output
 *
 * Defaults land Mad Professor's live-dub voicing:
 *  - long decay (0.85) — tails that breathe under a one-drop
 *  - high damping (0.75) — dark plate, "tube" feel
 *  - high density (0.8) — thick smearing of transients
 *  - ~45 ms predelay — separation between dry and wet so vocals stay
 *    intelligible and echoes don't mud into the source
 *  - low early-reflection mix — wash instead of discrete slaps
 *
 * A/B test against the DattorroPlate WASM for the "PCM-70" slot.
 */
export interface MadProfessorPlateOptions {
  decay?: number;       // 0-1 (maps to MVerb decay)
  damping?: number;     // 0-1
  density?: number;     // 0-1
  predelay?: number;    // 0-1
  size?: number;        // 0-1
  hpfHz?: number;       // pre-HPF cutoff (default 200)
  lpfHz?: number;       // post-LPF cutoff (default 5000)
  wet?: number;         // 0-1 (dry/wet mix — ToneAudioNode convention)
}

export class MadProfessorPlateEffect extends Tone.ToneAudioNode {
  readonly name = 'MadProfessorPlate';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private preHpf: Tone.Filter;
  private postLpf: Tone.Filter;
  private mverb: MVerbEffect;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private _options: Required<MadProfessorPlateOptions>;

  constructor(options: Partial<MadProfessorPlateOptions> = {}) {
    super();

    this._options = {
      decay: options.decay ?? 0.85,
      damping: options.damping ?? 0.75,
      density: options.density ?? 0.80,
      predelay: options.predelay ?? 0.18,  // ~45 ms on MVerb's predelay scale
      size: options.size ?? 0.70,
      hpfHz: options.hpfHz ?? 200,
      lpfHz: options.lpfHz ?? 5000,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Pre-HPF: keep sub-bass out of the reverb entirely. Classic dub trick
    // — the bassline should hit dry so it stays tight, while the echoes
    // and percussion get drenched.
    this.preHpf = new Tone.Filter({ type: 'highpass', frequency: this._options.hpfHz, rolloff: -24 });

    // Post-LPF: cut the plate's high-frequency shimmer. PCM-70 had a
    // warmer top end than most digital plates; a gentle 5 kHz rolloff
    // approximates that.
    this.postLpf = new Tone.Filter({ type: 'lowpass', frequency: this._options.lpfHz, rolloff: -12 });

    // MVerb core — fixed mix=1.0 / earlyMix low / bandwidth low for the
    // dark voicing; the user still controls decay / damping / density /
    // predelay / size.
    this.mverb = new MVerbEffect({
      damping: this._options.damping,
      density: this._options.density,
      decay: this._options.decay,
      predelay: this._options.predelay,
      size: this._options.size,
      bandwidth: 0.55,  // narrower internal tone — no need to expose
      gain: 1.0,
      mix: 1.0,
      earlyMix: 0.25,   // mostly late tail, no discrete slaps
      wet: 1.0,         // wet/dry happens at this wrapper's gains
    });

    // Dry path.
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: input → HPF → MVerb → LPF → wetGain → output.
    this.input.connect(this.preHpf);
    this.preHpf.connect(this.mverb);
    this.mverb.connect(this.postLpf);
    this.postLpf.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    const v = clamp01(value);
    this._options.wet = v;
    this.wetGain.gain.value = v;
    this.dryGain.gain.value = 1 - v;
  }

  setDecay(v: number)    { this._options.decay    = clamp01(v); this.mverb.setDecay(v); }
  setDamping(v: number)  { this._options.damping  = clamp01(v); this.mverb.setDamping(v); }
  setDensity(v: number)  { this._options.density  = clamp01(v); this.mverb.setDensity(v); }
  setPredelay(v: number) { this._options.predelay = clamp01(v); this.mverb.setPredelay(v); }
  setSize(v: number)     { this._options.size     = clamp01(v); this.mverb.setSize(v); }
  setHpfHz(hz: number)   { this._options.hpfHz = hz; this.preHpf.frequency.value = hz; }
  setLpfHz(hz: number)   { this._options.lpfHz = hz; this.postLpf.frequency.value = hz; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'decay':    this.setDecay(value); break;
      case 'damping':  this.setDamping(value); break;
      case 'density':  this.setDensity(value); break;
      case 'predelay': this.setPredelay(value); break;
      case 'size':     this.setSize(value); break;
      case 'hpfHz':    this.setHpfHz(value); break;
      case 'lpfHz':    this.setLpfHz(value); break;
      case 'wet':      this.wet = value; break;
    }
  }

  dispose(): this {
    this.mverb.dispose();
    this.preHpf.dispose();
    this.postLpf.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
