/**
 * Klystrack factory instrument presets: the ONE bank.
 *
 * A preset is a whole instrument value (KlysNativeInstrument: envelope, waveform and filter bits, pulse width,
 * vibrato, PWM, FM block, buzz, ring modulation and the 32-step program). The editor's preset select is generated
 * from this list (KLYS_FACTORY_PRESETS, spread into FACTORY_PRESETS), and choosing one writes the whole instrument
 * through applyKlysPreset (klysInstrumentEdit.ts): store, engine and undo, the same path as a knob move.
 *
 * Timing notes (measured on the real engine, src/engine/__tests__/klystrackPresetBank.test.ts):
 *  - a program step runs every `progPeriod` song ticks (1 = every tick; 0 = the program does not run). One tick is
 *    1/rate seconds, so program timing follows the song's rate (about 18 ms at 55 Hz, 20 ms at the default 50 Hz);
 *  - envelope times grow with the square of the value: a decay or release of 8 falls 40 dB in about 0.2 s, 16 in 0.7 s,
 *    24 in 1.5 s; an attack of 8 reaches 70 % in 0.12 s, 16 in 0.5 s;
 *  - the note number is the engine's: 36 sounds 261.6 Hz, each 12 an octave;
 *  - a ring source of 255 is the voice's own channel (the voice modulates itself); synchronisation needs another
 *    channel playing, so the bank uses neither a fixed channel for sync nor for ring.
 *  - wavetable entries belong to the song, so no preset uses them.
 */
import type { InstrumentPreset } from '@typedefs/instrument';
import type { KlysNativeInstrument } from '@/types/tracker';
import { klysStepWord } from '@/engine/klystrack/klysProgramCommands';
import { KLYS_EMPTY_STEP, KLYS_PROGRAM_LENGTH } from '@/engine/klystrack/klysInstrumentFields';

export type KlysPresetCategory =
  | 'Kick' | 'Snare' | 'Hi-Hat' | 'Clap' | 'Tom' | 'Percussion'
  | 'Sub Bass' | 'Pluck Bass' | 'Acid Bass' | 'Buzz Bass'
  | 'Pulse Lead' | 'Saw Lead' | 'FM Lead' | 'Vibrato Lead' | 'Buzz Lead'
  | 'Arpeggio' | 'Pad' | 'FM Bell' | 'Pluck' | 'Riser';

/** Whether the sound is a one-shot that must die away by itself, or one that holds while the note is held. */
export type KlysPresetShape = 'hit' | 'sustained';

export interface KlysPreset {
  name: string;
  category: KlysPresetCategory;
  shape: KlysPresetShape;
  /** The note the preset is designed to be played at (engine note numbers: 36 = 261.6 Hz). */
  note: number;
  instrument: KlysNativeInstrument;
}

// ---------------------------------------------------------------------------------------------------------------
// Vocabulary. Bit values are the table in klysInstrumentFields.ts (KLYS_FLAG_BITS).
// ---------------------------------------------------------------------------------------------------------------
const WAVE = { noise: 1, pulse: 2, triangle: 4, saw: 8, metallic: 128, ring: 256, filter: 512, fm: 32768 } as const;
const INST = { setPulseWidth: 16, setCutoff: 32, buzz: 64 } as const;
const LOW_PASS = 0, HIGH_PASS = 1, BAND_PASS = 2;

const S = klysStepWord;
const END = S('PrgEnd');

/** Program steps grouped by tick: every step of a tick but the last is chained, so the group runs in one tick. */
const ticks = (...groups: number[][]): number[] =>
  groups.flatMap((g) => g.map((w, i) => (i < g.length - 1 && (w & 0xF000) !== 0xF000 ? w | 0x8000 : w)));

/** A downward slide of `amount` portamento units (255 = about 4 semitones) in one tick. */
const slideDown = (amount: number): number[] => {
  const steps: number[] = [];
  for (let left = amount; left > 0; left -= 255) steps.push(S('PortDn', Math.min(255, left)));
  return steps;
};

