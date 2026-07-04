---
date: 2026-04-19
topic: WASMSingletonBase extraction + SidMon1 silence investigation
tags: [refactor, engine, wasm, sidmon1, handoff]
status: draft
---

# Session handoff — WASMSingletonBase migration + SidMon1 format gap

## Tasks (completed this session)

1. **Finished the post-gig dead-code backlog** (Items 2, 3, 4, 6 of
   `thoughts/shared/plans/2026-04-17-dead-code-cleanup-followups.md`). Item 1
   (WASMSingletonBase) was originally deferred, now done.
2. **Extracted `WASMSingletonBase`** and migrated **61 replayer/synth engines**
   onto it. ~1,450 LOC removed.
3. **Fixed the drumpad sample-load bugs** (drag-and-drop on pads, sample
   replaces synth config).
4. **Removed the SID playlist auto-repair** that was spamming console.
5. **Moved local API from :3001 → :3011** to stop colliding with
   `amiexpress-web`'s backend.
6. **Capped MCP bridge reconnect attempts** so the console doesn't fill with
   `WebSocket connection failed` lines when the relay is down.
7. **Investigated the SidMon1 "silent on `myfunnymazea.sid`" bug** —
   root-caused as a format-support gap (see next section), not a regression
   of my refactor.

## Tasks (incomplete — pick up here)

### 1. SidMon 1.0 sample-based variant is silent — not yet fixed

`myfunnymazea.sid` and probably other sample-based SidMon 1 files stay silent
because our WASM replayer only understands the **wavetable-based** variant.

**Proof** (my Node harness, committed at
`thoughts/shared/research/sm1-test.mjs`):

| File | load | 5s render peak | Waveform data |
|------|------|----------------|---------------|
| `myfunnymazea.sid`   | 1 (OK) | 0.0000 | 2 waveforms, ALL ZEROS |
| `Orpheus/defjam.sid` | 1 (OK) | 0.6445 | 7 waveforms, real data |
| `Daryl/newsontour.sid` | 1 (OK) | 0.9922 | 7 waveforms, real data |

So parse succeeds, `num_instruments=10`, `finished=0` for 5+ seconds — but
Paula channels stay at level 0 because every instrument's `waveform` index
points to empty wavetable entries.

**Why**: `myfunnymazea` has a SAMPLE TABLE that the replayer ignores. File layout:

```
file 0x0000..0x125c:  68k player code (magic "SID-MON BY R.v.VLIET" at 0x125c)
file 0x125c..0x129c:  44-byte offset table (position-44..position-1)
                      → points to tracks/instruments/waveforms/patterns below
file 0x12a4..        track data (136 × 6 bytes)
file 0x15b4..        instrument records (10 × 32 bytes) — ADSR + waveform index
file 0x16f4..        waveform data (2 × 32 bytes — BOTH ALL ZEROS)
file 0x1734..        pattern rows (917 × 5 bytes)
file 0x29ae..        pattern pointers (27 × 4 bytes)
file 0x29e2..0x2d28  SAMPLE TABLE ← the new thing (see below)
file 0x2d28..0xA036  raw PCM sample data
```

**Sample table** — 32 bytes per record:

```
offset 0    4 bytes    unknown u32 (sometimes looks like a length, sometimes 0)
offset 4    4 bytes    another u32
offset 8    4 bytes    reserved/zero
offset 12   4 bytes    cumulative sample-data end offset (grows monotonically)
offset 16   16 bytes   sample name (null-padded, e.g. "MUS1", "ARZTBASS",
                       "BREAKDRUM", "PECK", "DREAMBELLS", "HIHAT2", "GUITAR2",
                       "Crash2")
```

Layout of bytes 0-15 isn't fully decoded — only the cumulative offset at
bytes 12-15 is confirmed. Before touching C, find an authoritative reference.

**What does NOT match**: the file isn't SidMon 2.0 (documented in
`docs/formats/SidMon2.md` — uses 64-byte sample records with a completely
different size-prefixed header layout starting at file offset 0).

### 2. Four engines deliberately skipped in the migration (safe to defer)

These were skipped by the migration agent with clear architectural reasons
(see the plan-completion report in the session transcript). Worth revisiting
someday but nothing blocks them.

