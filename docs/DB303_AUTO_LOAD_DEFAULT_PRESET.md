# DB303 Auto-Load Default Preset - Implementation Summary

## Problem

When users created a new JC303/DB303 instrument, it would use generic default parameters that didn't showcase the synth's capabilities. Users would need to:
1. Manually click the IMPORT button
2. Find and select the db303-default-preset.xml file
3. Load it to get a good starting sound

This was a poor user experience - **users would fail here if we didn't fix it**.

## Solution

Automatically load the db303-default-preset.xml parameters as the default values for all new JC303/DB303 instruments. Now when a user creates or selects a JC303/DB303 instrument, it immediately sounds great without any manual import needed.

## Implementation

### 1. Updated Default Constants

**File: `src/types/instrument.ts`**

Modified `DEFAULT_TB303` to use parameters from `db303-default-preset.xml`:

```typescript
export const DEFAULT_TB303: TB303Config = {
  engineType: 'jc303',
  oscillator: {
    type: 'sawtooth',
    pulseWidth: 0,          // Pure sawtooth (0.0 from XML)
    subOscGain: 0,          // Off
    subOscBlend: 100,       // Full blend when enabled (1.0 from XML)
  },
  filter: {
    cutoff: 1000,           // ~1000 Hz (0.5 normalized from XML)
    resonance: 50,          // 50% (0.5 normalized from XML)
  },
  filterEnvelope: {
    envMod: 50,             // 50% (0.5 normalized from XML)
    decay: 300,             // ~300ms (0.5 normalized on log scale from XML)
  },
  accent: {
    amount: 50,             // 50% (0.5 normalized from XML)
  },
  slide: {
    time: 51,               // ~51ms (0.17 normalized from XML)
    mode: 'exponential',
  },
  devilFish: {
    enabled: true,
    normalDecay: 16.4,           // 0.164 * 100
    accentDecay: 0.6,            // 0.006 * 100
    softAttack: 0,               // 0 * 100
    accentSoftAttack: 10,        // 0.1 * 100
    passbandCompensation: 9,     // 0.09 * 100
    resTracking: 74.3,           // 0.743 * 100
    filterSelect: 255,           // 255 (full)
    diodeCharacter: 1,           // 1.0 = authentic
    duffingAmount: 3,            // 0.03 * 100
    lpBpMix: 0,                  // 0% bandpass
    stageNLAmount: 0,            // 0% nonlinearity
    ensembleAmount: 0,           // 0% ensemble
    oversamplingOrder: 2,        // 4x oversampling
    filterTracking: 0,           // 0% tracking
    filterFM: 0,                 // 0% filter FM
    accentSweepEnabled: true,
    sweepSpeed: 'normal',
    highResonance: false,
    muffler: 'soft',
    vegDecay: 1230,
    vegSustain: 0,
  },
  lfo: {
    waveform: 0,        // Sine (off by default)
    rate: 0,            // Off
    contour: 0,
    pitchDepth: 0,
    pwmDepth: 0,
    filterDepth: 0,
  },
  chorus: {
    enabled: false,
    mode: 0,            // Mode 1 (0 normalized from XML)
    mix: 50,            // 50% (0.5 normalized from XML)
  },
  phaser: {
    enabled: false,
    rate: 50,           // 50% (0.5 normalized from XML)
    depth: 70,          // 70% (0.7 "width" from XML)
    feedback: 0,
    mix: 0,
  },
  delay: {
    enabled: false,
    time: 300,          // 300ms (3 from XML)
    feedback: 30,       // 30% (0.3 from XML)
    tone: 50,           // 50% (0.5 from XML)
    mix: 0,
    stereo: 50,         // 50% (0.5 "spread" from XML)
  },
};
```

### 2. Added Factory Preset

**File: `src/constants/tb303Presets.ts`**

Added "JC303 Default" as the first preset in the TB303_PRESETS array, making it easy for users to find and use:

```typescript
{
  type: 'synth' as const,
  name: 'JC303 Default',
  synthType: 'TB303',
  tb303: {
    engineType: 'jc303',
    // ... all parameters from db303-default-preset.xml
  },
  effects: [],
  volume: -6,
  pan: 0,
}
```

This preset is now available in the preset browser and can be selected manually if users want to reset to defaults.

## User Experience Improvements

### Before

1. User creates new JC303/DB303 instrument
2. Instrument has poor default sound
3. User doesn't know how to get a good sound
4. **User fails** ❌

### After

1. User creates new JC303/DB303 instrument
2. Instrument immediately has professional default sound from db303-default-preset.xml
3. User can start making music right away
4. **User succeeds** ✅

## Parameter Conversion

The XML preset uses normalized values (0.0 - 1.0), which were converted to DEViLBOX parameter ranges:

| Parameter | XML Value | Range | DEViLBOX Value |
|-----------|-----------|-------|----------------|
| Cutoff | 0.5 | 200-5000 Hz (log) | ~1000 Hz |
| Resonance | 0.5 | 0-100% | 50% |
| EnvMod | 0.5 | 0-100% | 50% |
| Decay | 0.5 | 30-3000 ms (log) | ~300 ms |
| Accent | 0.5 | 0-100% | 50% |
| Slide Time | 0.17 | 0-300 ms | ~51 ms |
| Pulse Width | 0.0 | 0-100% | 0% (sawtooth) |
| Sub Osc Blend | 1.0 | 0-100% | 100% |

## Files Modified

1. **src/types/instrument.ts**
   - Updated `DEFAULT_TB303` constant with db303-default-preset.xml parameters
   - Added `devilFish` configuration with all Devil Fish parameters

2. **src/constants/tb303Presets.ts**
   - Added "JC303 Default" preset as first item in TB303_PRESETS array
   - Uses identical parameters to DEFAULT_TB303

3. **src/lib/import/__tests__/Db303PatternConverter.test.ts**
   - Removed unused `Pattern` type import

## Testing

- ✅ TypeScript compilation passes
- ✅ All parameter ranges correctly converted from normalized values
- ✅ Devil Fish parameters properly configured
- ✅ Effects (Chorus, Phaser, Delay) disabled by default with correct standby parameters
- ✅ LFO disabled by default

## Compatibility

The default preset is fully compatible with:
- ✅ db303.pages.dev XML format
- ✅ JC303 engine
- ✅ DB303 engine variant
- ✅ All existing JC303/DB303 preset import/export functionality

## Future Enhancements

Potential improvements:
- Auto-load different default presets based on selected engine type (jc303 vs db303)
- Provide multiple starter presets for different musical styles
- Preset browser with "Restore Factory Defaults" option

---

**Status**: ✅ Complete
**Version**: 1.0
**Date**: February 7, 2026
