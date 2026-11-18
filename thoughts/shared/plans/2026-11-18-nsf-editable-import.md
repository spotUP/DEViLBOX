---
date: 2026-11-18
topic: Editable NSF import (all expansion chips)
status: active
research: thoughts/shared/research/2026-11-18_nsf-editable-import.md
---

# Editable NSF import

Owner decision 2026-11-18: all chips at once (2A03 + DPCM, VRC6, VRC7, FDS, MMC5, N163, S5B). No 2A03-first phase split by chip; phases split by layer instead.

## Shape

- GME stays the player for the original NSF (faithful path unchanged).
- "Convert to editable" (opt-in) produces a normal Furnace-class TrackerSong, same model as .fur import, so save and the NES ROM / NSFe export (src/lib/export/nes/*) work unchanged.
- State source: game-music-emu wasm, extended in C++ with a per-frame channel-state readout. No second NSF emulator, no TypeScript player.
- Conversion logic ported from FamiStudio NsfFile.cs `Load` / `UpdateChannel` (MIT). Do not copy NSFImport or NotSoFatso code (GPL v2).
- Owner rule 2026-11-18: importers are C++ in wasm, no TypeScript conversion code. TypeScript only calls the wasm and hands its output to the existing load path. Default output: .fur bytes loaded by the existing .fur import path (one load path); phase 1 confirms where the converter lives (game-music-emu-wasm vs furnace-fileops-wasm).

## Phases

1. GME per-frame channel state accessor (C++ in third-party/game-music-emu + wasm glue, rebuild public/gme/*). Every chip: period/frequency, volume, duty/mode, length/enable, DPCM address/length/rate/output, FDS wave + mod table + mod depth/speed, N163 wave RAM + per-channel regs, VRC7 custom patch + per-channel regs, S5B tone/noise/envelope/mixer, MMC5 pulses + PCM. Run the file one PLAY call (frame) at a time and read state after each. Proof: a node test on a real NSF per chip prints plausible per-frame state (notes change, volumes move) and the audio GME renders is unchanged (existing gme tests pass).
2. C++ converter in wasm: per-frame state to Furnace song (.fur bytes). One channel per voice, one row per frame, user pattern length (default 64), instruments deduplicated by content per chip, DPCM sample extraction, note + fine pitch, volume column. TypeScript glue next to GameMusicParser only calls the wasm.
3. Compaction post-pass (C++ in the same wasm): fit per-frame volume/duty/pitch runs into instrument macros, pattern repeat detection, speed detection. Without this the songs are unreadable.
4. Wiring + proof: Convert to editable action (UI + MCP), oracle checker tool (resumable, like tools/nes-rom-check.ts) comparing Furnace render of the converted song with the GME trace per chip, export round trip through famistudioSong.ts. State the parity target per chip.

## Risks (from research)

- Drivers faster than 60 Hz, NSF2 IRQ songs, irregular PLAY calls.
- GME coverage of N163/VRC7/S5B state is unverified; phase 1 settles it.
- Furnace render will not be bit-identical to GME (different cores).

## Progress

- [x] Phase 1 (2026-11-18): per-frame state trace in game-music-emu-wasm (`gme_wasm_trace_*`), 2A03 verified on dr mario.nsf, expansion chips untested (no real files); converter goes in furnace-fileops-wasm. Findings: thoughts/spot/2026-11-18-nsf-phase1.md
