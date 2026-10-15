---
date: 2026-10-15
topic: Synth editors show what the knobs do - realtime curves in every DOMSynthPanel layout
tags: [synth-ui, visualization, curves, domsynthpanel, klystrack]
status: draft
---

# Synth editor curves - plan

## Problem

A synth editor is a wall of knobs. The user turns Cutoff and sees a number change; the sound changes later, if the
note is held. Modern synths draw the cause: the filter response with its cutoff and resonance, the envelope with
its stages, the LFO shape, the oscillator waveform, the modulation routing. Our editors draw none of that, so
tuning is blind ("a black box").

Invariant violated: **a parameter edit has no visible consequence at the place it is made.** The only feedback
is the header's spectrum/scope (`EditorHeader.tsx:506`), which shows the OUTPUT of all parameters mixed, only
while a note sounds, and never says which knob did what.

## What exists (reuse, do not rebuild)

Searched `src/components/**` for envelope, filter, LFO, wave and FM drawing code (counts are `<Component` uses
outside tests, measured with grep):

| Component | Does | Used in |
|---|---|---|
| `instruments/shared/EnvelopeVisualization.tsx` | ADSR, linear, steps, SID, MS envelope canvases | 21 files |
| `instruments/shared/FilterFrequencyResponse.tsx` | analytic LP/HP/BP/notch response from cutoff + Q | 8 files |
| `visualization/LiveFilterCurve.tsx` | response with live modulation markers (30 fps, high-DPI) | 2 files |
| `visualization/LFOVisualizer.tsx` | LFO shape | 1 file |
| `instruments/shared/FMAlgorithmDiagram.tsx` | FM operator routing | 2 files |
| `instruments/shared/WaveformLineCanvas.tsx` | one-cycle waveform | 2 files |
| `visualization/Instrument{Oscilloscope,Spectrum,Spectrogram,Lissajous}.tsx` | measured output | EditorHeader |

`DOMSynthPanel` + `SynthPanelLayout` (`types/synthPanel.ts`) drive 57 layouts in `constants/synthLayouts/`
(measured: `ls | wc -l`; count the layouts that DOMSynthPanel actually renders in step C0). Section order,
knobs and toggles are declared; no layout can declare a curve.

`ui/FilterCurve.tsx` has zero users (dead duplicate of `FilterFrequencyResponse`): delete or fold in during C1.

## Levels the fix could live at

1. **Per-synth bespoke canvases** (what the 21 envelope users did). Fails: every synth re-implements its own
   parameter-to-curve mapping and layout; 57 layouts means 57 hand-wired panels. Rejected - this is the
   duplication the codebase already carries.
2. **Measurement only** (richer spectrum/scope in the header). Fails: shows the effect, not the cause; silent
   until a note plays; cannot show a filter response at a held-down knob. Keep as the second layer, not the fix.
3. **Declarative curves in the layout (chosen).** A section can declare `curves`: a kind (`envelope`, `filter`,
   `lfo`, `waveform`, `transfer`, `fm-algorithm`), and a binding from layout keys to the kind's inputs. One pure
   function per kind turns bound values into points; one canvas per kind draws them (the existing components,
   fed by the binding). A synth gets curves by adding descriptors, not code. Parameter changes already flow
   through `DOMSynthPanel` `getValue`, so a curve redraws as the knob moves, with no audio and no held note.
4. **Live markers from the engine** (second layer on top of 3): where the voice is right now - envelope
   playhead, instantaneous cutoff after the envelope and LFO, program step. Needs engine state per synth; only
   where the engine can report it (klystrack program status exists: `KlysEngine.subscribeProgramStatus`).

Red-flag check: no damping, clamping or special-casing planned. The curve model must be the engine's own math
(see C1 measurement), not an approximation, or the picture lies.

## Design

```
SynthPanelLayout.sections[].curves?: CurveDescriptor[]
CurveDescriptor = { kind, bind: Record<input, layoutKey | constant>, height?, label? }

components/instruments/curves/
  curveModels.ts      pure: envelopePoints(bind values), filterResponse(...), lfoShape(...), ...
  CurvePanel.tsx      picks the canvas by kind, reads values through DOMSynthPanel getValue
  (canvases are the existing shared components; they gain a `values` entry point if they lack one)
```

