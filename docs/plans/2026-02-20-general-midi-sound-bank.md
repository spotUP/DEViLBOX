# General MIDI 2 Sound Bank Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GM2-compatible sound bank using DEViLBOX's own synths, then auto-create matching instruments when MIDI files are imported.

**Architecture:** New `GMSoundBank.ts` file maps all 128 GM2 program numbers (+ percussion) to `InstrumentConfig` presets using DEViLBOX synths. `MIDIImporter.ts` is updated to read `track.instrument.number` from `@tonejs/midi`, look up the GM preset, and return `instruments[]` alongside patterns. Both call sites (`FT2Toolbar.tsx`, `App.tsx`) load the returned instruments.

**Tech Stack:** TypeScript, `@tonejs/midi` (already installed), DEViLBOX synth types (`PolySynth`, `FMSynth`, `MonoSynth`, `Organ`, `StringMachine`, `MetalSynth`, `MembraneSynth`, `DrumMachine`, `AMSynth`)

---

## GM2 Family → SynthType Mapping Reference

| Program | GM Family      | SynthType      | Character                          |
|---------|----------------|----------------|------------------------------------|
| 0–7     | Piano          | `PolySynth`    | triangle osc, slow decay, sustain  |
| 8–15    | Chromat. Perc  | `AMSynth`      | bell-like, short decay, no sustain |
| 16–23   | Organ          | `Organ`        | no envelope, pure tone             |
| 24–31   | Guitar         | `PolySynth`    | sawtooth, fast attack, plucky      |
| 32–39   | Bass           | `MonoSynth`    | monophonic, octave -1, sawtooth    |
| 40–47   | Strings        | `StringMachine`| slow attack, high sustain          |
| 48–55   | Ensemble       | `PolySynth`    | sine/triangle, slow attack, pad    |
| 56–63   | Brass          | `PolySynth`    | square, medium attack              |
| 64–71   | Reed           | `PolySynth`    | sawtooth, medium attack            |
| 72–79   | Pipe           | `PolySynth`    | sine, slow attack, fluty           |
| 80–87   | Synth Lead     | `FMSynth`      | sine carrier, punchy               |
| 88–95   | Synth Pad      | `PolySynth`    | slow attack, long release, pad     |
| 96–103  | Synth FX       | `FMSynth`      | atmospheric                        |
| 104–111 | Ethnic         | `PolySynth`    | triangle, plucky                   |
| 112–119 | Percussive     | `MetalSynth`   | short, metallic/membrane           |
| 120–127 | Sound Effects  | `FMSynth`      | noise/FX                           |
| ch 9    | Percussion     | `DrumMachine`  | MIDI channel 10 drums              |

---

## Task 1: Create `src/lib/import/GMSoundBank.ts`

**Files:**
- Create: `src/lib/import/GMSoundBank.ts`

No tests needed for this task — it is a pure data/config file with a single pure function. Verify visually.

**Step 1: Create the file**

