/**
 * What each master FX preset's description promises, as numbers.
 *
 * Owner, 2026-10-08, after the EQ3 gain fix: the presets "change audio but not
 * as their description says". The description in fxPresets.ts is the spec; each
 * claim in it is turned into a metric the offline rig (src/test/audio/
 * masterChainRig.ts) reads off the real chain, and a bound it must meet. The
 * same table is the research record (thoughts/shared/research/
 * 2026-10-08_master-preset-claims.md) and the test (masterPresetClaims.test.ts).
 *
 * Metrics (see the rig for how each is read):
 *   tilt(hz[,ref])  gain of a third-octave noise band at hz minus at ref (1 kHz), dB.
 *                   A tilt, not an absolute gain: a Web Audio compressor adds its own
 *                   automatic make-up, so absolute gains move with its threshold.
 *   thd(hz)         harmonics 2-6 of a -12 dBFS sine, dB under the fundamental
 *                   (-20 = heavily distorted, -60 = clean). Saturation, sparkle, grit.
 *   gr(hz,hi)       compression: a sine stepped -40 dBFS -> hi (default -10); the step
 *                   minus the rise of the output, dB. Gentle ~1-3, heavy 6+.
 *   crest           crest factor of the drum loop, chain minus no chain, dB (punch kept: near 0).
 *   bvr             gain of the loop below 150 Hz minus above 500 Hz, dB (bass lift).
 *   tail            ms until the last 10 ms frame within 40 dB of a noise burst (reverb/echo length).
 *   tailLevel       energy 200 ms after the burst ends, dB under the burst (how much of it is still ringing).
 *   echo            loudest frame 300 ms - 1.5 s after the burst, dB under it (a repeat).
 *   shimmer         tail energy one octave above the source minus at the source, dB (> 0 ascends).
 *   clarity         the repeat over the median of the echo window, dB (a distinct echo, not a wash).
 *   am, fm          swing of the amplitude (dB) / of the instantaneous frequency (Hz) of a steady 1 kHz sine:
 *                   tremolo, wah, auto-filter, phaser, chorus, vibrato, wow. fm also reads high on a reverb.
 *   pan             swing of the left/right level difference of a steady sine, dB (auto-pan).
 *   width           side/mid ratio of half-correlated stereo noise, chain minus no chain, dB (> 0 wider).
 *   noise           what the chain makes of silence, dBFS (crackle, hiss).
 *   ceil            peak of the drum loop pushed 12 dB hot, dBFS (the ceiling a limiter holds).
 */
export type Metric =
  | { k: 'tilt'; hz: number; ref?: number }
  | { k: 'thd'; hz: number }
  | { k: 'gr'; hz?: number; hi?: number }
  | { k: 'crest' }
  | { k: 'bvr' }
  | { k: 'tail' }
  | { k: 'tailLevel' }
  | { k: 'echo' }
  | { k: 'shimmer' }
  | { k: 'clarity' }
  | { k: 'am' }
  | { k: 'fm' }
  | { k: 'pan' }
  | { k: 'width' }
  | { k: 'noise' }
  | { k: 'ceil' };

export interface Claim {
  /** The words of the description this claim measures. */
  say: string;
  m: Metric;
  min?: number;
  max?: number;
}

const tilt = (say: string, hz: number, min?: number, max?: number, ref?: number): Claim => ({ say, m: { k: 'tilt', hz, ref }, min, max });
const thd = (say: string, hz: number, min?: number, max?: number): Claim => ({ say, m: { k: 'thd', hz }, min, max });
const gr = (say: string, min?: number, max?: number, hz?: number, hi?: number): Claim => ({ say, m: { k: 'gr', hz, hi }, min, max });
const crest = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'crest' }, min, max });
const bvr = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'bvr' }, min, max });
const tail = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'tail' }, min, max });
const tailLevel = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'tailLevel' }, min, max });
const echo = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'echo' }, min, max });
const shimmer = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'shimmer' }, min, max });
const clarity = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'clarity' }, min, max });
const am = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'am' }, min, max });
const fm = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'fm' }, min, max });
const pan = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'pan' }, min, max });
const width = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'width' }, min, max });
const noise = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'noise' }, min, max });
const ceil = (say: string, min?: number, max?: number): Claim => ({ say, m: { k: 'ceil' }, min, max });

