# DEViLBOX Project Memory

## CRITICAL: Git Safety Rules

**!!! ABSOLUTE RULE - NEVER VIOLATE !!!**

### NEVER overwrite local changes without explicit user approval

Before running ANY of these destructive git commands, you MUST:

1. **STOP and WARN the user** about potential data loss
2. **Show exactly what local changes exist** (`git status`, `git diff --stat`)
3. **Explain the impact** - how many files, lines of code, hours of work at risk
4. **Get EXPLICIT approval** - user must type "yes" or confirm
5. **Suggest saving first** - recommend `git stash` or creating a backup branch

**FORBIDDEN COMMANDS** (without user approval AND saving local changes first):
- `git reset --hard` - DESTROYS all local changes
- `git checkout .` - DESTROYS all local changes
- `git restore .` - DESTROYS all local changes
- `git clean -f` - DELETES untracked files permanently
- `git pull` (when local changes exist) - Can cause merge conflicts or loss
- `git fetch origin && git reset --hard origin/main` - DESTROYS everything

**SAFE ALTERNATIVES:**
- `git stash` - Saves local changes before any destructive operation
- `git stash -u` - Saves local changes INCLUDING untracked files
- `git branch backup-YYYY-MM-DD` - Creates backup branch before reset
- `git diff > backup.patch` - Saves changes as patch file

**WHY THIS MATTERS:**
On 2025-01-29, 20 hours of local development work was permanently lost when
`git reset --hard` was run without saving local changes first. This catastrophic
data loss must NEVER happen again.

**WHEN IN DOUBT: DO NOT RUN THE COMMAND. ASK THE USER FIRST.**

---

## CRITICAL: Knob/Control Handling Pattern

**!!! ALWAYS USE THIS PATTERN FOR CONTROLS !!!**

### The Problem: Stale State in Callbacks

When React components handle rapid user input (knobs, sliders, etc.), callbacks can capture **stale state** from previous renders. This causes:
- Knobs interfering with each other (moving one knob resets others)
- Sluggish/laggy controls
- Lost parameter changes
- Frustrating user experience

### The Solution: Use Refs for Current State

**ALWAYS** use a `ref` to track the current config state, just like TB-303Controls does:

```typescript
export const MyControls: React.FC<Props> = ({ config, onChange }) => {
  const configRef = useRef(config);

  // Keep ref in sync with props
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Update helper - uses configRef.current, NOT config
  const updateParameter = useCallback((key: string, value: number) => {
    onChange({
      ...configRef.current,  // ← Use ref, NOT config prop!
      [key]: value
    });
  }, [onChange]); // ← Remove config from dependencies

  return (
    <Knob
      value={config.someParam}
      onChange={(v) => updateParameter('someParam', v)}
    />
  );
};
```

### Reference Implementation

**TB303Controls** (`src/components/instruments/controls/JC303StyledKnobPanel.tsx`) is the **reference implementation**. When creating new synth controls:

1. **Copy the pattern** from TB303Controls
2. Use `configRef.current` in ALL callbacks that modify state
3. Remove `config` from `useCallback` dependencies (keep only `onChange`)

### Files Fixed Using This Pattern

- ✅ `src/components/instruments/controls/JC303StyledKnobPanel.tsx` (reference)
- ✅ `src/components/instruments/synths/modular/views/ModularRackView.tsx` (fixed 2026-02-14)

### What NOT to Do

❌ **WRONG** - Uses stale `config` prop:
```typescript
const handleChange = useCallback((key, value) => {
  onChange({ ...config, [key]: value });  // BUG: stale config!
}, [config, onChange]);
```

✅ **CORRECT** - Uses current `configRef`:
```typescript
const handleChange = useCallback((key, value) => {
  onChange({ ...configRef.current, [key]: value });
}, [onChange]);
```

---

## Furnace Synth Implementation

*** IMPORTANT ***

When debugging or implementing Furnace chip synths, instruments, or imports:

1. **ALWAYS reference the Furnace tracker sources** at `/Users/spot/Code/DEViLBOX/Reference Code/furnace-master/`
   - Platform implementations: `src/engine/platform/` (e.g., `gb.cpp`, `nes.cpp`, `rf5c68.cpp`)
   - WASM wrapper: `/Users/spot/Code/DEViLBOX/furnace-wasm/common/FurnaceDispatchWrapper.cpp`
