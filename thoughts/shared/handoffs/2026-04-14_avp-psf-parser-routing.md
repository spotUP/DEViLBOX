---
date: 2026-04-14
topic: activision-pro-soundfactory-parser-routing
tags: [activision-pro, sound-factory, parser, routing, playback, wasm]
status: implemented
---

# Activision Pro + Sound Factory — Parser & Routing Fixes

## Status: COMPLETE

All tasks from the original handoff are done, plus additional fixes found during testing.

## Commits

1. `d67efe55` — SoundFactory WASM silence (4 C bugs), FC wrong engine routing, RK blank patterns
2. `aa232194` — Suppress unknown synthType error dialogs for WASM replayer formats  
3. `c822fe65` — FTM/Klystrack volume fixes, AVP subsong selector UI

## What Was Fixed

### SoundFactory2 (.psf) — 4 C bugs + WASM rebuild
- Sub-song offset reading skipped empty slots instead of contiguous
- SF_OP_SET_ADSR scanner double-counted 4 bytes (desynchronized instrument discovery)
- SF_OP_GOTO scanner had no loop detection (infinite hang in sf_create)
- SF_OP_LOOP disabled voices permanently instead of restarting

### ActivisionPro (.avp) — 3 C bugs + subsong UI
- loop_start not converted from words to bytes (wrong loop positions)
- has_ended set globally on first track transition (premature song end)
- instruments[-1] undefined behavior when uninitialized
- Subsong selector UI wired (AVPSubsongSelector component)

### Future Composer (.fc) — routing fix
- Parser set hippelFileData instead of futureComposerFileData, routing to wrong WASM engine

### Ron Klaren (.rk) — parser scanner fix
- M68k code scanner started at offset 0 instead of HEADER_SIZE (32)
- Caused sub-song/CIA/instrument detection to fail → empty patterns

### Face The Music (.ftm) — volume fix
- ftm_render_multi only rendered 4 of 8 channels, dropping channels 4-7

### Klystrack (.kt) — volume fix
- CYD engine PRE_GAIN_DIVISOR (4) made output very quiet; added 2x gain compensation

### All formats — synthType error dialog fix
- Dedicated WASM replayer instruments now use synthType 'Sampler' to prevent ToneEngine error dialogs

## All 12 Formats Verified in Browser

| Format | File | Peak |
|--------|------|------|
| SoundFactory | goldrunner.psf | 0.37 |
| ActivisionPro | gettysburg.avp | 0.52 |
| DSS | doxtro3.dss | 0.98 |
| Oktalyzer | les granges brulees.okta | 0.25 |
| Synthesis | space_sound.syn | 0.61 |
| Actionamics | dynablaster.ast | 0.35 |
| Future Composer | anthrox.fc | 0.47 |
| Ron Klaren | astra_2.rk | 0.69 |
| Face The Music | staticoscillations.ftm | plays |
| Fred Replayer | rebels.fred | 0.23 |
| Klystrack | Ocean Loader III.kt | 0.27 |
| Quadra Composer | synth_corn.emod | 0.65 |

## Future Work
- Unified subsong system for .dbx native format (user requested)
- Pattern display is approximate for opcode-based formats (SF, RK, FC)
