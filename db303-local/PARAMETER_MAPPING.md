# Parameter Mapping: db303.pages.dev ↔ DEViLBOX

## Overview
This document maps parameters between the db303.pages.dev implementation (XML format) and our DEViLBOX implementation (TypeScript/JSON).

## Core TB-303 Parameters

### Filter
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<cutoff>0.5</cutoff>` | `filter.cutoff` | 200-5000 Hz | XML uses 0-1, we use Hz |
| `<resonance>0.5</resonance>` | `filter.resonance` | 0-100 | XML uses 0-1, we use 0-100 |
| `<envMod>0.5</envMod>` | `filterEnvelope.envMod` | 0-100 | XML uses 0-1, we use 0-100 |
| `<decay>0.5</decay>` | `filterEnvelope.decay` | 0-100 | Filter envelope decay |
| `<accent>0.5</accent>` | `accent.amount` | 0-100 | Accent amount |

### Oscillator
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<waveform>0</waveform>` | `oscillator.type` | 'sawtooth' \| 'square' | 0=saw, 1=square |
| `<pulseWidth>0</pulseWidth>` | ❌ **Missing** | 0-1 | PWM control |
| `<subOscGain>0</subOscGain>` | ❌ **Missing** | 0-1 | Sub-oscillator level |
| `<subOscBlend>1</subOscBlend>` | ❌ **Missing** | 0-1 | Sub-osc mix type |

### Slide
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<slideTime>0.17</slideTime>` | `slide.time` | 0-1 (or ms) | Portamento time |

## Devil Fish Parameters

### Basic Devil Fish (We Have)
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<normalDecay>0.164</normalDecay>` | `devilFish.normalDecay` | 0-? ms | Normal note decay |
| `<accentDecay>0.006</accentDecay>` | `devilFish.accentDecay` | 0-? ms | Accent note decay |
| `<filterInputDrive>0.169</filterInputDrive>` | `devilFish.overdrive` | 0-1 | Filter input overdrive |
| `<filterTracking>0</filterTracking>` | `devilFish.filterTracking` | 0-1 | Keyboard tracking |

### Extended Devil Fish (Missing from DEViLBOX)
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<softAttack>0</softAttack>` | ❌ **Missing** | 0-1 | Normal note soft attack |
| `<accentSoftAttack>0.1</accentSoftAttack>` | ❌ **Missing** | 0-1 | Accent soft attack |
| `<passbandCompensation>0.09</passbandCompensation>` | ❌ **Missing** | 0-1 | Filter passband compensation |
| `<resTracking>0.743</resTracking>` | ❌ **Missing** | 0-1 | Resonance frequency tracking |
| `<filterSelect>255</filterSelect>` | ❌ **Missing** | 0-255 | Filter mode selection |
| `<diodeCharacter>1</diodeCharacter>` | ❌ **Missing** | 0-? | Diode ladder character |
| `<duffingAmount>0.03</duffingAmount>` | ❌ **Missing** | 0-1 | Non-linear filter (Duffing oscillator) |
| `<filterFmDepth>0</filterFmDepth>` | `devilFish.filterFM` | 0-1 | Filter FM modulation |
| `<lpBpMix>0</lpBpMix>` | ❌ **Missing** | 0-1 | Lowpass/Bandpass mix |
| `<stageNLAmount>0</stageNLAmount>` | ❌ **Missing** | 0-1 | Per-stage non-linearity |
| `<ensembleAmount>0</ensembleAmount>` | ❌ **Missing** | 0-1 | Built-in ensemble effect |
| `<oversamplingOrder>2</oversamplingOrder>` | ❌ **Missing** | 0-4 | Oversampling quality |

## LFO Parameters (Completely Missing from DEViLBOX)

| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<waveform>0</waveform>` | ❌ **Missing** | 0-2 | LFO waveform (sine/tri/square) |
| `<rate>0</rate>` | ❌ **Missing** | 0-1 | LFO speed |
| `<contour>0</contour>` | ❌ **Missing** | 0-1 | LFO envelope contour |
| `<pitchDepth>0</pitchDepth>` | ❌ **Missing** | 0-1 | Pitch modulation depth |
| `<pwmDepth>0</pwmDepth>` | ❌ **Missing** | 0-1 | PWM modulation depth |
| `<filterDepth>0</filterDepth>` | ❌ **Missing** | 0-1 | Filter modulation depth |

## Built-in Effects (Completely Missing from DEViLBOX)

