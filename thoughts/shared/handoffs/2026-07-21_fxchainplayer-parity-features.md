---
date: 2026-07-21
topic: fxchainplayer-parity-features
tags: [competitive, loudness, camelot, export, flac, ogg, dj, handoff]
status: in-progress
---

# Handoff — FXChainPlayer parity features

## Context

User asked to analyse FXChainPlayer (a scary-similar new player) and implement what
it does better where it fits DEViLBOX. Turned out FXCP is **closed-source** (releases
repo = README + screenshots only) and a **different product** (native desktop
player/DJ w/ VST3 hosting). Grounded audit (verified against real code, five parallel
investigations): **DEViLBOX matches or beats FXCP in every overlapping category**; the
real on-mission gaps are small. Audit doc:
`thoughts/shared/research/2026-07-21_fxchainplayer-competitive-audit.md`.

User picked three to build: **loudness meter, Camelot wheel, FLAC/OGG export**.
Also flagged a 4th gap mid-session: **AmigaKlang playback**.

## Done + verified (this session)

### Camelot wheel — CODE COMPLETE, needs live visual verify
- `src/engine/dj/DJKeyUtils.ts` — added `buildCamelotWheel(focusKey, deckKeys)` pure
  model helper (reuses existing `keyCompatibility`/`camelotColor`). `DeckId` type export.
- `src/components/dj/CamelotWheel.tsx` — NEW. 24-segment SVG ring, both decks marked,
  harmonic highlighting by relation to focus key (Deck A else B), cross-deck A→B legend.
- `src/components/dj/DJMixer.tsx` — wired `<CamelotWheel/>` as Row 2.5 (under crossfader).
- `src/engine/dj/__tests__/DJKeyUtils.test.ts` — NEW, 9 tests, added to `test:ci`+`test:all`.
- **NOTE**: the Camelot *capability* was already shipped (`DeckTrackInfo.tsx` has the
  chip + MATCH/COMPAT/ENERGY↑↓/MOOD/CLASH hint + color). This adds only the visual wheel.
- OPEN: live visual check in real Chrome (no dev server this session).

### Loudness meter DSP core — COMPLIANT + TESTED, wiring pending
- `src/lib/audio/loudnessMeter.ts` — NEW. Full ITU-R BS.1770-4 / EBU R128:
  - `kWeightingBiquads(fs)` — analytic libebur128 derivation; reproduces the tabulated
    48 kHz coeffs EXACTLY and is correct at 44.1 kHz.
  - `LoudnessMeter` class — incremental: momentary (400 ms), short-term (3 s), gated
    integrated (−70 abs + −10 rel gate), LRA (EBU 3342, gated ST 10th–95th pct),
    true-peak (4× oversample). `snapshot()` returns all five.
  - `measureBufferLoudness(channels, fs)` — offline convenience (File-Info Analyze / tests).
- `src/lib/audio/__tests__/loudnessMeter.test.ts` — NEW, 9 tests incl. exact tabulated
  coeffs + analytic 1 kHz anchor + true-peak inter-sample + LRA. Added to `test:ci`.
- Left `previewGenerator.measureLUFS()` (crude 6 s preview approximation) untouched —
  noted in the file for later convergence onto this compliant core.

type-check clean; 18/18 new tests pass.

## Remaining work (needs the dev server up for MCP verify)

### 1. Loudness meter — worklet + panel (own PR)
- AudioWorklet processor: tap master output, feed contiguous 128-frame blocks into a
  `LoudnessMeter`, `postMessage` a `LoudnessSnapshot` ~10×/s. Investigate how DEViLBOX
  registers worklets + where the master node is (grep `audioWorklet.addModule`,
  `masterGain`/master bus in `useAudioStore`/engine).
- DOM panel: M / S / I LUFS bars, Integrated headline w/ −14 (streaming) + −23
  (broadcast) target ticks, LRA, True-Peak w/ −1 dBTP over-flag (red). "Measures only
  while open" — attach worklet on open, detach on close (cost-free when closed, per FXCP).
  Use `src/components/ui/` primitives + Tailwind token classes (NOT raw colors).
- Status-bar toggle to open it (find the transport/status-bar component).
- Verify vs behavior: play a track, confirm Integrated settles, True-Peak flags a hot
  master. MCP: `play` → `get_audio_level` cross-check → `stop`.

### 2. FLAC + OGG export (own PR) — USER APPROVED 2 encoder deps, lazy-loaded
- Add FLAC encoder (libflac.js/wasm) + OGG Vorbis encoder (wasm) to package.json.
- Export router: `src/lib/export/audioExport.ts` (see `encodeMP3`/`Mp3Encoder` at
  `audioExport.ts:8,302-324` for the pattern), `AudioExportPanel.tsx` (WAV/MP3 toggle at
  :214 → add FLAC + OGG), `exporters.ts`, `nativeExportRouter.ts`.
- **Lazy-import** the encoders inside the export function so main bundle is unaffected.
- FLAC 16/24-bit; OGG q3/q5/q7. Regression: encode→decode round-trip test (decoders
  ARE bundled: `@wasm-audio-decoders/flac`, `.../ogg-vorbis`) asserting sane RMS match.
  Add to `test:ci`.

### 3. AmigaKlang playback (research) — TODO, no build go-ahead
- Memory: `memory/project_amigaklang_support_todo.md`. Verified gap; on-mission.
  Route unknown (UADE eagleplayer coverage vs exe-tune 68k+Paula path). Get a sample first.

## Gotchas
- `test:ci` is an explicit FILE LIST in package.json, not a dir glob — new tests must be
  added by name or they never run (both new tests were added; loudness to `test:ci`,
  DJKeyUtils to `test:ci`+`test:all`).
- No dev server / no browser on :4003 this session → zero live MCP verification done.
- MEMORY.md is 62 KB (over its 24 KB read budget) — needs compaction (separate chore).
- Nothing committed. Three intended PRs: (a) Camelot wheel, (b) loudness meter,
  (c) FLAC/OGG export — keep them separate per house PR-sizing rule.

## Next steps (ordered)
1. Start dev server, live-verify the Camelot wheel renders in DJ mixer → commit PR (a).
2. Wire loudness worklet + panel + toggle, live-verify → commit PR (b).
3. `npm i` the two encoders, integrate + round-trip test, live-verify → commit PR (c).
4. AmigaKlang: get a sample, probe route (research phase).