```typescript
/**
 * GMSoundBank — General MIDI 2 sound bank for DEViLBOX
 *
 * Maps GM2 program numbers (0–127) to InstrumentConfig presets
 * using DEViLBOX's built-in synths as approximations.
 *
 * Reference: https://en.wikipedia.org/wiki/General_MIDI_Level_2
 */

import type { InstrumentConfig, OscillatorConfig, EnvelopeConfig, FilterConfig } from '@typedefs/instrument';

// ─── Shared building blocks ─────────────────────────────────────────────────

const osc = (type: OscillatorConfig['type'], octave = 0): OscillatorConfig =>
  ({ type, detune: 0, octave });

const env = (attack: number, decay: number, sustain: number, release: number): EnvelopeConfig =>
  ({ attack, decay, sustain, release });

const lpf = (frequency: number, Q = 1): FilterConfig =>
  ({ type: 'lowpass', frequency, Q, rolloff: -24 });

const BASE: Pick<InstrumentConfig, 'type' | 'effects' | 'volume' | 'pan'> = {
  type: 'synth',
  effects: [],
  volume: -6,
  pan: 0,
};

// ─── GM2 instrument names (programs 0–127) ──────────────────────────────────

export const GM2_NAMES: readonly string[] = [
  // Piano (0–7)
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano',
  'Honky-tonk Piano', 'Rhodes Piano', 'Chorused Electric Piano',
  'Harpsichord', 'Clavinet',
  // Chromatic Percussion (8–15)
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
  'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  // Organ (16–23)
  'Hammond Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
  'Reed Organ', 'French Accordion', 'Harmonica', 'Bandoneon',
  // Guitar (24–31)
  'Nylon String Guitar', 'Steel String Guitar', 'Jazz Guitar', 'Clean Electric Guitar',
  'Muted Electric Guitar', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  // Bass (32–39)
  'Acoustic Bass', 'Finger Bass', 'Pick Bass', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  // Strings (40–47)
  'Violin', 'Viola', 'Cello', 'Contrabass',
  'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  // Ensemble (48–55)
  'String Ensemble 1', 'Slow String Ensemble', 'Synth Strings 1', 'Synth Strings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Choir', 'Orchestra Hit',
  // Brass (56–63)
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
  'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  // Reed (64–71)
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  // Pipe (72–79)
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
  'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  // Synth Lead (80–87)
  'Lead 1 Square', 'Lead 2 Sawtooth', 'Lead 3 Calliope', 'Lead 4 Chiff',
  'Lead 5 Charang', 'Lead 6 Voice', 'Lead 7 Fifths', 'Lead 8 Bass+Lead',
  // Synth Pad (88–95)
  'Pad 1 New Age', 'Pad 2 Warm', 'Pad 3 Polysynth', 'Pad 4 Space Voice',
  'Pad 5 Bowed Glass', 'Pad 6 Metallic', 'Pad 7 Halo', 'Pad 8 Sweep',
  // Synth Effects (96–103)
  'FX 1 Ice Rain', 'FX 2 Soundtrack', 'FX 3 Crystal', 'FX 4 Atmosphere',
  'FX 5 Brightness', 'FX 6 Goblins', 'FX 7 Echo Drops', 'FX 8 Star Theme',
  // Ethnic (104–111)
  'Sitar', 'Banjo', 'Shamisen', 'Koto',
  'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  // Percussive (112–119)
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
  'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  // Sound Effects (120–127)
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
  'Telephone Ring', 'Helicopter', 'Applause', 'Gun Shot',
] as const;

// ─── Family presets ──────────────────────────────────────────────────────────

/** Piano family (0–7): PolySynth with triangle oscillator, piano-like ADSR */
function pianoPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(program < 4 ? 'triangle' : 'sine'),
    envelope: env(2, 1500, 0.3, 500),
    filter: lpf(4000, 0.5),
  };
}

/** Chromatic percussion (8–15): AMSynth — bell/mallet character */
function chromaticPercPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'AMSynth',
    oscillator: osc('sine'),
    envelope: env(1, 400, 0, 200),
  };
}

/** Organ (16–23): Organ synth — sustained, organ-like */
function organPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'Organ',
    oscillator: osc(program === 18 ? 'square' : 'sine'), // Rock Organ → square
    envelope: env(10, 100, 1, 100),
  };
}

/** Guitar (24–31): PolySynth with sawtooth, plucky envelope */
function guitarPreset(program: number, id: number): InstrumentConfig {
  const isDistorted = program === 30 || program === 31; // Overdriven / Distortion
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(isDistorted ? 'square' : 'sawtooth'),
    envelope: env(1, isDistorted ? 600 : 350, 0.1, 200),
    filter: lpf(isDistorted ? 1500 : 3500),
  };
}

/** Bass (32–39): MonoSynth at octave -1, tight envelope */
function bassPreset(program: number, id: number): InstrumentConfig {
  const isSynth = program >= 38; // Synth Bass 1 & 2
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'MonoSynth',
    oscillator: osc(isSynth ? 'square' : 'sawtooth', -1),
    envelope: env(5, isSynth ? 400 : 200, 0.2, 100),
    filter: lpf(isSynth ? 800 : 1500, isSynth ? 4 : 1),
    monophonic: true,
  };
}

/** Strings (40–47): StringMachine with slow attack */
function stringsPreset(program: number, id: number): InstrumentConfig {
  const isPizz = program === 45; // Pizzicato
  const isHarp = program === 46;
  const isTimp = program === 47;
  if (isPizz || isHarp) {
    return {
      ...BASE, id,
      name: GM2_NAMES[program],
      synthType: 'PolySynth',
      oscillator: osc('triangle'),
      envelope: env(1, 400, 0, 200),
    };
  }
  if (isTimp) {
    return {
      ...BASE, id,
      name: GM2_NAMES[program],
      synthType: 'MembraneSynth',
      envelope: env(1, 500, 0, 200),
    };
  }
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'StringMachine',
    oscillator: osc('sawtooth'),
    envelope: env(program === 44 ? 5 : 60, 2000, 0.8, 600), // Tremolo fast, others slow
  };
}

/** Ensemble (48–55): PolySynth pads, slow attack */
function ensemblePreset(program: number, id: number): InstrumentConfig {
  const isOrchHit = program === 55;
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(isOrchHit ? 'square' : 'sine'),
    envelope: env(isOrchHit ? 1 : 80, isOrchHit ? 200 : 3000, isOrchHit ? 0 : 0.7, 800),
    filter: lpf(2000, 0.5),
  };
}

/** Brass (56–63): PolySynth with square wave, punchy attack */
function brassPreset(program: number, id: number): InstrumentConfig {
  const isSynth = program >= 62; // Synth Brass
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(isSynth ? 'sawtooth' : 'square'),
    envelope: env(isSynth ? 5 : 15, 500, 0.6, 200),
    filter: lpf(isSynth ? 2000 : 3000),
  };
}

/** Reed (64–71): PolySynth with sawtooth */
function reedPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc('sawtooth'),
    envelope: env(20, 1000, 0.7, 300),
    filter: lpf(2500, 2),
  };
}

/** Pipe/Flute (72–79): PolySynth with sine, fluty */
function pipePreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(program < 74 ? 'sine' : 'triangle'), // Piccolo/Flute=sine, rest=triangle
    envelope: env(30, 2000, 0.8, 400),
    filter: lpf(5000),
  };
}

/** Synth Lead (80–87): FMSynth — punchy leads */
function synthLeadPreset(program: number, id: number): InstrumentConfig {
  const isSaw = program === 81;
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'FMSynth',
    oscillator: osc(isSaw ? 'sawtooth' : 'sine'),
    envelope: env(1, 500, 0.5, 200),
  };
}

/** Synth Pad (88–95): PolySynth pads, very slow attack */
function synthPadPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc(program === 91 ? 'triangle' : 'sine'), // Bowed Glass = triangle
    envelope: env(200, 3000, 0.8, 1500),
    filter: lpf(1500, 0.5),
  };
}

/** Synth FX (96–103): FMSynth atmospheric */
function synthFXPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'FMSynth',
    oscillator: osc('sine'),
    envelope: env(100, 2000, 0.5, 1000),
  };
}

/** Ethnic (104–111): PolySynth, plucked/bowed */
function ethnicPreset(program: number, id: number): InstrumentConfig {
  const isBowed = program === 109; // Koto
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'PolySynth',
    oscillator: osc('triangle'),
    envelope: env(isBowed ? 30 : 1, isBowed ? 1500 : 500, isBowed ? 0.5 : 0, 200),
    filter: lpf(3000),
  };
}

/** Percussive (112–119): MetalSynth for bells/metallic, MembraneSynth for drums */
function percussivePreset(program: number, id: number): InstrumentConfig {
  const isDrum = program >= 116; // Taiko, Melodic Tom, Synth Drum, Reverse Cymbal
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: isDrum ? 'MembraneSynth' : 'MetalSynth',
    envelope: env(1, isDrum ? 400 : 200, 0, isDrum ? 300 : 100),
  };
}

/** Sound FX (120–127): FMSynth noise/FX */
function soundFXPreset(program: number, id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: GM2_NAMES[program],
    synthType: 'FMSynth',
    oscillator: osc('sine'),
    envelope: env(50, 1000, 0.3, 500),
  };
}

/** Percussion channel (MIDI ch 9): DrumMachine */
function percussionPreset(id: number): InstrumentConfig {
  return {
    ...BASE, id,
    name: 'GM Drums',
    synthType: 'DrumMachine',
  };
}

// ─── Main lookup ─────────────────────────────────────────────────────────────

/**
 * Create an InstrumentConfig for a GM2 program number.
 *
 * @param program  GM program number 0–127
 * @param id       1-based instrument slot number for the DEViLBOX tracker
 * @param isPercussion  true if this is MIDI channel 10 (drums)
 */
export function gmProgramToInstrument(
  program: number,
  id: number,
  isPercussion: boolean,
): InstrumentConfig {
  if (isPercussion) return percussionPreset(id);

  const p = Math.max(0, Math.min(127, program));

  if (p < 8)   return pianoPreset(p, id);
  if (p < 16)  return chromaticPercPreset(p, id);
  if (p < 24)  return organPreset(p, id);
  if (p < 32)  return guitarPreset(p, id);
  if (p < 40)  return bassPreset(p, id);
  if (p < 48)  return stringsPreset(p, id);
  if (p < 56)  return ensemblePreset(p, id);
  if (p < 64)  return brassPreset(p, id);
  if (p < 72)  return reedPreset(p, id);
  if (p < 80)  return pipePreset(p, id);
  if (p < 88)  return synthLeadPreset(p, id);
  if (p < 96)  return synthPadPreset(p, id);
  if (p < 104) return synthFXPreset(p, id);
  if (p < 112) return ethnicPreset(p, id);
  if (p < 120) return percussivePreset(p, id);
  return soundFXPreset(p, id);
}
```

