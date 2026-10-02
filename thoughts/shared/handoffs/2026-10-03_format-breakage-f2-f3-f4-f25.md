---
date: 2026-10-03
topic: Format breakage ledger — F25 solo/mute, F2 Hippel 7V grid, F3 level, F4 .sog — handoff for Sunday
tags: [formats, hippel, tfmx, uade, mixer, handoff]
status: draft
---

# Handoff — format breakage ledger, 2026-10-03 (continue Sunday)

Follows `2026-10-02_dub-wet-level-controls-channel-identity.md` (dub bus) and
the format triage that produced the ledger. The ledger is the todo list:
`thoughts/shared/plans/2026-10-02-format-breakage-todos.md` (F1–F26, each row
has symptom / evidence / cause / where to dig / how to verify). Read the
ledger first; this file says what moved today and what to do next.

## Done today (all committed on main)

| Item | Commit | What |
|------|--------|------|
| F25 | `94c7d3ec0` (pushed) | Mixer mute/solo registrations derive from `WASM_ENGINES` (`src/lib/mixer/engineMuteRegistry.ts`); FredReplayer2, Oktalyzer, Dss, Synthesis, SoundFactory2, Asap now receive the mask. Test `src/stores/__tests__/mixerMuteReachesRegistryEngines.test.ts`. Open halves in the ledger row: 5 engines with no mute API; isolation report for Fred. |
| F2 | `ab7a6535e` (unpushed at time of writing) | Hippel 7V "Incorrect Pattern Data" was the grid hiding the step's voice volume. Row 0 volume column now shows the track-table `0xFx` command (`0x10 + 0..64`), edits write it back through new `HippelCellSpan.aux`; 7V instruments 1-based like CoSo. Test `src/engine/__tests__/hippel7VVoiceVolume.test.ts` (in test:ci), fails on the old parser. Ratchet `tfmx7v` still byte-exact. |
| F3 | `abba6ffef` (unpushed) | Closed, not a defect: the 1.37 peak was a double start (load_file auto-plays, then `play`). Clean measurement: app meter within 2 dB of the worklet's own output; peaks above 1.0 are the soft limiter (ratio 4) by design. Docs only. |
| F4 | ledger edit, uncommitted when this was written — commit it with this handoff | Measured, blocked on an engine: raw Atari ST TFMX. libtfmxaudiodecoder refuses (`-3`), UADE maps `.sog` to the Amiga Hippel player (`module check failed`), renamed `hst.*` the ST player loads but outputs a flat 0.004 RMS buzz. Options in the row; recommended (c) "no player" message now, (a) native TFMX-ST + YM model as the real fix. Owner decision. |

