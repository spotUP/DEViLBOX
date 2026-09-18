---
date: 2026-09-18
topic: Pattern-display root cause, dub cell-encoding chunk, Dub Studio Gates B+C, and an unresolved audio-death bug
tags: [tracker, dub, autodub, musical-clock, audio-debug, handoff]
status: final
---

# Session handoff — 2026-09-18

Twelve commits, all pushed to `main`, all through the full gate (type-check +
`test:ci` + `test:compliance`). Suite grew 4195 → 4315 tests.

Two threads ran through this session:

1. **Reported bugs**, chased to root cause (pattern display, Play Pattern loop,
   the JA trap, the "stuck firing" bass).
2. **The Dub Studio plan**, resumed: pre-work chunk F2 finished, Gates B and C
   closed. Ledger 1 → 17 of 36.

One thing is **NOT fixed and must not be reported as fixed**: audio dies
intermittently when pressing Echo. It is instrumented, not solved. See §5.

---

## 1. Commits, newest first

| Commit | What |
|---|---|
| `6baa5acc8` | Gate C: musical event stream + look-ahead (C1, C3) |
| `fa03f3e1d` | Gate C: `MusicalChannelProfile`, four orthogonal axes (C2) |
| `33a686886` | Gate B: `MusicalClock` (B1, T3) |
| `d25da796c` | Dub slot pair 41/42; every registry move cell-encodable (F2 chunk) |
| `19fe7ab54` | Dub slots 39/40 render as `Z` in cell + Find/Replace (F2c) |
| `aca82ce31` | Worklet diag timeout 300 → 1500 ms |
| `1c9f91eed` | Worklet self-report (`insertProbe.workletDiag`) |
| `f2faf029f` | Dry-path probe in `get_dub_bus_state` |
| `20771d1c5` | Throw/solo restore the tap to the fader, not a sampled transient |
| `57b540ee3` | Disabling the bus silences the post-master vinyl chain |
| `979a7e30a` | Play Pattern actually loops on libopenmpt formats |
| `49686b491` | Pattern editor showed pattern 0 for the whole song |

Working tree is clean apart from pre-existing noise: `.serena/project.yml`,
`src/generated/changelog.ts`, `src/generated/file-manifest.json`, untracked
`FXChainPlayer-Releases-1.3.11/` and `tools/tms5220-audit/`. None of it is mine.

---

## 2. Reported bugs — root causes

### 2.1 "Many notes dropped visually in the patterns" (`49686b491`)

**Not a renderer bug. The editor was rendering the wrong pattern.**

`usePatternPlayback.ts` truncated the replayer's song order to a 1-entry array
while Play Pattern looped. Engine-driven formats (libopenmpt, Hively/AHX, UADE,
AdPlug, Furnace) sequence themselves and keep reporting positions into the REAL
order, so `PlaybackCoordinator`'s `ctx.songPositions[position] ?? 0` missed and
the `?? 0` reported pattern 0 for every row. On a sparse intro pattern that
reads as "the pattern lost its notes" — and it is format-independent, which is
why it had been blamed on quirky UADE formats.

Measured, not guessed: `globalRow 704` = `position*64+row` → engine at position
11; `patternOrder[11] = 11`; `currentPatternIndex` stayed 0. Clearing
`isLooping` made it follow.

Fix: the order is never truncated (it is the single source of truth for
index → pattern); Play Pattern is a loop RANGE over it; the coordinator holds
the last resolved pattern and warns once instead of inventing pattern 0.

### 2.2 Play Pattern did not loop on engine-driven formats (`979a7e30a`)

Consequence of 2.1's fix: `setPatternLoop` only binds the TS scheduler.
`PlaybackContext.enforceLoop` now seeks the engine back and drops the
out-of-range update. Gated on `useLibopenmptPlayback` — **libopenmpt is the
only engine here with a seek API**; Hively/AHX, UADE, AdPlug and Furnace expose
none, so for them Play Pattern still roams the song. Deliberate: pinning the
display while audio moves on is the bug we just fixed.