**Step 2: TypeScript check**

```bash
npm run type-check 2>&1 | grep GMSoundBank
```
Expected: no output (no errors).

**Step 3: Commit**

```bash
git add src/lib/import/GMSoundBank.ts
git commit -m "feat(midi): add GM2 sound bank — 128 programs mapped to DEViLBOX synths"
```

---

## Task 2: Update `MIDIImporter.ts` to use the GM sound bank

**Files:**
- Modify: `src/lib/import/MIDIImporter.ts`

**Step 1: Add `instruments` to `MIDIImportResult`**

Add `instruments: InstrumentConfig[]` to the interface and the import at the top:

```typescript
// Add import at top of file:
import { gmProgramToInstrument } from './GMSoundBank';
import type { InstrumentConfig } from '@typedefs/instrument';

// Update MIDIImportResult:
export interface MIDIImportResult {
  patterns: Pattern[];
  instruments: InstrumentConfig[];   // ← ADD THIS
  bpm: number;
  timeSignature: [number, number];
  metadata: {
    name: string;
    tracks: number;
    totalTicks: number;
  };
}
```

**Step 2: Build `instruments` array in `importMIDIFile`**

In `importMIDIFile`, before the `return` statement, build the instruments array from the track list. Only tracks with notes get an instrument:

```typescript
// Build instrument list — one per non-empty track, in same order as pattern channels
const instruments: InstrumentConfig[] = [];
let instId = 1;

if (opts.mergeChannels) {
  // merged: one instrument per track (matching channel order in merged pattern)
  midi.tracks.forEach((track) => {
    if (track.notes.length === 0) return;
    instruments.push(
      gmProgramToInstrument(track.instrument.number, instId++, track.instrument.percussion)
    );
  });
} else {
  // separate patterns: one instrument per non-empty track, id matches track index+1
  midi.tracks.forEach((track) => {
    if (track.notes.length === 0) return;
    instruments.push(
      gmProgramToInstrument(track.instrument.number, instId++, track.instrument.percussion)
    );
  });
}

return {
  patterns,
  instruments,   // ← ADD
  bpm,
  timeSignature,
  metadata: {
    name: midi.name || file.name.replace(/\.[^/.]+$/, ''),
    tracks: midi.tracks.length,
    totalTicks: midi.durationTicks,
  },
};
```