Earlier today (before this handoff's window, already pushed): F1 UADE
soft-reset trap fixed in `uade-wasm/src/entry.c` + rebuilt bundle
(`a3af29b82`), F26 link fix (`20eb08b28`), F19 console prefixes (`f076e3e2e`).

## In progress / not started — disclose

Recon only, no code written, for the next three cheap items:

- **F17** `ServerStatusBadges.tsx` opens `ws://${host}:4003/probe` every 15 s
  from the HTTPS live page → Mixed Content x40. Fix: gate `checkWebSocket`
  (and the Express `/health` fetch, same class) on
  `window.location.protocol === 'http:'`; return a single "not applicable"
  state, no retries. Pure helper + test under `src/__tests__/ci/` (that dir is
  in test:ci; `src/components/**/__tests__` is NOT).
- **F22** `load_file` reports `format: format?.label` (registry label,
  `writeHandlers.ts` ~1706) and `get_format_state` only lists
  `loadedWasmEngines` by file-data key. Add an `engine` field naming what
  will play: iterate `WASM_ENGINES` with `shouldActivate(desc, song)`
  (`NativeEngineRouting.ts:922`) → `desc.key`; else `uade` when
  `uadeEditableFileData` / classic streaming; else `tracker`. Put the
  resolver in `NativeEngineRouting.ts` so the bridge and the router agree.
- **F18** `futureplayer-wasm/src/FuturePlayer.c` lines 1199–1206 (per-tick
  `T000..T199`) and 1349–1368 (`[FP] set_subsong` …) are unconditional
  `fprintf(stderr)`. Gate behind `#ifdef FP_TRACE`, rebuild with CMake
  (`futureplayer-wasm/CMakeLists.txt`, emcc, `-O2`; outputs
  `public/futureplayer/FuturePlayer.{js,wasm}`), commit the rebuilt bundle
  (Actions are unpaid — CI does not rebuild wasm; see F26's lesson).

## State of the tree

- Branch `main`. Pushed through `94c7d3ec0`. Unpushed: `ab7a6535e`,
  `abba6ffef`, plus the commit carrying this handoff and the F4 ledger row.
  Push command (the pre-push gate takes 3–4 min and drops the SSH connection
  without keepalive):
  `GIT_SSH_COMMAND="ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30" git push origin main`
- Live (devilbox.uprough.net) is still `9a375ce7a` — none of this session is
  deployed. Owner: "we work on localhost so a live deploy is not urgent".
  Deploy only on request: `./scripts/deploy-manual.sh`.
- Dev stack: one `dev.sh` (Vite :5174, Express :3011, relay :4003). The relay
  was attached to `http://localhost:5174/` at the end (owner reloaded the
  local tab). DEViLBOX MCP server did not connect this session; drive the
  relay with `npx tsx tools/zz-relay.ts <method> '<json>'` (scratch,
  uncommitted, in the repo root). `load_file` needs `{filename, data(base64)}`;
  `evaluate_script` takes `{code}` as an EXPRESSION (no `return`, no
  top-level `await`; a promise expression is awaited).
- Uncommitted, not mine, leave alone: `src/generated/changelog.ts` (dev.sh),
  `tools/format-state.json` (owner's jukebox verdicts), `thoughts/lars/todos.md`,
  `third-party/*` submodule noise. Stashes 0–2 belong to other agents — never pop.
- Playback was stopped after the last measurement (`stop` → ok).

## Critical references

- Ledger: `thoughts/shared/plans/2026-10-02-format-breakage-todos.md`.
- Dub ledger (separate, 11 open): `thoughts/shared/plans/2026-10-02-remaining-dub-and-fx-issues.md`.
- Hippel grid ↔ file: `src/engine/hippel/hippelCellSpans.ts` (`HippelCellSpan`,
  `aux`, `patchEditedCells`, `hippelRowAt`), `src/engine/hippel/rebuildHippelModule.ts`,
  `src/lib/import/formats/JochenHippel7VParser.ts` (`decodeTFMX7VPattern`,
  `tfmx7VVoiceVolumeColumn`, `tfmx7VVoiceVolumeCommand`, `tfmx7VSpan`),
  `src/engine/uade/encoders/TFMX7VEncoder.ts`.
- Decoder: `tfmx-wasm/lib/libtfmxaudiodecoder/src/Jochen/` — `TFMX.cpp`
  (pattern/track step), `TFMX7V.cpp` (`TFMX_7V_trackTabCmd`: `0xFx` voice
  volume `v2==0 ? 100 : (16-v2)*6`, `0xDx` rate), `HippelDecoder.cpp:682`
  `getPlayPosition` (step relative to the subsong's first step; offset =
  file offset of the next pattern byte), `COSO.cpp:134` (rejects Atari ST).
- Headless TFMX worklet harness pattern: `src/engine/__tests__/hippelCoSoPlays.test.ts`
  (loads `public/tfmx/TFMX.worklet.js` with a fake `AudioWorkletProcessor`,
  `init`/`loadModule`/`modulePlay`, `process()` in 128-frame blocks; posted
  `modulePosition` messages carry `step`/`patternOffset`).
- Headless UADE: `tools/uade-audit/corpus-sweep.ts` (run with
  `npx tsx --tsconfig tsconfig.app.json … --only "name" --out <scratch> --fresh`),
  `tools/uade-audit/resetTrapRepro.ts` (loader copy with bundle/song path args;
  the basename is the player hint, so a copy named `hst.<name>` selects the
  Hippel ST player).
- Level meter: `src/engine/vj/AudioDataBus.ts` taps Tone's destination input
  (post limiter, post master volume), mono downmix; `getAudioLevel` in
  `src/bridge/handlers/writeHandlers.ts:1898`.
- Mixer mute path: `src/lib/mixer/engineMuteRegistry.ts`, `useMixerStore.ts`
  warm-up IIFE (`muteRegistryReady`, `muteMaskEngineNames()`).

## Learnings (keep)

- **Count engine starts before trusting a level.** `load_file` auto-plays;
  a following `play` starts the engine again. Two `[NativeEngineRouting]
  <key> loaded & playing` lines within seconds = doubled audio. Cost F3 a
  wrong row and a day of suspicion.
- **`transport.currentRow` never follows a WASM engine** — by design the
  canvas reads `useWasmPositionStore` directly. The ledger's old verify
  criterion `currentRow == enginePosition.row` was wrong for every native
  engine. Judge the grid from `enginePosition` or headless.
- **`evaluate_script` module imports are NOT the app's instances** —
  `import('/src/stores/useTransportStore.ts')` showed `isPlaying:false` while
  the song played, and a probe-created `TFMXEngine.getInstance()` was a second
  silent singleton (it also made the next engine start take the
  cross-context bridge). Measure through relay tools, or add a bridge tool
  (feedback rule: extend the MCP, don't hack around it).
- **Byte-exact says nothing about what the listener sees.** The 7V grid was
  1.0 in the ratchet and still read as "incorrect": a per-step attribute the
  grid did not draw. When a byte-exact format gets "Incorrect Pattern Data",
  diff the two songs' track-table bytes, not the pattern bytes.
- **Sibling parsers set the convention.** CoSo shows instruments 1-based;
  7V showed the raw sequence index. Check the sibling before trusting a
  parser's numbering.
- UADE player selection is by filename prefix/extension from
  `third-party/uade-3.05/eagleplayer.conf` (`.sog` → Amiga `JochenHippel`,
  `hst.` → `Jochen_Hippel_ST`).
- `git checkout -- <files>` + `git apply <patch>` is the way to prove a
  regression test fails on old code; never stash (other agents' stashes).

## Next steps (in order)

1. Push (if the commit with this handoff did not get pushed): see command above; confirm the `main -> main` line.
2. F17, F22, F18 as scoped above (each small, each with a test where a test can reach it; F18 needs the emcc rebuild).
3. F4 owner decision (a/b/c in the ledger row). Until then (c): a visible "no player for Atari ST TFMX" instead of silence.
4. F25 open halves: engines without a mute API (MaxTrax, Qsf, Pmdmini, Mdxmini, MusicLine) — decide per engine whether a mask can be added to the worklet; re-measure `get_channel_effect_slots` isolation for `fireworks ii.fred` at :5174, then trace `getActiveIsolationEngine`.
5. F6/F7 (stub grids and the 15 s scan cap) — design items, owner choice on (a) heuristic grid for stubs.
6. F8–F16 corpus/companion items (listing, companions, detectors), F20 ScriptProcessor count, F21 re-measure after a single start, F23/F24 tracker rows.
7. Dub ledger: L14 tab heights (owner todo), L2 honest move audit, L3–L9.

## Owner checks (not done by me — need ears/eyes at http://localhost:5174, hard reload first)

- `lethalxcess-intro.hip7`: row 0 of each step shows a volume value for voices with a `0xFx` command; voices drawn quiet (≤ `14`) are the ones barely heard. Re-judge the "Incorrect Pattern Data" verdict and re-date it in the tracker.
- `fireworks ii.fred`: solo isolates voices (F25).
- Jukebox ~50 songs: no "Soft reset threw", no freeze (F1).
- Dub fixes from 2026-10-02 by ear (bass, toggles +6 dB, Echo not stuck, knob/fader grab, Version Drop).
