# Open Source Bass Synths for Wobble / DnB / Dubstep

> Research survey of open source synthesizers suitable for creating wobbly drum & bass and dubstep bass sounds, with focus on JUCE→WASM integration feasibility for DEViLBOX. This is a reference document — no code changes.

---

## What DEViLBOX Already Has

- **WobbleBass** — native TS, dual osc + sub, tempo-synced wobble LFO, filter env, formant growl, distortion
- **TB303 (DB303)** — WASM, analog filter + resonance, LFO, Devil Fish mods, slide/accent
- **Odin2** — WASM build started (`juce-wasm/odin2/`), 12 filter models, 3 osc, mod matrix
- **Vital** — WASM build started (`juce-wasm/vital/`), spectral wavetable, 4 LFOs, mod matrix
- **Surge** — WASM build started (`juce-wasm/surge/`), FM+wavetable hybrid
- **OBXd** — WASM, Oberheim emulation, 2 osc, resonant filter
- **Dexed** — WASM, DX7 6-op FM (good for punchy FM bass)
- **MoogFilters** — WASM effect, 7 ladder filter models
- **Buzzmachine 3o3/3o3DF** — Jeskola Buzz TB-303 clones

---

## TIER 1: Best Candidates (JUCE C++, high WASM feasibility)

### 1. Monique Monosynth — TOP PICK

- **Repo**: github.com/surge-synthesizer/monique-monosynth
- **License**: Dual GPL3 / **MIT** (MIT option avoids GPL complications)
- **Status**: Actively maintained (Surge Synth Team)
- **Why it's ideal for wobble bass**:
  - **Purpose-built for bass and lead** — this is literally its design goal
  - 3 continuously morphable oscillators
  - 3 filters (LP/HP/BP) with **cross-routing** (filter→filter for complex shapes)
  - 4 "Morphing LFOs" (MFOs) — all **always tempo-synced** (16/1 to 1/64)
  - Filter mod via envelope + LFO mix with "mod mix" knob
  - Built-in distortion, delay, reverb, chorus
  - 16-step arpeggiator
- **WASM feasibility**: HIGH — JUCE-based, same pipeline as DB303/Dexed/OBXd builds. Headless engine separable from GUI.

### 2. Helm (Matt Tytel)

- **Repo**: github.com/mtytel/helm
- **License**: GPL3
- **Status**: Not actively maintained (predecessor to Vital, ~2019)
- **Why it's relevant**:
  - 2 oscillators with unison + cross modulation
  - Multimode resonant filter (LP/HP/BP/notch/allpass)
  - Drag-to-modulate system: any modulator → any destination
  - 2 LFOs with sync, 2 ADSR envelopes
  - Sub oscillator, step sequencer (rhythmic filter modulation)
  - Distortion, delay, reverb, stutter
- **WASM feasibility**: HIGH — synthesis engine in `src/synthesis/` is clean, self-contained C++. Simpler than Vital, potentially easier to strip down.

### 3. Socalabs Wavetable (FigBug)

- **Repo**: github.com/FigBug/Wavetable
- **License**: **MIT**
- **Status**: Actively maintained
- **Why it's relevant**:
  - 2 wavetable oscillators + noise + sub
  - **Imports Serum-format wavetables** (access to massive ecosystem)
  - Up to 8x unison with spread, formant, and bend
  - 100 built-in wavetables
  - 3 mono LFOs, 3 poly LFOs, 3 envelopes
  - 5 effects
- **WASM feasibility**: HIGH — JUCE-based, MIT license.

### 4. Vaporizer2 (VAST Dynamics)

- **Repo**: github.com/VASTDynamics/Vaporizer2
- **License**: GPL3
- **Status**: Open-sourced 2023, community maintained
- **Why it's relevant**:
  - 4 wavetable osc banks, up to 24-voice unison
  - **30+ filter types** (biquad, SVF, diode ladder, all 4x oversampled)
  - 780+ wavetables, 410+ factory presets
  - 25 mod sources → 220 mod destinations
  - Additive, subtractive, FM, granular modes
- **WASM feasibility**: MEDIUM-HIGH — JUCE-based but very large codebase. The 30+ filter types make it uniquely valuable. Binary will be large.

### 5. OB-Xf (Surge Synth Team fork of OB-Xd)

- **Repo**: github.com/surge-synthesizer/OB-Xf
- **License**: GPL3
- **Status**: Actively maintained (2025 release)
- **Why it's relevant**:
  - Enhanced multimode filter (continuous HP↔Notch↔BP↔LP blend)
  - Already proven in browser: **WebOBXD** (github.com/jariseon/webOBXD) runs OBXd via WAM + WASM
  - Modernized version of what you already have
- **WASM feasibility**: HIGH — you already have OBXd; this is the upgrade path.

---

## TIER 2: Worth Investigating

### 6. Firefly Synth 2

- **Repo**: github.com/sjoerdvankreel/firefly-synth
- **License**: **MIT**
- **Status**: Very actively maintained
- **Key features**: 4 osc, SVF + comb filters, **10 per-voice LFOs + 10 global LFOs** with BPM sync, AM+FM routing, flexible filter→distort→filter chains
- **WASM feasibility**: MEDIUM — NOT JUCE (custom framework), different build path. MIT license is favorable. The 10+10 LFO architecture is uniquely suited to complex wobble textures.

### 7. openAV Sorcer — "The Dubstep Synth"

