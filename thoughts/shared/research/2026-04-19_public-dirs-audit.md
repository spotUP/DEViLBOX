---
date: 2026-04-19
topic: public-dirs-registry-audit
tags: [cleanup, audit, effects, registry, post-gig]
status: final
---

# public/ Directory Audit vs Effect & Synth Registries

Resolves Item 3 of `thoughts/shared/plans/2026-04-17-dead-code-cleanup-followups.md`.

## Method

The dead-code audit flagged 92 `public/<dir>/` entries as unreferenced by grep. This is misleading because the effect/synth registries load modules dynamically via:
- `ctx.audioWorklet.addModule(\`${baseUrl}<dir>/Foo.worklet.js\`)` — template-literal paths that string-match against the dir.
- Effect classes in `src/engine/effects/*Effect.ts` — registered by id (e.g. `'SpringReverb'`) in `src/engine/registry/effects/wasm.ts`, which then dynamically imports the effect class, which in turn fetches from `public/<dir>/`.

For each flagged dir I checked:
1. The actual `.js` / `.wasm` / `.worklet.js` filename inside `public/<dir>/`.
2. Whether that capitalised basename appears as `id: '<Name>'` in `src/engine/registry/effects/wasm.ts` (or other registry files).
3. Whether any file under `src/engine/effects/` or `src/engine/<synth>/` fetches from that dir via template literal.
4. Whether a synth/replayer engine references the dir by `${base}<dir>/Foo.*` pattern.

## Result

**86 of 92 dirs are live** — the flag was wrong, because the audit used literal `/<dir>/` grep and missed template-literal paths.

### LIVE — registered effect, loaded dynamically
`agc, artistic-delay, autosat, autotune, bass-enhancer, beat-breather, binaural-panner, bitta, cabinet-sim, calf-phaser, clipper, deesser, della, distortion-shaper, dragonfly-hall, dragonfly-plate, dragonfly-room, driva, ducka, dynamic-eq, dynamics-proc, early-reflections, eq5, eq8, eq12, exciter, expander, geq31, gott-comp, granular-freeze, haas-enhancer, juno-chorus, kuiza, leslie, limiter, masha, maximizer, mono-comp, moogfilters, multi-chorus, multi-spread, multiband-clipper, multiband-comp, multiband-dynamics, multiband-enhancer, multiband-expander, multiband-gate, multiband-limiter, mverb, noise-gate, overdrive, panda, parametric-eq, phono-filter, pulsator, re-tape-echo, reverse-delay, ring-mod, roomy, satma, saturator, shimmer-reverb, sidechain-gate, sidechain-limiter, slapback-delay, spacey-delayer, springreverb, swedishchainsaw, tapedelay, transient-designer, tube-amp, tumult, vihda, vintage-delay, vinyl, vinylnoise, x42-comp, zam-delay, zam-eq2`

All of these have an `id: '<Name>'` entry in `src/engine/registry/effects/wasm.ts` (or sibling registry files) and a `*Effect.ts` class in `src/engine/effects/` that fetches from the dir.

### LIVE — synth / replayer / hardware UI dir (not an effect)
| Dir | What it is |
|-----|------------|
| `cheesecutter` | CheeseCutter SID tracker — `src/engine/cheesecut/CheeseCutterEngine.ts` |
| `fonts` | Fontaudio + MSDF + TTF assets — referenced by various UI components |
| `fred-wasm` | Fred Editor replayer WASM — `src/engine/fred/FredEditorReplayerEngine.ts:72` |
| `hippel-coso` | Hippel CoSo replayer — `src/engine/hippelcoso/HippelCoSoEngine.ts` |
| `melodica` | Melodica synth (WASM) |
| `open303` | Open303 TB-303 clone (used by DB303 path) |
| `sorcer` | Sorcer wavetable synth |
| `tal-noisemaker` | TAL NoizeMaker synth |
| `tonewheel` | Tonewheel organ synth — 25 file refs incl. `TonewheelOrganControls` |
| `vital` | Vital synth |

### LIVE — support assets
| Dir | What it is |
|-----|------------|
| `templates` | Starter template files (`protracker.mod`, `hippelcoso.coso`, etc.) — referenced by `systemPresets.ts:1088–1237` as `templateFile:` |
| `worklets` | `scratch-buffer.worklet.js` — used by `src/engine/dj/DeckScratchBuffer.ts` (DJ scratching) |

### TRULY DEAD — safe to delete
| Dir | Contents | Evidence |
|-----|----------|----------|
| `public/test-patterns/` | `swing-test.xml`, `swing-test-slow.xml` | 0 refs in `src/`. Only mention is in a stale handoff doc `HANDOFF_SWING_AND_DB303.md` in repo root. |

### Stale file inside a LIVE dir
- `public/worklets/scratch-buffer.worklet.js.bak` — a `.bak` backup of the live worklet. Safe to delete.

## Recommendation

- **Do NOT delete any of the 91 live dirs.** The original audit's path-based grep was the wrong tool. Add a note to `thoughts/shared/research/2026-04-17_dead-code-audit.md` flagging this method's limitation.
- **Delete** `public/test-patterns/` and `public/worklets/scratch-buffer.worklet.js.bak`. Both are ~10 KB combined; effectively symbolic.
- **Do not generalise** from this audit to other `public/` dirs — each new dir needs the same three-check method (registry id, effect fetch, synth fetch) before any deletion.

## Notes for future audits

The dead-code audit's grep pattern `rg '/<dirname>/'` will keep producing false positives because:
1. Template-literal paths are prefixed by `${baseUrl}` or `${base}` without a leading slash — grepping for `/foo/` misses `${baseUrl}foo/Foo.wasm`.
2. Registry IDs are CamelCase (e.g. `BassEnhancer`), not kebab-case like the dir names.
3. Effect classes are in `src/engine/effects/` separate from the registry file, and the connection is via `await import('@engine/effects/XxxEffect')`.

A better audit would walk `EffectRegistry.getAllIds()` at runtime and diff against the dir listing.
