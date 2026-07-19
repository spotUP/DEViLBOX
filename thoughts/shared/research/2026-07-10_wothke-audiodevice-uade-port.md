---
date: 2026-07-10
topic: Porting Wothke audio.device (WebUADE+) into DEViLBOX uade-3.05
tags: [uade, audio.device, maxtrax, wothke, amiga, vasm, port]
status: final
---

# Porting Wothke's audio.device support into DEViLBOX's UADE (uade-3.05)

## Why

MaxTrax (and A-Train, Kyrandia, Quartet) use the Amiga `audio.device`. Stock UADE
has no audio.device, so its MaxTrax EaglePlayer crashes (`Illegal instruction: 4afc`,
"score crashed"). That is why DEViLBOX went the transpile-`max.asm`→C→WASM route.

Forum thread (surfaced by user 2026-07-10) revealed **Juergen Wothke's WebUADE+**
(uade-2.13 fork) which DID add a working `audio.device` emulation. Repo:
`https://bitbucket.org/wothke/uade-2.13` (cloned to scratchpad during research).

Decision (user): **port audio.device into DEViLBOX's real UADE first**, then audit
the rest of Wothke's improvements. This gives correct playback for all audio.device
formats at once AND yields a lock-step Paula oracle to later fix the transpiled
MaxTrax player's timestretch.

## The timestretch bug (why the transpile route stalled)

Transpiled `max.asm` player plays but sounds "timestretched and weird" (pitch OK,
time axis wrong). Offline `native_trace` render (identical core) reproduces it, so
NOT a browser cache issue. The hand-rolled harness approximates audio.device timing
as a 50 Hz VBlank + hand-written Paula (`paula_soft.c`); real audio.device timing is
DMA-interrupt driven. The approximation drifts. A real-UADE oracle is the way out.
WAV of the current native render: `~/Desktop/mtx_native_render.wav`.

## Key finding: upstream 3.05 already has an UNFINISHED audio.device skeleton

DEViLBOX uses uade-3.05 (`third-party/uade-3.05`), newer than Wothke's 2.13.
The amiga↔host message protocol DIVERGED between the two, so **Wothke's prebuilt
2.13 `score` binary is NOT protocol-compatible with 3.05's host** — the port must be
source-level and the amiga `score` must be reassembled.

3.05 skeleton already present:
- `src/include/amigamsg.h:22` — `AMIGAMSG_RESERVED_0 /* 18: For an audio.device experiment */`
- `src/uade.c:639` — `case AMIGAMSG_RESERVED_0:` stub (just logs).
- `amigasrc/score/score.s:2399` — `audioname1 dc.b 'audio.device',0`
- `amigasrc/score/score.s:2416` — `exec_open_device` detects audio.device → `isaudiodev`.
- `amigasrc/score/score.s:2422` — `isaudiodev` handles `OpenDevice` + `ACMD_ALLOCATE`
  (cmd 32): cooks a channel mask from `IO_DATA` first byte + a `'uniq'` alloc key,
  returns success. **Does NOT handle `BeginIO` (CMD_WRITE=3)** — the actual play
  command. That is the missing piece.
- `amigasrc/score/todo.txt:28` — "- fake audio.device (Maxtrax)" (listed as unfinished).

So upstream stubbed OpenDevice/Allocate but never wired BeginIO → host. Wothke's
2.13 does exactly that.

## Wothke's audio.device implementation (the reference)

Host C side (`src/`):
- `src/audiodevice.c` (586 lines) — "poor man's audio.device". Self-contained;
  only dep is `swap16/swap32`. Translates IOAudio requests (period/vol/sample ptr/
  len/cycles) into Paula channel state.
- `src/audiodevice.h` — 4-fn interface: `audiodevice_reset/_open/_beginIO/_abortIO`
  plus `audiodevice_DMA_signal(nr)` (called from custom.c).
- `src/uade.c:758-790` — 3 message cases: `AMIGAMSG_AUDIO_DEV_OPEN=50 / _BEGINIO=51 /
  _ABORTIO=52` read IOAudio src/dst ptrs from 0x204/0x208 and call the audiodevice_* fns.
- `src/custom.c:1424` — `audiodevice_DMA_signal(nr)` on Paula DMA event → drives the
  one-shot(attack)→loop transition and audio interrupts.
- `src/include/amigamsg.h:26-28` — the AUDIO_DEV_* enum (values 50-52; 3.05 must use
  its own numbering — reuse RESERVED_0=18 or add new).

