---
date: 2026-07-17
topic: suntronic-native-retrigger-fix-and-deferred-scheduler-port
tags: [suntronic, native-playback, paula, oracle, gate-e, retrigger]
status: implemented
---

# SunTronic native: retrigger fix DONE, phase-drift scheduler port OPEN

## Governing directive (still active)

> "dont ask about every single detail. you know what the goal is. perfectly
> editable suntronic songs in devilbox. just go. finish it."

**HARD RULE:** Native SunTronic (`formatEngine.suntronic: 'native'`) is the
shipping default and must NOT be reverted. UADE = offline oracle ONLY.

Commit ONLY when the user explicitly asks. Every bug fix ships a fails-on-revert
regression wired into `test:ci`. `npm run type-check` (`tsc -b --force`) mandatory.
MCP-first debugging in REAL Chrome (never Playwright). Always `stop` playback after
MCP tests.

## Task(s)

1. **DONE — `ready` note-on retrigger fix.** `ready`
   (`public/data/songs/SUNTronicTunes/ready`, 9796B extensionless V1.3 DELIRIUM,
   the most iconic SunTronic song, ALL-synth / zero sampled instruments) played
   wrong native: "no bass", "channel 2 flat", "notes don't decay". Root cause
   found + fixed + committed (`b7764cfc6`). Oracle-matched on all four voices.
2. **OPEN — Gate-E cycle-accurate Paula-DMA scheduler port.** Residual "not
   perfect but better" = sub-frame phase drift on the swept-timbre voices (2/3).
   Large separate effort. NOT started. Do NOT start unprompted.
3. **TODO (unstarted) — VU/scope low input.** VU meters + channel visualizers
   get very LOW input; per-voice scope taps are pre-mix and cap at the Paula
   single-voice ceiling 0.25.

## Recent changes (this session)

- **`src/engine/suntronic/SunTronicSynthVoice.ts`** — added
  `retriggerVoiceState(state)`: FULL in-place voice restart (clears `arpIndex`,
  `feedbackLatched`, `playBuffer`, `resonPhase`, `resonCnt`) = `createVoiceState()`
  in place. Big header comment records WHY full reset (oracle-verified) and warns
  against re-adding arpIndex-preservation without an oracle A/B.
- **`src/engine/suntronic/SunTronicPlayer.ts`** — `noteOn()` latches per-voice
  `retrig=true`; `snapshot()` surfaces `retrig` on each tick voice. Without it,
  same-instrument note repeats are invisible to the renderer (instrOff unchanged)
  and play on from the previous note's decayed tail → bass at 0.57x oracle RMS.
  Also added the dormant `opts.drin` hook (256-byte external arp table; zero-filled
  default; unused until the per-module arp/vibrato port lands — keep it).
- **`src/engine/suntronic/SunTronicNativeRender.ts`** — `deriveBucket()` resets
  the voice via `retriggerVoiceState()` on `retrig || instrOff change || slot
  change`. Comment corrected (previously stale: claimed it "keeps arpIndex").
- **`src/engine/suntronic/__tests__/sunTronicRetriggerArp.test.ts`** (NEW) —
  asserts full reset incl. `arpIndex===0` and `toEqual(createVoiceState())`.
  Fails-on-revert (removing `state.arpIndex = 0` fails 2 tests).
- **`package.json`** — wired the standing suntronic test set into `test:ci`
  (sunTronicSampled, sunTronicNativeRender, sunTronicLegatoDisplay,
  supportedByHeader, suntronicHeaderLoad) + the new retrigger regression.

Committed as `b7764cfc6` (pre-commit `test:ci` green). **NOT pushed.**

Unrelated pre-existing dirty files left untouched: `src/generated/changelog.ts`,
`src/lib/file/UnifiedFileLoader.ts` (session-start state, not ours).

## Learnings

- **Ground-truth oracle beats disasm inference.** Prior session theorized note-on
  PRESERVES arpIndex (from the existence of opcode 0x95 which clears $12). The
  UADE oracle (`tools/suntronic-re/voice-compare.ts`) disproved it: preserving
  arpIndex over-moved voice 0 (envelope variance 0.182 vs oracle 0.128),
  flattened voice 1 bass, ran voice 3 ~11% hot. FULL reset matches on every voice.
  Surfaced only by user ears ("channel 2 flat", "no bass"). Measure first.
