---
date: 2026-08-19
topic: "PR 78 — UADE MaxTrax eagleplayer, audio.device hardening, reproducible wasm build"
tags: [uade, maxtrax, audio-device, wasm, ci, security]
status: final
---

## Why

`main` did not build UADE from a clean checkout. Commits 10c478188 / 61917acb7 / c8f96ec23 landed the MaxTrax fake-audio.device work, but four supporting files stayed uncommitted. `third-party/uade-3.05/src/uade.c:651` switches on `AMIGAMSG_AUDIO_DEV_OPEN` / `_BEGINIO` / `_ABORTIO`, and the committed `amigamsg.h` declared none of them.

An ultra review of the first two commits found 15 issues. All 15 are fixed here — including two that invalidated the original premise of the PR.

## What the review changed

**The shipped wasm was not reproducible from this repo.** It exported `uade_wasm_get_cia_fire_log`, a symbol in no source file and no `EXPORTED_FUNCTIONS` list — it had been built out of tree. Corroborating: main's wasm already embedded the 6113-byte `eagleplayer.conf` with the MaxTrax line while main's tracked conf was 6090 bytes without it. `public/uade/UADE.{js,wasm}` here are rebuilt by `build.sh` from the committed sources, and CI now rebuilds them on every change.

**"UADE cannot play MaxTrax (ret=-1)" was cause and effect backwards.** Four comments said this. Measured: remove the `MaxTrax prefixes=mxtx` line, rebuild, and `maxtraxPlayback.render.test.ts` fails with exactly `ret=-1`; restore it and the same file renders. The eagleplayer entry is what makes UADE play MaxTrax at all.

## Commits

| commit | what |
|--------|------|
| `4bcb4ce8b` | MaxTrax eagleplayer registry + `AMIGAMSG_AUDIO_DEV_*` enums |
| `017ad6854` | `yarn.lock` sync (libflacjs in, node-hid tree out) |
| `9a8c12793` | audio.device: validate every module-controlled value |
| `05f821810` | pin the message ids, verify both sides agree |
| `b9b0ad5f9` | MaxTrax prefix routing + companion-file forwarding |
| `6dec06399` | CI builds the UADE core; stop committing generated blobs |
| `76c47c884` | rebuild UADE.js/UADE.wasm from committed sources |

## Memory safety (`audiodevice.c`)

The file turns 68k values a module controls into host pointers and array indices, and validated none of them:

- `get_target_channel()` returns -1 when `io_Unit` carries no channel bit; that -1 reached `_write_msg_list[-1]` as a read **and a write**, and `audio_channel[-1]` via `AUDxPER`/`AUDxVOL`.
- `audiodevice_abortIO` indexed the 33-entry `cmd_labels[]` with a raw `io_Command` and passed the result to `%s`; the guarded `get_cmd_label()` already existed one function away.
- 15 `get_real_address()` calls, zero `valid_address()` calls.
- `alloc_channels()` looped over an unvalidated 32-bit `ioa_Length`.
- `reply_message()` walked the reply chain with no cycle detection — on the render thread.
- `score.s` fabricated an allocation result using IOStdReq offsets (`IO_LENGTH`=36, `IO_DATA`=40) against an IOAudio request (`ioa_AllocKey`@32 WORD, `ioa_Data`@34, `ioa_Length`@38), then cleared `io_Error` unconditionally, discarding `ADIOERR_ALLOCFAILED`.

Fixed at the boundary, not per use site: `resolve_amiga()` / `resolve_request()` / `valid_channel()` are now the only places an Amiga address becomes a host pointer or a unit bitmask becomes an index. `score.s` no longer fabricates anything — `audiodevice_open()` is the single source of truth — and propagates the host's `io_Error` as OpenDevice's `d0`.

## Verification

- [x] `npm run type-check` (`tsc -b --force`) — clean
- [x] `npm run test:ci` — 297 files / 3976 tests pass
- [x] `npm run test:compliance` — pass
- [x] `uade-wasm/tests/run_audiodevice_tests.sh` — 6/6 pass; **all 6 fail against the pre-fix `audiodevice.c`** (5 sanitizer aborts, 1 timeout from the unbounded reply walk)
- [x] `uade-wasm/verify_amigamsg.py` — 26 ids agree; verified to catch a planted mismatch
- [x] `score.s` reassembles byte-identically with `vasmm68k_mot`
- [x] `maxtraxPlayback.render.test.ts` — antmusic.mxtx still renders non-silent in both windows after the score.s and audiodevice.c changes
- [x] New `uadeMaxTraxWiring.test.ts` — 3 of its 5 assertions fail on the pre-fix code
- [ ] Manual: drop a Modland `MXTX.<tune>` + `SMPL.<tune>` pair and confirm the sample bank loads (no split-file fixture in the repo)

## Notes for reviewers

- `uade-wasm/src/player_registry.c` and `basedir_data.c` are no longer tracked. `build.sh` regenerates both as step 1, so the committed copies were never build inputs — 10 MB of hex tables and a conflict surface on every player addition.
- `uadeAudioDeviceRobustness.test.ts` is a crash guard, not a decider: it was measured to pass against the pre-fix source too. `audiodeviceSafety.test.ts` is the deciding test.
- `cinter4` declared `matchMode: 'both'` with an empty `prefixes` array, failing the registry-integrity test intermittently. Corrected to `'extension'`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