interface Spec extends Partial<Omit<KlysNativeInstrument, 'adsr' | 'fm' | 'program' | 'name'>> {
  adsr?: Partial<KlysNativeInstrument['adsr']>;
  fm?: Partial<Omit<KlysNativeInstrument['fm'], 'adsr'>> & { adsr?: Partial<KlysNativeInstrument['fm']['adsr']> };
  program?: number[];
}

/** A full instrument: every member written, so a preset replaces whatever was in the slot. */
function instrumentOf(name: string, spec: Spec): KlysNativeInstrument {
  const { adsr, fm, program = [], ...rest } = spec;
  return {
    name,
    adsr: { a: 0, d: 0, s: 31, r: 6, ...adsr },
    flags: 0, cydflags: WAVE.pulse, baseNote: 60, finetune: 0, slideSpeed: 0, pw: 1024, volume: 128, progPeriod: 0,
    vibratoSpeed: 0, vibratoDepth: 0, pwmSpeed: 0, pwmDepth: 0, cutoff: 2047, resonance: 0, flttype: LOW_PASS,
    ymEnvShape: 0, buzzOffset: 0, fxBus: 0, vibShape: 0, vibDelay: 0, pwmShape: 0, lfsrType: 0, wavetableEntry: 0,
    ringMod: 0xFF, syncSource: 0xFF,
    ...rest,
    fm: {
      flags: 0, modulation: 0, feedback: 0, wave: 0, harmonic: 0x11, attackStart: 0,
      ...fm, adsr: { a: 0, d: 0, s: 0, r: 0, ...fm?.adsr },
    },
    program: [...program, ...new Array(Math.max(0, KLYS_PROGRAM_LENGTH - program.length)).fill(KLYS_EMPTY_STEP)],
  };
}

const bank: KlysPreset[] = [];
function add(category: KlysPresetCategory, shape: KlysPresetShape, name: string, note: number, spec: Spec): void {
  bank.push({ name, category, shape, note, instrument: instrumentOf(name, spec) });
}
const hit = (category: KlysPresetCategory, name: string, note: number, spec: Spec): void => add(category, 'hit', name, note, spec);
const held = (category: KlysPresetCategory, name: string, note: number, spec: Spec): void => add(category, 'sustained', name, note, spec);

// ---------------------------------------------------------------------------------------------------------------
// Kicks: a noise click on the first tick, then a triangle body whose pitch falls by portamento.
// ---------------------------------------------------------------------------------------------------------------
/**
 * A kick body: tick 0 is a noise click (the instrument's own waveform) while the pitch already falls; tick 1 switches to
 * the body waveform (and, if `closeCutoff` is given, closes the filter so only the low body is left); the slide amounts
 * (255 = about 4 semitones) are per tick. The cutoff step is the 8-bit Set Filter Cutoff (value x 8): the 12-bit fine
 * cutoff cannot be chained in the engine (bit 15 is read as part of its instruction), so it is not used.
 */
const kickBody = (body: number, slide: [number, number, number, number], closeCutoff?: number): number[] => ticks(
  slideDown(slide[0]),
  [S('Waveform', body), ...(closeCutoff === undefined ? [] : [S('Cutoff', closeCutoff)]), ...slideDown(slide[1])],
  slideDown(slide[2]),
  slideDown(slide[3]),
  [END],
);

hit('Kick', 'Deep Kick', 40, {
  cydflags: WAVE.noise, adsr: { d: 11, s: 0, r: 4 }, progPeriod: 1,
  program: kickBody(WAVE.triangle, [510, 510, 510, 460]),
});
hit('Kick', 'Punch Kick', 40, {
  cydflags: WAVE.noise | WAVE.filter, flags: INST.setCutoff | INST.setPulseWidth, cutoff: 2047, pw: 700,
  adsr: { d: 9, s: 0, r: 4 }, progPeriod: 1,
  program: kickBody(WAVE.pulse, [510, 450, 300, 490], 12),
});
hit('Kick', 'Long Sub Kick', 38, {
  cydflags: WAVE.noise, adsr: { d: 12, s: 0, r: 4 }, progPeriod: 1,
  program: kickBody(WAVE.triangle, [510, 450, 300, 710]),
});
hit('Kick', 'Hard Kick', 42, {
  cydflags: WAVE.noise | WAVE.filter, flags: INST.setCutoff, cutoff: 2047, resonance: 1,
  adsr: { d: 10, s: 0, r: 4 }, progPeriod: 1,
  program: kickBody(WAVE.saw, [510, 510, 510, 795], 22),
});
hit('Kick', 'Short Kick', 40, {
  cydflags: WAVE.noise, adsr: { d: 7, s: 0, r: 4 }, progPeriod: 1,
  program: kickBody(WAVE.triangle, [510, 510, 450, 505]),
});

