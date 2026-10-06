# Dub Bus test harness + dead-knob audit

Status: IN PROGRESS — branch `feature/dub-bus-move-inaudibility` (uncommitted)
Decided 2026-10-02 by Lars: **full Web Audio polyfill** (not the DI seam), and
**wire up** the 3 dead knobs rather than exempting them.

## Why

Every dub bug of 2026-09/10 was found by hand in a live browser via MCP, because
`DubBus` cannot be constructed in Node (Tone needs `instanceof AudioParam`).
Nine sessions of browser probing found: dead-return recovery, Liquid's phaser
branch silently disconnected by a `Tone.connect` cast, Sub Harmonic's band-limit
never connected, the Bed's setup line decaying its own gain to zero, and Liquid's
wet mix being re-muted by the settings mirror. A harness makes the sixth bug a
unit test instead of an afternoon.

## Phase A — Web Audio polyfill  [src/test/audio/] — PARTIAL, BLOCKED ON TONE

- [x] A1 `AudioParam` — value + scheduled-event history, all five write kinds.
- [x] A2 `AudioNode` — connect/disconnect recorded in BOTH directions, plus
      param and destination targets. Edge registry works.
- [x] A3 Node subclasses — delay, biquad, waveshaper, analyser, convolver,
      compressor, panner, buffer source, constant source, merger/splitter,
      worklet.
- [x] A4 `AudioBuffer`, `AudioContext`, `OfflineAudioContext`.
- [x] A5 `installAudioGlobals()`.
- [ ] A6 Tone accepts it — **BLOCKED, see below.**

### A6 finding — the polyfill premise is wrong (measured, 2026-10-02)

Tone does NOT use the browser's `AudioContext`. Tone 14.7.39 bundles its own
complete Web Audio implementation, `standardized-audio-context` 24.1.26, inside
`node_modules/tone/node_modules/`. So installing globals has no effect on it.

That package WRAPS a native context, it does not replace one — standalone it
throws `Missing the native AudioContext constructor.` Feeding it ours gets
further and then dies inside its own bundled, minified factory:

```
TypeError: Cannot read properties of null (reading 'hasOwnProperty')
  at channelInterpretation .../standardized-audio-context/helpers/overwrite-accessors.js
  at getNativeContext       .../factories/native-audio-destination-node.js:27
```

Shimming a minified vendor internal is exactly the band-aid the rules forbid,
and there is no supported hook for it. Options that remain are (1) mock the
`tone` module in tests, or (2) run these tests in a real browser via vitest
browser mode — which project rules rule out (Playwright/Chromium banned).

Tone surface the dub stack needs is small enough to mock: `Tone.Gain` (82),
`Tone.connect` (33), `Tone.getContext` (12), `Tone.disconnect` (6),
`Tone.Filter` (4), `Tone.Convolver` (1); `ToneAudioNode`/`InputNode`/`OutputNode`
are type-only.

CAVEAT if we mock: real Tone's `connect` extracts a native node from its target
and silently connects nothing when that fails — that is the bug class behind the
phaser's dead branch. A mock can assert wiring intent but cannot reproduce
Tone's native-extraction semantics exactly, so the phaser-branch regression must
keep its MCP/browser verification. Flagged, not solved.

## Phase B — harness factory

- [ ] B1 `createTestDubBus()` in `src/test/audio/dubBusHarness.ts` — real
      DubBus on the polyfill, real effects, no stubs.
- [ ] B2 Smoke test: it constructs and its graph reaches `master`.

## Phase C — tests

- [ ] C1 REGRESSION Liquid: a held `combSweep` keeps `sweepOutput.gain` at the
      move's value across any later `setSettings` write. Fails before the
      `heldMoveBlocksSettingsDrive` fix.
- [ ] C2 REGRESSION Bed: `startSubBassBed` output stays above zero after setup
      settles. Fails before the stray `setTargetAtTime(0)` removal.
