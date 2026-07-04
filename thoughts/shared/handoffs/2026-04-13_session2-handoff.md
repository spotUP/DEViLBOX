---
date: 2026-04-13
topic: editability-smoke-test-audio-leaks
tags: [editability, smoke-test, audio-leak, uade, format-registry]
status: final
---

# Session Handoff — 2026-04-13

## Commits (12 total)

1. `bcb5208` — 65 more formats editable (81% → 92%) + 3 demoscene synths in registry
2. `a788fb8` — Chip RAM pattern reader frozen array fix
3. `e8b5a6b` — 166 test songs from Reference Music
4. `aaabae1` — Standard format test songs (MOD, XM, IT, S3M, FUR, SID, VGM)
5. `15a27ba` — Pre-existing type error fixes (CheeseCutter, ChannelRoutedEffects, etc.)
6. `5cdb508` — Special FX: add .jd extension + jd.* prefix
7. `d73054e` — UADE worklet crash recovery (malloc abort → reinit)
8. `ffacd9a` — Route 6 silent formats + fix test files
9. `079370d` — Stop ALL active WASM engines on stop (not just current song's)
10. `290d66d` — Mute UADE output gain on stop
11. `7a84989` — Mute libopenmpt output gain on stop
12. `3db9676` + `ae4dbd8` + `16db802` — Mute ALL engine gains on stop/restore on play + force-stop UADE/libopenmpt
13. `bcae498` — Art of Noise: allow zero-size IFF chunks
14. `3cb4080` — Comprehensive smoke test (9 checks, scores, tracker reporting)

## Key Fixes

### Audio leak on format switching (ROOT CAUSE FIXED)
- `stopNativeEngines()` only stopped engines matching the current song — when rapidly loading different formats, the previous engine kept playing
- Fixed: stop ALL engines with active instances, mute output gains immediately on stop, force-stop UADE/libopenmpt which aren't in WASM_ENGINES array
- Leak detector (`tools/stop-test.ts`) confirmed: no audible leaks remaining

### UADE WASM crash recovery
- `_malloc` abort after heap corruption cascaded into "No browser connected" crashes
- Fixed: `_lastLoadFailed` flag now set on ANY exception (not just non-zero return), ensuring next load reinits WASM

### Format routing gaps
- `.jd` (Special FX), `.hip` (Hippel), `.cm` (Custom Made), `.dsr` (Desire), `.hip7` (Hippel 7V), `.fw` (Forgotten Worlds) — all were falling through to generic UADE or completely unrecognized
- Fixed: added extension matching to registry entries and catchall regex

## Smoke Test

### `tools/quick-smoke.ts` — comprehensive 9-check test
Checks: audio (spectral beep detection), format detection, patterns, instruments (sample + synth data), editability, playback advancing, song structure, export round-trip, console errors. Scores 0-100. Reports to localhost:4444.

### `tools/stop-test.ts` — audio leak detector
Plays each format, stops, checks if audio persists. Prints only leakers.

### Last partial results (before comprehensive test rewrite)
- 119/142 tested = 84% audio pass rate (browser crashed mid-run)
- 19 silent formats (mix of bad test files + genuine UADE limitations)

## Latest Smoke Test Results (final run)
- **53 audio OK**, 21 silent, 99 browser-disconnected (crashed on ashley-hogg)
- 58 have patterns, 0 instruments detected (WS bridge limitation), 63 exportable
- 14 streamed formats identified (need stream visualizer)
- Browser crashes on `ashley-hogg` (compiled 68k) — UADE WASM crash after ArtOfNoise engine switch

## Remaining Silent Formats (21)
Genuine failures needing investigation:
- `composer-667`, `deflemask`, `fm-tracker` — have native parsers, should work
- `future-composer-bsi`, `future-composer-1.3`, `future-composer-1.4` — FC family, should work
- `hippel`, `hippel-st`, `hippel-coso`, `hippel-st-coso` — Hippel family UADE
- `desire`, `custommade`, `anders-oland`, `darius-zendeh`, `dave-lowe-new`, `forgotten-worlds` — UADE routing
- `actionamics`, `digibooster`, `delitracker-custom` — UADE-only
- `iff-smus` — IFF SMUS format

## Browser Crash Chain
`art-of-noise` (ArtOfNoise WASM engine) → `ashley-hogg` (UADE) = crash.
The engine transition from ArtOfNoise back to UADE triggers a WASM abort.
99 formats untested after the crash.

## Still Needs
- Fix browser crash on ashley-hogg (ArtOfNoise → UADE engine transition)
- Investigate 21 silent formats
- Fix fredmon instrument loading (sounds terrible/broken)
- Soak test (2+ hour sustained playback) — 5 days to gig
- WS bridge: get_instruments_list, get_audio_analysis, get_format_state return empty/0

## Key Files
| File | Change |
|------|--------|
| `src/engine/replayer/NativeEngineRouting.ts` | Stop-all-engines, gain mute/restore, force-stop UADE/libopenmpt |
| `src/engine/uade/UADEEngine.ts` | Gain mute on stop, restore on play |
| `src/engine/libopenmpt/LibopenmptEngine.ts` | Gain mute on stop, restore on play/resume |
| `public/uade/UADE.worklet.js` | Crash recovery, try/catch in _loadIntoWasm |
| `src/lib/import/FormatRegistry.ts` | 7 extension routing fixes, catchall additions |
| `src/lib/import/FormatCapabilities.ts` | 65 formats added to editable/exportable |
| `tools/quick-smoke.ts` | Comprehensive 9-check smoke test |
| `tools/stop-test.ts` | Audio leak detector |
| `public/data/test-songs/` | 173 format test directories |
