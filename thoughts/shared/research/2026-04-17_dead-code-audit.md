---
date: 2026-04-17
topic: dead-and-duplicated-code-audit
tags: [audit, dead-code, duplication, refactor, cleanup]
status: final
---

# DEViLBOX — Dead and Duplicated Code Audit

Four parallel research agents covered parsers, components, engines/stores/hooks, and public/WASM/third-party. This is a **documentation** of what exists, not a plan to delete anything. Treat the "candidate for removal" column as *needs verification*, not *safe to delete* — dynamic-lookup registries and reserved-for-future wiring can hide real consumers. Always confirm with a grep before removal.

---

## 1. Format parsers

### Dead
| Parser file | Evidence |
|---|---|
| `src/lib/import/formats/GMCParser.ts` | Not in `FormatRegistry.ts`. Only imported by its own test at `src/lib/import/__tests__/GMCParser.test.ts:7`. `GameMusicCreatorParser.ts` is the registered, active parser for `.gmc` (FormatRegistry.ts:613, UADEParser.ts:674). |

### Not duplicates (false positives considered)
- `FredEditorParser` vs `FredGrayParser` — different formats (`.fred` vs `gray.*` prefix, different prefKeys). Legitimate variants.
- No other parser pairs covering the same format detected across ~179 registered parsers.

### Engines without parsers / parsers without engines
No critical mismatches. 45 unregistered parsers either are utility files imported by other parsers (`AmigaUtils`, `SIDPatternCache`, etc.), UADE-backed (no native engine needed), or GMCParser.

---

## 2. React components

### Dead (no non-test importers)
| File | Last-modified | Notes |
|---|---|---|
| `src/components/visualization/CustomBanner.tsx` | Mar 7 2026 | Exported component, never referenced. Added recently in commit `efc209c32`. |
| `src/components/visualization/StereoField.tsx` | Feb 19 2026 | Lissajous / goniometer visualizer. Never imported. |
| `src/components/visualization/JingleVisualizer.tsx` | Mar 18 2026 | Startup jingle animation. Added in `cc221b570`, never wired. |
| `src/components/ui/AccentChargeVisualizer.tsx` | Mar 12 2026 | Devil Fish accent sweep capacitor visualization. Never consumed. |

### Reserved components (do NOT remove per user's rule)
None found — no `_`-prefixed components exist in `src/components/`.

### Design-system shadowing (one-off instead of shared)
| File | Inline pattern | Should use |
|---|---|---|
| `src/components/instruments/hardware/TB303Hardware.tsx:97–118` | Custom `TB303Button` with inline Tailwind color-map | `<Button variant="ft2" color={…}>` from `@components/ui/Button` |
| `src/components/drumpad/ConfirmDialog.tsx` (entire file) | Full custom dialog with `fixed inset-0 bg-dark-bg/95` | Canonical `src/components/common/ConfirmDialog.tsx` |

**Similar hardware-panel buttons** (`DX7Button`, `VL1Button`, `CZ101Button`, `D50Button`, `TR808StepButton`, `VFXButton`, etc.) also duplicate the core `Button` styling without using its variant/color props. These are localized to instrument panels — likely intentional for hardware UI fidelity, but flagged as design-system leakage.

### DOM↔Pixi duplication
None detected. 3D components (`DJ3DCameraControls.tsx`, `DeckVinyl3DView.tsx`, `MixerVestax3DView.tsx`) are specialized GL renderers without DOM counterparts. All shared state/logic appears to flow through stores + hooks as required.

---

## 3. Engines, stores, hooks

### Dead
None found — every engine, store, and hook has non-test importers.

### Copy-pasted logic (biggest consolidation opportunity)

**20+ WASM singleton replayer engines** repeat lines 10–100 almost verbatim:
- `getInstance()` / `hasInstance()` / `ensureInitialized()`
- Static `wasmBinary`, `jsCode`, `loadedContexts`, `initPromises` fields
- Instance check + context-mismatch handling
- `dispose()` + `_disposed` check pattern

Representative copy-paste examples:
- `JamCrackerEngine.ts:27–100` ↔ `FCEngine.ts:13–100`
- `FredReplayerEngine.ts:10–70` ↔ `SoundMonEngine.ts:10–70`
- `FredEditorReplayerEngine.ts:11–67` ↔ `SidMon1ReplayerEngine.ts:11–67`

The pattern repeats across Sonix, PreTracker, Organya, Ixalance, Cpsycle, SC68, ZXTune, PumaTracker, ArtOfNoise, Hippel, SidMon variants, DeltaMusic, Oktalyzer, FutureComposer, Synthesis, Symphonie, TFMX, FaceTheMusic and ~15 more.

**Suggested shared location:** `src/engine/wasm/WASMSingletonBase.ts` abstract class — eliminates an estimated **~2000+ lines** of redundant code.

