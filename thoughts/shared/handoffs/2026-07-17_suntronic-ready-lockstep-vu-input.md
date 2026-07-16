---
date: 2026-07-17
topic: suntronic-ready-lockstep-and-vu-input
tags: [suntronic, native-engine, oracle, wav-lockstep, vu-meters, mixer, stereo-separation]
status: draft
---

# SunTronic native — `ready` lockstep + VU/scope input level

## Task(s)

Governing directive (still active, verbatim): **"dont ask about every single detail. you
know what the goal is. perfectly editable suntronic songs in devilbox. just go. finish it."**
Native SunTronic (`formatEngine.suntronic: 'native'`) is the shipping default and must NOT
be reverted (user rejected reverting, hard rule). UADE = offline oracle only.

Two NEW tasks opened this handoff, plus the just-finished work:

1. **CRITICAL — `ready` plays very wrong in DEViLBOX, perfect in UADE.**
   Path: `public/data/songs/SUNTronicTunes/ready` (9796 bytes, extensionless V1.3 module,
   routed by DELIRIUM header). "Most iconic SunTronic song by far, one of the most iconic
   chip songs ever — this is what everyone remembers SunTronic for." Must be perfect BOTH
   audibly AND in the pattern display. Ask from user: **render WAVs (native vs UADE oracle)
   and lockstep-diff them** to find where native diverges. Status: NOT STARTED.

2. **TODO — VU meters + channel visualizers get very LOW input.** Screenshot shows the 4
   SunTronic channel scopes (SunTronic 0..3) with barely-visible waveforms — the scope tap
   / meter feed is far below the audible signal level. Investigate why the scope Int16 the
   engine pushes is so quiet vs the actual mix. Status: NOT STARTED (likely relates to the
   Paula ±0.25 single-voice ceiling — per-voice scope taps are pre-mix so each voice caps at
   0.25, and the meter/visualizer may be reading those un-normalized).

3. **DONE this session (verified live + tests, NOT committed)** — the earlier
   mute/solo + VU + channel-visualizer + stereo-separation complaint. See below.

## Recent Changes (DONE, uncommitted)

All four facets of "i cant mute/solo suntronic songs and they have no vu meters or channel
visualizers and the devilbox stereo separation settings have no effect" — fixed + verified
LIVE in real Chrome + fails-on-revert regression tests in test:ci.

