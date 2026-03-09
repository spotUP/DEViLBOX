---
name: compose
description: "Generate musical patterns using AI composition tools — bass, drums, melody, arpeggio"
---

# /compose — AI Music Composition

Generate musical patterns in the loaded song using AI composition tools.

## Usage

```
/compose <type> [options]
```

Examples:
- `/compose bass` — Generate a bass line (auto-detects key from loaded song)
- `/compose drums channel 1 density 0.6` — Drum pattern on channel 1
- `/compose melody key C minor` — Melody in C minor
- `/compose arpeggio key Am octave 4` — Arpeggio in A minor, octave 4

## Available Pattern Types

| Type | Description |
|------|-------------|
| `bass` | Root-heavy bass line, low octave, euclidean rhythm |
| `drums` | Kick on 1/3, snare on 2/4, hihats on 8ths/16ths |
| `arpeggio` | Cycle through chord tones (1st, 3rd, 5th) |
| `chord` | Stacked chord tones on beat positions |
| `melody` | Scale-aware random walk with rhythmic variation |
| `euclidean` | Pure Bjorklund euclidean rhythm with scale notes |

## Steps

### Step 1: Analyze Existing Song (if loaded)
```
analyze_song
```
Returns detected key, scale, channel roles, chord progression. Use this to inform generation.

### Step 2: Generate Pattern
```
generate_pattern(
  type: "<bass|drums|arpeggio|chord|melody|euclidean>",
  channel: 0,           // Target channel (default 0)
  patternIndex: 0,      // Target pattern (default 0)
  instrument: 1,        // Instrument to use (default 1)
  key: "C",             // Root note (auto-detected if omitted)
  scale: "minor",       // Scale type (default minor)
  octave: 3,            // Base octave (default 3)
  density: 0.5          // Note density 0-1 (default 0.5)
)
```

### Step 3: Preview
```
render_pattern_text(patternIndex: 0, channels: [0])
```
Show what was generated.

### Step 4: Play
```
play
wait_for_audio(timeoutMs: 3000)
```

## Transforms

After generating, apply transforms:

```
transform_pattern(patternIndex: 0, channel: 0, operation: "transpose", params: {semitones: 5})
transform_pattern(patternIndex: 0, channel: 0, operation: "reverse")
transform_pattern(patternIndex: 0, channel: 0, operation: "invert")
transform_pattern(patternIndex: 0, channel: 0, operation: "humanize", params: {amount: 0.2})
```

Available operations: `transpose`, `reverse`, `rotate`, `invert`, `retrograde`, `augment`, `diminish`, `humanize`

## Scale Types

`major`, `minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `pentatonic`, `pentatonicMinor`, `blues`, `chromatic`

## Drum Parameters

For drum patterns, customize via `params`:
```
generate_pattern(type: "drums", channel: 1, instrument: 2, density: 0.5,
  params: {kick: 36, snare: 38, hihat: 42, rowsPerBeat: 4})
```