export type ClaimGroup =
  | 'Amiga' | 'Clean, Warm, Loud' | 'Modern' | 'Wide, Space, Ambient' | 'Lo-Fi, Vinyl, Texture'
  | 'Genre, DJ' | 'Dub, Delay' | 'Instrument, Modulation' | 'C64';

/** Claims per preset name, by group. */
export const PRESET_CLAIMS: Record<ClaimGroup, Record<string, Claim[]>> = {
  Amiga: {
    'Amiga Bass Cannon': [
      tilt('sub enhancement: 40 Hz over 1 kHz', 40, 6),
      tilt('sub enhancement: 60 Hz over 1 kHz', 60, 6),
      thd('saturation: harmonics of a 60 Hz sine', 60, -25),
      gr('heavy compression: gain reduction at -10 dBFS', 6),
      bvr('thunderous: bass over the rest', 4),
      crest('heavy compression keeps the kicks (crest)', -3.2),
    ],
    'Amiga Multiband': [
      gr('tighten lows: the low band compressed (100 Hz sine)', 3, undefined, 100),
      tilt('scoop mids: 1 kHz under 100 Hz', 1000, undefined, -3, 100),
      tilt('scoop mids: 1 kHz under 8 kHz', 1000, undefined, -3, 8000),
      tilt('open highs: 8 kHz over 1 kHz', 8000, 3),
    ],
    'Amiga Tape Warmth': [
      thd('tape sim: harmonics of a 60 Hz sine', 60, -45),
      tilt('warmth: 250 Hz over 1 kHz', 250, 1),
      gr('gentle compression: gain reduction at -10 dBFS', 1, 3.5),
      tilt('soft rolloff: 10 kHz under 1 kHz (not more than 9 dB)', 10000, -9, -3),
    ],
    'Chipgold': [
      tilt('fat bass: 100 Hz over 1 kHz', 100, 3),
      tilt('sub weight: 50 Hz-ish (60 Hz) over 1 kHz', 60, 2.5),
      thd('harmonic sparkle: harmonics of a 5 kHz sine', 5000, -35),
      thd('clean: a 1 kHz sine stays clean', 1000, undefined, -50),
      gr('clean: only gentle compression', undefined, 3),
    ],
    'Exotic Shimmer': [
      tilt('fat bottom: 100 Hz over 1 kHz', 100, 3),
      tilt('fat bottom: 60 Hz over 1 kHz', 60, 1.5),
      tail('ethereal reverb: tail of at least 1 s', 1000),
      shimmer('ascending reverb: the octave above the source rings louder than the source', 0),
    ],
    'Paula Dub Sirens': [
      echo('space echo: a repeat within 15 dB of the burst', -15),
      tail('spring tank: tail of at least 1.5 s', 1500),
      tilt('heavy subs: 40 Hz over 1 kHz', 40, 6),
      tilt('heavy subs: 60 Hz over 1 kHz', 60, 6),
      bvr('heavy subs: bass over the rest', 4),
    ],
    'Paula Punchline': [
      bvr('bass lift', 3),
      thd('tape warmth: harmonics of a 60 Hz sine', 60, -40),
      gr('punchy glue: gain reduction at -10 dBFS', 1.5, 5),
      crest('punchy: kicks not swallowed (crest)', -1.5),
    ],
    "Paula's Revenge": [
      thd('exciter: harmonics of a 5 kHz sine', 5000, -35),
      bvr('bass boost', 3),
      gr('hard limiting: gain reduction at -3 dBFS', 6, undefined, 1000, -3),
      crest('hard limiting: crest factor falls', undefined, -3),
      thd('tape grit: harmonics of a 1 kHz sine', 1000, -38),
    ],
    'Tracker Dance Floor': [
      gr('aggressive compression: gain reduction at -10 dBFS', 6),
      bvr('bass', 2.5),
      thd('hihat sizzle: harmonics of a 5 kHz sine', 5000, -35),
      crest('aggressive but the kick stays (crest)', -1.5),
    ],
    'Paula Sings': [
      tilt('fat low end: 100 Hz over 1 kHz', 100, 2),
      tilt('air restoration: 10 kHz over 1 kHz', 10000, 1),
      thd('tape warmth: harmonics of a 1 kHz sine', 1000, -45),
      tail('space: a reverb tail of at least 400 ms', 400),
    ],
    'Retro Arcade': [
      tilt('bass-heavy: 60 Hz over 1 kHz', 60, 2.5),
      tilt('bass-heavy: 100 Hz over 1 kHz', 100, 2.5),
      crest('transient snap: crest factor rises', 2),
      tilt('mid-presence: 4 kHz over 1 kHz', 4000, 1),
    ],
  },
  'Clean, Warm, Loud': {
    'Clean Master': [
      gr('gentle glue compression', 0.3, 4),
      tilt('tonal balance: a lift at 250 Hz', 250, 0.3),
      thd('transparent: a 1 kHz sine stays clean', 1000, undefined, -60),
    ],
    'Transparent': [
      gr('barely-there bus compression', 0.3, 1.5),
      crest('preserves full dynamics (crest)', -0.5),
    ],
    'Balanced': [
      tilt('EQ sculpting: 250 Hz over 1 kHz', 250, 1),
      gr('light compression', 0.2, 2),
      width('widening', 1),
    ],
    'Analog Warmth': [
      thd('tape saturation: harmonics of a 1 kHz sine', 1000, -40),
      gr('compression', 0.5, 4),
      tilt('warm: 250 Hz over 1 kHz', 250, 0.5),
    ],
    'Tape Machine': [
      thd('saturation: harmonics of a 1 kHz sine', 1000, -45),
      tilt('head-bump warmth: 100 Hz over 1 kHz', 100, 1),
      fm('subtle wow: the pitch moves', 0.5),
    ],
    'Tube Console': [
      thd('Chebyshev harmonics: a 1 kHz sine', 1000, -40),
      tilt('EQ: 250 Hz over 1 kHz', 250, 1),
    ],
    'Warm Bass': [
      thd('tape saturation: a 1 kHz sine', 1000, -40),
      gr('gentle compression', 0.5, 4),
    ],
    'Warm Overdrive': [
      thd('warm crunch: harmonics of a 1 kHz sine', 1000, -30),
      tilt('filter: 14 kHz under 1 kHz', 14000, undefined, -6),
      tilt('without harshness: 4 kHz not above 1 kHz', 4000, undefined, 2),
    ],
    'Rotary Warmth': [
      am('Leslie: the level swings', 1),
      thd('tape saturation: a 1 kHz sine', 1000, -45),
    ],
    'Club Ready': [
      gr('punchy compression', 2),
      tilt('sub boost: 40 Hz over 1 kHz', 40, 3),
      tilt('sub boost: 60 Hz over 1 kHz', 60, 3),
    ],
    'Brick Wall': [
      gr('hard limiting: gain reduction at -10 dBFS', 8),
      ceil('hard limiting: a hot signal stays under the ceiling', undefined, 0),
    ],
    'Pumping': [
      gr('aggressive compression', 5),
      crest('obvious pump: the crest falls', undefined, -1.5),
    ],
    'Swedish Chainsaw': [
      thd('HM-2 everything on max: a 1 kHz sine', 1000, -10),
      tilt('the Gothenburg tone: 8 kHz well under 1 kHz', 8000, undefined, -8),
      gr('JCM800 wall: compressed', 10),
    ],
    'Chip Metal': [
      thd('HM-2 wall: a 1 kHz sine', 1000, -15),
      tilt('scooped mids: 1 kHz under 100 Hz', 1000, undefined, -3, 100),
      tilt('scooped mids: 1 kHz under 4 kHz', 1000, undefined, -2, 4000),
      tilt('tight lows: 40 Hz under 100 Hz', 40, undefined, -3, 100),
      crest('kick punching through: crest rises', 1.5),
    ],
  },
  'Modern': {
    'Modern Precision': [
      gr('multiband glue', 2, 6),
      ceil('true-peak ceiling', undefined, -0.1),
      thd('clean: a 1 kHz sine', 1000, undefined, -35),
    ],
    'Modern Club Pump': [
      gr('dense multiband', 5),
      tilt('weighty sub: 40 Hz over 1 kHz', 40, 2),
      ceil('soft clip into the ceiling', undefined, -0.1),
    ],
    'Modern Glue & Air': [
      gr('gentle multiband glue', 1.5, 4),
      tilt('silky top: 10 kHz over 1 kHz', 10000, 1.5),
    ],
    'Modern Amiga Master': [
      tilt('fuller lows: 60 Hz over 1 kHz', 60, 1.5),
      tilt('8-bit harshness tamed: 8 kHz under 1 kHz', 8000, undefined, -1),
      ceil('ceiling', undefined, -0.1),
    ],
  },
  'Wide, Space, Ambient': {
    'Stereo Wide': [
      width('subtle stereo widening', 1),
      gr('glue compression', 0.3),
    ],
    'Room Glue': [
      tail('short plate: a tail of 200 - 700 ms', 200, 700),
      tailLevel('a plate that is audible: still ringing 200 ms on', -35),
    ],
    'Immersive': [
      tail('plate reverb', 500),
      width('widener: large soundstage', 2),
      am('chorus: the level moves', 1),
    ],
    'Leslie Cabinet': [
      am('rotary swirl: the level swings', 3),
    ],
    'Hall Reverb': [
      tail('large hall: a tail of at least 1.2 s', 1200),
      tailLevel('lush: still loud 200 ms on', -20),
    ],
    'Small Room': [
      tail('tight early reflections: 150 - 600 ms', 150, 600),
    ],
    'Plate Shimmer': [
      tail('lush plate: a tail of at least 800 ms', 800),
      width('lush: wider than the source', 1),
    ],
    'Cathedral': [
      tail('massive, cavernous: a tail of at least 2.5 s', 2500),
    ],
    'Shimmer Wash': [
      tail('ethereal reverb: at least 1 s', 1000),
      shimmer('ascending: the octave above rings louder than the source', 0),
    ],
    'Dark Plate': [
      tail('dense plate: a tail of at least 1.2 s', 1200),
      tilt('dark: 8 kHz under 1 kHz', 8000, undefined, -3),
    ],
    'Tight Room': [
      tail('short natural room: 150 - 700 ms', 150, 700),
    ],
    'Spacey Delay': [
      echo('multi-tap: a repeat within 10 dB of the blip', -10),
      tail('celestial trails: at least 3 s', 3000),
    ],
    'Ping Pong Hall': [
      echo('bouncing delay: a repeat within 12 dB', -12),
      tail('hall: at least 1.5 s', 1500),
      width('big stereo', 2),
    ],
    'Ambient': [
      tail('spacious plate: at least 800 ms', 800),
      gr('gentle compression', 0.4, 4),
      width('spacious: wider than the source', 2),
    ],
    'Ambient Space': [
      tail('long reverb: at least 2.5 s', 2500),
      echo('ping-pong: a repeat within 10 dB', -10),
    ],
    'Dreamy Haze': [
      tail('reverb: at least 1.2 s', 1200),
      tilt('soft: 8 kHz under 1 kHz', 8000, undefined, -6),
    ],
    'Underwater': [
      tilt('deep LP filter: 4 kHz under 1 kHz', 4000, undefined, -12),
      tail('reverb: at least 1 s', 1000),
    ],
    'Frozen': [
      tail('glacial: a tail of at least 2.5 s', 2500),
      echo('delay: a repeat within 15 dB', -15),
      shimmer('crystalline: upper octave present (within 12 dB of the source)', -12),
    ],
    '*Wave Landscape': [
      shimmer('shimmer: upper octave within 6 dB of the source', -6),
      echo('ambient delay: a repeat within 15 dB', -15),
      tail('a tail of at least 1.5 s', 1500),
    ],
    'Cosmic': [
      echo('delay: a repeat within 10 dB', -10),
      tail('reverb: at least 1.5 s', 1500),
    ],
    'Haunted': [
      tail('spring: at least 400 ms', 400),
      thd('distortion: a 5 kHz sine', 5000, -45),
    ],
  },
  'Lo-Fi, Vinyl, Texture': {
    'Vinyl Press': [
      noise('crackle: the chain makes noise from silence', -75),
      tilt('RIAA EQ and rolloff: 10 kHz under 1 kHz', 10000, undefined, -0.7),
    ],
    'Dusty Grooves': [
      thd('tape warmth: a 1 kHz sine', 1000, -45),
    ],
    'Lo-Fi Master': [
      thd('tape sim: a 1 kHz sine', 1000, -45),
      tilt('rolloff: 8 kHz under 1 kHz', 8000, undefined, -3),
      noise('vinyl: noise from silence', -75),
    ],
    'Cassette Dub': [
      thd('tape sim: a 1 kHz sine', 1000, -45),
      echo('delay: a repeat within 25 dB', -25),
      tilt('degradation: 8 kHz under 1 kHz', 8000, undefined, -3),
    ],
    'Lo-Fi Tape': [
      tilt('worn cassette: 8 kHz under 1 kHz', 8000, undefined, -3),
      fm('wow and flutter: the pitch moves', 5),
    ],
    'Turntable': [
      fm('wow and flutter: the pitch moves', 5),
      noise('cartridge: noise from silence', -70),
    ],
    'Tape Delay Machine': [
      echo('tape delay: a repeat within 20 dB', -20),
      fm('wow and flutter: the pitch moves', 1),
    ],
    'Parallel Crush': [
      gr('heavy compression', 5),
      crest('heavy: the crest falls', undefined, -2),
    ],
    'Glue Bus': [
      gr('gentle bus compression', 0.4, 4),
    ],
    'Industrial': [
      thd('harsh distortion: a 1 kHz sine', 1000, -20),
      gr('hard compression', 6),
    ],
    'Fuzz Box': [
      thd('thick fuzzy saturation: a 1 kHz sine', 1000, -25),
      tilt('bite: 4 kHz over 1 kHz', 4000, 0.5),
    ],
    'Dark Pad': [
      tilt('low-pass: 8 kHz under 1 kHz', 8000, undefined, -12),
    ],
    'Crystal Castles Void': [
      tail('shimmer: a tail of at least 4 s', 4000),
      shimmer('ethereal: upper octave present', 0),
    ],
  },
  'Genre, DJ': {
    'Techno': [
      tilt('hard-hitting sub boost: 40 Hz over 1 kHz', 40, 3),
      gr('compression', 3),
      thd('grit: a 1 kHz sine', 1000, -40),
    ],
    'House': [
      tilt('warm low-end: 100 Hz over 1 kHz', 100, 2),
      tilt('smooth tops: 10 kHz under 1 kHz', 10000, undefined, -2),
      gr('glue compression', 0.4, 4),
    ],
    'Drum & Bass': [
      tilt('sub weight: 40 Hz over 1 kHz', 40, 3),
      tilt('air: 10 kHz over 1 kHz', 10000, 1.5),
      crest('tight transients: the crest holds', -1),
    ],
    'Hip Hop': [
      tilt('fat low-end: 100 Hz over 1 kHz', 100, 2),
      thd('warm saturation: a 1 kHz sine', 1000, -45),
      gr('controlled dynamics', 1),
    ],
    'Dub / Reggae': [
      tilt('heavy subs: 40 Hz over 1 kHz', 40, 6),
      tilt('warm mids: 250 Hz over 1 kHz', 250, 1),
      tail('spring tank: at least 300 ms', 300),
    ],
    'Hardstyle': [
      tilt('maximum sub: 40 Hz over 1 kHz', 40, 6),
      gr('hard limiting', 6),
      thd('grit: a 1 kHz sine', 1000, -40),
    ],
    'Psychedelic': [
      am('Leslie and phaser: the level swings', 3),
      tail('reverb: at least 500 ms', 500),
    ],
    'Synthwave': [
      am('chorus: the level moves', 1),
      echo('delay: a repeat within 20 dB', -20),
      gr('compression', 0.5),
    ],
    'Shoegaze': [
      thd('saturation: a 1 kHz sine', 1000, -40),
      tail('massive reverb: at least 1.5 s', 1500),
      width('wall of sound: wide', 3),
    ],
    'Acid House': [
      am('auto-filter: the level swings', 3),
      thd('distortion: a 1 kHz sine', 1000, -30),
    ],
    'Garage / 2-Step': [
      gr('tight compression', 3),
      echo('delay: a repeat within 20 dB', -20),
      crest('punchy', -3),
    ],
    'DJ Booth': [
      gr('club-standard bus compression', 1, 5),
      thd('tape warmth: a 1 kHz sine', 1000, -45),
      tilt('EQ: a lift at 100 Hz', 100, 1),
    ],
    'Big Room': [
      tail('plate reverb: at least 800 ms', 800),
      width('wide stereo', 2),
      gr('compression', 1),
    ],
    'Vinyl DJ': [
      thd('warmth: a 1 kHz sine', 1000, -45),
      noise('vinyl character: noise from silence', -70),
    ],
    'Echo Out': [
      echo('tape echo: a repeat within 15 dB', -15),
      clarity('a distinct repeat, not a wash', 4),
    ],
    'Warehouse Rave': [
      thd('gritty tape: a 1 kHz sine', 1000, -40),
      gr('hard compression', 5),
    ],
    'Dub Echo': [
      echo('ping-pong delay: a repeat within 15 dB', -15),
      tail('reverb: at least 1.5 s', 1500),
    ],
    'Filter Sweep': [
      am('auto-filter LFO: the level swings', 3),
    ],
    'Phaser Wash': [
      am('deep phaser sweep: the level swings', 3),
    ],
    'Auto-Pan': [
      pan('LFO panning: the image moves', 3),
    ],
    'Vibrato Wobble': [
      fm('pitch wobble', 5),
    ],
    'Frequency Shift': [
      am('frequency shift: the shifted partial beats against the source', 3),
    ],
    'Feedback Loop': [
      tail('self-oscillating delay: at least 2.5 s', 2500),
      echo('a repeat within 12 dB', -12),
    ],
  },
  'Dub, Delay': {
    'Spring Tank': [
      tail('classic spring reverb: at least 400 ms', 400),
    ],
    'Dub Siren Echo': [
      echo('Space Echo: a repeat within 10 dB', -10),
      tail('spring: at least 3 s', 3000),
    ],
    'King Tubby Filter': [
      echo('echo: a repeat within 15 dB', -15),
      am('dramatic sweeps: the level swings', 2),
    ],
    'Phaser Dub': [
      am('Bi-Phase swirl: the level swings', 3),
      echo('tape echo: a repeat within 15 dB', -15),
    ],
    'Tape Echo Wash': [
      echo('degraded repeats: within 20 dB', -20),
    ],
    'Dub Chamber': [
      echo('tape echo: a repeat within 15 dB', -15),
      tail('spring reverb: at least 2 s', 2000),
    ],
    'Aelapse Dub': [
      echo('tape delay: a repeat within 25 dB', -25),
      tail('spring: at least 2 s', 2000),
    ],
    'Mad Professor Studio': [
      tail('long dark tail: at least 1.5 s', 1500),
      tilt('dark: 8 kHz under 1 kHz', 8000, undefined, -3),
      tilt('bass stays dry: 100 Hz under 1 kHz', 100, undefined, -3),
    ],
    'Mad Professor Cathedral': [
      tail('7-second tail (RT60): at least 4 s down to -40 dB, about 6.5 s to -60', 4000),
      tilt('warm top: 8 kHz under 1 kHz', 8000, undefined, -3),
      shimmer('shimmer-free', undefined, -10),
    ],
    'Mad Professor + Tape': [
      echo('tape echo: a repeat within 20 dB', -20),
      tail('Scientist wash: at least 1.2 s', 1200),
    ],
    'Dattorro Tubby': [
      tail('short bright plate: 300 - 1200 ms', 300, 1200),
      tilt('bright: 8 kHz not under -1.5 dB', 8000, -1.5),
    ],
    'Dattorro Infinite': [
      tail('near-infinite tail: at least 8 s', 8000),
    ],
    'Dattorro Steel': [
      tail('resonant plate: at least 1.5 s', 1500),
    ],
    'Dattorro + King Tubby': [
      thd('filter screaming: a 1 kHz sine', 1000, -30),
      tail('metallic plate: at least 1.5 s', 1500),
    ],
    'Dattorro + Tape Wash': [
      echo('tape echo: a repeat within 15 dB', -15),
      tail('full dub throw: at least 3 s', 3000),
    ],
    'Ambient Echo': [
      echo('delay: a repeat within 10 dB', -10),
      tilt('darkening: 14 kHz under 1 kHz', 14000, undefined, -2),
    ],
    'Tape Echo': [
      echo('warm tape delay: a repeat within 20 dB', -20),
    ],
    'Stereo Ping Pong': [
      echo('bouncing delay: a repeat within 8 dB', -8),
      width('wide stereo', 1),
    ],
    'Space Echo': [
      echo('multi-head echo: a repeat within 10 dB', -10),
      tail('psychedelic: at least 3 s', 3000),
    ],
    'RE-201 King Tubby': [
      echo('three heads: a repeat within 12 dB', -12),
      tail('tape and spring: at least 3 s', 3000),
    ],
    'RE-201 Spring Only': [
      tail('spring reverb tank: at least 800 ms', 800),
    ],
    'RE-201 Runaway': [
      tail('near-runaway feedback: at least 8 s', 8000),
      echo('a repeat within 12 dB', -12),
    ],
    'Dub Plate Special': [
      echo('tape delay: a repeat within 20 dB', -20),
      fm('wobbling echoes: the pitch moves', 0.3),
    ],
    'Midnight Dub Delay': [
      tilt('dark: 8 kHz under 1 kHz', 8000, undefined, -2),
      echo('tape delay: a repeat within 20 dB', -20),
      tail('heavy reverb wash: at least 3 s', 3000),
    ],
    'RE-201 + Dattorro': [
      echo('tape echo: a repeat within 15 dB', -15),
      tail('massive wash: at least 2.5 s', 2500),
    ],
  },
  'Instrument, Modulation': {
    'Acid Bass': [
      thd('distortion: a 1 kHz sine', 1000, -25),
      tilt('filter: 4 kHz far under 1 kHz', 4000, undefined, -20),
    ],
    'Sub Bass': [
      tilt('low-pass: 4 kHz far under 1 kHz', 4000, undefined, -20),
      thd('clean sub: a 60 Hz sine', 60, undefined, -40),
    ],
    'Moog Acid': [
      tilt('Moog ladder: 4 kHz far under 1 kHz', 4000, undefined, -20),
      thd('squelchy: resonance drives a 1 kHz sine', 1000, -45),
      am('Leslie: the level swings', 1),
    ],
    'Acid Screamer': [
      thd('distortion: a 1 kHz sine', 1000, -25),
      tilt('resonant filter: 4 kHz under 1 kHz', 4000, undefined, -15),
    ],
    'Punchy Drums': [
      gr('compression', 2),
      tilt('EQ boost for attack: 4 kHz over 1 kHz', 4000, 1.5),
      crest('attack kept (crest)', -2.5),
    ],
    'Gated Snare': [
      tail('80s gate: a tail of 300 - 900 ms', 300, 900),
      gr('gated and compressed', 3),
    ],
    'Chorus Lead': [
      am('chorus: the level moves', 1),
      width('width', 5),
    ],
    'Phaser Lead': [
      am('classic phaser sweep: the level swings', 3),
    ],
    'Shimmer Pad': [
      thd('tape warmth: a 1 kHz sine', 1000, -40),
      am('chorus: the level moves', 1),
    ],
    'Clean Vocal': [
      gr('compression', 0.4, 4),
      thd('clean: a 1 kHz sine', 1000, undefined, -60),
      tilt('EQ: low cut, 100 Hz under 1 kHz', 100, undefined, -1),
    ],
    'Thick Chorus': [
      am('deep chorus: the level moves', 3),
      width('widener: lush thickening', 3),
    ],
    'Phaser Jet': [
      am('deep bi-phase sweep: the level swings', 3),
    ],
    'Tremolo Gate': [
      am('fast tremolo: rhythmic gating', 6),
    ],
    'Wah Sweep': [
      am('auto-wah: the level swings', 3),
    ],
  },
  'C64': {
    'SID Stadium': [
      tail('massive plate reverb: at least 800 ms', 800),
      width('wide stereo', 2),
      gr('arena compression', 1),
    ],
    'SID Bass Machine': [
      tilt('sub enhancement: 40 Hz over 1 kHz', 40, 3),
      thd('saturation: a 1 kHz sine', 1000, -35),
      gr('tight compression', 3),
    ],
    'SID Acid Trip': [
      am('phaser swirl: the level swings', 3),
      echo('tape echo: a repeat within 12 dB', -12),
      tail('plate reverb: at least 1 s', 1000),
    ],
    'SID Raw Power': [
      bvr('bass boost', 2),
      gr('hard compression', 5),
    ],
    'SID Neon Nights': [
      am('chorus thickening: the level moves', 1),
      thd('tube warmth: a 1 kHz sine', 1000, -40),
      echo('delay: a repeat within 15 dB', -15),
      width('wide stereo', 1),
    ],
  },
};

