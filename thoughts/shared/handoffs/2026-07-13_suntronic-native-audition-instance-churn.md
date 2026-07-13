---
date: 2026-07-13
topic: suntronic-native-audition-instance-churn
tags: [suntronic, uade, native-synth, audition, ToneEngine, instance-cache]
status: done
---

# SunTronic native audition — instance-churn root cause fixed + VERIFIED + committed

## UPDATE (2026-07-13, latest) — type-1 noise fixed + feedback mechanism nailed from disasm

- **Type-1 PRNG noise fixed + committed `3b3a2e95b`** (LOCAL, unpushed). CALC5/6
  middle-square had two transcription bugs: shift was `>>8` (must be `>>4`) and the
  word was written AFTER stepping (must write BEFORE → `out[0] == seed`). Recovered
  byte-exact from a real UADE chip-RAM noise buffer (mule.src, seed `0x6d77`) via
  the P5 oracle: `d0_next = ((d0*d0) >>> 4 & 0xffff) ^ 0xac91`. Regression
  `sunTronicNoiseOracle.test.ts` + golden `sunTronicNoiseOracle.golden.json`
  (feeds the known seed → exact 128B; fails-on-revert, confirmed). The per-tick
  seed CARRY stays unverified (workspace `rndnum` between ticks does not follow the
  stream) — but it only picks which noise instance plays, not the timbre, so it
  does NOT block audio correctness or the golden.

- **Authoritative feedback mechanism read from the disasm** (`docs/formats/Replayers/
  DeliPlayers/AndySilva/DP_Suntronic.s`, MEGAEFFECTS @594-763):
  - `A2 = LEA $00A6(A0)` = the voice's **play buffer** (voice+0xA6) — both the output
    destination AND the feedback source. Persists across ticks (not recomputed).
  - **Feedback latch = bit1 of voice+0x14.** type-1 (CALC2 `MOVEA.L A2,A3`) and
    type-else (CALC13 `MOVEA.L A2,A4`) switch their source from wave1 to the play
    buffer once bit1 is set — i.e. every tick AFTER the first. Tick 0 (unlatched)
    reads wave1; bit1 is set at CALC4/CALC15. This is the live-buffer feedback that
    native currently FAKES with a constant wave1 → matches only tick 0.
  - **type-3 (CALC10 resample) is NOT feedback** — reads only A3 (wave1). Earlier
    "types 3/4/5/6 feedback" note was WRONG; only type-1 + type-else feed back.
  - **Noise (CALC5) is source-independent** (uses RNDNUMBER) — noise fix stands.
  - **Morph (CALC1) direction CONFIRMED correct**: measured real `wave1`
    (record+0x1A = A3) = `0x7f…` = native's `wave1`; native `out=wave1+(wave2-wave1)*D1/128`
    matches disasm `A3+(A4-A3)*D1/128`. No morph bug (no type-0 song exists to
    oracle-check, so this measurement was the check).
  - Splice stays byte-exact-locked by the golden (real chip RAM is the arbiter;
    a CALC7 A3/A4 label ambiguity in the dump does NOT override 11/11 exact).

- **gliders.src measured: feedback types 4/5/6 (all renderSmooth) reproduce 0/340.**
  Confirms the wave1-approx is the last Gate-1 gap.

- **NEXT UNIT (Gate-1 close): implement play-buffer feedback.**
  1. Add a persistent `playBuffer: Int8Array` to `SunSynthVoiceState` (= voice+0xA6),
     initialised to wave1-length zeros; on note-start bit1 is clear so tick 0 reads
     wave1, then the tick's OUTPUT is copied into playBuffer and bit1 latched.
  2. type-1 CALC3 path: when latched, read source from playBuffer (not wave1).
  3. type-else CALC14 path: when latched, seed A4 reads (`out[i]`/`out[i-1]` initial
     D0/D1) from playBuffer; A3 stream stays wave1.
  4. **Prerequisite oracle work:** the current P5 oracle DEDUPS to a Set — cannot
     validate a t→t recurrence. Extend it to capture the ORDERED per-tick buffer
     sequence for ONE type-else voice on gliders (+ the arp D1[t] sequence), then
     assert `buffer[t] == CALC14(playbuf=buffer[t-1], wave1, D1[t])`. Build that
     ordered oracle FIRST (measure-first), then implement, then lock a golden.