- **Mute/solo (#1):** `SunTronicNativeRender.ts` per-voice `vUserGain` + `setVoiceGain`;
  `SunTronicSongEngine.setChannelGain` forwards to renderer + persists; registered in
  `useMixerStore` `_gainEngineCache` (maxCh 4, like Cinter4). Live: mute mixer ch0 → L
  energy −67%, unmute recovers.
- **VU / channel visualizers (#3):** `SunTronicSongEngine.pushScope` → `useOscilloscopeStore`
  (`setChipInfo(4,0,['SunTronic 0..3'])`, `updateChannelData`, `clear()` on stop). Live:
  oscilloscope active, 4 channels, hasData=true. (NOTE: this is the SAME feed as new task #2
  — it works but input level is too low.)
- **Stereo separation (#4):** root cause = PT2 mode (default) only drove the post-mix
  `StereoSeparationNode` when `useLibopenmptPlayback`. Native pre-mixed engines
  (SunTronic/UADE/Hively) feed finished stereo into `separationNode.inputTone` and have NO
  per-channel Tone panners, so PT2 pan-scaling was a no-op → node stuck at identity(100).
  Fix: new pure `src/engine/stereoSeparationPolicy.ts` `resolvePt2NodeSeparation(sep,
  useLibopenmpt, nativeRoutedCount)` drives the node whenever `nativeRoutedCount > 0`. Both
  `setStereoSeparation` and `setStereoSeparationMode` PT2 branches use it. Live: sep0 →
  perfect mono (side=0), sep100 → full width (side=0.099). **Side benefit: this also fixes
  the separation slider for ALL native pre-mixed engines (UADE/Hively), not just SunTronic.**
- **Note display (0x94 legato):** prior fix, `SunTronicParser.ts` + `sunTronicLegatoDisplay.test.ts`, green.

Uncommitted files (add by name — NEVER `git add -A`):
```
src/engine/TrackerReplayer.ts
src/engine/suntronic/SunTronicNativeRender.ts
src/engine/suntronic/SunTronicSongEngine.ts
src/engine/suntronic/__tests__/sunTronicNativeRender.test.ts
src/engine/stereoSeparationPolicy.ts                        (new)
src/engine/__tests__/stereoSeparationPolicy.test.ts         (new)
src/lib/import/formats/SunTronicParser.ts
src/lib/import/formats/__tests__/sunTronicLegatoDisplay.test.ts   (new)
src/stores/useMixerStore.ts
```
Plus a large set of untracked `public/data/songs/SUNTronicTunes/**` corpus files (songs +
`instr/`), including `ready`. These are the actual play/edit corpus.

## Critical References

- `src/engine/suntronic/SunTronicNativeRender.ts` — byte-exact Paula render, MAIN thread.
  Paula stereo law: `left=(s0+s3)*0.5, right=(s1+s2)*0.5` (voices 0,3→L; 1,2→R).
  `paulaVoiceSample(byte,vol) = byte*vol/32768` → single-voice ceiling **0.25**. Per-voice
  scope buffers `ch[v]` are PRE-mix (this is the likely low-VU-input cause — task #2).
- `src/engine/suntronic/SunTronicSongEngine.ts` — standalone singleton; scope push +
  oscilloscope + setChannelGain. `setChipInfo`/`pushScope` are where VU input level is set.
- `src/engine/stereoSeparationPolicy.ts` + `src/engine/__tests__/stereoSeparationPolicy.test.ts`.
- `src/engine/replayer/NativeEngineRouting.ts` (~1156) — SunTronic `needsDirectRouting`
  connects `instance.output → separationInputTone`, `routedNativeEngines.add(...)`.
- Test corpus path GOTCHA: `sunTronicNativeRender.test.ts` reads
  `public/data/songs/formats/SUNTronicTunes` (`CORPUS` const line 32) but the live app corpus
  is `public/data/songs/SUNTronicTunes`. Confirm `ready` + its `instr/` samples exist under
  BOTH before writing a lockstep test (may need to copy or point at the right dir).
- UADE oracle harness: prior sessions used UADE offline render for byte/fidelity oracles
  (see `native-mix.ts`, `voiceFidelity` metric in memory `project_suntronic_gate2_two_clock`).
  The Gate-2 residual (accumulated Paula-DMA phase drift past the correlation window) is a
  KNOWN deferred cycle-accurate-scheduler gap — `ready` "very wrong" may be a NEW/different
  bug (parse, instrument mapping, effect) rather than that residual. Diff first, don't assume.

## Learnings

- Vite dev-server module duplication: `import('/src/engine/TrackerReplayer.ts')` in
  `evaluate_script` returns a SEPARATE empty singleton, NOT the app's `@engine/...` instance.
  To introspect/drive the REAL replayer: drive the actual settings UI (React native value
  setter + dispatch input/change) OR read console logs (e.g. `SunTronicSong output → stereo
  separation`). Do not measure the imported duplicate — it has no song.
- `get_audio_level` MCP taps the Tone masterMeter and is BLIND to the native `_nativeContext`
  (peakMax reads 0 while native audio plays). For native fidelity, render buffers directly /
  read energy from the render core, not the meter.
- MCP "No browser connected": relay (:4003) up but page WS down → reload page via
  chrome-devtools `navigate_page` to reconnect.

## Next Steps

1. **`ready` lockstep (task #1)** — Phase-1 research/measure FIRST (root-cause protocol, no
   guessing): (a) render native WAV via the SunTronic render core (`renderSunTronicMix` /
   `SunTronicNativeRenderer`) for `ready`; (b) render UADE oracle WAV; (c) lockstep-diff
   (per-sample or windowed `voiceFidelity`) to locate WHERE and per WHICH voice it diverges —
   and check the pattern display separately (note/effect decode) since user wants BOTH
   audio and pattern-display correct. Confirm `ready` parses (V1.3 DELIRIUM), which timbre
   types (0-6) + sampled voices it uses, and whether divergence is parse/instrument/effect
   vs the deferred Paula-DMA phase residual. Ship a fails-on-revert regression once root cause
   is found.
2. **VU/scope low input (task #2)** — inspect the scope Int16 scaling in
   `SunTronicSongEngine.pushScope` vs the audible mix; per-voice taps cap at Paula 0.25 so the
   visualizer likely needs the mixed/normalized signal or a gain-up on the tap. Fix at the
   right layer (don't just multiply blindly — verify what the meter expects).
3. **Commit** the finished mute/solo/VU/scope + stereo-separation + 0x94 work — ONLY when the
   user asks (standing rule: commit only on request). Files listed above, add by name.

## Other Notes

- Every bug fix ships a fails-on-revert regression test wired into `test:ci`
  (`src/engine/__tests__/` and `src/engine/suntronic/__tests__/` are whole-dir globs → auto
  included). `npm run type-check` (`tsc -b --force`) mandatory before done.
- MCP-first debugging in REAL Chrome, NEVER Playwright. Always `stop` (+ `release_all_notes`)
  when done testing.
- Do NOT revert native engine/default. UADE = oracle only.