/**
 * Why the offline rig cannot build a preset's chain, or null when it can. Such a
 * preset is measured live (tools/master-fx-claims-live.ts) against LIVE_CLAIMS,
 * which are limited to what a song-fed tap reads: octave-band tilt and crest.
 */
export function liveOnlyReason(effects: ReadonlyArray<{ category?: string; type: string }>): string | null {
  if (effects.some((e) => e.category === 'neural' || e.type === 'Neural')) return 'neural amp model: the network runs only in the browser';
  if (effects.some((e) => e.type.startsWith('WAM'))) return 'WAM plugin: runs only in the browser';
  if (effects.some((e) => e.type === 'VinylNoise' || e.type === 'Tumult')) return 'noise layer: gated by the engine playing flag, silent offline';
  if (effects.some((e) => e.type === 'BitCrusher')) return 'bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)';
  if (effects.some((e) => e.type === 'GranularFreeze')) return 'freeze: captures on a trigger, passes nothing until one arrives';
  return null;
}

/** Claims for the live-only presets (see liveOnlyReason): tilt and crest, read by tools/master-fx-claims-live.ts on a playing song. */
export const LIVE_CLAIMS: Record<string, Claim[]> = {
  'Tube Screamer Glow': [
    tilt('warm mid-push: 1 kHz over 125 Hz', 1000, 1, undefined, 125),
    tilt('without harshness: 4 kHz under 1 kHz', 4000, undefined, 0),
  ],
  'Princeton Glow': [
    tilt('shimmery tube warmth: 1 kHz over 4 kHz is not a dark sound (4 kHz within 3 dB of 1 kHz)', 4000, -3, undefined),
    crest('a clean amp keeps the dynamics (crest)', -2),
  ],
  'VHS Tape': [
    tilt('rolloff: 16 kHz far under 1 kHz', 16000, undefined, -10),
  ],
  'Broken Sampler': [
    tilt('filter: 8 kHz under 1 kHz', 8000, undefined, -3),
    tilt('filter: 16 kHz far under 1 kHz', 16000, undefined, -10),
  ],
  'Cassette Deck': [
    crest('bit crush and saturation: the crest falls', undefined, -2),
  ],
};

/**
 * Live-only presets whose live claims could not be read: the browser dropped
 * its connection while measuring them (a WAM plugin, then Lo-Fi Drums) or the
 * tap sees nothing of them (noise layers, a freeze). Listed so the gap is
 * stated, not silent.
 */
export const LIVE_UNVERIFIED: ReadonlySet<string> = new Set([
  'Big Muff Wall', 'Stone Phaser', 'Vox Amp Crunch', 'Lo-Fi Drums', 'Crystal Castles Vocal', 'Radiowave',
  'Lo-Fi Radio', 'Vinyl Record', 'Rain Ambience', 'Frozen Texture', 'Granular Cloud',
  'Blackstar Clean', 'Tube Screamer Glue', 'Sovtek Warmth', 'Filmosound Master', 'Clean Fender', 'Crunch Marshall',
  'High Gain Mesa', 'Dumble Lead', 'Sovtek Doom', 'BadCat Jazz', 'El Coyote Blues', 'ENGL Metal', 'TS9 + Spring',
  'Big Muff Doom', 'RAT + Delay', 'Revv G3 Chug', 'Goat + Leslie', 'Aguilar Bass Grit', 'SID Shredder', 'SID Crunch Box',
]);

