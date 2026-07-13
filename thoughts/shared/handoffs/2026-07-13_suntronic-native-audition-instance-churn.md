---
date: 2026-07-13
topic: suntronic-native-audition-instance-churn
tags: [suntronic, uade, native-synth, audition, ToneEngine, instance-cache]
status: done
---

# SunTronic native audition — instance-churn root cause fixed + VERIFIED + committed

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