- `SymphonieEngine` — its `loadSong` does its own two-phase waits, doesn't
  fit `WASMSingletonBase.ready()` contract.
- `VocoderCore` — not a singleton; instantiated per `VocoderEngine` /
  `VocoderEffect`. Static WASM cache but no `static instance`/`getInstance()`.
- `DB303Synth`, `RdPianoSynth` — `implements DevilboxSynth` per-instance
  synths, each note/preset builds its own instance.
- `FurnaceDispatchEngine` — 2272 LOC, most complex engine in the project.
  Different lifecycle shape (external `init(context)`, its own ready-promise,
  no `output` field). Any base-class change to accommodate it would risk
  every other engine.

### 3. `FutureComposerEngine` 1.3 format support

Unrelated to this session but discovered while testing: `FutureComposerEngine`
(whole-song replayer, different from `FCEngine`) fails with
`fc_create failed (unsupported format)` on FC 1.3 `.smod` files. FC 1.4 works.
This is a pre-existing WASM-side limitation.

## Critical references

- **Base class**: `src/engine/wasm/WASMSingletonBase.ts` (190 LOC, stable).
- **61 migrated engines**: every `*Engine.ts` under `src/engine/` that matched
  `grep -l "private static wasmBinary"` — see the 12 migration commits
  between `9d8670001` and `85f024a3e` for the exact list.
- **SidMon1 WASM source**: `sidmon1-wasm/src/sidmon1/` — particularly
  `sidmon1.c:499 sm1r_load`, `sidmon1.c:724 sm1r_tick`,
  `sidmon1.c:259 voice_trigger`, `sidmon1.c:324 voice_tick`,
  `sidmon1_wrapper.c:28 player_load`, `sidmon1_wrapper.c:42 player_render`,
  `paula_soft.c` (channel mixer).
- **SidMon1 worklet** (fix landed): `public/sidmon1/SidMon1Replayer.worklet.js`
  — now surfaces `player_load` parse failures as errors instead of silent
  playback.
