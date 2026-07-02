/**
 * cinter4Params.ts — Cinter 4 instrument parameter model (single source of truth)
 *
 * A Cinter instrument is described by 12 user parameters. The same 12 values are
 * encoded three ways, and this module is the canonical converter between them:
 *
 *   1. User parameters     — small integers the instrument editor edits.
 *                            params 0-7 ∈ [0,100], params 8-11 ∈ [0,10].
 *   2. Sample-name string  — how ProTracker carries the params to CinterConvert:
 *                            "1" + eight 2-digit fields + four 1-digit fields
 *                            (value 100 → "XX", value 10 → "X").
 *   3. Binary synth words  — the 9 words stored per generated instrument in the
 *                            .cinter4 songdata (and consumed by the Amiga player):
 *                            mpitch, mod, bpitch, attack, dist, decay,
 *                            mpitchdecay, moddecay, bpitchdecay.
 *
 * Every transform here is a 1:1 port of the authoritative reference
 * (askeksa/Cinter: cinter/src/engine.rs and convert/CinterConvert.py). The
 * forward (param → word) transforms MUST stay byte-exact so DEViLBOX exports
 * regenerate identical samples on the Amiga at runtime.
 *
 * Reference: cinter/src/engine.rs (pitchfun/decayfun/envfun, get_parameter_*),
 *            convert/CinterConvert.py (pitchconv/decaycurve, inst_data packing).
 */

export const CINTER4_PARAM_COUNT = 12;

/** Parameter index → name (matches engine.rs get_parameter_name). */
export const CINTER4_PARAM_NAMES = [
  'attack', 'decay', 'mpitch', 'mpitchdecay', 'bpitch', 'bpitchdecay',
  'mod', 'moddecay', 'mdist', 'bdist', 'vpower', 'fdist',
] as const;

export type Cinter4ParamName = typeof CINTER4_PARAM_NAMES[number];

/** Inclusive maximum integer value per parameter (0-7 → 100, 8-11 → 10). */
export const cinter4ParamMax = (index: number): number => (index < 8 ? 100 : 10);

/** The 9 synth words stored per generated instrument (excludes length/replength). */
export interface Cinter4SynthWords {
  mpitch: number;
  mod: number;
  bpitch: number;
  attack: number;
  dist: number;
  decay: number;
  mpitchdecay: number;
  moddecay: number;
  bpitchdecay: number;
}

// ── Forward transforms (user param int → synth value) ────────────────────────
// Direct ports of engine.rs. All inputs are the integer display value.

/** envfun(p) = 10000 / (1 + p²) — integer division, used by attack & decay. */
export const cinter4EnvFun = (p: number): number => Math.floor(10000 / (1 + p * p));

/**
 * Cinter version of an instrument. The pitch and pitch/mod-decay curves differ
 * between versions; attack/decay (envfun), mod and dist are version-independent.
 * The version is carried by the MOD sample name (first char digit → 4, else 3)
 * and is NOT recoverable from the .cinter4 songdata alone.
 */
export type Cinter4Version = 3 | 4;

/** pitchfun (v4): 0→0; p<5→8<<p; else round(256·2^((p−5)/12)).  v3: p·512. */
export const cinter4PitchFun = (p: number, version: Cinter4Version = 4): number => {
  if (version === 3) return p * 512;
  if (p === 0) return 0;
  if (p < 5) return 8 << p;
  return Math.round(256 * Math.pow(2, (p - 5) / 12));
};

/**
 * decayfun (v4): v=p/50−1; round(exp(0.0008·v + 0.1·v⁷)·65536) & 0xFFFF.
 * v3: round(exp(−0.000002·p²)·65536) & 0xFFFF (falloff only, no growth).
 */
export const cinter4DecayFun = (p: number, version: Cinter4Version = 4): number => {
  // v3 truncates (floor, no +0.5); v4 rounds. Matches CinterConvert.py decaycurve.
  if (version === 3) return Math.floor(Math.exp(-0.000002 * p * p) * 65536) & 0xffff;
  const v = p / 50 - 1;
  return Math.round(Math.exp(0.0008 * v + 0.1 * Math.pow(v, 7)) * 65536) & 0xffff;
};

/**
 * Encode the 12 user parameters into the 9 stored synth words.
 * Mirrors CinterConvert.py inst_data packing exactly.
 */