Amiga side (`amigasrc/score/`):
- `amigasrc/score/devices/audio/audio_dev.s` — fake audio.device: BeginIO/AbortIO
  vectors emit AMIGAMSG to host instead of touching Paula.
- `amigasrc/score/devices/audio/audio.i`, `audio.h` — struct/offset defs (IOAudio,
  ioa_Request, ioa_Data, ioa_Length, ioa_Period, ioa_Volume, ioa_Cycles, unit mask).

Player source is IDENTICAL: `diff wothke/max_trax/max.asm  our/max.asm` == empty
(both 3174 lines). shared.asm identical too. So the player logic is not in question —
only the audio.device host it runs on.

## Toolchain (de-risked)

Amiga `score` is assembled with **vasm** (not asmone in practice):
`amigasrc/score/Makefile`:
```
score: score.s relocator.s config.i
	vasm.vasmm68k-mot -no-opt -o $@ -Fbin $<
```
`amiga-development-notes.txt` says asmone; the checked-in Makefile uses
`vasm.vasmm68k-mot` (Mot syntax, binary output). vasm builds from source on macOS.
DEViLBOX's `uade-wasm/build.sh` currently ships the **prebuilt** `amigasrc/score/score`
binary and never assembles it — no m68k assembler in the build today.

## Critical files (DEViLBOX side)

- `uade-wasm/build.sh` — emscripten build. Source list ~line 75-144. Uses
  `frontends/common/eagleplayer.c`, `src/player_registry.c`, `uadecore_wasm.c`.
  No amiga-asm step. Would need: assemble score with vasm + add `audiodevice.c`.
- `third-party/uade-3.05/src/uade.c` — `uadecore_get_amiga_message()` at line 382;
  message switch; RESERVED_0 handler at 639.
- `third-party/uade-3.05/amigasrc/score/score.s` — `exec_open_device`/`isaudiodev` ~2410.
- `third-party/uade-3.05/src/custom.c` — Paula/DMA; DMA-signal hook site TBD (find the
  audio DMA trigger; Wothke's is custom.c:1424 in 2.13).
- `third-party/uade-3.05/amigasrc/score/score` — prebuilt binary (Milestone-0 target
  to reproduce from source).

## Open questions / risks

1. **Milestone 0 (make-or-break): PASSED 2026-07-10.** `vasmm68k_mot`
   (`/opt/homebrew/bin/`, `brew install vasm`) reassembles `score.s` to a
   byte-identical binary (md5 `7876cd5b22aa1be827990ce3dbc5cfc5`, 23914 bytes).
   Command (from `amigasrc/score/`):
   `vasmm68k_mot -no-opt -o /tmp/score_rebuilt -Fbin score.s`
   (one harmless warning: label `end` conflicts w/ directive, line 3893). Binary
   name in Makefile is `vasm.vasmm68k-mot`; installed binary is `vasmm68k_mot`.
   Amiga-score reassembly is proven safe — score.s can be edited + rebuilt.
2. Message numbering: reuse `AMIGAMSG_RESERVED_0=18` for a single audio-dev opcode
   (sub-dispatch on IO_COMMAND) vs add 3 new enums. Wothke used 3; 3.05 has room.
3. custom.c DMA-signal hook: locate the 3.05 equivalent of Wothke's custom.c:1424
   (audio DMA / interrupt point). 3.05 custom.c differs from 2.13.
4. audiodevice.c endianness: written big-endian-assuming with swap*(); WASM host is
   LE — confirm swap path matches 3.05's `amiga_get_u32` conventions.
5. Editability: this gives PLAYBACK via the opaque emulator. The transpiled native
   player remains the editability path. Not either/or — the oracle from this port
   feeds the transpile fix.

## Wothke's OTHER improvements (Tier list, for the later audit)

Tier 1 (unique, not in upstream 3.x, high value):
- audio.device (this doc).
- Custom-module eagleplayers: Archon, Archon2, Astate, MarbleMadness, SkyFox
  (`emscripten/docs/work_in_progress/Custom/`).
- "Improved soundcore" ~40 exotic formats (see root README list).

Tier 2 (verify vs 3.05 before porting — may already be covered):
- `src/prowiz` (mod-format converters), `src/unice68`, `src/decrunch`
  (MMCMP/PowerPacker/SQSH/S404). 3.05 has none of these dirs but depacks via `rmc`.
- Quartet ST (`amigasrc/players/quartet_st`).

Skip (redundant): separate 4-channel output — DEViLBOX already has per-channel
isolation via its own WASM Paula tap.