- **p7 ordered oracle BUILT** (`tools/suntronic-re/p7-feedback-oracle.ts`) + two
  structural findings (NOT yet a working feedback port):
  1. **TRIPLE-BUFFERING.** Each channel's AUDxLC rotates through 3 chip-RAM
     addresses 0x80 (128B = one buffer) apart, e.g. gliders ch0 =
     {0x26fc4, 0x27044, 0x270c4}. MEGAEFFECTS writes voice+0xA6 (A2, fixed), then
     the play routine copies it into a 3-deep ring and re-points Paula so it never
     reads a half-written buffer. CONSEQUENCE: consecutive ticks land at DIFFERENT
     locs by design — any oracle that filters "consecutive same-loc" rejects every
     real feedback step (my first p7 pass did this → 0 runs). The rotating
     addresses ARE the ordered per-tick output sequence; capture is 1 tick / 882
     frames (clean 3-cycle rotation confirms exactly one replayer tick per chunk).
  2. **Steady-state convergence.** At a repeating loc the buffer content does NOT
     change (0/55 same-loc steps changed) → the feedback contracts to a FIXED
     POINT B where `B == CALC14(B, wave1, D1)`. A first-diff probe of
     `calc14(B, wave1, D1)` vs captured 128B buffers gave best ham=122/128 (no
     match) — BUT that probe filtered buffers by `Set(size)>3`, which catches the
     TYPE-1 NOISE buffers (gliders has 2 type-1 insts), not the smooth feedback
     outputs. Smooth type-else outputs are LOW-entropy/correlated.
  - **REFINED NEXT UNIT (crisp):**
    (a) In the oracle, isolate SMOOTH buffers by a small max-adjacent-delta filter
        (reject noise) before matching — that yields real type-else feedback buffers.
    (b) First-diff `calc14` (the faithful transcription in p7) against ONE such
        smooth fixed-point buffer. Prime suspects in the CALC14 math: the final
        `LSR.W #7` is LOGICAL (p7 tries both), the `MULU #-$4000` (0xC000) sign +
        SWAP high-word extraction for D3, and the initial `SUB.B`→`EXT.W` diff.
    (c) Once calc14 reproduces the fixed point, port it into `renderSmooth`
        (SunTronicSynthVoice.ts) with a persistent `playBuffer` in
        `SunSynthVoiceState` (= voice+0xA6, seeded from wave1 on note-start, bit1
        latch), do the same for the type-1 CALC3 feedback path, then lock a golden
        (ordered per-tick sequence) in test:ci. That CLOSES Gate 1.
  - Morph/splice/noise are DONE; feedback (type-1 CALC3 + type-else CALC14) is the
    only Gate-1 gap left.

## UPDATE (2026-07-13, later) — Phase 0 P5 oracle built, type-2 splice fixed

- Built `tools/suntronic-re/p5-wavebuffer-oracle.ts`: per-1-tick chunked render +
  drain Paula AUDxLC:LEN write-log + `read_memory` = ground-truth per-tick synth
  wave buffers (the voice rewrites the SAME chip buffer in place every tick, so
  snapshot per tick, not once). Diffs vs native `renderSynthTick`.
- Oracle caught an INVERTED type-2 (CALC7) splice. Native had head=wave2/tail=wave1;
  UADE proves head=wave1/tail=wave2 (non-DC unit fixture confirms tail=`wave2[D1..]`,
  phase-preserving). Fixed `SunTronicSynthVoice.ts` case 2 + its unit test → native
  reproduces all 11 of mule.src's type-2 buffers byte-exact (was 0).
- Regression: `src/engine/suntronic/__tests__/sunTronicWaveBufferOracle.test.ts`
  + committed golden `sunTronicWaveBufferOracle.golden.json` (wasm-free, fails-on-revert).
- Committed LOCAL (unpushed): `0492ee999`. type-check + test:ci green.
- Gate 1 PARTIAL: mule in-window only sounds type-2 (done) + type-1 (PRNG noise).
  NEXT UNITS: (a) type-1 — read UADE workspace `rndnum` via read_memory, seed native
  PRNG at a known tick, compare next buffer (PRNG-state alignment). (b) types 4/5 —
  not triggered in mule; need a song that exercises them (gliders has 4/5/6). (c) P6
  note-row timing (Gate 2). See `plans/2026-07-13-suntronic-phase0-oracle.md` P5 RESULT.

## RESOLUTION (2026-07-13, next session)

- Fix VERIFIED in real Chrome via MCP: audition of a SunTronicSynth instrument
  (held C4) reads `get_instrument_level` **0.2759 / active:true** (was 0/false
  pre-fix) — single voice through the wired chain, playhead does not advance.
  Whole-song `play` audible (rmsMax 0.13, not silent). No console errors.