2. **NEVER guess** - Always reference the actual Furnace source code
3. **Get proof/evidence** - Read the relevant platform file
4. **Implement 1:1** - Match the Furnace source exactly, including:
   - Register write sequences
   - Timing/order of writes
   - Envelope formats
   - Frequency calculations
   - Key-on/key-off sequences

Reference code location: `/Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/engine/platform/`

*** IMPORTANT ***

---

## localStorage Schema Versioning

Schema versioning in `src/hooks/useProjectPersistence.ts` — bump `SCHEMA_VERSION` when
changing default instrument configs or stored data structures. Old data is discarded on load.
See the version history comments in that file.

---

## DB303 / TB-303 Synth — Definitive Reference

*** READ THIS ENTIRE SECTION BEFORE TOUCHING ANY 303 CODE ***

### History of Confusion

Between 2026-02-09 and 2026-02-12, we went through **6+ audit cycles** that produced
conflicting results every time because different C++ source files were read. The wrong
sources have now been deleted. DO NOT recreate them or read stale docs about 303 params.

**Wrong sources that were deleted (DO NOT reference):**
- `juce-wasm/db303/` — DELETED. Was a different JUCE build, NOT the running WASM.
- `juce-wasm/open303/` — DELETED. Another copy, also not running.
- `mame-wasm/db303/` — DELETED. Yet another copy, also not running.
- `docs/TB303_*.md`, `docs/DB303_*.md` — DELETED. Contained outdated/conflicting info.
- `claudedocs/parameter_ranges_verification.md` — DELETED. Wrong values.

### Source of Truth Chain (PROVEN)

The correct and ONLY sources, in order of authority:

1. **`public/db303/DB303.wasm`** — The actual running WASM binary.
   - MD5: `c618210d83ad1bbf613afb84a5adc117`
   - Identical to `db303-local/db303.wasm` (verified via MD5 match).

2. **`db303-local/default-preset.xml`** — The reference app's startup defaults.
   - The reference app (`db303-local/db303-index-unmin.js`) calls
     `fetch("presets/default-preset.xml")` during `loadDefaults()` at init (line 2784).
   - These XML values OVERRIDE the JS hardcoded defaults.

3. **`db303-local/db303-index-unmin.js`** — The reference app's JS source.
   - Shows how the UI sends values to WASM (all 0-1 normalized).
   - Shows the hardcoded JS defaults (which get overridden by the XML on init).
   - Shows which params are inverted (`passbandCompensation` has `invert: !0`).

4. **`Reference Code/jc303-main/src/JC303.cpp`** — The JUCE wrapper source.
   - Contains `setParameter()` which converts 0-1 → real DSP values.
   - Uses `linToLin()` and `linToExp()` from `GlobalFunctions.h`.
   - This conversion layer is COMPILED INTO the WASM. JS never needs to convert.

5. **`Reference Code/jc303-main/src/dsp/open303/rosic_Open303.cpp`** — The DSP engine.
   - Shows internal value ranges (cutoff in Hz, envMod 0-100%, etc.).
   - DO NOT use these ranges in TypeScript — the WASM converts internally.

### Parameter Pipeline

```
TypeScript (0-1) → AudioWorklet (passthrough) → WASM setParameter (converts 0-1 → real) → Open303 DSP
```

- `DB303Synth.ts` sends 0-1 normalized values via `postMessage` to worklet.
- `DB303.worklet.js` calls `this.synth[setterName](numericValue)` — no transformation.
- WASM `JC303.cpp::setParameter()` converts: e.g., cutoff 0-1 → 314-2394 Hz (exponential).
- Open303 DSP uses real-world values internally.

**RULE: TypeScript ALWAYS sends 0-1. NEVER convert to Hz/ms/% in JS.**

### Conversion Table (from JC303.cpp::setParameter)