**Step 3: Set `instrument` in cells and `instrumentId` in channels**

The pattern-creation functions need to know which instrument index corresponds to each channel. Pass a `channelInstrumentMap: Map<number, number>` (trackIndex → instrumentId) into the create functions.

Update `createPatternFromMIDI` signature and usage:

```typescript
// OLD call:
const pattern = createPatternFromMIDI(midi, opts, ppq, rowsPerBeat);

// NEW call — pass the instrument map
const trackToInstId = new Map<number, number>();
let idx = 0;
midi.tracks.forEach((track, ti) => {
  if (track.notes.length === 0) return;
  trackToInstId.set(ti, idx + 1);
  idx++;
});
const pattern = createPatternFromMIDI(midi, opts, ppq, rowsPerBeat, trackToInstId);
```

Update `createPatternFromMIDI` to accept and use the map:

```typescript
function createPatternFromMIDI(
  midi: Midi,
  options: MIDIImportOptions,
  ppq: number,
  rowsPerBeat: number,
  trackToInstId: Map<number, number>,   // ← ADD
): Pattern {
  // ... (existing logic unchanged until channel creation)

  const channels = Array.from(channelNotes.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([trackIndex, notes]) => {
      const instId = trackToInstId.get(trackIndex) ?? 1;  // ← ADD
      const rows: TrackerCell[] = Array.from({ length: patternLength }, () => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }));

      notes.forEach(({ tick, note }) => {
        const row = tickToRow(tick, ppq, rowsPerBeat, options.quantize);
        if (row < 0 || row >= patternLength) return;
        const xmNote = midiToXMNote(note.midi);
        if (!xmNote) return;
        rows[row].note = xmNote;
        rows[row].instrument = instId;   // ← ADD: set instrument number
        if (options.velocityToVolume) {
          const volumeValue = velocityToVolume(note.velocity * 127);
          rows[row].volume = 0x10 + Math.round((volumeValue / 64) * 64);
        }
        const endRow = tickToRow(tick + note.durationTicks, ppq, rowsPerBeat, options.quantize);
        if (endRow < patternLength && endRow > row) {
          rows[endRow].note = 97;
        }
      });

      return {
        id: generateId('channel'),
        name: `Ch ${trackIndex + 1}`,
        instrumentId: instId,   // ← ADD: wire channel to instrument
        color: null,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80,
        pan: 0,
        rows,
      };
    });
  // ...
}
```