- Regression added: `src/engine/__tests__/nativeAuditionSharedInstance.contract.test.ts`
  asserts the invariant `NATIVE_AUDITION_SYNTHS ⊆ isWASMSynth` (static source
  scan, in the `src/engine/__tests__/` test:ci glob dir). Confirmed
  fails-on-revert (removing `'SunTronicSynth'` → 1 failed).
- Committed LOCAL (unpushed, await push auth): `df911c3a4`.
- Type-check clean.
- **Next: Phase 4** (native SunTronic SONG playback from the grid, no UADE) and
  Phase 5 (authoring compiler), then replicate across the other 20 formats.

---


## Task

Standing `/loop`: **"keep going untill all formats are done"** — the compiled-68k-player
reverse-engineering campaign. SunTronic V1.3 is the pilot: build a REAL DEViLBOX audio
engine for one compiled-player UADE format and prove ONE format end-to-end (author new
song plays via extracted voices; audition a synth instrument plays ONLY that voice, not
the whole UADE module) before touching the other 20 formats.

Immediate sub-task this session: fix the SunTronic native audition voice that appeared
silent when auditioning a synth instrument.

## Root cause (FOUND — this is the payoff of the session)

`SunTronicSynth` was registered in the `getInstrument` **createInstrument switch**
(`ToneEngine.ts:2519`) but was **MISSING from the `isWASMSynth` shared-instance list**
(`ToneEngine.ts:~1738`). Consequences:

- `isSharedType` evaluated **false** for SunTronicSynth.
- So the instrument was keyed **per-channel** (`getInstrumentKey(id, channelIndex)`)
  instead of as a shared singleton (`getInstrumentKey(id, -1)`).
- The preview/audition path (`InstrumentList.startPreview` → `engine.getInstrument(inst.id, inst)`,
  no `channelIndex`) and the playback path (with a real `channelIndex`) therefore
  created **DIFFERENT instances** for the same instrument id.