### Stale local caches — investigated, all safe
| File | Cache | Verdict |
|---|---|---|
| `DjFxActions.ts:92` | `activeFx` Map | Intentional — tracks per-action transient effect nodes |
| `DjFxActions.ts:1197` | `deckSweepCancels` Map | Safe — stores cancel fns only, recreated per engage |
| `useMixerStore.ts:96-104` | `_muteMaskEngineCache`, `_trackerReplayerMod`, etc. | Intentional — warm-up refs to singletons, read via `hasInstance()` |
| ~~`DjFxActions.ts` `channelMuteState`~~ | ~~Map~~ | **Already removed** in commit `1413839b4` |

### Superseded/shim layers
None detected. Naming is consistent across engines and stores.

---

## 4. Public artifacts, WASM source dirs, third-party submodules

### ⚠ Caveat on the "unused public/" list

The agent found **~105 `public/<dir>/` directories with no TS grep match** for their path. However, **many effect modules are loaded by registry ID at runtime**, not by literal string path. Before acting on any of these, grep the synth/effect registry and plugin loader to confirm whether the name is referenced via a dynamic lookup.

Candidates flagged as unused (needs verification per above):

`agc, artistic-delay, autosat, autotune, bass-enhancer, beat-breather, binaural-panner, bitta, cabinet-sim, calf-phaser, cheesecutter, clipper, deesser, della, distortion-shaper, dragonfly-hall/plate/room, driva, ducka, dynamic-eq, dynamics-proc, early-reflections, eq5/8/12, exciter, expander, fonts, fred-wasm, geq31, gott-comp, granular-freeze, haas-enhancer, hippel-coso, juno-chorus, kuiza, leslie, limiter, masha, maximizer, melodica, mono-comp, moogfilters, multi-chorus/spread, multiband-*, mverb, noise-gate, open303, overdrive, panda, parametric-eq, phono-filter, pulsator, re-tape-echo, reverse-delay, ring-mod, roomy, satma, saturator, shimmer-reverb, sidechain-gate/limiter, slapback-delay, sorcer, spacey-delayer, springreverb, swedishchainsaw, tal-noisemaker, tapedelay, templates, test-patterns, tonewheel, transient-designer, tube-amp, tumult, vihda, vintage-delay, vinyl, vinylnoise, vital, worklets, x42-comp, zam-delay, zam-eq2`

Verified ACTIVELY USED (sample):
`furnace, octamed, uade, hively, klystrack, pt2, ft2-sampled`

### Third-party submodules — actively built (27)
`amsynth-master, calf-studio-gear, fluidsynth, furnace-master, geonkick-master, helm-master, hivelytracker-master, monique-monosynth, mxml, musicline_playback-main, odin2-master, openmpt-master, OB-Xf-main, projectm-master, pt2-clone-master, RaffoSynth, rtosc-build-wasm, setBfree, sfizz, sunvox_sources-master, surge-xt, synthv1, tfmx-wasm, tunefish, uade-3.05, vital-main, wavesabre, zynaddsubfx-wasm, fftw-3.3.10`

All linked via `*-wasm/CMakeLists.txt` and referenced in TS code.

### Third-party submodules — reference/historical (verify before removal)
`aelapse, aeolus, distrho-ports, libtfmxaudiodecoder-main, mda-lv2, oidos-master, retromulator, sonix-music-driver, voclib, dexed, buzzmachines-master, fast tracker 2`

Some of these (e.g., `aelapse` per MEMORY.md) **are actively ported** and the audit missed the build reference — treat this list as "verify by hand" not "safe to delete".

---

## Priority suggestions (if cleanup is pursued post-gig)

| Priority | Action | Impact |
|---|---|---|
| **HIGH** | Delete `src/lib/import/formats/GMCParser.ts` + its test | Dead code, unambiguous |
| **HIGH** | Verify the 4 dead visualisation/UI components, remove if truly unused | ~4 files |
| **MEDIUM** | Extract `WASMSingletonBase` abstract class for replayer engines | ~2000 LOC reduction |
| **MEDIUM** | Consolidate `drumpad/ConfirmDialog` onto `common/ConfirmDialog` | 1 file + minor API alignment |
| **LOW** | Hardware-panel buttons → design-system `<Button variant>` | Many files, touches UI fidelity |
| **INVESTIGATE** | Audit the 105 "unused public/" artifacts — almost all are effect modules likely loaded by registry ID, not path | Could be a big win OR entirely false positives |

## Scope explicitly NOT audited

- `scripts/` and `tools/` — build/server utilities
- `server/` — Node server-side code
- Test files themselves for dead fixtures
- Shader files in `public/*/shaders`
- Package.json dependencies (`npm dedupe` / unused deps)
- Unused CSS classes in Tailwind config

These would be next passes if a more thorough sweep is warranted.