// ---------------------------------------------------------------------------------------------------------------
// Snares: a short tone (triangle, 150-250 Hz) with a noise burst that outlasts it.
// ---------------------------------------------------------------------------------------------------------------
hit('Snare', 'Tight Snare', 33, {
  cydflags: WAVE.noise | WAVE.triangle, adsr: { d: 8, s: 0, r: 4 }, progPeriod: 1,
  program: ticks([S('Waveform', WAVE.noise | WAVE.triangle), ...slideDown(150)], [S('Waveform', WAVE.noise)], [END]),
});
hit('Snare', 'Fat Snare', 31, {
  cydflags: WAVE.noise | WAVE.triangle, adsr: { d: 10, s: 0, r: 4 }, progPeriod: 1,
  program: ticks([...slideDown(250)], [S('Waveform', WAVE.noise)], [END]),
});
hit('Snare', 'Electronic Snare', 33, {
  cydflags: WAVE.noise | WAVE.pulse, adsr: { d: 9, s: 0, r: 4 }, progPeriod: 1, pw: 300, flags: INST.setPulseWidth,
  program: ticks([...slideDown(200)], [S('Waveform', WAVE.noise | WAVE.pulse)], [S('Waveform', WAVE.noise)], [END]),
});
hit('Snare', 'Crisp Snare', 35, {
  cydflags: WAVE.noise | WAVE.triangle | WAVE.filter, flttype: HIGH_PASS, cutoff: 60, resonance: 0,
  flags: INST.setCutoff, adsr: { d: 7, s: 0, r: 4 }, volume: 200, progPeriod: 1,
  program: ticks([...slideDown(100)], [S('Waveform', WAVE.noise)], [END]),
});

// ---------------------------------------------------------------------------------------------------------------
// Hi-hats: metallic noise through a high-pass filter.
// ---------------------------------------------------------------------------------------------------------------
hit('Hi-Hat', 'Closed Hi-Hat', 60, {
  cydflags: WAVE.noise | WAVE.metallic | WAVE.filter, flttype: HIGH_PASS, cutoff: 1500, resonance: 1,
  flags: INST.setCutoff, adsr: { d: 5, s: 0, r: 2 }, volume: 255,
});
hit('Hi-Hat', 'Open Hi-Hat', 60, {
  cydflags: WAVE.noise | WAVE.metallic | WAVE.filter, flttype: HIGH_PASS, cutoff: 1400, resonance: 1,
  flags: INST.setCutoff, adsr: { d: 11, s: 0, r: 8 }, volume: 255,
});
hit('Hi-Hat', 'Pedal Hi-Hat', 60, {
  cydflags: WAVE.noise | WAVE.metallic | WAVE.filter, flttype: HIGH_PASS, cutoff: 1100, resonance: 0,
  flags: INST.setCutoff, adsr: { d: 4, s: 0, r: 3 }, volume: 220,
});

