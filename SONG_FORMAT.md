# DEViLBOX Song Format Documentation

**Version:** 1.0.0
**Format:** `devilbox-song`

This document provides a complete reference for creating DEViLBOX `.song.json` files manually.

---

## Table of Contents

- [Overview](#overview)
- [Root Structure](#root-structure)
- [Metadata](#metadata)
- [Instruments](#instruments)
  - [Common Fields](#instrument-common-fields)
  - [Synth Types](#synth-types)
  - [Filter Configurations](#filter-configurations)
- [Patterns](#patterns)
- [Channels](#channels)
- [Tracker Cells](#tracker-cells)
- [Effects](#effects)
- [Common Errors](#common-errors)
- [Complete Examples](#complete-examples)

---

## Overview

DEViLBOX uses a JSON-based song format that contains:
- **Metadata**: Project information
- **Instruments**: Synth/sampler configurations
- **Patterns**: Musical data organized in tracker-style rows
- **Sequence**: Playback order of patterns
- **BPM**: Tempo

---

## Root Structure

Every `.song.json` file must have this exact structure:

```json
{
  "format": "devilbox-song",
  "version": "1.0.0",
  "metadata": { ... },
  "bpm": 125,
  "instruments": [ ... ],
  "patterns": [ ... ],
  "sequence": [ ... ],
  "automation": { ... },          // Optional
  "automationCurves": [ ... ],    // Optional
  "masterEffects": [ ... ]        // Optional
}
```

### Required Root Fields

| Field | Type | Description |
|-------|------|-------------|
| `format` | `"devilbox-song"` | **REQUIRED** - Must be exactly this string |
| `version` | `string` | **REQUIRED** - Format version (e.g., "1.0.0") |
| `metadata` | `object` | **REQUIRED** - Project metadata |
| `bpm` | `number` | **REQUIRED** - Tempo (30-300) |
| `instruments` | `array` | **REQUIRED** - Array of instrument configs |
| `patterns` | `array` | **REQUIRED** - Array of pattern objects |
| `sequence` | `string[]` | **REQUIRED** - Pattern IDs in playback order |

### Optional Root Fields

| Field | Type | Description |
|-------|------|-------------|
| `automation` | `object` | Legacy automation data (nested format) |
| `automationCurves` | `array` | Flat array of automation curves |
| `masterEffects` | `array` | Global effects chain |

---

## Metadata

```json
{
  "metadata": {
    "id": "unique-song-id",
    "name": "My Song Title",
    "author": "Artist Name",
    "description": "Optional description",
    "createdAt": "2026-01-21T00:00:00.000Z",
    "modifiedAt": "2026-01-21T00:00:00.000Z",
    "version": "1.0.0"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier (kebab-case recommended) |
| `name` | `string` | Yes | Display name |
| `author` | `string` | No | Creator name |
| `description` | `string` | No | Project description |
| `createdAt` | `string` | No | ISO 8601 timestamp |
| `modifiedAt` | `string` | No | ISO 8601 timestamp |
| `version` | `string` | No | Song version (semantic versioning) |

---

## Instruments

### Instrument Common Fields

**Every instrument MUST have these fields:**

```json
{
  "id": 1,
  "name": "Instrument Name",
  "synthType": "Synth",
  "effects": [],
  "volume": -6,
  "pan": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `number` | **YES** | Instrument ID (0-255) |
| `name` | `string` | **YES** | Display name |
| `synthType` | `string` | **YES** | Synth type (see below) |
| `effects` | `array` | **YES** | Effects chain (can be empty `[]`) |
| `volume` | `number` | **YES** | Volume in dB (-60 to 0) |
| `pan` | `number` | **YES** | Pan (-100 to 100, 0 = center) |

---

### Synth Types

#### Available Synth Types

```typescript
'Synth' | 'MonoSynth' | 'DuoSynth' | 'FMSynth' | 'AMSynth' |
'PluckSynth' | 'MetalSynth' | 'MembraneSynth' | 'NoiseSynth' |
'TB303' | 'Sampler' | 'Player' | 'Wavetable' | 'GranularSynth' |
'SuperSaw' | 'PolySynth' | 'Organ' | 'DrumMachine' |
'ChipSynth' | 'PWMSynth' | 'StringMachine' | 'FormantSynth'
```

---

### Standard Synth Configuration

Used by: `Synth`, `MonoSynth`, `DuoSynth`, `FMSynth`, `AMSynth`, `PluckSynth`

```json
{
  "id": 0,
  "name": "Lead Synth",
  "synthType": "MonoSynth",
  "oscillator": {
    "type": "sawtooth",
    "detune": 0
  },
  "envelope": {
    "attack": 10,
    "decay": 300,
    "sustain": 0,
    "release": 100
  },
  "filter": {
    "type": "lowpass",
    "frequency": 2000,
    "Q": 1,
    "rolloff": -24
  },
  "effects": [],
  "volume": -6,
  "pan": 0
}
```

#### Oscillator Config

| Field | Type | Values | Default |
|-------|------|--------|---------|
| `type` | `string` | `"sine"`, `"square"`, `"sawtooth"`, `"triangle"` | `"sawtooth"` |
| `detune` | `number` | -100 to 100 (cents) | `0` |

#### Envelope Config

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `attack` | `number` | 0-2000 | Attack time in ms |
| `decay` | `number` | 0-2000 | Decay time in ms |
| `sustain` | `number` | 0-1 | Sustain level (0-100%) |
| `release` | `number` | 0-5000 | Release time in ms |

#### Filter Config

⚠️ **CRITICAL: Filter properties differ between synth types!**

**Standard Synths (Synth, MonoSynth, etc.):**
```json
{
  "filter": {
    "type": "lowpass",
    "frequency": 2000,    // ← Use "frequency" (20-20000 Hz)
    "Q": 1,               // ← Use "Q" (0-100 resonance)
    "rolloff": -24        // ← Use "rolloff" (-12, -24, -48, -96)
  }
}
```

**TB-303 Only:**
```json
{
  "filter": {
    "cutoff": 800,      // ← Use "cutoff" (specific to TB-303)
    "resonance": 65     // ← Use "resonance" (specific to TB-303)
  }
}
```

---

### TB-303 Configuration

The TB-303 requires a special `tb303` configuration object:

```json
{
  "id": 1,
  "name": "Acid Bass",
  "synthType": "TB303",
  "tb303": {
    "oscillator": {
      "type": "sawtooth"
    },
    "filter": {
      "cutoff": 400,
      "resonance": 80
    },
    "filterEnvelope": {
      "envMod": 75,
      "decay": 180
    },
    "accent": {
      "amount": 85
    },
    "slide": {
      "time": 60,
      "mode": "exponential"
    }
  },
  "effects": [],
  "volume": -6,
  "pan": 0
}
```

#### TB-303 Fields

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `oscillator.type` | `string` | `"sawtooth"`, `"square"` | Waveform |
| `filter.cutoff` | `number` | 157-4788 Hz | Filter cutoff frequency |
| `filter.resonance` | `number` | 0-100% | Filter resonance |
| `filterEnvelope.envMod` | `number` | 0-300% | Envelope modulation depth |
| `filterEnvelope.decay` | `number` | 16-3000 ms | Envelope decay time |
| `accent.amount` | `number` | 0-100% | Accent intensity |
| `slide.time` | `number` | 2-360 ms | Slide/glide time |
| `slide.mode` | `string` | `"linear"`, `"exponential"` | Slide curve |

---

### Sampler Configuration

For sample-based instruments:

```json
{
  "id": 2,
  "name": "Kick Drum",
  "synthType": "Sampler",
  "parameters": {
    "sampleUrl": "data:audio/wav;base64,..."
  },
  "effects": [],
  "volume": -6,
  "pan": 0
}
```

---

## Patterns

A pattern contains musical data organized in channels and rows:

```json
{
  "id": "pattern-0",
  "name": "Main Pattern",
  "length": 64,
  "channels": [ ... ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **YES** | Unique pattern ID (must be string!) |
| `name` | `string` | **YES** | Display name |
| `length` | `number` | **YES** | Number of rows (1-256) |
| `channels` | `array` | **YES** | Array of channel objects |

⚠️ **Common Error:** Pattern `id` must be a **string**, not a number!

```json
// ❌ WRONG
"id": 0

// ✅ CORRECT
"id": "pattern-0"
```

---

## Channels

Each channel in a pattern represents one track:

```json
{
  "id": "channel-0",
  "name": "Bass",
  "muted": false,
  "solo": false,
  "volume": 80,
  "pan": 0,
  "instrumentId": 1,
  "color": "#ef4444",
  "rows": [ ... ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **YES** | Unique channel ID |
| `name` | `string` | **YES** | Display name |
| `muted` | `boolean` | **YES** | Mute state |
| `solo` | `boolean` | **YES** | Solo state |
| `volume` | `number` | **YES** | Channel volume (0-100) |
| `pan` | `number` | **YES** | Pan (-100 to 100, 0 = center) |
| `instrumentId` | `number` | **YES** | Instrument ID to use |
| `color` | `string\|null` | **YES** | CSS color or `null` |
| `rows` | `array` | **YES** | Array of tracker cells |

⚠️ **All channel fields are REQUIRED!** Missing `pan`, `volume`, `solo`, or `instrumentId` will cause errors.

---

## Tracker Cells

Each row in a channel is a tracker cell:

```json
{
  "note": "C-4",
  "instrument": 1,
  "volume": 48,
  "effect": null,
  "effect2": null,
  "accent": false,
  "slide": false
}
```

### Standard Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `note` | `string\|null` | `"C-4"`, `"D#5"`, `"==="`, `null` | Note value |
| `instrument` | `number\|null` | 0-255, `null` | Instrument ID |
| `volume` | `number\|null` | 0-64, `null` | Volume (0x00-0x40) |
| `effect` | `string\|null` | `"A0F"`, `null` | Effect command |
| `effect2` | `string\|null` | `"486"`, `null` | Second effect |

### TB-303 Specific Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `accent` | `boolean` | `true`, `false` | Accent on/off |
| `slide` | `boolean` | `true`, `false` | Slide to next note |

### Note Format

Notes use FastTracker II format: `NOTE-OCTAVE`

```
C-4   → C in octave 4
C#4   → C# in octave 4
D-5   → D in octave 5
===   → Note off
null  → Empty cell
```

Valid notes: `C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`
Valid octaves: `-2` to `8`

### Empty Row Example

```json
{
  "note": null,
  "instrument": null,
  "volume": null,
  "effect": null,
  "effect2": null,
  "accent": false,
  "slide": false
}
```

---

## Effects

Effect commands are 3-character hex strings: `CMD` + `XY`

### Common Effects

| Code | Name | Description |
|------|------|-------------|
| `0xy` | Arpeggio | Cycles between note, note+x, note+y |
| `1xx` | Porta up | Slide pitch up |
| `2xx` | Porta down | Slide pitch down |
| `3xx` | Tone porta | Slide to target note |
| `4xy` | Vibrato | x=speed, y=depth |
| `5xy` | Tone porta + volume slide | |
| `6xy` | Vibrato + volume slide | |
| `7xy` | Tremolo | Volume vibrato |
| `8xy` | Set panning | 00=left, 80=center, FF=right |
| `9xx` | Sample offset | (for samplers) |
| `Axy` | Volume slide | x=up, y=down |
| `Bxx` | Jump to order | Jump to sequence position |
| `Cxx` | Set volume | 00-40 (0-64) |
| `Dxx` | Pattern break | Jump to next pattern at row xx |
| `Exy` | Extended | See extended effects |
| `Fxx` | Set speed/tempo | 01-1F=speed, 20-FF=BPM |

### Extended E-Effects

| Code | Name | Description |
|------|------|-------------|
| `E0x` | Set filter | |
| `E1x` | Fine porta up | |
| `E2x` | Fine porta down | |
| `E3x` | Glissando control | |
| `E4x` | Vibrato waveform | |
| `E5x` | Set finetune | |
| `E6x` | Pattern loop | E60=set loop, E6x=loop x times |
| `E7x` | Tremolo waveform | |
| `E8x` | Set panning (fine) | |
| `E9x` | Retrigger note | Retrigger every x ticks |
| `EAx` | Fine volume up | |
| `EBx` | Fine volume down | |
| `ECx` | Note cut | Cut note after x ticks |
| `EDx` | Note delay | Delay note by x ticks |
| `EEx` | Pattern delay | |
| `EFx` | Funk repeat | |

---

## Common Errors

### 1. Invalid Song Format Error

```
Failed to import song: Error: Invalid song format
```

**Causes:**
- Missing `"format": "devilbox-song"`
- Missing `"version"` field
- Missing `"sequence"` array
- Pattern IDs are numbers instead of strings

**Fix:**
```json
{
  "format": "devilbox-song",    // ← REQUIRED
  "version": "1.0.0",            // ← REQUIRED
  "metadata": { ... },
  "bpm": 129,
  "instruments": [ ... ],
  "patterns": [ ... ],
  "sequence": ["pattern-0"]      // ← REQUIRED (string IDs!)
}
```

---

### 2. Invalid setValueAtTime Error

```
Error: Invalid argument(s) to setValueAtTime: undefined
Error: Invalid argument(s) to setValueAtTime: null
```

**Cause:** Channel missing required fields (`pan`, `volume`, `solo`, `instrumentId`)

**Fix:**
```json
{
  "channels": [
    {
      "id": "channel-0",
      "name": "Bass",
      "muted": false,
      "solo": false,          // ← REQUIRED
      "volume": 80,           // ← REQUIRED
      "pan": 0,               // ← REQUIRED
      "instrumentId": 1,      // ← REQUIRED
      "color": "#ef4444",
      "rows": [ ... ]
    }
  ]
}
```

---

### 3. Cannot Read Property 'icon' Error

```
TypeError: Cannot read properties of undefined (reading 'icon')
```

**Cause:** Invalid `synthType` (e.g., `"TB303Accurate"` doesn't exist)

**Fix:** Use valid synth types only:
```json
{
  "synthType": "TB303"  // ✅ CORRECT (not "TB303Accurate")
}
```

---

### 4. Filter Property Errors

**Problem:** Using wrong filter property names for synth type

**Standard Synths:**
```json
// ❌ WRONG - Don't use TB-303 properties
{
  "filter": {
    "cutoff": 800,
    "resonance": 65
  }
}

// ✅ CORRECT - Use standard properties
{
  "filter": {
    "frequency": 2000,
    "Q": 1,
    "rolloff": -24
  }
}
```

**TB-303 Only:**
```json
// ✅ CORRECT - TB-303 uses special properties
{
  "tb303": {
    "filter": {
      "cutoff": 400,
      "resonance": 80
    }
  }
}
```

---

## Complete Examples

### Minimal Working Song

```json
{
  "format": "devilbox-song",
  "version": "1.0.0",
  "metadata": {
    "id": "minimal-song",
    "name": "Minimal Example",
    "author": "",
    "description": "",
    "createdAt": "2026-01-21T00:00:00.000Z",
    "modifiedAt": "2026-01-21T00:00:00.000Z",
    "version": "1.0.0"
  },
  "bpm": 125,
  "instruments": [
    {
      "id": 0,
      "name": "Default",
      "synthType": "Synth",
      "oscillator": {
        "type": "sawtooth",
        "detune": 0
      },
      "envelope": {
        "attack": 10,
        "decay": 500,
        "sustain": 0,
        "release": 100
      },
      "filter": {
        "type": "lowpass",
        "frequency": 2000,
        "Q": 1,
        "rolloff": -24
      },
      "effects": [],
      "volume": -6,
      "pan": 0
    }
  ],
  "patterns": [
    {
      "id": "pattern-0",
      "name": "Pattern 0",
      "length": 16,
      "channels": [
        {
          "id": "channel-0",
          "name": "Channel 0",
          "muted": false,
          "solo": false,
          "volume": 80,
          "pan": 0,
          "instrumentId": 0,
          "color": null,
          "rows": [
            {
              "note": "C-4",
              "instrument": 0,
              "volume": 48,
              "effect": null,
              "effect2": null,
              "accent": false,
              "slide": false
            }
            // ... 15 more rows (total 16)
          ]
        }
      ]
    }
  ],
  "sequence": ["pattern-0"]
}
```

---

### TB-303 Bass Line

```json
{
  "format": "devilbox-song",
  "version": "1.0.0",
  "metadata": {
    "id": "acid-bass",
    "name": "303 Bass",
    "author": "",
    "description": "TB-303 acid bassline",
    "createdAt": "2026-01-21T00:00:00.000Z",
    "modifiedAt": "2026-01-21T00:00:00.000Z",
    "version": "1.0.0"
  },
  "bpm": 130,
  "instruments": [
    {
      "id": 1,
      "name": "Acid Bass",
      "synthType": "TB303",
      "tb303": {
        "oscillator": {
          "type": "sawtooth"
        },
        "filter": {
          "cutoff": 400,
          "resonance": 80
        },
        "filterEnvelope": {
          "envMod": 75,
          "decay": 180
        },
        "accent": {
          "amount": 85
        },
        "slide": {
          "time": 60,
          "mode": "exponential"
        }
      },
      "effects": [],
      "volume": -6,
      "pan": 0
    }
  ],
  "patterns": [
    {
      "id": "pattern-bass",
      "name": "303 Pattern",
      "length": 16,
      "channels": [
        {
          "id": "channel-0",
          "name": "TB-303",
          "muted": false,
          "solo": false,
          "volume": 80,
          "pan": 0,
          "instrumentId": 1,
          "color": "#ef4444",
          "rows": [
            {
              "note": "C-2",
              "instrument": 1,
              "volume": 48,
              "effect": null,
              "effect2": null,
              "accent": true,
              "slide": false
            },
            {
              "note": null,
              "instrument": null,
              "volume": null,
              "effect": null,
              "effect2": null,
              "accent": false,
              "slide": false
            },
            {
              "note": "C-2",
              "instrument": 1,
              "volume": 40,
              "effect": null,
              "effect2": null,
              "accent": false,
              "slide": true
            },
            {
              "note": "D-2",
              "instrument": 1,
              "volume": 50,
              "effect": null,
              "effect2": null,
              "accent": true,
              "slide": false
            }
            // ... 12 more rows
          ]
        }
      ]
    }
  ],
  "sequence": ["pattern-bass"]
}
```

---

### Multi-Channel Song

```json
{
  "format": "devilbox-song",
  "version": "1.0.0",
  "metadata": {
    "id": "multi-channel",
    "name": "Multi-Channel Example",
    "author": "",
    "description": "Multiple instruments and channels",
    "createdAt": "2026-01-21T00:00:00.000Z",
    "modifiedAt": "2026-01-21T00:00:00.000Z",
    "version": "1.0.0"
  },
  "bpm": 125,
  "instruments": [
    {
      "id": 1,
      "name": "TB-303 Bass",
      "synthType": "TB303",
      "tb303": {
        "oscillator": { "type": "sawtooth" },
        "filter": { "cutoff": 400, "resonance": 80 },
        "filterEnvelope": { "envMod": 75, "decay": 180 },
        "accent": { "amount": 85 },
        "slide": { "time": 60, "mode": "exponential" }
      },
      "effects": [],
      "volume": -6,
      "pan": 0
    },
    {
      "id": 2,
      "name": "Lead Synth",
      "synthType": "MonoSynth",
      "oscillator": {
        "type": "sawtooth",
        "detune": 0
      },
      "envelope": {
        "attack": 5,
        "decay": 200,
        "sustain": 0.3,
        "release": 150
      },
      "filter": {
        "type": "lowpass",
        "frequency": 1200,
        "Q": 2,
        "rolloff": -24
      },
      "effects": [],
      "volume": -8,
      "pan": 0
    }
  ],
  "patterns": [
    {
      "id": "pattern-main",
      "name": "Main",
      "length": 16,
      "channels": [
        {
          "id": "channel-0",
          "name": "Lead",
          "muted": false,
          "solo": false,
          "volume": 80,
          "pan": 0,
          "instrumentId": 2,
          "color": "#3b82f6",
          "rows": [ /* 16 rows */ ]
        },
        {
          "id": "channel-1",
          "name": "Bass",
          "muted": false,
          "solo": false,
          "volume": 80,
          "pan": 0,
          "instrumentId": 1,
          "color": "#ef4444",
          "rows": [ /* 16 rows */ ]
        }
      ]
    }
  ],
  "sequence": ["pattern-main"]
}
```

---

## Quick Reference Checklist

When creating a song file, ensure:

- [ ] Root has `"format": "devilbox-song"`
- [ ] Root has `"version": "1.0.0"`
- [ ] Root has `"sequence"` array with pattern IDs
- [ ] All pattern IDs are **strings**, not numbers
- [ ] All instruments have `id`, `name`, `synthType`, `effects`, `volume`, `pan`
- [ ] All channels have `id`, `name`, `muted`, `solo`, `volume`, `pan`, `instrumentId`, `color`, `rows`
- [ ] Standard synths use `filter.frequency`, `filter.Q`, `filter.rolloff`
- [ ] TB-303 uses `tb303.filter.cutoff` and `tb303.filter.resonance`
- [ ] All tracker cells have `note`, `instrument`, `volume`, `effect`, `effect2`, `accent`, `slide`
- [ ] Pattern length matches number of rows in each channel
- [ ] Instrument IDs referenced in cells exist in instruments array

---

## AudioWorklet Hot-Reload Warning

If you see this error during development:

```
Uncaught NotSupportedError: An AudioWorkletProcessor with name "tb303-processor" is already registered
```

**This is harmless** - it occurs when Vite hot-reloads the TB-303 AudioWorklet. Just refresh the page to clear it. It won't affect production builds.

---

**Last Updated:** 2026-01-21
**DEViLBOX Version:** 1.0.0