| Parameter       | 0-1 Input | Real DSP Value     | Mapping     |
|-----------------|------------|--------------------| ------------|
| cutoff          | 0.0-1.0    | 314 - 2394 Hz      | Exponential |
| resonance       | 0.0-1.0    | 0 - 100%           | Linear      |
| envMod          | 0.0-1.0    | 0 - 100%           | Linear      |
| decay           | 0.0-1.0    | 200 - 2000 ms      | Exponential |
| accent          | 0.0-1.0    | 0 - 100%           | Linear      |
| tuning          | 0.0-1.0    | 400 - 480 Hz       | Linear      |
| volume          | 0.0-1.0    | -60 - 0 dB         | Linear      |
| waveform        | 0.0-1.0    | 0 - 1 (saw→square) | Linear      |
| normalDecay     | 0.0-1.0    | 30 - 3000 ms       | Linear      |
| accentDecay     | 0.0-1.0    | 30 - 3000 ms       | Linear      |
| softAttack      | 0.0-1.0    | 0.3 - 3000 ms      | Exponential |
| slideTime       | 0.0-1.0    | 2 - 360 ms         | Linear      |

### filterSelect — CRITICAL

Only TWO valid values:
- **`0`** = DiodeLadder (the classic 303 filter, produces screams)
- **`5`** = MissThang-20 (Korg alternative filter)

**Any other value (1, 2, 3, 4, 255, etc.) is INVALID** and puts the filter in an
undefined state, killing resonance and the characteristic 303 sound.

The reference app sets `filterSelect(0)` on init (line 2358 of db303-index-unmin.js).
The default-preset.xml has `filterSelect: 255` which is invalid but gets sent to WASM
which presumably clamps or ignores it. DEViLBOX defaults to `filterSelect: 0`.

**Previous bug:** DEViLBOX used `filterSelect: 1` for months, which is invalid and
was likely the primary reason the 303 couldn't produce its characteristic screaming
sound on high-pitched notes.

### Inverted Parameters

