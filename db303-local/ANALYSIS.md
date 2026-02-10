# DB303.pages.dev Analysis

## Overview
Downloaded and analyzed the db303.pages.dev web implementation to understand their approach and extract useful resources.

**Site URL:** https://db303.pages.dev/
**GitHub:** https://github.com/dfl/lowenlabs-audio
**Author:** David Lowenfels (Löwen Labs)

## Downloaded Resources

### WASM Files
- `db303.wasm` (73KB) - Main DB303 WASM module
- `open303.wasm` (73KB) - Open303 baseline for comparison
- Both appear to be identical in size, suggesting db303 is a variant/fork of Open303

### JavaScript Files
- `db303-index.js` (80KB) - Main application bundle (minified)
- `webaudio-controls.js` (70KB) - Web Audio Controls UI library

### Configuration Files
- `default-preset.xml` - Default synthesizer preset
- `default-pattern.xml` - Default 303 pattern/sequence

## Key Findings

### 1. Parameter Structure (from default-preset.xml)

The db303 implementation has a comprehensive parameter set organized into:

#### Oscillator
- `waveform` (0-1) - Saw/Square blend
- `pulseWidth` (0-1) - PWM control
- `subOscGain` (0-1) - Sub-oscillator level
- `subOscBlend` (0-1) - Sub-oscillator mix

#### Filter (Core TB-303 params)
- `cutoff` (0-1)
- `resonance` (0-1)
- `envMod` (0-1) - Envelope modulation amount
- `decay` (0-1) - Filter envelope decay
- `accent` (0-1) - Accent amount

#### Devil Fish Modifications
This is extensive and shows db303 has FULL Devil Fish implementation:
- `normalDecay` (0.164) - Normal note decay time
- `accentDecay` (0.006) - Accented note decay time
- `softAttack` (0-1) - Soft attack for normal notes
- `accentSoftAttack` (0-1) - Soft attack for accented notes
- `passbandCompensation` (0.09) - Filter passband level compensation
- `resTracking` (0.743) - Resonance tracking across frequency
- `filterInputDrive` (0.169) - Overdrive/distortion before filter
- `filterSelect` (255) - Filter mode selection
- `diodeCharacter` (1) - Diode ladder filter character
- `duffingAmount` (0.03) - Non-linear filter effect
- `filterFmDepth` (0-1) - Filter FM modulation depth
- `lpBpMix` (0-1) - Lowpass/Bandpass mix
- `stageNLAmount` (0-1) - Per-stage non-linearity
- `ensembleAmount` (0-1) - Ensemble/chorus effect
- `oversamplingOrder` (2) - Oversampling quality (0-4)
- `filterTracking` (0-1) - Keyboard tracking
- `slideTime` (0.17) - Portamento/slide time

#### LFO
- `waveform` (0-2) - LFO waveform selection
- `rate` (0-1) - LFO speed
- `contour` (0-1) - LFO envelope contour
- `pitchDepth` (0-1) - Pitch modulation depth
- `pwmDepth` (0-1) - PWM modulation depth
- `filterDepth` (0-1) - Filter modulation depth

#### Built-in Effects
**Chorus:**
- `mode` (0-2) - Chorus mode
- `mix` (0-1) - Dry/wet mix

**Phaser:**
- `rate` (0-1) - Phaser speed
- `width` (0-1) - Phaser depth
- `feedback` (0-1) - Feedback amount
- `mix` (0-1) - Dry/wet mix

**Delay:**
- `time` (0-?) - Delay time
- `feedback` (0-1) - Feedback amount
- `tone` (0-1) - Tone control
- `mix` (0-1) - Dry/wet mix
- `spread` (0-1) - Stereo spread

### 2. Pattern/Sequencer Format (from default-pattern.xml)

```xml
<db303-pattern version="1.0" numSteps="16">
  <step index="0" key="0" octave="0" gate="true" accent="false" slide="false"/>
  ...
</db303-pattern>
```

**Pattern attributes:**
- `numSteps` - Pattern length (1-32 steps)
- Each step has:
  - `index` - Step position (0-based)
  - `key` - Note within scale (0-11 for chromatic)
  - `octave` - Octave offset (-2 to +2 typical)
  - `gate` - Note on/off
  - `accent` - Accent flag
  - `slide` - Portamento/slide flag

### 3. Features We Don't Have Yet

Comparing db303.pages.dev to our implementation:

#### Missing Features:
1. **LFO System** - Complete LFO with multiple destinations
   - Pitch modulation
   - PWM modulation
   - Filter modulation
   - Multiple waveforms

2. **Built-in Effects Chain**
   - Chorus (with multiple modes)
   - Phaser
   - Stereo delay with tone control

3. **Enhanced Devil Fish Parameters**
   - `passbandCompensation` - We may not have this
   - `resTracking` - Resonance tracking
   - `duffingAmount` - Non-linear filter effect
   - `lpBpMix` - LP/BP mix control
   - `stageNLAmount` - Per-stage NL
   - `ensembleAmount` - Built-in ensemble
   - `oversamplingOrder` - Configurable oversampling

4. **Oscillator Enhancements**
   - Pulse width control
   - Sub-oscillator with gain and blend

5. **Advanced Filter**
   - Filter mode selection (multiple modes)
   - Input drive/overdrive
   - Diode character control

6. **Pattern/Sequencer Features**
   - XML import/export
   - Variable pattern length (1-32 steps)
   - Per-step octave control

### 4. Implementation Differences

**Our Current Implementation (Open303-based):**
- Core TB-303 parameters ✓
- Basic Devil Fish parameters ✓
- WASM-based audio engine ✓
- AudioWorklet processing ✓

**db303.pages.dev Additional Features:**
- Full Devil Fish parameter set
- LFO system
- Built-in effects (chorus, phaser, delay)
- Enhanced oscillator (PWM, sub-osc)
- Pattern sequencer with XML format
- WebGL visualizer
- Web Audio Controls UI

### 5. WASM Analysis

Both `db303.wasm` and `open303.wasm` are 73KB, suggesting:
- They may share the same base engine
- db303 might be a parameter/preset layer over Open303
- OR they're built from the same source with different configurations

The presence of extensive Devil Fish parameters in the preset XML suggests db303 has these implemented in WASM, not just in JavaScript.

## Recommendations

### High Priority Enhancements:
1. **Add LFO system** - This is a major feature gap
2. **Implement missing Devil Fish parameters**:
   - `passbandCompensation`
   - `resTracking`
   - `duffingAmount`
   - `lpBpMix`
   - `oversamplingOrder`

### Medium Priority:
3. **Add pulse width control** to oscillator
4. **Add sub-oscillator** with gain/blend
5. **Implement built-in effects** (chorus, phaser, delay)

### Lower Priority:
6. **Add pattern sequencer** with XML import/export
7. **Implement WebGL visualizer** for eye candy
8. **Add filter mode selection**

## Usage Notes

The downloaded resources can be used for:
- **Reference implementation** - Study how they structure parameters
- **Preset conversion** - Convert their XML presets to our format
- **Feature comparison** - Identify gaps in our implementation
- **Pattern inspiration** - Use their demo patterns as starting points

## Next Steps

1. **Compare WASM APIs** - Decompile/analyze the WASM to see what functions are exposed
2. **Test parameter mapping** - See if their parameters map 1:1 to our Open303 implementation
3. **Extract more presets** - Search for additional preset files on their site
4. **Implement priority features** - Start with LFO system and missing DF parameters