export function cinter4ParamsToWords(params: readonly number[], version: Cinter4Version = 4): Cinter4SynthWords {
  const p = params;
  return {
    attack:      (65536 - cinter4EnvFun(p[0])) & 0xffff,
    decay:       cinter4EnvFun(p[1]) & 0xffff,
    mpitch:      cinter4PitchFun(p[2], version),
    mpitchdecay: cinter4DecayFun(p[3], version),
    bpitch:      cinter4PitchFun(p[4], version),
    bpitchdecay: cinter4DecayFun(p[5], version),
    mod:         p[6] & 0xffff,
    moddecay:    cinter4DecayFun(p[7], version),
    dist:        ((p[8] << 12) | (p[9] << 8) | (p[10] << 4) | p[11]) & 0xffff,
  };
}

// ── Inverse transforms (synth word → user param int) ─────────────────────────
// The forward transforms are monotonic over the small integer domains, so an
// exact inverse is found by scanning the domain (and falling back to the closest
// match for hand-authored / out-of-spec words). This guarantees that words
// produced by the reference converter round-trip to their exact source params.

const invertByScan = (target: number, max: number, fwd: (p: number) => number): number => {
  let best = 0;
  let bestErr = Infinity;
  for (let p = 0; p <= max; p++) {
    const v = fwd(p);
    if (v === target) return p;
    const err = Math.abs(v - target);
    if (err < bestErr) { bestErr = err; best = p; }
  }
  return best;
};

/**
 * Decode the 9 stored synth words back into the 12 user parameters.
 * Used on import so the instrument editor can present Cinter-level values.
 * `version` must match how the instrument was authored (from the MOD sample
 * name) — the songdata alone cannot disambiguate v3 from v4.
 */
export function cinter4WordsToParams(w: Cinter4SynthWords, version: Cinter4Version = 4): number[] {
  const pitch = (t: number) => invertByScan(t, 100, (p) => cinter4PitchFun(p, version));
  const decay = (t: number) => invertByScan(t, 100, (p) => cinter4DecayFun(p, version));
  const params = new Array<number>(CINTER4_PARAM_COUNT).fill(0);
  params[0]  = invertByScan((65536 - w.attack) & 0xffff, 100, cinter4EnvFun);
  params[1]  = invertByScan(w.decay & 0xffff, 100, cinter4EnvFun);
  params[2]  = pitch(w.mpitch);
  params[3]  = decay(w.mpitchdecay);
  params[4]  = pitch(w.bpitch);
  params[5]  = decay(w.bpitchdecay);
  params[6]  = Math.min(100, w.mod & 0xffff);
  params[7]  = decay(w.moddecay);
  params[8]  = (w.dist >> 12) & 0xf;
  params[9]  = (w.dist >> 8) & 0xf;
  params[10] = (w.dist >> 4) & 0xf;
  params[11] = w.dist & 0xf;
  return params;
}

/**
 * Detect whether stored words were produced by the v3 or v4 pitch/decay curves.
 * Heuristic: v3 pitches are exact multiples of 512 and v3 cannot represent the
 * 8/16/32/64 low-pitch steps; we pick the version whose forward transforms
 * reproduce the pitch words exactly. Defaults to 4 when ambiguous. The MOD
 * sample name is authoritative when available — use it instead of this.
 */
export function cinter4DetectVersion(w: Cinter4SynthWords): Cinter4Version {
  // Detect by PITCH only: pitch transforms are exact integer ops (no FP/rounding
  // noise), unlike the decay curves whose stored values can be ±1-2 off in files
  // produced by older converter releases. A pitch word reproduces exactly under
  // exactly one version unless it lands on a value both can hit (then v4 wins).
  const pitchExact = (version: Cinter4Version): boolean => {
    const re = cinter4ParamsToWords(cinter4WordsToParams(w, version), version);
    return re.mpitch === w.mpitch && re.bpitch === w.bpitch;
  };
  if (pitchExact(4)) return 4;
  if (pitchExact(3)) return 3;
  return 4;
}

// ── Sample-name encoding ─────────────────────────────────────────────────────
// "1" + eight 2-digit fields (value 100 → "XX") + four 1-digit fields (10 → "X").
// Total length 21 (FILENAME_LENGTH). The leading "1" marks a Cinter 4 instrument.

export const CINTER4_FILENAME_LENGTH = 21;

export function cinter4ParamsToSampleName(params: readonly number[]): string {
  let name = '1';
  for (let i = 0; i < CINTER4_PARAM_COUNT; i++) {
    if (i < 8) {
      const v = params[i];
      name += v === 100 ? 'XX' : v.toString().padStart(2, '0');
    } else {
      const v = params[i];
      name += v === 10 ? 'X' : v.toString();
    }
  }
  return name;
}

