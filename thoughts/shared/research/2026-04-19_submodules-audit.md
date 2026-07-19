---
date: 2026-04-19
topic: third-party-submodules-audit
tags: [cleanup, audit, submodules, post-gig]
status: final
---

# third-party/ "Submodules" Audit vs Build Scripts

Resolves Item 4 of `thoughts/shared/plans/2026-04-17-dead-code-cleanup-followups.md`.

## Method

The dead-code audit flagged `aelapse, aeolus, distrho-ports, libtfmxaudiodecoder-main, mda-lv2, oidos-master, retromulator, sonix-music-driver, voclib, dexed, buzzmachines-master, fast tracker 2` as reference-only. MEMORY.md explicitly corrected the `aelapse` misclassification, which invalidated trust in the rest.

For each candidate I checked:
1. Does any `*-wasm/CMakeLists.txt` include its path?
2. Does any build script (`*.sh`, `Makefile`) reference it?
3. Does any C/C++/Rust source in our `*-wasm/` dirs `#include` or import from it?

**Important finding:** there is no `.gitmodules` file. These `third-party/<name>/` dirs are NOT git submodules — they are nested git repos cloned into the tree. Git status marks the modified ones as `m` (modified nested) and others as `?` (untracked).

## Result — Plan's flagged 12

| Submodule | Status | Evidence |
|-----------|--------|----------|
| `aelapse` | **ACTIVELY BUILT** | `juce-wasm/aelapse-ui/CMakeLists.txt` + `public/aelapse/Aelapse.wasm`. MEMORY.md 2026-04-12 handoff documents full port. Audit was wrong. |
| `aeolus` | **ACTIVELY BUILT** | `aeolus-wasm/CMakeLists.txt` builds from it. |
| `dexed` | **ACTIVELY BUILT** | `juce-wasm/dexed/CMakeLists.txt` — 3 references. |
| `retromulator` | **ACTIVELY BUILT** | `juce-wasm/opl3/CMakeLists.txt` — 3 references. Used for the OPL3 build. |
| `libtfmxaudiodecoder-main` | **NOT USED** (forked) | `tfmx-wasm/CMakeLists.txt:7–11` explicitly says *"Use our LOCAL copy of libtfmxaudiodecoder, not the third-party submodule. We forked the library into tfmx-wasm/lib/libtfmxaudiodecoder/src"*. |
| `buzzmachines-master` | **ACTIVELY BUILT** | `scripts/build-buzzmachines.sh` references it. |
| `oidos-master` | **NOT USED** (replaced by Rust port) | `oidos-wasm/` is a Rust Cargo project, not using upstream. |
| `sonix-music-driver` | **NOT USED** (forked) | `sonix-wasm/` has its own sources. Zero references. |
| `mda-lv2` | **NOT USED** (forked) | `mda-dx10-wasm/`, `mda-epiano-wasm/`, `mda-jx10-wasm/` have their own sources. Zero references. |
| `distrho-ports` | **NOT USED** | Zero references anywhere. |
| `voclib` | **ACTIVELY BUILT** | `voclib-wasm/voclib_bridge.c` references it. |
| `fast tracker 2` | **NOT USED** (forked) | `ft2-sampled-wasm/` has its own `src/` tree. MEMORY.md documents the extraction. Zero current build references. |

## Result — Other submodules checked for completeness