- [ ] C3 REGRESSION phaser branch: phaser input reaches `sweepOutput`. Fails
      before the native-connect fix.
- [ ] C4 KNOB REACHABILITY: all 91 `DubBusSettings` knobs — set each to a
      non-default value, assert an AudioParam value or a graph edge changed.
      Anything that cannot move must carry a written exemption naming why.
- [ ] C5 The 3 dead knobs become reachable: `sidechainSource`,
      `sidechainChannelIndex`, `sirenFeedback`.

## Phase D — wire the 3 dead knobs

- [ ] D1 `sidechainSource: 'channel'` routes the detector at
      `sidechainChannelIndex` instead of the bus input.
- [ ] D2 `sirenFeedback` applies from settings (move value layered on top).
- [ ] D3 Remove the 2 UI knobs only if D1 proves impossible — it isn't.

## Phase E — verification

- [ ] E1 Every new test: revert the fix, confirm it FAILS, restore.
- [ ] E2 `npm run type-check`.
- [ ] E3 Affected suites only (per rule 6a — no full sweep).

## Knob audit — settled findings (2026-10-02)

91 knobs on `DubBusSettings`. Verified twice: read sites counted from the type,
then confirmed per-knob at the actual line (an earlier `rg` attempt was invalid —
`rg` is not installed on this machine and silently returned zero for everything).

- 82 applied inside `DubBus`.
- 7 applied by engine code: `deckTapAmount` (DubActions 365/376/386),
  `throwBeats` (DubActions 365), `throwQuantize` (DubActions 364/396/408/420),
  `filterDropHz` (DubActions 440/576), `echoSyncDivision` (DrumPadEngine 928),
  `pingPongSyncToBpm` (DrumPadEngine 933).
- 3 DEAD: `sidechainSource`, `sidechainChannelIndex` — appear in `DubBus.ts`
  only in a comment (line 1549); `sirenFeedback` — zero hits in `src/engine/`.
  NOTE: the `sidechainSource` hits in ChannelEffectsManager/MasterEffectsChain
  are a DIFFERENT field on effect config, not this one. Do not confuse them.

## Constraints

- Do not touch `main`; PR #79 stays separate and open.
- No emoji. Scratch in the session scratchpad, never `/tmp`.
- Run only affected suites.
## bbmp clean-room replayers (owner, 2026-10-05)

Source: /Users/spot/Downloads/bbmp-replayers.zip - ten replayers written clean-room by creep for the ByteBandit Music Player, GPL-3.0-or-later, free to use in DEViLBOX. Each folder has the C++ engine plus `clean-room/description.md`. Reference recordings (~10 GB) available on request. Floating-point ones (t0ast, berotracker, buz, jxs) are exact only without fast-math / FMA: build WASM with `-fno-fast-math -ffp-contract=off`.

- [ ] pmdc - PMD (NEC PC-98), 1,510 songs, register-exact vs PMDWin (ymfm). Compare with our current PMD path first.
- [ ] kdm - Ken's Digital Music (instruments in `waves.kwv`).
- [ ] jxs - JayTrax, bit-exact vs CrossX.
- [ ] buz - Buzzic 1 and 2, bit-exact.
- [ ] jo - Jesper Olsen game music, Paula-write exact; would replace UADE + WantedTeam.bin route.
- [ ] smx - SCC-Musixx (MSX), byte-exact (emu2212).
- [ ] synder - Synder SNG, sample-exact.
- [ ] t0ast - T0AST, bit-exact.
- [ ] berotracker - BeRoTracker, bit-exact.
- [ ] piece - P/ECE music driver, within 0.1-1 dB.
- [ ] axs - description and tables only; replayer not written.

Per format: native WASM engine + worklet (PiyoPiyo / TFM pattern), parser for an editable grid, corpus songs, reachability test through parseModuleToSong. Native engine over UADE per the owner's standing rule.