Verified live on a module with a non-identity order (position 5 → pattern 9):
held across three pattern lengths, then song mode advanced correctly.

### 2.3 The JA trap (`57b540ee3`)

The vinyl chain is wired **post-master** (`this.master → vinylEffect →
vinylOutputNode`, `DubBus.ts:1650`) and the disable path never touched it — it
only closes input gain, zeroes echo/spring and drops return gain. So disabling
the bus to stop vinyl noise left it running, and the JA slider is
`disabled={!busEnabled}` — the one control that would turn it down greys out.
Now `_desiredVinylLevel` (what the user asked for) is separate from what is
applied; disabling silences without losing the setting.

### 2.4 "One of the bass effects is stuck firing" (`20771d1c5`)

Same bug class as `035b392cb`, which fixed only the whole-mix path. A channel
tap's gain carries the user's fader AND whatever transient a move applies. Both
`openChannelTap` (sampled at open) and `soloChannelTap` (snapshot) read that
node to learn the "baseline", so when AutoDub interleaved moves the sample was
another move's transient and release ramped the tap UP. It ratcheted toward
1.0; at full send the channel feeds the echo continuously and the bass never
stops. Evidence: the fire log had the tap at 0.149 before a throw whose fader
was 0.106, and 1.0 after release.

`ChannelTapBaselines` now holds the fader per channel, resolved **at release
time** so a fader moved during a hold is honoured.

---

## 3. Dub Studio plan — where it stands

**Authoritative plan:** `thoughts/shared/plans/2026-09-17-dub-studio-revised-ai-performer-plan.md`
(revision 2). `...-master-implementation-plan.md` is revision 1 and **stale**.

**Ledger (read this before trusting any summary, including this one):**
`thoughts/shared/plans/2026-09-17-dub-studio-progress.md` — **17 of 36**.

The ledger had drifted: it claimed 1 of 36 while F1/F1a/F1c had shipped the
night the plan was written. I reconciled it against the code. Verify before
trusting a count.

### Done this session

- **F2c** — `xmEffectToString` claimed 36-38 while slots 39/40 shipped, so
  moves 16-31 in a cell drew a wrong character in `EffectCell` and
  Find/Replace. Both grid renderers were already correct; that asymmetry is
  why it hid. Range now lives once in `moveTable` as
  `DUB_EFFECT_TYPE_MIN/MAX`.
- **F2 chunk** — slot pair 41/42 declared (indices 32-47); seven moves
  appended (`hpfRise`, `madProfPingPong`, `combSweep`, `versionDrop`,
  `skankEchoThrow`, `riddimSection`, `skankFloatThrow`) that were live in the
  router but had no table index; version 37 → 44. Two latent traps found while
  wiring: both renderer glyph arrays were `new Array(41)` (41/42 would land
  past the end), and `DubEffectScanner` had its own private ceiling — the
  reason a slot pair could be declared and produce cells that draw but never
  fire. F2b decided **against the item's own premise**: it assumed columns 3-8
  are never dispatched, but `TrackerReplayer` dispatches `effTyp2..effTyp8`, so
  the scanner now reads all eight.
- **Gate B (B1, T3)** — `src/lib/dub/musicalClock.ts`. `bar = floor(row/16)`
  was true only for 4/4 at speed 6; at speed 3 a bar is 32 rows, so row 16 (mid
  bar 0) was called bar 1 and every `bar % N` phrase rule drifted. Pure, no
  state: a view of transport by construction. Models `beatUnit` alongside
  `beatsPerBar` from the start (7/8 ≠ 7/4). Fractional grids deliberately NOT
  rounded (speed 5 = 4.8 rows/beat).
- **Gate C (C1, C2, C3)** — `musicalChannelProfile.ts` (four orthogonal axes,
  each with confidence AND source; user overrides authoritative; reuses the
  three existing classifiers rather than adding a fourth) and
  `musicalEvents.ts` (`ChannelEventSource` as the tracker/DJ unification point;
  look-ahead windows sized from the clock).

### Deliberately not done

