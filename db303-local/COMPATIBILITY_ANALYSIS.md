# DB303 Compatibility Analysis

## Current Status

### Our WASM (rosic Open303)
- **Size**: 68KB
- **Source**: `juce-wasm/db303/` - Robin Schmidt's Open303 library
- **Parameters**: ~32 via `setParameter(int, float)` interface
- **Features**: Basic TB-303 emulation (saw/square, filter, envelope)

### Reference db303.wasm (db303.pages.dev)
- **Size**: 152KB
- **Parameters**: 62+ named setters via embind
- **Features**: Advanced 303 with:
  - Korg filter modeling (bite, clip, crossmod, Q sag, sharpness, warmth, stiffness)
  - Devil Fish modifications
  - Extended cutoff/envMod modes (10-5000Hz, 0-300%)
  - Built-in ensemble effect
  - Per-stage non-linearity
  - Pitch-to-pulse-width modulation
  - LFO with multiple destinations
  - Chorus, phaser, delay effects
  - Internal sequencer with swing

## Missing Parameters in Our Implementation

The following parameters exist in the reference WASM but not in our rosic-based WASM:

### Korg Filter Parameters
| Parameter | WASM Function | Description |
|-----------|---------------|-------------|
| korgBite | setKorgBite | Filter "bite" or edge character |
| korgClip | setKorgClip | Soft clipping in filter |
| korgCrossmod | setKorgCrossmod | Cross modulation between filter stages |
| korgQSag | setKorgQSag | Resonance sag behavior |
| korgSharpness | setKorgSharpness | Filter sharpness/precision |
| korgWarmth | setKorgWarmth | Diode character / warmth |
| korgStiffness | setKorgStiffness | Duffing amount (with sticky-zero) |
| korgFilterFm | setKorgFilterFm | Filter FM depth |
| korgIbiasScale | setKorgIbiasScale | Resonance tracking (inverted) |

### Extended Mode Parameters
| Parameter | WASM Function | Description |
|-----------|---------------|-------------|
| cutoffHz | setCutoffHz | Direct Hz control (10-5000Hz) |
| envModPercent | setEnvModPercent | Direct percent (0-300%) |

### Advanced Features
| Parameter | WASM Function | Description |
|-----------|---------------|-------------|
| pitchToPw | setPitchToPw | Pitch to pulse width modulation |
| stageNLAmount | setStageNLAmount | Per-stage non-linearity |
| ensembleAmount | setEnsembleAmount | Built-in ensemble effect |

### Sequencer Functions (not needed - we have our own)
- setSequencerNumSteps
- setSequencerRootNote
- setSequencerStep
- setSequencerSwing
- setSequencerTempo

## Workaround Applied

Our DB303Synth.ts now has setter methods for ALL the reference parameters, but they will:
1. Try named setters first (for future WASM upgrade)
2. Fall back to numeric ID mapping (for current WASM)
3. Silently no-op for parameters our WASM doesn't support

## Path to Full 1:1 Compatibility

### Option 1: Replace WASM (Recommended)
1. Extract embind loader from reference site's bundled JS
2. Copy `db303.wasm` to `public/db303/`
3. Update worklet to instantiate `DB303Engine` class
4. All 62+ parameters work automatically

### Option 2: Rebuild from Source
1. Obtain db303 C++ source (not publicly available)
2. Compile to WASM with embind
3. Update worklet accordingly

### Option 3: Live with Differences
Our rosic Open303 is a valid TB-303 emulation, just simpler:
- Core 303 behavior works correctly
- Filter sounds authentic but lacks advanced modeling
- Devil Fish parameters have no effect
- Good for most use cases

## Files Updated for Future Compatibility

- `src/engine/db303/DB303Synth.ts`: Added all 62 parameter constants and setters
- `src/types/instrument.ts`: Updated DEFAULT_TB303 and DEFAULT_DEVIL_FISH
- This allows seamless WASM upgrade when available