// ---------------------------------------------------------------------------------------------------------------
// Claps: bursts of band-passed noise, one per tick, the last one ringing.
// ---------------------------------------------------------------------------------------------------------------
hit('Clap', 'Hand Clap', 60, {
  cydflags: WAVE.noise | WAVE.filter, flttype: BAND_PASS, cutoff: 700, resonance: 1, flags: INST.setCutoff,
  adsr: { d: 9, s: 0, r: 4 }, progPeriod: 1,
  program: [S('Volume', 255), S('Volume', 30), S('Volume', 255), S('Volume', 30), S('Volume', 255), END],
});
hit('Clap', 'Wide Clap', 60, {
  cydflags: WAVE.noise | WAVE.filter, flttype: BAND_PASS, cutoff: 560, resonance: 0, flags: INST.setCutoff,
  adsr: { d: 12, s: 0, r: 6 }, progPeriod: 1,
  program: [S('Volume', 255), S('Volume', 40), S('Volume', 255), S('Volume', 40), S('Volume', 255), S('Volume', 60), S('Volume', 255), END],
});

// ---------------------------------------------------------------------------------------------------------------
// Toms: a tonal triangle body with a drop of about an octave.
// ---------------------------------------------------------------------------------------------------------------
const tomBody = (drop: number): number[] => ticks([S('Waveform', WAVE.noise | WAVE.triangle), ...slideDown(drop)], [S('Waveform', WAVE.triangle), ...slideDown(drop)], slideDown(drop / 2), [END]);
hit('Tom', 'Low Tom', 26, { cydflags: WAVE.triangle, adsr: { d: 14, s: 0, r: 4 }, progPeriod: 1, program: tomBody(120) });
hit('Tom', 'Mid Tom', 33, { cydflags: WAVE.triangle, adsr: { d: 13, s: 0, r: 4 }, progPeriod: 1, program: tomBody(100) });
hit('Tom', 'High Tom', 40, { cydflags: WAVE.triangle, adsr: { d: 12, s: 0, r: 4 }, progPeriod: 1, program: tomBody(80) });

// ---------------------------------------------------------------------------------------------------------------
// Percussion and noise effects.
// ---------------------------------------------------------------------------------------------------------------
hit('Percussion', 'Rim Shot', 60, {
  cydflags: WAVE.pulse, adsr: { d: 4, s: 0, r: 2 }, pw: 200, flags: INST.setPulseWidth, progPeriod: 1,
  program: ticks([S('Waveform', WAVE.noise | WAVE.pulse)], [S('Waveform', WAVE.pulse), ...slideDown(100)], [END]),
});
hit('Percussion', 'Cowbell', 56, {
  cydflags: WAVE.pulse | WAVE.ring, ringMod: 0xFF, adsr: { d: 9, s: 0, r: 6 }, pw: 300, flags: INST.setPulseWidth,
});
hit('Percussion', 'Crash Cymbal', 60, {
  cydflags: WAVE.noise | WAVE.metallic | WAVE.filter, flttype: HIGH_PASS, cutoff: 900, resonance: 2,
  flags: INST.setCutoff, adsr: { a: 1, d: 22, s: 0, r: 12 },
});
hit('Percussion', 'Laser Zap', 60, {
  cydflags: WAVE.pulse, adsr: { d: 12, s: 0, r: 4 }, pw: 1024, flags: INST.setPulseWidth, progPeriod: 1,
  program: ticks(slideDown(500), slideDown(500), slideDown(500), slideDown(500), slideDown(500), slideDown(500), [END]),
});
hit('Percussion', 'Wood Block', 64, {
  cydflags: WAVE.triangle, adsr: { d: 5, s: 0, r: 3 }, progPeriod: 1,
  program: ticks(slideDown(60), slideDown(30), [END]),
});

