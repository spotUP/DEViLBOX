---
date: 2026-07-10
topic: UADE audio.device port — phased plan
tags: [uade, audio.device, maxtrax, plan]
status: draft
---

# UADE audio.device port — phased plan

Research: `thoughts/shared/research/2026-07-10_wothke-audiodevice-uade-port.md`.
Goal: MaxTrax (and other audio.device formats) play correctly through DEViLBOX's
real UADE (uade-3.05), by finishing upstream's stubbed audio.device using Wothke's
proven `audiodevice.c` logic. Milestone 0 (vasm reassembly of score) = PASSED.

## Reference sources (scratchpad clone, uade-2.13 Wothke)
- host: `src/audiodevice.c` + `.h`, `src/uade.c:758-790`, `src/custom.c:1424`
- amiga: `amigasrc/score/devices/audio/{audio_dev.s,audio.i,audio.h}`

## Phase 1 — Amiga score: trap audio.device BeginIO → host message
Extend `third-party/uade-3.05/amigasrc/score/score.s`.
- Current `isaudiodev` (~2422) handles OpenDevice + ACMD_ALLOCATE only. MaxTrax
  reaches audio via `BeginIO`/`DoIO` with `CMD_WRITE` (3) on the IOAudio request.
- UADE routes device I/O through its exec `BeginIO`/`DoIO` traps. Find where score.s
  handles BeginIO (grep `beginio`/`DoIO`/`SendIO`); add: if the request's device is
  our fake audio.device, push IOAudio ptr to $204, emit `AMIGAMSG_RESERVED_0` (18)
  with a sub-op selector (open/beginio/abortio) OR add 3 new enums.
- Decide numbering: reuse RESERVED_0=18 w/ sub-dispatch (host reads IO_COMMAND) is
  least invasive to the protocol. Wothke used 50/51/52.
- Reassemble: `vasmm68k_mot -no-opt -o score -Fbin score.s`. Verify it still boots a
  normal MOD (regression) before wiring host side.
- **Test:** load antmusic.mxtx, confirm host receives the audio-dev message (add a
  temporary `fprintf` in the RESERVED_0 handler). No audio yet.

## Phase 2 — Host: port audiodevice.c + wire message handler
- Copy `audiodevice.c`/`.h` into `third-party/uade-3.05/src/` (adapt swap*() to
  3.05's `amiga_get_u32`/`get_real_address` + LE WASM host).
- In `uade.c` `uadecore_get_amiga_message()`: replace the RESERVED_0 stub (639) with
  a call to `audiodevice_beginIO(...)` etc., reading IOAudio ptrs like Wothke does.
- Port `audiodevice_DMA_signal` hook into 3.05 `custom.c` at the audio-DMA/interrupt
  site (locate 3.05 equivalent of 2.13 custom.c:1424).
- audiodevice.c writes Paula regs — verify it targets 3.05's Paula (`custom.c` audio
  channel state), and that DEViLBOX's per-channel WASM tap still sees it.
- Add `audiodevice.c` to `uade-wasm/build.sh` source list.
- Add vasm score-reassembly step to `build.sh` (so score.s edits ship), OR commit the
  rebuilt `score` binary.
- **Test:** render antmusic via uade-wasm → audible, correct-tempo audio.

## Phase 3 — Oracle + validate + regression
- With UADE playing MaxTrax correctly, dump its Paula register writes (period/vol/
  sample/len/cycles per voice per tick) via existing `_uade_wasm_get_paula_log` /
  `enable_paula_log`.
- Compare against the transpiled player's BeginIO trace → fix the transpiled
  timestretch by register-diff (separate task; unblocks the native-editable path).
- Regression test wired into test:ci: a real MaxTrax song renders non-silent through
  uade-wasm AND a known non-audio.device MOD still renders identically (score change
  must not regress normal playback). Revert-check: must fail without the port.

## Phase 4 — Routing / format wiring
- Ensure DEViLBOX routes .mxtx to the UADE path (not the transpiled player) once this
  works, or keep both and choose per feature (UADE=playback, transpile=edit).
- Update `NativeEngineRouting` / import detection as needed.

## Later (separate plans) — rest of Wothke audit
Tier 1 custom eagleplayers + exotic soundcore formats; Tier 2 prowiz/unice68/decrunch
vs 3.05 rmc. See research doc Tier list.