### Chorus
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<mode>0</mode>` | ❌ **Missing** | 0-2 | Chorus mode selection |
| `<mix>0.5</mix>` | ❌ **Missing** | 0-1 | Chorus dry/wet mix |

### Phaser
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<rate>0.5</rate>` | ❌ **Missing** | 0-1 | Phaser rate/speed |
| `<width>0.7</width>` | ❌ **Missing** | 0-1 | Phaser depth |
| `<feedback>0</feedback>` | ❌ **Missing** | 0-1 | Phaser feedback |
| `<mix>0</mix>` | ❌ **Missing** | 0-1 | Phaser dry/wet mix |

### Delay
| db303.pages.dev XML | DEViLBOX TypeScript | Range | Notes |
|---------------------|---------------------|-------|-------|
| `<time>3</time>` | ❌ **Missing** | 0-? | Delay time (seconds?) |
| `<feedback>0.3</feedback>` | ❌ **Missing** | 0-1 | Delay feedback |
| `<tone>0.5</tone>` | ❌ **Missing** | 0-1 | Delay tone/filter |
| `<mix>0</mix>` | ❌ **Missing** | 0-1 | Delay dry/wet mix |
| `<spread>0.5</spread>` | ❌ **Missing** | 0-1 | Stereo spread |

## Pattern/Sequencer Format

### db303.pages.dev Pattern (XML)
```xml
<db303-pattern version="1.0" numSteps="16">
  <step index="0" key="0" octave="0" gate="true" accent="false" slide="false"/>
</db303-pattern>
```

### DEViLBOX Pattern (needs implementation)
Our sequencer pattern format would need to match:
```typescript
interface TB303Pattern {
  numSteps: number; // 1-32
  steps: Array<{
    index: number;
    key: number;      // 0-11 (chromatic scale)
    octave: number;   // -2 to +2
    gate: boolean;    // note on/off
    accent: boolean;  // accent flag
    slide: boolean;   // portamento/slide
  }>;
}
```

## Conversion Functions Needed

### XML to TypeScript
```typescript
function convertDb303PresetToTB303Config(xml: string): TB303Config {
  // Parse XML and map parameters
  // Handle range conversions (0-1 → 0-100, etc.)
  // Skip unsupported parameters with console warning
}

function convertDb303PatternToTB303Pattern(xml: string): TB303Pattern {
  // Parse XML pattern
  // Map steps directly (format is very similar)
}
```

### TypeScript to XML
```typescript
function convertTB303ConfigToDb303Preset(config: TB303Config): string {
  // Generate XML from our config
  // Convert ranges (0-100 → 0-1, etc.)
  // Include default values for parameters we don't support
}

function convertTB303PatternToDb303Pattern(pattern: TB303Pattern): string {
  // Generate XML pattern
  // Direct mapping (formats are compatible)
}
```

## Priority Features to Implement

Based on parameter analysis:

### High Priority (Major features):
1. **LFO System** (6 parameters)
   - Completely missing from our implementation
   - Essential for modulation capabilities

2. **Extended Devil Fish Parameters** (10 parameters)
   - `duffingAmount` - Non-linear filter effect (unique to db303)
   - `lpBpMix` - LP/BP mix (filter topology control)
   - `resTracking` - Resonance tracking
   - `passbandCompensation` - Filter compensation
   - `oversamplingOrder` - Audio quality control

### Medium Priority:
3. **Oscillator Enhancements** (3 parameters)
   - `pulseWidth` - PWM control
   - `subOscGain` / `subOscBlend` - Sub-oscillator

4. **Built-in Effects** (12 parameters total)
   - Chorus, Phaser, Delay
   - All with comprehensive controls

### Lower Priority:
5. **Pattern/Sequencer**
   - XML import/export
   - Variable length (1-32 steps)
   - Per-step octave control

## Implementation Notes

1. **Range Conversions:**
   - db303 typically uses 0-1 normalized ranges
   - We use musical units (Hz for frequency, 0-100 for percentages)
   - Need conversion functions for import/export

2. **Missing Parameters:**
   - We should add these to our TB303Config interface
   - Mark them as optional for backward compatibility
   - Log warnings when importing presets with unsupported params

3. **WASM API:**
   - Check if our Open303 WASM already supports these parameters
   - If not, we need to rebuild from rosic source with additions
   - Or switch to db303 WASM which appears to have full feature set

4. **Backward Compatibility:**
   - Keep existing parameters working
   - Add new parameters as optional
   - Provide sensible defaults for all new parameters