// ---------------------------------------------------------------------------------------------------------------
// Basses.
// ---------------------------------------------------------------------------------------------------------------
held('Sub Bass', 'Sub Bass', 12, { cydflags: WAVE.triangle, adsr: { a: 0, d: 0, s: 31, r: 8 }, volume: 160 });
held('Sub Bass', 'Round Sub Bass', 12, {
  cydflags: WAVE.pulse | WAVE.filter, pw: 1024, flags: INST.setPulseWidth | INST.setCutoff, cutoff: 260, resonance: 1,
  adsr: { a: 0, d: 12, s: 22, r: 8 }, pwmSpeed: 6, pwmDepth: 30,
});
held('Pluck Bass', 'Saw Pluck Bass', 24, {
  cydflags: WAVE.saw | WAVE.filter, flags: INST.setCutoff, cutoff: 1500, resonance: 1, adsr: { a: 0, d: 14, s: 8, r: 6 },
  progPeriod: 1, program: [S('CutoffDn', 130), S('CutoffDn', 130), S('CutoffDn', 130), S('CutoffDn', 130), S('CutoffDn', 130), S('CutoffDn', 130), END],
});
held('Pluck Bass', 'Pulse Pluck Bass', 24, {
  cydflags: WAVE.pulse | WAVE.filter, pw: 600, flags: INST.setPulseWidth | INST.setCutoff, cutoff: 1100, resonance: 0,
  adsr: { a: 0, d: 10, s: 10, r: 5 }, pwmSpeed: 10, pwmDepth: 60,
  progPeriod: 1, program: [S('CutoffDn', 90), S('CutoffDn', 90), S('CutoffDn', 90), S('CutoffDn', 90), END],
});
held('Acid Bass', 'Acid Bass', 24, {
  cydflags: WAVE.saw | WAVE.filter, flags: INST.setCutoff, cutoff: 1900, resonance: 3, adsr: { a: 0, d: 10, s: 20, r: 5 },
  progPeriod: 1, program: ticks([S('CutoffDn', 255)], [S('CutoffDn', 200)], [S('CutoffDn', 150)], [S('CutoffDn', 100)], [S('CutoffDn', 50)], [END]),
});
held('Acid Bass', 'Squelch Bass', 24, {
  cydflags: WAVE.pulse | WAVE.filter, pw: 900, flags: INST.setPulseWidth | INST.setCutoff, cutoff: 200, resonance: 3, adsr: { a: 0, d: 12, s: 18, r: 5 },
  progPeriod: 1,
  program: ticks([S('CutoffUp', 120)], [S('CutoffUp', 120)], [S('CutoffUp', 120)], [S('CutoffUp', 120)], [S('CutoffDn', 120)], [S('CutoffDn', 120)], [S('CutoffDn', 120)], [S('CutoffDn', 120)], [S('Goto', 0)]),
});
held('Buzz Bass', 'Buzz Bass', 24, {
  cydflags: WAVE.pulse, flags: INST.buzz, ymEnvShape: 0, buzzOffset: -12 * 256, adsr: { a: 0, d: 0, s: 31, r: 6 },
});
held('Buzz Bass', 'Buzz Triangle Bass', 24, {
  cydflags: WAVE.triangle, flags: INST.buzz, ymEnvShape: 2, buzzOffset: -7 * 256, adsr: { a: 0, d: 0, s: 31, r: 6 },
});