- **Three configs characterized:** (A) no retrig reset = catastrophic level errors
  (bass 0.57x). (B) full reset = oracle-matched RMS 1.00-1.02, low-band 1.00-1.02,
  movement matched all voices — SHIPPED. (C) arpIndex-preserve = flat bass +
  over-moving v0.
- **Browser render == offline native, bit-identical** (`chunk-vs-single.ts`,
  maxDiff 0). The hybrid arch (main-thread `SunTronicPlayer` +
  `SunTronicNativeRenderer.renderInto` → 44100Hz chunks → `SunTronicResampler.worklet.js`
  ring buffer) faithfully plays the oracle-validated output. A browser-vs-native
  xcorr 0.1 alarm was capture-alignment noise, not a render bug.
- **Residual imperfection = PHASE DRIFT, not timbre.** Lag sweep on current
  full-reset code: voice 0 [640-lag]0.715/[20000]0.953; v1 0.815/0.891;
  v2 0.583/0.959; v3 0.587/0.966. Wide-lag 0.89-0.97 (content/spectrum matches)
  but tight-lag drops to 0.58 on v2/v3 (timing slides). Classic phase-drift
  signature: native steps on the 882.76-sample VBLANK grid; UADE resolves Paula
  DMA per-cycle. The swept-timbre voices accumulate sub-frame offset.

## Critical references

- Fix: `src/engine/suntronic/SunTronicSynthVoice.ts:77` (`retriggerVoiceState`);
  `SunTronicNativeRender.ts:~209` (deriveBucket reset); `SunTronicPlayer.ts` noteOn
  `retrig=true` + snapshot `retrig`.
- Test: `src/engine/suntronic/__tests__/sunTronicRetriggerArp.test.ts`.
- Oracle A/B tool: `tools/suntronic-re/voice-compare.ts` (per-voice
  RMS/low-band/movement native vs UADE — the decisive tool).
- Lag sweep: `tools/suntronic-re/ready-lagsweep.ts`. WAV render:
  `ready-full-mix.ts`. Envelope diff: `ready-envdiff.ts`. Score dump:
  `rdyinst.ts`. Chunk-equivalence proof: `chunk-vs-single.ts`.
- Tools need `TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/<x>.ts`
  for `@/` path aliases. Env: `SONG=ready SECS=14`.
- `ready` is ALL-synth (`synthInstruments`=10, `sampledInstruments`=[]); bass is
  synth voice 1.

## Next steps

1. **Decide on the Gate-E scheduler port** (the only remaining "not perfect" gap).
   This is a cycle-accurate Paula-DMA scheduler: replay the module on a per-cycle
   (or per-DMA-fetch) clock instead of the 882.76-sample VBLANK grid, so swept
   timbres on voices 2/3 stop accumulating sub-frame phase offset. This is a
   RESEARCH+PLAN effort (its own multi-session Gate), not a loop-tick patch —
   run the research phase first, do NOT start coding unprompted. Reference the
   existing Gate-2 double-position clock work (commit `c86b6fff5`) as the closest
   prior scheduler port; the same cycle-accurate machinery is what's deferred here.
2. **Task 3 — VU/scope low input.** Scope/meter taps are per-voice pre-mix (cap
   0.25). Feed them post-mix (or scale by the Paula stereo law L=(v0+v3)*0.5 /
   R=(v1+v2)*0.5) so meters read full-scale.
3. Push when the user authorizes (nothing pushed this session).

## Other notes

- `drin` in the suntronic engine is a REAL dormant feature hook (zero-filled arp
  note-transpose table), NOT junk scaffolding — leave it. It's the placeholder for
  the per-module arp/vibrato port; zero table = byte-exact row-0 semantics today.
- MCP browser had disconnected at session end; could not `stop` via MCP. If a
  `ready` playback is still hot in the browser, stop it there.
- Golden regression + 51 suntronic tests pass; type-check clean.