Similarly update `createPatternFromTrack` to accept and use its instrument id:

```typescript
// OLD call:
const pattern = createPatternFromTrack(track, trackIndex, opts, ppq, rowsPerBeat);

// NEW call:
const instId = (nonEmptyIndex + 1); // where nonEmptyIndex tracks only non-empty tracks
const pattern = createPatternFromTrack(track, trackIndex, instId, opts, ppq, rowsPerBeat);
```

Update `createPatternFromTrack`:

```typescript
function createPatternFromTrack(
  track: Track,
  trackIndex: number,
  instId: number,           // ← ADD
  options: MIDIImportOptions,
  ppq: number,
  rowsPerBeat: number,
): Pattern {
  // ... existing logic

  // In the note loop, add instrument assignment:
  rows[row].note = xmNote;
  rows[row].instrument = instId;   // ← ADD

  // In channel creation:
  return {
    id: generateId('pattern'),
    name: track.name || `Track ${trackIndex + 1}`,
    length: patternLength,
    channels: [
      {
        id: generateId('channel'),
        name: 'Channel 1',
        instrumentId: instId,   // ← CHANGE from null to instId
        // ...
      },
    ],
  };
}
```

Also update the loop that calls `createPatternFromTrack`:

```typescript
// Current code:
for (let trackIndex = 0; trackIndex < midi.tracks.length; trackIndex++) {
  const track = midi.tracks[trackIndex];
  if (track.notes.length === 0) continue;
  const pattern = createPatternFromTrack(track, trackIndex, opts, ppq, rowsPerBeat);
  patterns.push(pattern);
}

// New code:
let nonEmptyIndex = 0;
for (let trackIndex = 0; trackIndex < midi.tracks.length; trackIndex++) {
  const track = midi.tracks[trackIndex];
  if (track.notes.length === 0) continue;
  const instId = nonEmptyIndex + 1;
  const pattern = createPatternFromTrack(track, trackIndex, instId, opts, ppq, rowsPerBeat);
  patterns.push(pattern);
  nonEmptyIndex++;
}
```

**Step 4: TypeScript check**

```bash
npm run type-check 2>&1 | grep -E "MIDIImporter|GMSoundBank"
```
Expected: no output.

**Step 5: Commit**

```bash
git add src/lib/import/MIDIImporter.ts
git commit -m "feat(midi): auto-create GM2 instruments from track program numbers on import"
```

---

## Task 3: Wire instruments into `FT2Toolbar.tsx` MIDI handler

**Files:**
- Modify: `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` — around line 992 (the MIDI branch)

The current MIDI branch calls `resetInstruments()` then never calls `loadInstruments()`. Fix it:

**Step 1: Add `loadInstruments` to the MIDI branch**

Find the MIDI branch (added in previous session, looks like):