- **DJ adapter for C1.** Needs deck beat-grid/stem access; belongs with that
  work. Interface is fixed and documented. Not stubbed — a stub would look
  finished.
- **F3** (persona evidence labels L1/L2/L3) — last pre-work item,
  documentation-only.

---

## 4. Learnings worth keeping

- **A test caught a real bug in my own C3 implementation.** I derived
  note-value windows from the beat length, which double-applied `beatUnit` and
  made `1/8` half an eighth in 6/8. Note values are absolute; only `beat`
  follows `beatUnit`.
- **Editing anything under `src/bridge/handlers/` forces a full page reload**
  (no HMR boundary). Never touch it mid-experiment — one such edit contaminated
  a measurement this session.
- **`fire_dub_move` without `channelId` is a no-op** for per-channel moves
  (`echoThrow` returns null). An early "single throw, no runaway" test of mine
  was void because of this.
- **MCP `hard_reload` has no user gesture**, so the engine comes up silent and
  AutoDub never fires. Live verification of anything audio needs the user to
  reload and click.
- **The machine was at load 40-116 all session** (two Chrome renderers at
  ~120% CPU each, not the DEViLBOX tab). `tsc` and `vitest` stalled repeatedly;
  one `SIDDubSynths` test failed at 5107 ms in a full run and passed in 99 ms
  alone. Check load before believing a timeout.
- **Always capture full push output.** A `git push | tail -4` threw away a
  gate-failure reason and cost a re-run.

---

## 5. NOT FIXED — audio dies intermittently on Echo

User: pressing Echo kills all audio; "it echoes out and never returns".
Transport keeps ticking. Reproduced twice via the real path
(`DubRouter.fire echoThrow`), then **five misses** under identical settings.
Not reproducible on demand. A fix here would be a guess, so I instrumented
instead.

**Ruled out by measurement, not reasoning** — during a kill every gain from the
module output to the destination read sane: insert envelope 1, M/S 0.625/0.375,
shelf 9 dB, convolver dry 1, tonearm/vinyl dry 1, bus input 1, return 0.9,
masterChannel 0 dB unmuted, `masterEffectsInput` 1, `blepInput` 1, libopenmpt
output gain 1, worklet present, isolation masks null. Also ruled out:
`dub_panic` while playing, a plain `set_cell` during playback, DJ decks (user
and measurement agree), and the dub bus self-oscillating (a clean page with the
bus enabled and nothing loaded is silent).

**The narrowing that matters:** `currentRow` kept advancing through both kills.
In libopenmpt mode the TS scheduler is skipped, so rows only come from the
worklet's own `pos` messages, and a paused worklet posts nothing. It was
rendering and posting while output was zero → **it rendered silence**. That
implicates the masks applied inside the module:
`effectiveMainMask = userMuteMask & ~isolatedBits`. Either being wrong mutes
every channel at the source, nothing downstream can undo it, and `play()`
resets both — which is exactly why only stop → play recovers.

**Prime suspect, unproven:** `useMixerStore.ts:241` `forwardReplayerMuteMask`
builds the mask as `isSoloing ? !ch.soloed : ch.muted`. If `isSoloing` is ever
true while nothing is soloed, the mask is 0 = total silence, and the probe
would still show every channel unmuted and unsoloed — which is what it showed.