- Placement (decision D1): the curve sits at the top of the section that owns its knobs (cutoff curve above
  the Filter knobs), full section width.
- Live marker (decision D2): a drawn marker only where the engine reports state; otherwise the static curve.
- DOMSynthPanel stays presentation: it asks `sectionFlexBasis` (already shared) and renders `CurvePanel`.
- Tabs: the klystrack editor already has Main and Program tabs (commit 25331db17). Other multi-section
  layouts use `SynthPanelLayout.tabs` (already supported by DOMSynthPanel).

## Decisions for the owner

- D1 placement: curve inside its section (Recommended: the cause sits next to the knobs it answers) vs a pinned
  "Sound Shape" strip at the top of the editor (one place to look, but far from the knob).
- D2 live markers: ship static curves everywhere first, markers where an engine reports state (Recommended) vs
  markers required before any curve ships.
- D3 rollout order after the klystrack pilot: layouts ranked by users and by how many of their params are
  curve-able (census C0 produces the ranking; Recommended: follow the ranking, not alphabet).

## Checklist (full, with IDs; ticked in the open as executed)

Phase C0 - census (no code)
- [ ] CV-0.1 List every layout DOMSynthPanel renders (count from the registry in `constants/synthLayouts/index.ts`, state which builder was counted).
- [ ] CV-0.2 Per layout, classify its params into curve kinds (envelope, filter, lfo, waveform, transfer, fm) and record a table in `thoughts/shared/research/2026-10-15_synth-curve-census.md`.
- [ ] CV-0.3 Rank layouts by users x curve-able share; this ranking is D3.

Phase C1 - pilot on klystrack (the engine whose math I can read: `klystrack-wasm/common/cyd.c`, `music.c`)
- [ ] CV-1.1 Probe the real artifact: filter coefficient formula (`cyd_set_filter_coeffs`), envelope stage timing (`envspd`), vibrato/PWM shapes (`mus_shape`), pulse width map. A 20-line harness test, not a guess.
- [ ] CV-1.2 `curveModels.ts` pure functions for envelope, filter, lfo, pulse width, waveform, with unit tests that compare against numbers measured from the WASM (not against themselves).
- [ ] CV-1.3 `CurveDescriptor` in `types/synthPanel.ts`; `CurvePanel.tsx`; DOMSynthPanel renders a section's curves.
- [ ] CV-1.4 Klystrack layout declares: Volume envelope (ADSR), Filter response (cutoff, resonance, type, enable bit), Vibrato and PWM shapes (speed, depth, shape), Oscillator waveform (flags + pulse width).
- [ ] CV-1.5 Live marker: the program step already marked in the Program tab; add the playing instrument's envelope playhead only if the worklet reports stage and level (needs a new worklet message; otherwise static).
- [ ] CV-1.6 Reachability test: drive `UnifiedInstrumentEditor` as the existing klystrack test does, twist Cutoff, assert the filter curve model input changed and the canvas draw was called (sentinel). Revert-check red.
- [ ] CV-1.7 Delete `ui/FilterCurve.tsx` (0 users) after confirming with a second grep from the exports.

Phase C2 - roll out by ranking (one PR-sized unit per layout group, each with the same reachability pattern; behaviour tested at the pure function)
- [ ] CV-2.n One item per layout group from CV-0.3 (filled in after census).

Phase C3 - measured layer
- [ ] CV-3.1 Header spectrum stays; add a "response at held note" overlay only if D2 asks for it.

## Verification

Automated (kept separate from manual):
- `npm run type-check` clean; `npm run test:ci` for the touched areas only.
- curveModels tests compare against measured engine numbers.
- One reachability test per synth family, not per curve.

Manual (only the owner can confirm; LOCAL `http://localhost:5174`):
- Open a klystrack instrument: twist Cutoff, Resonance, filter type; the filter curve moves with the knob, with no note held.
- Twist attack, decay, sustain, release; the envelope shape moves and matches what is heard.
- PASS = each curve follows its knob immediately and matches the sound; FAIL = a curve lags, or disagrees with what you hear.

## Out of scope until asked

Modulation matrices, drag-the-curve-to-edit interaction (an obvious follow-up: dragging the cutoff point on the
filter curve), per-voice multi-note overlays.