```typescript
} else if (isMIDIFile(lower)) {
  const result = await importMIDIFile(new File([buffer], filename), { mergeChannels: true });
  if (result.patterns.length === 0) {
    notify.error('No patterns found in MIDI file');
    return;
  }
  resetAutomation();
  resetTransport();
  resetInstruments();
  engine.disposeAllInstruments();
  loadPatterns(result.patterns);
  setPatternOrder(result.patterns.map((_, i) => i));
  setCurrentPattern(0);
  setBPM(result.bpm);
  setMetadata({ ... });
  notify.success(`Imported: ${result.metadata.name}`);
```

Add `loadInstruments(result.instruments)` after the resets and before `loadPatterns`:

```typescript
} else if (isMIDIFile(lower)) {
  const result = await importMIDIFile(new File([buffer], filename), { mergeChannels: true });
  if (result.patterns.length === 0) {
    notify.error('No patterns found in MIDI file');
    return;
  }
  resetAutomation();
  resetTransport();
  resetInstruments();
  engine.disposeAllInstruments();
  if (result.instruments.length > 0) {           // ← ADD
    loadInstruments(result.instruments);          // ← ADD
  }
  loadPatterns(result.patterns);
  setPatternOrder(result.patterns.map((_, i) => i));
  setCurrentPattern(0);
  setBPM(result.bpm);
  setMetadata({
    name: result.metadata.name,
    author: '',
    description: `Imported from MIDI (${result.metadata.tracks} track${result.metadata.tracks !== 1 ? 's' : ''})`,
  });
  notify.success(
    `Imported: ${result.metadata.name} — ${result.instruments.length} instrument(s), BPM: ${result.bpm}`
  );
```

**Step 2: TypeScript check**

```bash
npm run type-check 2>&1 | grep FT2Toolbar
```
Expected: no output.

**Step 3: Commit**

```bash
git add src/components/tracker/FT2Toolbar/FT2Toolbar.tsx
git commit -m "feat(midi): load GM2 instruments into instrument slots on MIDI file import"
```

---

## Task 4: Wire instruments into `App.tsx` MIDI handler

**Files:**
- Modify: `src/App.tsx` — around the MIDI branch added in previous session

**Step 1: Add instrument loading**

Find the MIDI branch in `App.tsx` `onLoadTrackerModule`:

```typescript
} else if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
  const { importMIDIFile } = await import('@lib/import/MIDIImporter');
  const result = await importMIDIFile(new File([buffer], filename), { mergeChannels: true });
  ...
  resetTransport();
  resetInstruments();
  getToneEngine().disposeAllInstruments();
  loadPats(result.patterns);
  ...
```

Add `loadInstruments` after the resets:

```typescript
const { loadInstruments: loadInst } = useInstrumentStore.getState();  // add this line
// after disposeAllInstruments():
if (result.instruments.length > 0) {
  loadInst(result.instruments);
}
loadPats(result.patterns);
```

**Step 2: TypeScript check**

```bash
npm run type-check 2>&1 | tail -5
```
Expected: clean (only pre-existing errors if any).

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(midi): load GM2 instruments in App.tsx MIDI handler"
```

---

## Task 5: Verify end-to-end

**Step 1: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: successful build, no new errors.

**Step 2: Manual test checklist**

- [ ] Load a multi-track `.mid` file (format 1) — confirm multiple instruments appear in instrument list named after GM programs
- [ ] Load a single-track `.mid` file (format 0 with multiple MIDI channels) — confirm one instrument per channel
- [ ] Load a MIDI file with percussion (channel 10) — confirm a DrumMachine instrument is created
- [ ] Play back — confirm notes trigger the correct instruments
- [ ] BPM matches MIDI file tempo

**Step 3: Final commit (if any fixups needed)**

```bash
git add -p
git commit -m "fix(midi): <describe any fixup>"
```

---

## Notes

- **GM2 instrument names are max 22 chars** — all names in `GM2_NAMES` are within this limit (InstrumentConfig.name limit).
- **Instrument IDs are 1-based** — id=1 is the first slot, matching XM convention.
- **`mergeChannels: true` is the default for MIDI import** — creates one pattern with multiple channels, one instrument per channel. Change to `false` for separate patterns per track.
- **`channel.instrumentId`** is `number | null` in the Pattern type — we set it to the numeric instrument id.
- **Percussion instruments** — MIDI channel 10 tracks (`track.instrument.percussion === true`) get a `DrumMachine` instrument regardless of program number.
- **Long MIDI files** are still truncated at 256 rows — this is a pre-existing limitation. Multi-pattern support would be a separate task.