**Instrumentation now live.** `get_dub_bus_state` returns `insertProbe`
(every dry-path gain) and `insertProbe.workletDiag` (the worklet's own state).

Healthy baseline, captured 2026-09-18 with a MOD playing at rms 0.13:

    hasModule true, hasExt true, paused false, channels 4,
    userMuteMask 65535 (0xFFFF), isolatedBits 0, effectiveMainMask 65535,
    activeIsolationSlots 0, activeDubSlots 0,
    lastRenderRms 0.147, renderCount rising, silentReason null

**Next time it dies, BEFORE stop/play, in this order:**

1. `get_dub_bus_state` → read `insertProbe.workletDiag`
2. `unmute_all_channels` — if audio returns, the mask is confirmed

How to read it:

- `silentReason: "module-rendered-silence"` + `effectiveMainMask: 0` → mask bug
  **confirmed**; fix the mask writer, not the audio graph.
- `silentReason: "paused"` or `"no-module"` → the hot-reload lifecycle, not masks.
- `lastRenderRms > 0` with a silent master → audio IS produced and swallowed
  between the worklet and `masterEffectsInput`; the stereo separation node is
  next.
- `workletDiag: null` → the worklet never answered: it is wedged.

Full investigation, including everything eliminated and two of my own
hypotheses that died to measurement:
`thoughts/spot/notes/2026-09-18_master-noise-floor-and-bus-runaway.md`

---

## 6. Critical references

| Path | Why |
|---|---|
| `thoughts/shared/plans/2026-09-17-dub-studio-progress.md` | The ledger. Re-read before trusting any count. |
| `thoughts/shared/plans/2026-09-17-dub-studio-revised-ai-performer-plan.md` | Authoritative plan (revision 2). |
| `thoughts/spot/notes/2026-09-18_master-noise-floor-and-bus-runaway.md` | Audio-death investigation (gitignored scratchpad). |
| `thoughts/spot/notes/2026-09-18_pattern-editor-wrong-pattern.md` | Pattern-display investigation (gitignored). |
| `src/lib/dub/musicalClock.ts` | Gate B. Pure; view of transport. |
| `src/lib/dub/musicalChannelProfile.ts` | Gate C2. Axes + confidence + source. |
| `src/lib/dub/musicalEvents.ts` | Gate C1/C3. `ChannelEventSource`, look-ahead. |
| `src/engine/dub/moveTable.ts` | Cell-encoding contract. **Append-only** — index is on-disk `.dbx`. |
| `src/engine/dub/DubEffectScanner.ts` | Scans all 8 effect columns; shares the display range. |
| `src/engine/PlaybackCoordinator.ts:~293` | `resolvePatternForPosition` — no more silent `?? 0`. |
| `src/lib/tracker/playbackOrder.ts` | Order is never truncated; loop is a range. |
| `src/lib/dub/channelTapBaseline.ts` | Fader per channel; the anti-ratchet. |
| `src/bridge/handlers/readHandlers.ts` | `getDubBusState` + `insertProbe`. Editing forces a full reload. |

---

## 7. Next steps, ordered

1. **Gate D — `PerformanceContext` (D1).** The performer's memory: clock,
   upcoming + recent events, channel profiles, arrangement state, recent moves,
   active gestures, wet/feedback energy, current intention, time since last
   action, phrase history. Gates E-L all read from it, and B/C supply most
   inputs, so it is largely assembly.
2. **Catch the audio death live** using §5. Highest user-facing value; needs
   the bug to occur.
3. **F3** — persona evidence labels (L1/L2/L3). Documentation-only, closes
   pre-work.
4. **Gate E** — intention layer + REST as an explicit multi-bar decision. The
   reviewer calls REST one of the highest-priority changes.

## 8. Unverified by a human

- The pattern-display fix (`49686b491`) — proven by MCP, never eyeballed.
  Load a MOD at `http://localhost:5174`, Play Pattern then Play Song: the grid
  must show the pattern you hear and the pos/pattern counters must count.
- The tap-ratchet fix (`20771d1c5`) under live AutoDub — needs a tab loaded
  after that commit, AutoDub on, then read the fire log: a `fire` entry at
  `activeHolds: 0` should show the tap at the fader, not a ratcheted value.

## 9. Other notes

- Deploy is automatic on push; verify via `version.json` buildHash, not a green
  workflow.
- Two logged-but-untracked issues: `DubEffectScanner`'s `try/catch` wraps the
  whole channel loop, so one throwing move aborts the rest of that row; and
  `transport.currentPatternIndex` is never written during playback (playback
  writes `useTrackerStore`), so MCP `get_playback_state` reports
  `currentPattern: 0` even when correct — cosmetic, untouched.
- The user's dub settings ended the session with the Perry preset:
  `returnGain 0.9`, `extFeedbackGain 0.035`, peaks 1.00-1.03 at master 0 dB.