- `buildInstrumentEffectChain` was wired to the FIRST instance's `output` (inst#1-5 in
  the probe logs); the preview churn then spawned a SECOND wave of fresh, **unwired**
  instances (inst#6-10, named "Synth 1".."Synth 5", ~160ms apart). Triggering an
  audition played an instance whose `output → chainGain` link was never built → the
  chain-output analyser (`get_instrument_level`) read `level:0, active:false` while a
  direct analyser tap on `this.output` read `0.30`. That contradiction was the smoking gun.

### The fix (APPLIED, uncommitted)

`ToneEngine.ts` — added `'SunTronicSynth'` to the `isWASMSynth` array (line ~1743,
alongside `'DavidWhittakerSynth'`). This makes it a **shared singleton per instrument id**
(exactly like Cinter4Synth's sibling native voices and every other WASM replayer voice):
one instance per id, chain built once, reused by both preview and playback. No more churn.

```
'OctaMEDSynth', 'DavidWhittakerSynth', 'SunTronicSynth',   // <- SunTronicSynth added
```

Type-check passes (`npm run type-check`, tsc -b --force, clean).

## Status: UNVERIFIED — the audible end-to-end test was NOT run after the fix

The fix is a confirmed root-cause one-liner, but it has NOT been verified in real Chrome
yet. **Do this first next session** (MCP + real Chrome, NEVER Playwright):
1. `npm run dev`, browser at localhost:5174, click once to unlock AudioContext.
2. `load_file` a SunTronic `.src` (fixtures: `public/data/songs/formats/SUNTronicTunes/`,
   e.g. `mule.src`).
3. `select_instrument` a synth instrument (synthType `SunTronicSynth`), `trigger_note {id, note:'C4', duration:1}`.
   - EXPECTED: hear ONLY that voice; `get_instrument_level(id)` now reads level>0 / active:true
     (was 0/false before the fix); playhead does NOT advance.
4. `play` → the whole UADE module plays accurately (song routes via `uadeEditableFileData`,
   grid notes suppressed by `_suppressNotes` at TrackerReplayer:2957).
5. `stop` (+ `release_all_notes`) when done — MANDATORY, don't leave playback hot.

### Measurement gotchas that wasted most of the session (don't repeat)

- `get_audio_level` taps the **master analyser** on `Tone.getDestination()` and is **BLIND
  to audition-while-stopped** for ALL instruments (proven: a normal Sampler triggered while
  stopped also reads rmsMax 0). Do NOT use it to judge a stopped audition. Use
  `get_instrument_level(id)` (per-instrument chain-output analyser) instead.
- `console.log` is INVISIBLE to `get_console_errors` (captures warn+error only). Use
  `console.warn` for probes.
- `output.numberOfOutputs` is a port count (always 1 for a GainNode), NOT a connection
  count — useless as a wiring signal.
- Mixer volumes are **dB**: 0 = unity/full, not silent. `set_master_volume` rejects >0.
- `trigger_note` needs `{id:<number>, note, duration}` — `select_instrument` first; there
  is no `instrument` param.
- Browser MCP WS drops intermittently; Express :4003 stays up (`lsof -nP -iTCP:4003 -sTCP:LISTEN`).
  Recover by retrying the same call.

## Critical references

- `src/engine/ToneEngine.ts:2519` — SunTronicSynth createInstrument case.
- `src/engine/ToneEngine.ts:~1738-1744` — `isWASMSynth` shared-instance list (THE FIX site).
- `src/engine/ToneEngine.ts:1717` `getInstrument` — cache keying: `isSharedType` → `getInstrumentKey(id,-1)`.
- `src/engine/ToneEngine.ts:1644` `getInstrumentOutputDestination` — native → `synthBus`, else `masterInput`.
- `src/engine/ToneEngine.ts:513` `connectNativeSynth` — native AudioNode → Tone chain bridge.
- `src/engine/tone/InstrumentEffectsChain.ts:45` `connectToDestWithFilter` — native branch: `output → channel filter → dest`.
- `src/engine/suntronic/SunTronicSynth.ts` — the voice (renderBuffer → looped buffer source → output GainNode). Monophonic Paula voice.
- `src/components/instruments/InstrumentList.tsx:162` `startPreview` → `engine.getInstrument(inst.id, inst)` (the preview path, no channelIndex — the churn trigger).
- `src/lib/import/parsers/withFallback.ts` — `NATIVE_AUDITION_SYNTHS = new Set(['SunTronicSynth'])` guard preserving native synthType through the UADE clobber.
- `src/lib/import/formats/__tests__/sunTronicHybridRouting.test.ts` — 2 passing tests (parser marks synth records + fallback keeps native synthType AND injects UADE). In test:ci glob.

## Recent changes (this session)

- FOUND the instance-churn root cause (per-channel keying due to missing shared-list entry).
- APPLIED fix: added `'SunTronicSynth'` to `isWASMSynth` in `ToneEngine.ts` (uncommitted).
- REVERTED all temp diagnostics from 3 files: `SunTronicSynth.ts` (instance counter, ctor
  probe, output-tap analyser, attack probe), `InstrumentEffectsChain.ts` (build probe +
  restored the native filter path that had been bypassed), `ToneEngine.ts`
  (`connectNativeSynth` logs + `getInstrumentOutputDestination` forced-masterInput probe).
  Tree is clean of probes (verified by grep).
- Type-check passes.

## Next steps (ordered)

1. **Verify the fix audibly** in real Chrome via MCP (steps above). If audition now plays
   the single voice and `get_instrument_level` reads >0 → root cause confirmed fixed.
2. **Add a fails-on-revert regression test** for the shared-instance keying: assert
   `getInstrument(id, cfg)` and `getInstrument(id, cfg, channelIndex)` return the SAME
   instance for `SunTronicSynth` (they diverged before the fix). Wire into the test:ci
   explicit file list. Temporarily revert the one-liner to confirm it fails.
3. **Commit** the fix + test once green (local; all SunTronic commits are unpushed —
   await user push auth). Suggested msg: `fix(suntronic): share one SunTronicSynth instance per id (audition churn)`.
4. Continue the loop: Phase 4 (native SunTronic SONG playback from the grid, no UADE) and
   Phase 5 (authoring compiler → new .src that plays). Then replicate the pilot pattern
   across the other 20 compiled-player formats.

## Other notes

- All SunTronic work (commits `5373b40d1`..`d31a0004a`, ~10 commits) is LOCAL/UNPUSHED.
  Do not push without user auth.
- Untracked `tools/suntronic-re/probe-*.ts` are earlier RE probes — harmless, leave or clean up.
- Campaign framing (user, verbatim): "could we disassemble the most feature complete/advanced
  song per format and make them editable so people can create new songs with these engines?"
  SunTronic is the proof-of-concept for that whole idea. Full engine, sunTronic only, prove
  end-to-end before the other 20.