Two parameters are inverted before sending to WASM (matching reference app's `invert: !0` flag):
- **`passbandCompensation`**: App state 0.09 → WASM gets `1 - 0.09 = 0.91`
- **`resTracking`**: App state 0.257 → WASM gets `1 - 0.257 = 0.743`

The reference app's XML stores these as knob positions. For `resTracking`, the XML also
stores the inverted value (line 727: `1 - i.resTracking`), so reading requires double
inversion: XML 0.743 → `1 - 0.743 = 0.257` (app state) → `1 - 0.257 = 0.743` (WASM).
For `passbandCompensation`, the XML stores the knob value directly (0.09).

This inversion is done in `DB303Synth.ts` at the `set()` and `applyConfig()` methods.

**Previous bug (fixed 2026-02-12):** App state was 0.9 and 0.7 respectively (copied from
JS hardcoded defaults instead of XML runtime defaults). This sent 0.1 and 0.3 to WASM
instead of the correct 0.91 and 0.743.

### Correct Default Values (from default-preset.xml)

These are the values DEViLBOX uses in `DEFAULT_TB303` (src/types/instrument.ts):

| Parameter              | Value  | Source                    |
|------------------------|--------|---------------------------|
| cutoff                 | 0.5    | default-preset.xml        |
| resonance              | 0.5    | default-preset.xml        |
| envMod                 | 0.5    | default-preset.xml        |
| decay                  | 0.5    | default-preset.xml        |
| accent                 | 0.5    | default-preset.xml        |
| **filterSelect**       | **0**     | Reference init code            |
| **normalDecay**        | **0.164** | default-preset.xml             |
| **accentDecay**        | **0.006** | default-preset.xml             |
| softAttack             | 0         | default-preset.xml             |
| **accentSoftAttack**   | **0.1**   | default-preset.xml             |
| **passbandCompensation** | **0.09** | default-preset.xml (→WASM 0.91) |
| **resTracking**        | **0.257** | XML 0.743 inverted (→WASM 0.743) |
| **filterInputDrive**   | **0.169** | default-preset.xml             |
| **diodeCharacter**     | **1**     | default-preset.xml             |
| **duffingAmount**      | **0.03**  | default-preset.xml             |
| oversamplingOrder      | 2         | Reference init code            |

### How Accent Works (from rosic_Open303.cpp)

The 303 accent is triggered by MIDI velocity:
- `velocity >= 100` → accented note (`hasAccent = true`)
- `velocity < 100` → normal note

On an accented note, the DSP:
1. Sets `accentGain = accent` (the global accent amount, 0-1)
2. Uses `accentDecay` for the filter envelope (very fast → sharp filter spike)
3. Uses `accentAmpRelease` for amp release (shorter)

On a normal note:
1. Sets `accentGain = 0`
2. Uses `normalDecay` for the filter envelope (slower)

The accent sweep is smoothed by an RC circuit (rc2, 15ms time constant) which creates
the characteristic curved sweep. Consecutive accented notes build up progressively
because the RC doesn't fully discharge — this is the "escalating scream" effect
described in hardware analysis (firstpr.com.au/rwi/dfish/303-unique.html).

### What Makes the 303 "Scream"

Reference: https://www.firstpr.com.au/rwi/dfish/303-unique.html

The screaming sound on high-pitched notes comes from:
1. **DiodeLadder filter (filterSelect=0)** — the nonlinear diode ladder resonates
2. **High resonance** (0.85+) — pushes toward self-oscillation
3. **Filter envelope sweep** — envMod determines range, decay determines speed
4. **Filter drive** (filterInputDrive) — saturates the filter input
5. **Diode character** (diodeCharacter) — adds nonlinear harmonics

If filterSelect is NOT 0 (DiodeLadder), the filter won't have the right character.

### TB-303 Hardware Architecture (from firstpr.com.au analysis)

The 303's unique sound comes from its unusual envelope and accent circuit design,
which has no parallel in standard modular synth components.

**Two Envelope Generators:**
- **VEG (Volume Envelope Generator):** Sharp attack, exponential decay, FIXED decay time.
  Only drives the VCA. The note's volume shape is always the same.
- **MEG (Main Envelope Generator):** Sharp attack, exponential decay, VARIABLE decay
  (controlled by Decay knob). Drives the filter cutoff frequency. On accented notes,
  MEG uses a FIXED short decay instead of the knob setting.

**The Accent Sweep Circuit (key to the scream):**
The accent circuit uses a diode, 47kΩ resistor, 100kΩ pot, and 1µF capacitor.
When accented notes play in succession, the capacitor doesn't fully discharge between
notes, causing the filter peak to rise PROGRESSIVELY higher with each note. This is
described as "the cry of a living creature becoming increasingly distressed."

The filter response produces "a quick, smooth curve" rather than the angular response
you would get from a standard ADSR envelope generator.

**Accent does FOUR things simultaneously** (Chris Meyer / Patreon analysis):
1. **Snaps filter envelope decay to minimum** — overrides the Decay knob setting
2. **Adds shortened filter envelope to VCA** — creates multi-segment envelope
   (instant attack → fast decay → slow decay), louder peak than normal notes
3. **Adds a SECOND slower envelope to filter cutoff** — summed with the normal
   fast-decay envelope, creating: instant attack → very fast decay → slower
   re-attack → slower decay (complex multi-segment shape)
4. **The second filter envelope ACCUMULATES** — if re-triggered before fully
   decaying, it starts from its current level, climbing higher each note.
   This is the "escalating scream" / "cry of a living creature" effect.

**The Filter (Tim Stinchcombe analysis):**
- The 303 filter is **4-pole** (not 2-pole as commonly stated) — diode ladder
- Coupling capacitors around the filter core create **~6 additional poles** that
  act as a hidden high-pass filter with a fixed cutoff around **8 Hz**
- When you increase resonance on the LPF, you ALSO increase resonance on this
  hidden HPF, creating a **resonant bass boost** at 8 Hz that extends up through
  50-100+ Hz. This is why the 303 gets "fatter" at high resonance instead of
  losing bass like a typical resonant LPF.

**Devil Fish Modifications (relevant to our DevilFish params):**
- Independent MEG time control for normal vs accented notes (normalDecay/accentDecay)
- Ability to reduce Env Mod to zero
- Extended Env Mod range at full clockwise rotation

**Key insight:** "There are a number of things that only the TB-303 can do — which
cannot be done with a modular synth using standard modules." The accent is not just
"louder and brighter" — it's four interacting effects that create complex multi-segment
envelopes, and the accumulation behavior has no equivalent in standard ADSR modules.

### Common Mistakes (DO NOT REPEAT)

1. **Reading the wrong C++ source.** The JUCE builds (`juce-wasm/`, `mame-wasm/`) were
   DIFFERENT from the running WASM. They have been deleted.

2. **Using `filterSelect: 1`.** Only 0 and 5 are valid. 1 is undefined behavior.

3. **Confusing JS hardcoded defaults with runtime defaults.** The JS code has
   `accentDecay: 0.1` hardcoded, but the app loads `default-preset.xml` on init
   which overrides it to `0.006`. The XML values are the effective defaults.

4. **Converting 0-1 to Hz/ms in TypeScript.** The WASM does all conversion internally.
   TypeScript ALWAYS sends 0-1 normalized values.

5. **Reading `rosic_Open303.cpp` and thinking those are the values to send from JS.**
   The DSP expects real values (Hz, ms, %), but the WASM wrapper (JC303.cpp) converts
   from 0-1. JS sends 0-1, not real values.

6. **Treating the `tb303DevilFishPresets.ts` file as authoritative.** That file uses
   raw Hz/ms/% values and is only used in test files. The actual presets are in
   `tb303Presets.ts` which uses 0-1 normalized values.

### File Locations

| File | Purpose |
|------|---------|
| `src/types/instrument.ts` | `DEFAULT_TB303` — default config, source of truth for app defaults |
| `src/constants/tb303Presets.ts` | Factory presets (0-1 normalized). Uses `DF_DEFAULTS` shared object. |
| `src/engine/db303/DB303Synth.ts` | TypeScript API layer. `applyConfig()` and `set()` entry points. |
| `public/db303/DB303.worklet.js` | AudioWorklet. Routes params to WASM. Forces `filterSelect(0)` on init. |
| `public/db303/DB303.wasm` | The running WASM binary (site-rip, NOT built from juce-wasm/). |
| `db303-local/default-preset.xml` | Reference defaults (source of truth for default values). |
| `db303-local/db303-index-unmin.js` | Reference app JS (source of truth for param handling). |
| `Reference Code/jc303-main/` | JC303 source (source of truth for WASM internals). |
| `src/hooks/useProjectPersistence.ts` | Schema versioning — bump when changing defaults. |

---

## Hardware UI WASM Modules — Extraction Pattern

Hardware UIs (PT2, FT2) compile real reference source code to WASM via Emscripten, then blit the framebuffer to a React canvas each rAF frame.

### Architecture

```
Reference C source → WASM bridge (pt2_sampled.c / ft2_sampled.c) → Emscripten MODULARIZE
→ factory `createXXX({})` injected via script tag → React rAF loop calls `_tick()` then blits fb
```

### Build Commands

```bash
cd <module>/build && emcmake cmake .. && emmake make
# PT2: cd pt2-sampled-wasm/build && emcmake cmake .. && emmake make
# FT2: cd ft2-sampled-wasm/build && emcmake cmake .. && emmake make
```

### Critical Rules

- **NEVER let an agent generate binary data arrays** (font bitmaps, sprite data). Always `cp` from reference:
  - `cp "Reference Code/pt2-clone-master/src/gfx/pt2_gfx_font.c" pt2-sampled-wasm/src/`
  - Agent-generated binary data renders silently garbled (e.g., "FWk RACHT" instead of "ALL RIGHT")
- `EM_JS` and `EMSCRIPTEN_KEEPALIVE` macros produce false IDE errors — they are NOT real build errors
- Mouse `mouseup`/`mousemove` events go on `document`, not canvas, to handle drag-outside-canvas
- Call `_tick()` before blit each rAF frame so C-side update flags are processed before rendering
- Add null guard `if (m._module_tick)` to handle browser cache serving old WASM without the export

### Framebuffer Blit (BGRA→RGBA byte swap)

```typescript
/* WASM little-endian ARGB 0xAARRGGBB stored as [BB,GG,RR,AA] */
/* Canvas ImageData wants [RR,GG,BB,AA] */
dst[off] = src[off+2]; dst[off+1] = src[off+1]; dst[off+2] = src[off]; dst[off+3] = 255;
```

### PT2 Module

- Framebuffer: 320×255. Sampler occupies rows 121–254 (SAMPLER_Y=121, SAMPLER_H=134)
- Output: `public/pt2/PT2SampEd.js` + `.wasm`
- Config buffer: 11 bytes `[volume, finetune, loopStart(4 LE), loopLength(4 LE), loopType]`
- Source: `pt2-sampled-wasm/src/` — extracted from `Reference Code/pt2-clone-master/`

### FT2 Module

- Framebuffer: 632×400. Sample editor occupies most of the screen.
- Output: `public/ft2/FT2SampEd.js` + `.wasm`
- Source: `ft2-sampled-wasm/src/` — extracted from `Reference Code/fast tracker 2/`

---