/**
 * Parse the 12 params from a Cinter 4 sample name. Returns null if the name is
 * not a valid Cinter 4 parameter string (does not start with "1", too short,
 * or contains non-digit/non-X fields). Cinter 3 (legacy) names are not handled
 * here — they require the convert3to4 remap and are out of scope for export.
 */
export function cinter4SampleNameToParams(name: string): number[] | null {
  if (!name.startsWith('1')) return null;
  const params = new Array<number>(CINTER4_PARAM_COUNT).fill(0);
  for (let i = 0; i < CINTER4_PARAM_COUNT; i++) {
    if (i < 8) {
      const field = name.slice(i * 2 + 1, i * 2 + 3);
      if (field.length < 2) return null;
      const d1 = field[0];
      const d2 = field[1];
      if (d1.toUpperCase() === 'X') params[i] = 100;
      else if (d2.toUpperCase() === 'X') {
        if (!/[0-9]/.test(d1)) return null;
        params[i] = parseInt(d1, 10) * 10;
      } else {
        if (!/^[0-9]{2}$/.test(field)) return null;
        params[i] = parseInt(field, 10);
      }
    } else {
      const field = name.slice(i + 9, i + 10);
      if (field.length < 1) return null;
      if (field.toUpperCase() === 'X') params[i] = 10;
      else if (/[0-9]/.test(field)) params[i] = parseInt(field, 10);
      else return null;
    }
  }
  return params;
}

/**
 * Parse the params from ANY Cinter sample name (v3 or v4), as CinterConvert does.
 *
 * The 22-char ProTracker sample name carries the 12 params in positions 1-20; the
 * FIRST character is only a label (the Cinter GUI writes "1" for v4, a letter for
 * v3) and determines the version: digit → 4, anything else → 3. Returns null when
 * the name is not a valid Cinter parameter string — which is how a Cinter
 * instrument is told apart from an ordinary sample whose name is free text.
 */
export function cinter4ParseSampleName(name: string): { params: number[]; version: Cinter4Version } | null {
  if (name.length < 21) return null;
  const version: Cinter4Version = /[0-9]/.test(name[0]) ? 4 : 3;
  const params = new Array<number>(CINTER4_PARAM_COUNT).fill(0);
  for (let i = 0; i < CINTER4_PARAM_COUNT; i++) {
    if (i < 8) {
      const field = name.slice(i * 2 + 1, i * 2 + 3);
      if (field.length < 2) return null;
      const d1 = field[0], d2 = field[1];
      if (d1.toUpperCase() === 'X' && d2.toUpperCase() === 'X') params[i] = 100;
      else if (d2.toUpperCase() === 'X') { if (!/[0-9]/.test(d1)) return null; params[i] = parseInt(d1, 10) * 10; }
      else { if (!/^[0-9]{2}$/.test(field)) return null; params[i] = parseInt(field, 10); }
    } else {
      const c = name[i + 9];
      if (c === undefined) return null;
      if (c.toUpperCase() === 'X') params[i] = 10;
      else if (/[0-9]/.test(c)) params[i] = parseInt(c, 10);
      else return null;
    }
  }
  return { params, version };
}

// ── Editor display text (matches engine.rs get_parameter_text_and_label) ──────

export interface Cinter4ParamDisplay { value: string; label: string }

/** Human-readable value + unit label for a parameter, for the instrument editor. */
export function cinter4ParamDisplay(index: number, p: number): Cinter4ParamDisplay {
  switch (index) {
    case 0:
    case 1: {
      const f = cinter4EnvFun(p);
      return f === 0
        ? { value: 'infinite', label: '' }
        : { value: String(Math.floor(32767 / f) + 1), label: 'samples' };
    }
    case 2:
    case 4: {
      if (p === 0) return { value: 'none', label: '' };
      const st = p - 5;
      if (st < 0) return { value: `${st} oct`, label: '' };
      if (st % 12 === 0) return { value: `${st / 12} oct`, label: '' };
      return { value: `${Math.floor(st / 12)} oct ${st % 12}`, label: 'st' };
    }
    case 6:
      return { value: String(p), label: '' };
    case 3:
    case 5:
    case 7:
      return { value: (cinter4DecayFun(p) / 65536).toFixed(5), label: '' };
    case 8:
    case 9:
    case 11:
      return { value: String(p), label: '' };
    case 10:
      return { value: String(p + 1), label: '' };
    default:
      return { value: '', label: '' };
  }
}
