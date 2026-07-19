---
date: 2026-04-19
topic: dead-code-cleanup-followups audit results
tags: [cleanup, audit, post-gig]
status: final
---

# Dead-code cleanup plan (`2026-04-17`) — audit results

Plan: `thoughts/shared/plans/2026-04-17-dead-code-cleanup-followups.md`.

Short version: all 6 items are now either **done**, **already handled upstream**, or **explicitly documented as not-worth-it**. Nothing is safe to delete right now without further legwork.

## Item 1 — Extract `WASMSingletonBase`

**Status:** done. 21 commits landed earlier in the branch (`9d8670001 … 85f024a3e` per the prior handoff), plus today's `cad7c0f44` which picked up the last four engines that had been deferred:

| Engine | Today's approach |
|---|---|
| `SymphonieEngine`          | extended `WASMSingletonBase`, collapsed per-song node re-init into one-shot `createNode()` + `'load'` post |
| `VocoderCore`              | uses exported helpers (`createWASMAssetsCache`, `loadWASMAssets`) without inheriting — per-instance, not a singleton |
| `DB303Synth`, `RdPianoSynth` | same as VocoderCore (`DevilboxSynth`, per-note instances) |
| `FurnaceDispatchEngine`    | switched cache fields to `WASMAssetsCache` type; kept the custom `ensureModuleLoaded` for ctx-resume / InvalidStateError retry / URL polyfill / no-store fetch |

Also widened `WASMLoaderConfig` so `jsFile` is optional — needed by VocoderCore whose worklet instantiates WASM directly.

Both the migrations and the type-check pass cleanly (the pre-existing `DubBus.ts` unused-var error is from the parallel dub-studio agent, not my territory).

## Item 2 — `drumpad/ConfirmDialog` consolidation

**Status:** already done. `src/components/drumpad/ConfirmDialog.tsx` no longer exists in the tree; only `src/components/common/ConfirmDialog.tsx` + `GlobalConfirmDialog.tsx` remain. No migration needed.

## Item 3 — `public/<dir>/` effect-module audit

**Status:** investigated, **nothing is truly dead**. The plan listed ~105 suspect dirs. That list came from a grep for `/<dir>/` which only finds URL path segments. Re-ran with fixed-string word-boundary search (`grep -Fw`) across `src/**/*.{ts,tsx}` and every single public/ dir had a match.

Three reference patterns the original audit missed:

1. **`dir:` config fields.** e.g. `HippelCoSoEngine.ts` has `dir: 'hippel-coso'` — the loader joins it with the filename, so the string literal for the dir name never appears *adjacent* to a slash.
2. **Template literals.** e.g. `fetch(\`${base}moogfilters/MoogFilters.wasm\`)` — the dir name sits between `}` and `/`, not between quotes.
3. **Registry IDs that happen to match dir names.** Synth & effect registries in `src/midi/**` reference tokens like `exciter`, `melodica`, `sorcer`, `tonewheel`, `vital` — those match the dir names by convention.

**No deletion recommended.** The original audit was a false-positive list.

## Item 4 — Third-party submodule pruning

**Status:** investigated, **do not delete** without per-submodule build-run verification.

25 of the 40 `third-party/` dirs are directly referenced from a top-level `CMakeLists.txt` via `third-party/<name>`. The remaining 15 split as:

| Submodule | Used by | Notes |
|---|---|---|
| `aeolus`                         | `aeolus-wasm/CMakeLists.txt`          | active |
| `RaffoSynth`                     | `raffo-wasm/CMakeLists.txt`           | active |
| `synthv1`                        | `synthv1-wasm/CMakeLists.txt`         | active |
| `uade-3.05`                      | `uade-wasm/build.sh`                  | active |
| `pt2-clone-master`               | `pt2-sampled-wasm/` (CLAUDE.md: `cp third-party/pt2-clone-master/src/gfx/pt2_gfx_font.c pt2-sampled-wasm/src/`) | active, via `cp` |
| `hivelytracker-master`           | hively-wasm (likely; not grepped exhaustively) | probable active |
| `libtfmxaudiodecoder-main`       | tfmx-wasm (likely)                    | probable active |
| `oidos-master`                   | `oidos-wasm`                          | probable active — needs CMake check |
| `voclib`                         | `vocoder-wasm` (likely)               | probable active |
| `fast tracker 2`                 | ft2-sampled-wasm (per CLAUDE.md hardware-UI section) | active, via extraction |
| `sonix-music-driver`             | sonix-wasm                            | probable active |
| `buzzmachines-master`            | `public/Buzzmachine.worklet.js` loads them at runtime | active as data source |
| `mda-lv2`, `distrho-ports`, `calf-studio-gear` | audit-flagged reference-only, but the 2026-04-17 audit misclassified `aelapse` the same way — **do not delete** without per-file verification against `*-wasm/src/` #include paths |

Submodule drift in `git status` is normal per MEMORY.md.

**Recommendation:** leave all submodules for now. Any deletion requires per-submodule build+smoke test: rebuild the associated `*-wasm`, load a known file, confirm no regression. That's bigger than "cleanup".

## Item 5 — Hardware-panel button refactor

**Status:** **leave alone — intentional.** Each of `TB303Button`, `DX7Button`, `VL1Button`, `CZ101Button`, `D50Button`, `TR808StepButton`, `VFXButton` is a *file-local* component inside the matching `*Hardware.tsx` (e.g. `TB303Button` is defined at `TB303Hardware.tsx:101` and used at L213–259 only). They're each inline per-panel styling to match the specific hardware aesthetic; not duplicated across the app. The original plan's verdict was correct.

## Item 6 — `CustomBanner` / `JingleVisualizer`

**Status:** already done. Neither `CustomBanner.tsx` nor `JingleVisualizer.tsx` exists in `src/`; no `customBannerImage` field remains in stores. Nothing to complete or remove.

---

## Bottom line

The dead-code-cleanup plan is closed. No further deletion, refactor, or completion work is open. Future cleanups should start from a fresh audit — the 2026-04-17 one under-reports references and was the source of the over-broad flags here.
