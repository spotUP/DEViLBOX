---
date: 2026-07-21
topic: fxchainplayer-parity, dj+app perf, offline-first, export fixes
tags: [handoff, dj, loudness, export, flac, ogg, perf, offline, camelot, key-detection, vitest, amigaklang]
status: final
---

# Handoff — FXChainPlayer parity + perf + offline + export fixes

Big multi-thread session. **Everything below is COMMITTED + PUSHED to `origin/main`**
(12 session commits, `ece43645f`..`826c97b21`, on top of `9b74b940b`). CI deploy of the
last push was in flight at handoff — confirm conclusion + live `version.json` buildHash
before assuming production is current.

## What triggered it
User dropped `FXChainPlayer-Releases-1.3.11/` (a competitor) and asked to analyse it and
match anything worth matching. It's **closed-source** (README + screenshots only), a
native C++/Qt player. Grounded audit (five parallel code investigations) →
**DEViLBOX already matches or beats it in every overlapping area**; real gaps were small.
Audit: `thoughts/shared/research/2026-07-21_fxchainplayer-competitive-audit.md`.

## Shipped this session (all pushed, most live-verified via MCP)

1. **Camelot wheel** (`ece43645f`) — `CamelotWheel.tsx` in DJ mixer + tested
   `buildCamelotWheel()` in `DJKeyUtils.ts`. Live-verified.
2. **Key-detector fix** (`188a887b2`) — essentia `KeyExtractor` was called with 11 of its
   15 embind args → threw → every key `Unknown` (BPM masked it). Now passes all 15;
   extracted to `src/workers/analyzeKey.ts` w/ arity regression test.
   **Live-verified: deck reads 5A.** This also un-deadened Auto-DJ harmonic mixing +
   playlist harmonic sort (they silently clashed on `Unknown` before). NOTE: analyses are
   cached — tracks analysed before this fix keep `Unknown` until re-analysed.
3. **Loudness meter** (`ba5c173b5`) — `loudnessMeter.ts` (BS.1770-4, exact tabulated 48k
   coeffs, M/S/I gating, LRA, 4x true-peak) + relay worklet + `loudnessSession.ts` tap +
   `LoudnessMeterPanel.tsx` + LUFS status-bar toggle. **Live-verified: −16.3 LUFS reading.**
4. **FLAC + OGG export** (`586a45fd5` + browser fix `3b6d1d68d`) — `audioEncoders.ts`
   (lazy libflacjs + wasm-media-encoders). libflacjs npm entry is a NODE factory
   (`__dirname`), crashes in browser → now loads the UMD wasm from `/flac/` (public asset,
   SW-cached). Round-trip tests: FLAC lossless, OGG structural.
5. **App-wide perf pass** (`3a5564f38`) — gated ~20 always-on rAF loops app-wide
   (visualizers, VJ renderers, PatternEditorCanvas, animation coordinator, DJ hooks,
   polls) on `document.hidden` + change/silence gates; selector quantization killed a
   20 Hz re-render storm. Rule: **skip only pixel-identical frames; animating visuals stay
   60 fps** (user requirement). **Live-verified idle DJ: p50/p95/p99 = 20/20.9/21 ms.**
   Plan + status: `thoughts/shared/research/2026-07-21_dj-view-cpu-optimization.md`.
6. **MCP relay flap fix** (`ffe3f4839`) — `ServerStatusBadges` health-probe opened a
   pathless :4003 WS every poll; the relay treats any pathless conn as THE browser and
   kicked the real MCPBridge → chronic "No browser connected". Probes now use `/probe`;
   relay closes it without claiming the slot. **This is why MCP finally stayed connected.**
7. **Offline-first** (`2e275229a`) — fonts self-hosted (`public/fonts/`, CDN removed),
   `useOnlineStatus` + `OfflineNotice`, gated Modland/HVSC/CSDb/YouTube panels, OFFLINE
   status-bar pill, SW caches visited songs/instruments, DJ-set streaming offline errors.
   Regression `src/__tests__/offlineReadiness.test.ts`.