| Submodule | Status |
|-----------|--------|
| `amsynth-master` | ACTIVELY BUILT (`amsynth-wasm/CMakeLists.txt`) |
| `calf-studio-gear` | **NOT USED** (no references found) |
| `fftw-3.3.10` | Embedded inside `furnace-master/extern/fftw/` — transitive |
| `fluidsynth` | ACTIVELY BUILT (`fluidsynth-wasm/CMakeLists.txt`) |
| `furnace-master` | ACTIVELY BUILT (`furnace-wasm/CMakeLists.txt`) |
| `geonkick-master` | ACTIVELY BUILT (`geonkick-wasm/CMakeLists.txt`) |
| `helm-master` | ACTIVELY BUILT (`juce-wasm/helm-ui/CMakeLists.txt`) |
| `hivelytracker-master` | ACTIVELY BUILT (`hively-insed-wasm/src/hvl_insed.c`) |
| `monique-monosynth` | ACTIVELY BUILT (`juce-wasm/monique-ui/CMakeLists.txt`) |
| `musicline_playback-main` | ACTIVELY BUILT (`musicline-wasm/CMakeLists.txt`) |
| `mxml` | ACTIVELY BUILT (`zynaddsubfx-wasm/CMakeLists.txt`) |
| `OB-Xf-main` | ACTIVELY BUILT (`juce-wasm/obxf/CMakeLists.txt`) |
| `odin2-master` | ACTIVELY BUILT (`juce-wasm/odin2-ui/CMakeLists.txt`) |
| `openmpt-master` | ACTIVELY BUILT (`openmpt-soundlib-wasm/CMakeLists.txt`) |
| `projectm-master` | ACTIVELY BUILT (`projectm-wasm/CMakeLists.txt`) |
| `pt2-clone-master` | **NOT USED** (forked — MEMORY.md: "extracted from third-party/pt2-clone-master/") |
| `RaffoSynth` | ACTIVELY BUILT (`raffo-wasm/CMakeLists.txt`) |
| `rtosc-build-wasm` | ACTIVELY BUILT (`zynaddsubfx-wasm/CMakeLists.txt`) |
| `setBfree` | ACTIVELY BUILT (`setbfree-wasm/CMakeLists.txt`) |
| `sfizz` | ACTIVELY BUILT (`sfizz-wasm/CMakeLists.txt`) |
| `sorcer-master` | ACTIVELY BUILT (`juce-wasm/sorcer/CMakeLists.txt`) |
| `sunvox_sources-master` | ACTIVELY BUILT (`sunvox-wasm/CMakeLists.txt`) |
| `surge-xt` | ACTIVELY BUILT (5 CMakeLists refs across `juce-wasm/`) |
| `synthv1` | ACTIVELY BUILT (`synthv1-wasm/CMakeLists.txt`) |
| `tunefish` | ACTIVELY BUILT (`tunefish-wasm/CMakeLists.txt`) |
| `uade-3.05` | ACTIVELY BUILT (`uade-wasm/build.sh`, `uade-wasm/src/player_registry.c`) |
| `vital-main` | ACTIVELY BUILT (`juce-wasm/vital/CMakeLists.txt`) |
| `wavesabre` | ACTIVELY BUILT (`wavesabre-wasm/CMakeLists.txt`) |

## Candidates for deletion (pending owner review)

These appear in `third-party/` but are NOT used by any build script, CMakeLists, or source file:

1. `third-party/libtfmxaudiodecoder-main` — explicitly superseded by the local fork in `tfmx-wasm/lib/libtfmxaudiodecoder/src`.
2. `third-party/oidos-master` — superseded by Rust rewrite in `oidos-wasm/`.
3. `third-party/sonix-music-driver` — superseded by local fork in `sonix-wasm/src/`.
4. `third-party/mda-lv2` — superseded by local forks in `mda-*-wasm/`.
5. `third-party/distrho-ports` — no references found anywhere.
6. `third-party/calf-studio-gear` — no references found anywhere.
7. `third-party/pt2-clone-master` — extracted into `pt2-*-wasm/src/` (MEMORY.md documents this).
8. `third-party/fast tracker 2` — extracted into `ft2-sampled-wasm/src/` (MEMORY.md documents this).

**Reasons to keep anyway (owner call):**
- CLAUDE.md guidance says *"NEVER use `third-party/` as authoritative reference — use `/Users/spot/Code/Reference Code/`"*. So deleting these doesn't lose the reference.
- But MEMORY.md references `third-party/pt2-clone-master/src/gfx/pt2_gfx_font.c` and similar paths for *re-extraction* workflows (hardware-UI ports).
- Size trade-off is significant — these repos can be GB-sized.

**Recommendation:** defer deletion until the user confirms they won't need to re-extract assets. If they say "reference lives at `/Users/spot/Code/Reference Code/` exclusively", all 8 are safe to delete.

## Files to update when deleting any of these

- `CLAUDE.md` — `third-party/fast tracker 2/` reference lines (Hardware UI WASM section)
- `MEMORY.md` — references to `third-party/pt2-clone-master/` extraction notes
- Project memory `memory/WASM_BUILD_MILESTONE.md` etc.