// ---------------------------------------------------------------------------------------------------------------
// Leads.
// ---------------------------------------------------------------------------------------------------------------
held('Pulse Lead', 'Pulse Lead', 48, {
  cydflags: WAVE.pulse, pw: 1024, flags: INST.setPulseWidth, adsr: { a: 0, d: 8, s: 24, r: 8 },
  pwmSpeed: 12, pwmDepth: 70, vibratoSpeed: 36, vibratoDepth: 10, vibDelay: 20,
});
held('Pulse Lead', 'Thin Pulse Lead', 48, {
  cydflags: WAVE.pulse, pw: 380, flags: INST.setPulseWidth, adsr: { a: 0, d: 14, s: 12, r: 10 },
  pwmSpeed: 5, pwmDepth: 40, vibratoSpeed: 30, vibratoDepth: 8, vibDelay: 30,
});
held('Saw Lead', 'Saw Lead', 48, {
  cydflags: WAVE.saw | WAVE.filter, flags: INST.setCutoff, cutoff: 1400, resonance: 1, adsr: { a: 4, d: 10, s: 26, r: 10 },
  vibratoSpeed: 32, vibratoDepth: 12, vibDelay: 24,
});
held('Saw Lead', 'Bright Saw Lead', 48, {
  cydflags: WAVE.saw | WAVE.pulse, pw: 1500, flags: INST.setPulseWidth, adsr: { a: 0, d: 12, s: 22, r: 8 },
  vibratoSpeed: 40, vibratoDepth: 8, vibDelay: 16,
});
held('FM Lead', 'FM Lead', 48, {
  cydflags: WAVE.fm | WAVE.triangle, adsr: { a: 0, d: 8, s: 24, r: 8 },
  fm: { modulation: 60, feedback: 3, harmonic: 0x12, adsr: { a: 0, d: 14, s: 12, r: 6 } },
});
held('FM Lead', 'Metallic FM Lead', 48, {
  cydflags: WAVE.fm | WAVE.pulse, pw: 1024, flags: INST.setPulseWidth, adsr: { a: 0, d: 6, s: 24, r: 8 },
  fm: { modulation: 90, feedback: 5, harmonic: 0x13, adsr: { a: 0, d: 20, s: 20, r: 8 } },
});
held('Vibrato Lead', 'Vibrato Lead', 48, {
  cydflags: WAVE.triangle, adsr: { a: 5, d: 6, s: 26, r: 10 },
  vibratoSpeed: 48, vibratoDepth: 30, vibDelay: 40, vibShape: 0,
});
held('Vibrato Lead', 'Warbling Lead', 48, {
  cydflags: WAVE.triangle | WAVE.saw, adsr: { a: 3, d: 8, s: 28, r: 12 },
  vibratoSpeed: 70, vibratoDepth: 50, vibDelay: 60, vibShape: 0,
});
held('Buzz Lead', 'Buzz Lead', 48, {
  cydflags: WAVE.pulse, flags: INST.buzz, ymEnvShape: 1, buzzOffset: 12 * 256, adsr: { a: 0, d: 0, s: 31, r: 8 },
  vibratoSpeed: 36, vibratoDepth: 10, vibDelay: 30,
});

// ---------------------------------------------------------------------------------------------------------------
// Arpeggios: the program steps the pitch (one chord note per step, every `progPeriod` ticks).
// ---------------------------------------------------------------------------------------------------------------
const arpeggio = (...offsets: number[]): number[] => [...offsets.map((o) => S('Arp', o)), S('Goto', 0)];
held('Arpeggio', 'Minor Arpeggio', 48, {
  cydflags: WAVE.pulse, pw: 500, flags: INST.setPulseWidth, adsr: { a: 0, d: 16, s: 12, r: 6 }, progPeriod: 1,
  program: arpeggio(0, 3, 7, 12, 7, 3),
});
held('Arpeggio', 'Major Arpeggio', 48, {
  cydflags: WAVE.pulse, pw: 260, flags: INST.setPulseWidth, adsr: { a: 0, d: 6, s: 8, r: 4 }, progPeriod: 2,
  program: arpeggio(0, 4, 7, 12),
});
held('Arpeggio', 'Fast Triangle Arpeggio', 48, {
  cydflags: WAVE.triangle, adsr: { a: 0, d: 0, s: 28, r: 6 }, progPeriod: 1,
  program: arpeggio(0, 7, 12, 16, 19, 16, 12, 7),
});

// ---------------------------------------------------------------------------------------------------------------
// Pads: slow attack, pulse-width movement and slow vibrato.
// ---------------------------------------------------------------------------------------------------------------
held('Pad', 'Warm Pad', 36, {
  cydflags: WAVE.pulse | WAVE.filter, pw: 1024, flags: INST.setPulseWidth | INST.setCutoff, cutoff: 700, resonance: 0,
  adsr: { a: 16, d: 12, s: 26, r: 20 }, pwmSpeed: 4, pwmDepth: 90, vibratoSpeed: 20, vibratoDepth: 6, vibDelay: 50,
});
held('Pad', 'Wide Saw Pad', 36, {
  cydflags: WAVE.saw | WAVE.pulse | WAVE.filter, pw: 1700, flags: INST.setPulseWidth | INST.setCutoff, cutoff: 900, resonance: 1,
  adsr: { a: 18, d: 10, s: 24, r: 22 }, pwmSpeed: 3, pwmDepth: 120, pwmShape: 1,
});
held('Pad', 'Ringing Pad', 36, {
  cydflags: WAVE.triangle | WAVE.ring, ringMod: 0xFF, adsr: { a: 14, d: 10, s: 22, r: 20 },
  vibratoSpeed: 18, vibratoDepth: 10, vibDelay: 40,
});