- **Format docs**: `docs/formats/SidMon1.md` (says "no PCM samples" — which
  doesn't cover the sample-based variant we found), `docs/formats/SidMon2.md`
  (different format; NOT what `myfunnymazea.sid` is).
- **Delirium reference source**:
  `docs/formats/Replayers/DeliPlayers/Delirium/SIDMon1.0.s` — the canonical
  68k assembly; likely has comments about sample-variant handling if we look.
- **Reference implementation the parser was written against**: FlodJS's
  S1Player.js by Christian Corti (Neoart Costa Rica).

## Recent changes (commits landed this session)

```
0a5350b7a fix(sidmon1): surface player_load parse failures instead of silent playback
85f024a3e refactor(engine): migrate UADE engine to WASMSingletonBase
331ad84dc refactor(engine): migrate SunVox engine to WASMSingletonBase
8344e219b refactor(engine): migrate MusicLine engine to WASMSingletonBase
678a5857d refactor(engine): migrate Hively and Geonkick engines
5d59d3cf3 refactor(engine): migrate Klystrack and PT2 engines
4d3b284b9 refactor(engine): migrate Sawteeth and PreTracker engines
c9ce04a15 refactor(engine): migrate 5 more replayer engines
f27cdafd0 refactor(engine): migrate 9 more replayer engines
90648cd80 refactor(engine): migrate 7 more replayer engines
17fccf8e6 refactor(engine): migrate 16 songEnd/oscData replayer engines
4c968bc9b refactor(engine): migrate 6 more engines
a56fb99d2 refactor(engine): migrate 9 replayer engines
990d011b7 refactor(engine): re-apply SidMon1Replayer migration
2ad191d28 revert(engine): back out SidMon1Replayer migration (later reverted again)
9d8670001 refactor(engine): extract WASMSingletonBase, migrate 6 reference engines
5c280a02a chore(dj): remove SID playlist auto-repair — was spamming console for days
9fe7ef6b0 fix(drumpad): loading a sample clears any prior synth config
f744ceae0 feat(drumpad): drag-and-drop audio files directly onto pads
1662c971d fix(engine): one friendly warn per broken instrument, not two stack-traces
60ed7d954 fix(mcp): cap bridge reconnect attempts at 5
ebf1bd7d8 chore(dev): default local API port 3001 → 3011
```

## Learnings & gotchas

- **Don't skip `npm run type-check` between engine migrations**. One engine
  mid-batch had a chained-HEAP transform the agent missed by default; only
  the type-check prevented a silent runtime regression.
- **`master` has a parallel dub-studio refactor going** by another agent.
  Don't revert `src/engine/dub/*`, `src/components/dj/*`, `src/types/dub.ts`,
  or `ChannelRoutedEffects.ts` — their errors are their problem.
- **SidMon1 silence was NOT the refactor's fault**. Confirmed by reverting
  to the pre-refactor file and reproducing identical silence.
  `docs/formats/SidMon1.md` explicitly says "no PCM samples" — but
  `myfunnymazea.sid` clearly has a sample table. The docs understate the
  variants.
- **Node harness beats browser testing for WASM bring-up**. Emscripten
  output has a Node.js env branch built in; skipped ~30 minutes of
  MCP-routing debug once I wrote
  `thoughts/shared/research/sm1-test.mjs`.
- **`.env` and `server/.env` are gitignored** — the port move at 3001→3011
  lives in those files locally. Only `dev.sh`, `dev-persistent.sh`,
  `CLAUDE.md` have the canonical value on main.

## Artifacts

- **Handoff (this file)**: `thoughts/shared/handoffs/2026-04-19_wasm-singleton-base-plus-sidmon1-silence.md`
- **Node test harnesses** (re-runnable, all under 50 LOC):
  - `thoughts/shared/research/sm1-test.mjs` — load a .sid, render 5s in
    0.5s chunks, print per-chunk peak + channel levels + finished state.
    Also does `note_on(inst=0)` to check if the engine can produce any
    audio at all.
  - `thoughts/shared/research/sm1-headers.mjs` — dump parsed offset table.
  - `thoughts/shared/research/sm1-tracks.mjs` — per-voice track lists.
  - `thoughts/shared/research/sm1-patptrs.mjs` — pattern pointers + first
    rows.
  - `thoughts/shared/research/sm1-waveforms.mjs` — decoded 32-byte
    waveforms per file.
  - `thoughts/shared/research/sm1-hexdump.mjs` — offset table + scan for
    wave-like regions elsewhere in the file.
- **Plan**: `thoughts/shared/plans/2026-04-17-dead-code-cleanup-followups.md`
  — all 6 items now complete or explicitly deferred.

## Next steps (ordered)

1. **Decide SidMon 1 sample-variant scope.** Two options:
   a. Find an authoritative reference for the sample extension first. Likely
      sources: the UADE player for SidMon 1
      (`third-party/uade-3.05/players/SidMon 1/` per the docs), the Delirium
      `SIDMon1.0.s` in `docs/formats/Replayers/DeliPlayers/Delirium/`, or
      FlodJS S1Player.js (not in-tree).
   b. Accept the limitation, add a user-visible warning when a SidMon 1 file
      with empty waveforms is loaded, and move on.
2. **If choosing (a)**: extend `sm1r_load` in
   `sidmon1-wasm/src/sidmon1/sidmon1.c` to parse the sample table at
   `position + ppEnd`, extend `SM1Instrument` to hold a sample pointer
   + length, extend `voice_trigger` / `voice_tick` to feed Paula with
   variable-length PCM rather than 32-byte waveforms. Then rebuild via
   `cd sidmon1-wasm/build && emmake make`. Verify with the Node harness
   before the browser.
3. **`FutureComposerEngine` FC 1.3 support** — separate investigation.
4. **Consider migrating the 4 deliberately-skipped engines**
   (SymphonieEngine, VocoderCore, DB303/RdPianoSynth, FurnaceDispatchEngine).
   None of them block anything. Not urgent.

## Other notes

- Dub-studio work by the parallel agent is ongoing. Don't touch dub files.
- `git status` will show submodule drift in `third-party/*` — normal, ignore.
- I did NOT test `FCEngine` (only powers instrument preview, no natural test
  hook) nor `FredEditorReplayerEngine` in this session. Both follow the
  same pattern as the ones confirmed working so they're likely fine, but
  flag if something surfaces.
- The user explicitly confirmed (on bare pre-refactor code) that SidMon 1
  is ALSO silent on `myfunnymazea.sid` — my refactor is innocent. Don't
  be tempted to re-revert SidMon1 migration when someone brings this up.