8. **AmigaKlang** (`e9281c369`) — the "FXCP plays it, we don't" gap was ILLUSORY:
   AmigaKlang is a sample-precalc tool; tunes ship as plain ProTracker `.mod`s DEViLBOX
   already plays. Ingested 15 official example tunes to `public/data/songs/amigaklang/`.
   **Live-verified: amigahub plays.** No transpile/exe-runner. Detail:
   `memory/project_amigaklang_support_todo.md`.
9. **Silent-export fix** (`e5543a5fe`) — `captureLiveSong` fire-and-forget `play()`d then
   tapped immediately; native engines (libopenmpt sample mods) start async → whole capture
   could be silent (reproduced: a mod that plays fine exported at −inf dBFS). Now connects
   the tap first, then AWAITs `play()`. **NOT re-verified end-to-end in-app yet.**
10. **Vitest CPU caps** (`826c97b21`) — the machine "grind": vitest spawned a full-core
    process per worker (cap was 4). Now `maxWorkers: 2` locally (env `VITEST_MAX_WORKERS=4`
    in CI so deploy gate stays fast); `npm run dev` no longer runs the full test:ci glob
    before Vite; added `test:fast` (1 worker).

## Open / owed (start here)

- **CONFIRM DEPLOY**: `gh run list` + `curl -s https://devilbox.uprough.net/version.json`
  → buildHash should be `826c97b2`. (Prior push `11a28889` already confirmed live.)
- **Re-verify FLAC export end-to-end in-app** — encoder + capture-race both fixed + tested,
  but not eyeballed together. Load a song, export FLAC, confirm a non-silent `.flac`
  downloads and plays. (The earlier silent WAV was the capture race, now fixed.)
- **Offline walkthrough** — DevTools → Network → Offline, flip through all views. Human check.
- **Machine grind footnote**: the biggest CPU hog was NOT DEViLBOX — a Tauri dev build
  from `~/Code/Up_Rough_Demo_System/web/maker/src-tauri` at ~82%. User said it STAYS.

## Not pursued (explicit user decisions — do NOT resurrect)
- **FXCP live shader editor** — user declined twice. `memory/feedback_deselected_stays_deselected.md`.
- **DJ perf structural refactor** (playhead out of reactive store) — RESOLVED by selector
  quantization; no further work (documented in the perf research doc).

## Gotchas / learnings
- `test:ci` is an explicit FILE LIST in `package.json`, not a dir glob — new tests must be
  added by name (session added: DJKeyUtils, analyzeKey, loudnessMeter, offlineReadiness,
  audioEncoders.roundtrip). `src/__tests__/ci/**` is EXCLUDED (`vite.config.ts`), latent.
- MCP relay: needs Express server (`cd server && npm run dev`) for :4003; Vite alone is not
  enough. `npm run dev` = Vite ONLY now; use `dev:fullstack`/`./dev.sh` or start the server
  separately. After the /probe fix the browser bridge stays connected (no more flap).
- `dj_vj_action loadDeck` takes `{side, path}` (server base64s it). `export_wav` MCP tool
  is two-phase (captureId → poll) and shares the capture path — used it to prove the export
  path DOES produce audio (peak −7.7 dBFS) vs the dialog's silent race.
- Frame-stats recorder (`get_frame_stats`) needs the tab visible (rAF suspends when hidden).
- MEMORY.md was compacted this session (62 KB → ~8 KB); detail archived verbatim into
  `project_suntronic_sessions_log.md`, `project_uade_phase3_codec_log.md`,
  `project_maxtrax_sessions_log.md`.

## Key files added this session
- `src/components/dj/CamelotWheel.tsx`, `src/workers/analyzeKey.ts`,
  `src/lib/audio/loudnessMeter.ts` + `loudnessSession.ts`,
  `src/components/audio/LoudnessMeterPanel.tsx`, `public/loudness-relay.worklet.js`,
  `src/lib/export/audioEncoders.ts`, `public/flac/*`, `src/hooks/useOnlineStatus.ts`,
  `src/components/common/OfflineNotice.tsx`, `public/fonts/*`,
  `public/data/songs/amigaklang/*` (15 mods).
- Memory: `project_fxcp_session_fixes.md`, `project_amigaklang_support_todo.md`,
  `project_export_capture_silence_samplemods.md` (now fixed), `feedback_deselected_stays_deselected.md`.