// ---------------------------------------------------------------------------------------------------------------
// FM bells: a decaying modulator on top of a plain carrier.
// ---------------------------------------------------------------------------------------------------------------
hit('FM Bell', 'Glass Bell', 60, {
  cydflags: WAVE.fm | WAVE.triangle, adsr: { d: 22, s: 0, r: 10 },
  fm: { modulation: 70, feedback: 0, harmonic: 0x15, adsr: { a: 0, d: 14, s: 0, r: 8 } },
});
hit('FM Bell', 'Tubular Bell', 52, {
  cydflags: WAVE.fm | WAVE.triangle, adsr: { d: 22, s: 0, r: 12 },
  fm: { modulation: 100, feedback: 0, harmonic: 0x17, adsr: { a: 0, d: 20, s: 0, r: 10 } },
});
hit('FM Bell', 'Chime', 64, {
  cydflags: WAVE.fm | WAVE.triangle, adsr: { d: 18, s: 0, r: 8 },
  fm: { modulation: 50, feedback: 2, harmonic: 0x1A, adsr: { a: 0, d: 10, s: 0, r: 6 } },
});

// ---------------------------------------------------------------------------------------------------------------
// Plucks and stabs.
// ---------------------------------------------------------------------------------------------------------------
hit('Pluck', 'Pulse Pluck', 48, {
  cydflags: WAVE.pulse | WAVE.filter, pw: 700, flags: INST.setPulseWidth | INST.setCutoff, cutoff: 1800, resonance: 1,
  adsr: { d: 15, s: 0, r: 6 }, progPeriod: 1, program: [S('CutoffDn', 140), S('CutoffDn', 140), S('CutoffDn', 140), S('CutoffDn', 140), END],
});
hit('Pluck', 'Chord Stab', 43, {
  cydflags: WAVE.saw | WAVE.filter, flags: INST.setCutoff, cutoff: 1000, resonance: 2, adsr: { d: 6, s: 0, r: 5 },
  progPeriod: 1, program: [S('Arp', 0), S('Arp', 4), S('Arp', 7), S('Arp', 12), S('Arp', 0), END],
});

// ---------------------------------------------------------------------------------------------------------------
// Risers and sweeps.
// ---------------------------------------------------------------------------------------------------------------
held('Riser', 'Noise Riser', 48, {
  cydflags: WAVE.noise | WAVE.filter, flttype: LOW_PASS, cutoff: 80, resonance: 2, flags: INST.setCutoff,
  adsr: { a: 24, d: 0, s: 31, r: 12 }, progPeriod: 1,
  program: [S('CutoffUp', 60), S('Goto', 0)],
});
held('Riser', 'Rising Siren', 36, {
  cydflags: WAVE.pulse, pw: 1024, flags: INST.setPulseWidth, adsr: { a: 12, d: 0, s: 31, r: 10 }, progPeriod: 1,
  program: [S('PortUp', 30), S('Goto', 0)],
});

export const KLYS_PRESETS: readonly KlysPreset[] = bank;

/** The bank in the shape the editor's preset select lists (FACTORY_PRESETS): the instrument itself rides along. */
export const KLYS_FACTORY_PRESETS: InstrumentPreset['config'][] = KLYS_PRESETS.map((p) => ({
  type: 'synth' as const,
  name: p.name,
  synthType: 'KlysSynth' as const,
  klysPresetId: klysPresetId(p),
  volume: -8,
  pan: 0,
  effects: [],
}));

/** A preset's stable id: category and name. */
export function klysPresetId(p: Pick<KlysPreset, 'category' | 'name'>): string {
  return `${p.category}/${p.name}`;
}

export function klysPresetById(id: string): KlysPreset | undefined {
  return KLYS_PRESETS.find((p) => klysPresetId(p) === id);
}