- **Repo**: github.com/openAVproductions/openAV-Sorcer
- **License**: GPL3
- **Status**: Legacy (not maintained)
- **Key features**: **Explicitly designed for dubstep**. 2 morphing wavetable osc + sine, dedicated wobble filter, LFO, ADSR. DSP core written in **FAUST**.
- **WASM feasibility**: MEDIUM — FAUST DSP code can compile directly to WASM via `faust2wasm`. LV2 wrapper stripped, just the DSP core.

### 8. amsynth

- **Repo**: github.com/amsynth/amsynth
- **License**: GPL2+
- **Status**: Actively maintained
- **Key features**: Classic analog modeling, dual osc (sine/saw/square/noise) with hard sync, 12/24 dB resonant filter, LFO→pitch/filter/amp, dual ADSR
- **WASM feasibility**: MEDIUM — Linux-focused platform layer, but synthesis core is self-contained. Good "simple subtractive" option if you want something lighter than Monique.

### 9. ZynAddSubFX

- **Repo**: github.com/zynaddsubfx/zynaddsubfx
- **License**: GPL2+
- **Status**: Actively maintained
- **Key features**: 3 engines (additive, subtractive, PADsynth), extensive filter section, formant filters, huge preset library
- **WASM feasibility**: LOW-MEDIUM — Complex dependencies (liblo, FLTK), tightly coupled threading. Would require significant work to isolate for WASM.

---

## TIER 3: DSP Libraries (Filters, LFOs, Modulators)

| Library | Repo | License | Description |
|---------|------|---------|-------------|
| **MoogLadders** | github.com/ddiakopoulos/MoogLadders | Various | 7 Moog ladder implementations — **already in your project** (`juce-wasm/moogfilters/src/`) |
| **DSPFilters** | github.com/vinniefalco/DSPFilters | MIT | Butterworth, Chebyshev, Elliptic, Legendre (multichannel IIR) |
| **Q Audio DSP** | github.com/cycfi/q | MIT | Header-only C++ DSP: oscillators, filters, envelopes, no deps |
| **STK** | github.com/thestk/stk | MIT-like | Stanford synthesis toolkit: oscillators, filters, physical modeling |
| **State Variable Filter** | github.com/fps/state-variable-filter | MIT | Single-header SVF implementation |
| **FAUST stdlib** | faustlibraries.grame.fr/libs/filters/ | GPL | Moog ladder, SVF, resonant LP, Butterworth — compilable to WASM |

---

## TIER 4: Rust → WASM (Alternative Path)

| Synth | Repo | License | Notes |
|-------|------|---------|-------|
| **web-synth** (Ameobea) | github.com/Ameobea/web-synth | MIT | Full browser DAW in Rust→WASM. 8-op FM, wavetable, SIMD-accelerated. Proven architecture. |
| **wasm-audioworklet-synth** | github.com/reprimande/wasm-audioworklet-synth | MIT | Minimal Rust TB-303-style acid bass in browser. Good reference. |
| **Glicol** | github.com/chaosprint/glicol | MIT | Rust audio DSP library, runs in browser. Graph-based routing. |
| **NIH-plug** | github.com/robbert-vdh/nih-plug | ISC | Rust plugin framework with example synths. Portable DSP code. |

---

## TIER 5: Web Audio Native / Reference

| Project | Repo | License | Notes |
|---------|------|---------|-------|
| **WubWub** | github.com/fi4cr/wubwub | MIT | JS browser synth with explicit **Wobble Bass preset**, formant talking bass, growl mod |
| **Wobbler** | github.com/coleww/wobbler | MIT | Minimal JS wobble bass — LFO→lowpass cutoff. Good for parameter recipes. |

---

## FAUST Path (Special Mention)

FAUST (github.com/grame-cncm/faust) is a functional DSP language that compiles directly to WASM AudioWorklet modules via `faust2wasm`. This means you could:

1. Write a custom wobble bass synth in ~200 lines of FAUST
2. Compile it to WASM + AudioWorklet JS in one command
3. The Sorcer dubstep synth's DSP core IS FAUST code
4. FAUST stdlib includes dozens of filter implementations

This is potentially the fastest path to a custom bass module.

---

## Recommended Priority if Integrating Later

(Vital, Odin2, and Surge XT already in progress — excluded)

| # | Synth | Rationale |
|---|-------|-----------|
| 1 | **Monique** | Purpose-built for bass. MIT license. Same JUCE pipeline. 3 filters + 4 tempo-synced MFOs = wobble machine. |
| 2 | **Helm** | Simpler than Vital, clean code, excellent modulation. Good "workhorse" bass synth. |
| 3 | **Socalabs Wavetable** | MIT. Serum wavetable import opens massive preset ecosystem. |
| 4 | **Sorcer via FAUST** | Only synth designed specifically for dubstep. FAUST→WASM is a direct compilation path. |
| 5 | **Vaporizer2** | 30+ filter types, 220 mod destinations. Complex but enormous sound design potential. |

---

## Key Resources

- github.com/webprofusion/OpenAudio — master list of open source audio software
- github.com/olilarkin/awesome-musicdsp — curated DSP resources
- github.com/BillyDM/awesome-audio-dsp — Rust/C++ audio DSP resources
- github.com/Dreamtonics/juce_emscripten — JUCE→Emscripten bridge
- github.com/jariseon/webOBXD — proven OBXd-in-browser via WASM
