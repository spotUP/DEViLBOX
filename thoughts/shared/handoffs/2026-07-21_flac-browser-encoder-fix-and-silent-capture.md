---
date: 2026-07-21
topic: FLAC browser encoder fix, silent live-capture still open, Firefox AudioParam crash
tags: [handoff, flac, export, capture, firefox, tone, deploy]
status: final
---

# Handoff — FLAC encoder browser fix + open silent-capture + Firefox crash

Session halted mid-investigation on user request (machine load). All DEViLBOX
processes killed (dev servers, vite, tsc, esbuild, maschine-nihia daemons, MCP
server). Browser tab left on about:blank.

## State

- **Deploy CONFIRMED**: live buildHash `826c97b2` on devilbox.uprough.net
  (CI run 29868243009 success). Prior session's 12 commits all live.
- **UNCOMMITTED working-tree change**: `src/lib/export/audioEncoders.ts` —
  see below. Type-check PASSED (tsc -b --force, exit 0). Round-trip tests
  PASSED (4/4, `src/lib/export/__tests__/audioEncoders.roundtrip.test.ts`).
  NOT committed — commit message suggestion:
  `fix(export): FLAC encode broken in browser (CJS wrapper import)`.

## Fixed this session (uncommitted)

**FLAC export was STILL broken in-browser** despite prior fix `3b6d1d68d`.
That fix replaced the core lib load (window.Flac UMD from `/flac/`) but
`encodeFlac` still did `await import('libflacjs/lib/encoder')` — a UMD/CJS
wrapper whose `factory(require, exports)` pattern defeats Vite/esbuild CJS
interop → runtime `Error: Dynamic require of "./utils/data-utils" is not
supported`. Node/vitest fine (real require), browser dead — why round-trip
tests passed while in-app export failed.

Fix (right level): dropped the npm wrapper entirely; `encodeFlac` now drives
the low-level `Flac` stream API directly (create_libflac_encoder →
init_encoder_stream w/ write-callback chunks → FLAC__stream_encoder_process →
finish → merge → delete). One implementation, both envs. `FlacApi` interface
extended with the 5 low-level methods.

Verified: node round-trip 4/4 green; browser synthetic encode via
evaluate_script → `{ok:true, size:18927, magic:"fLaC"}`.

## OPEN — silent live-capture STILL reproduces (task 2, unresolved)

End-to-end in-app test: loaded `public/data/songs/amigaklang/JosSs-Cream.mod`
(ProTracker, editorMode classic, 31 instruments), ran
`exportLiveCaptureToFlac({durationSec:10})` in-page →
**valid FLAC (magic OK, 11.0 s decoded) but peak = −Infinity dBFS (silent)**.
So `e5543a5fe` (await play() before tap) did NOT fully fix the race.

Key evidence: after the export, `play` + `wait_for_audio` detected audio only
after **78.5 s** (rms 0.031). Audio onset lags play() by tens of seconds on a
fresh page load — likely sample decode / engine warmup for 31-instrument mod,
NOT the 50–300 ms the trimLeadingSilence comment assumes. During the whole
10 s capture window no audio had started yet.

Next steps:
1. Find what takes ~78 s after play() on fresh load (sample decoding?
   instrument creation? first-play silent bug — see memory
   `wasm_engine_audio_routing`). That is the root cause, not the tap order.
2. `captureLiveSong` must gate on ACTUAL audio flowing (e.g. analyser
   threshold like MCP `wait_for_audio` / the working `export_wav` MCP path)
   or on an engine-ready signal — not merely `await play()`.
3. Then re-verify: non-silent FLAC from the in-app dialog, real download.
4. NB: repro above was on a page whose modules were mid-HMR after the encoder
   edit; re-test on clean reload before deep-diving, but the 78 s onset was
   measured post-reload, so it looks real.

## OPEN — Firefox boot crash (task 4, user report, investigation started)

Report: devilbox.uprough.net in Firefox 152/Win64, boot-time critical error
`Error: param must be an AudioParam`, minified stack RWe/FWe/Bne/OWe in
`main-Cw3qoZuG.js` (an OLD build — asset now 404/fallback on server, cannot
symbolicate; report timestamp 05:38Z predates today's deploys).

Established: assertion is Tone.js `core/context/Param.js:26` — a Tone node
was handed a native param that fails standardized-audio-context's
`isAnyAudioParam`. Classic Firefox gap: params missing/non-native on some
nodes (e.g. `AudioListener.positionX` family unimplemented in Firefox).
Grepped src: no Panner3D/positionX usage found ("Listener" hits are event
listeners). Component stack = React render path → some component constructs
the offending Tone node at mount/boot.

Next steps:
1. Reproduce locally: Firefox.app IS installed. Start dev, open
   `http://localhost:5174` in Firefox, read the real (unminified) stack.
2. Suspects: Tone.Listener/3D path inside Tone itself, or a Tone wrapper
   around an AudioWorklet param (loudness relay worklet is new). Firefox
   AudioParam set on worklets differs.
3. Fix at root (feature-detect / correct node), add regression if testable.

## Task list at halt

- #1 deploy confirm — DONE (826c97b2 live)
- #2 FLAC end-to-end — encoder fixed (uncommitted); capture still silent, OPEN
- #3 offline walkthrough — NOT STARTED
- #4 Firefox AudioParam crash — investigation started, OPEN

## Gotchas learned

- FLAC round-trip test file: `src/lib/export/__tests__/audioEncoders.roundtrip.test.ts`
  (NOT `src/__tests__/export-roundtrip.test.ts` — that's HippelCoSo; it shows
  2 pre-existing 5 s-timeout failures under `VITEST_MAX_WORKERS=1`, likely
  env slowness, unrelated — recheck at normal worker count).
- `npm run dev` at repo root = Vite ONLY; Express+relay :4003/:3011 need
  `cd server && npm run dev` separately (was running this session, now killed).
- Chrome tab connects MCP bridge only after full app boot; `navigate_page`
  times out at 10–30 s but page loads fine — poll `document.readyState`.
- In-page module testing: `await import('/src/lib/export/audioExport.ts')`
  via evaluate_script works in dev and exercises exact dialog code paths.
- ~10 orphaned `tools/maschine-nihia` daemon instances were running (killed).
  They accumulate — likely respawned per dev-server start; possible
  machine-load contributor alongside vitest/tsc.
