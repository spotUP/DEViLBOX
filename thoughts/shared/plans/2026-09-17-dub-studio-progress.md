---
date: 2026-09-17
topic: Dub Studio implementation ledger
tags: [dub, ledger, progress]
status: active
plan: thoughts/shared/plans/2026-09-17-dub-studio-revised-ai-performer-plan.md
analysis: thoughts/shared/plans/2026-09-17-dub-studio-gap-reconciliation.md
---

# Dub Studio — execution ledger

Durable todo list. Survives compaction, crashes, `/clear`. **Re-read this before trusting
recollection or any earlier summary in a conversation.**

Running count: **54 of 58 done.**

**The denominator was wrong until 2026-09-18.** The header said "of 36" from the day this file
was written and was never updated as sub-items (F1a, F1c, F2a-F2e, T1-T3, the X series) were
added. Counted from the checkboxes: 17 ticked, 34 open, 51 total (X9 and X10 added 2026-09-18; X11 added later the same day, making 52). If you change the item list,
recount — do not trust this sentence either.

### Gate status

| Gate | State | Notes |
|---|---|---|
| A — baseline lock | **closed** | A1 |
| Pre-work — cell encoding + skank | **closed** | F1, F1a, F1c, F2, F2a-e, F3, T1, T2 |
| B — musical clock | **closed** | B1, T3 |
| C — event model | **closed** | C1, C2, C3. DJ adapter for C1 deliberately not written |
| D — performance context | **closed** | D1 |
| E — intention + REST | **closed** | E1, E2, E3 |
| F — gesture engine | **closed** | F4 |
| G — wet energy | **closed** | G1 |
| H-L — musical behaviour | **closed** | H1, I1, J1, K1-K4, L1, L2, AE1 |
| M-O — record, verify, release | M1, N1-N4, O1 done | O2 (human) |
| X — user-reported open threads | 21 of 35 | X1-X9, X11-X19, X21-X24, X26, X28, X33 closed. OPEN: X10 (clipping), X25 (levels), X27, X29-X32, X34, X35 — most logged 2026-09-21 |

### Debt carried, not hidden

- **T1 debt CLEARED 2026-09-18.** The skank reshape's regression test is written and verified
  to fail on the pre-fix shape. It went in late, which is the thing to avoid rather than repeat.
- **X2 debt CLEARED 2026-09-19.** The skank was shipped 2026-04 and tested by measurement
  only for five months; it has now been heard on "world class dub" and works. The lesson is
  the gap itself — a gesture can measure correct and stay unheard indefinitely.

**Reconciled against the code 2026-09-18** — the ledger had drifted: F1, F1a and F1c were
implemented the same night the plan was written but never ticked. Verify before trusting a count.

Legend: `[ ]` open · `[~]` in progress · `[x]` done+verified · `[?]` blocked

Authoritative plan: `2026-09-17-dub-studio-revised-ai-performer-plan.md` (revision 2).
It supersedes `2026-09-17-dub-studio-master-implementation-plan.md` (revision 1, stale baseline).

---

## Decisions already made (do not re-litigate)

**Baseline**
- Revision 1 of the reviewer's plan was anchored on `research/2026-04-20-tracker-dub-bus-world-class.md`,
  a stale planning doc I mistakenly shipped in the review bundle. Its G1–G16 list, 27-move count,
  `gatedFlanger` preset and A1/A2 phase labels are **historical**. Revision 2 discards them.
- Plan stages 1–5 of revision 1 (items 1–31) are verified shipped. Reconciliation §1 has the
  file-by-file evidence. Do not re-implement.

**Reviewer's musical rulings** (revision 2 §§2-9 + relayed follow-up 2026-09-17 — these are
answers, not open questions)
- **Skank timing:** `skankEchoThrow` = dotted **eighth** (1/8D, 0.75 beat). The 1.5-beat 3:2 float
  becomes a **separate first-class registry move, `skankFloatThrow`** — not a parameter. Reason:
  they are musically different gestures, and separate entries give independent weighting, performer
  selection, lane recording and MIDI/pad exposure. Full append-only treatment: registry, cell table,
  pad, key, MIDI, lane colour.
  Persona tendency (weighting, NOT capability — all five can reach both):
  Tubby dotted-eighth primarily, float rarely · Jammy dotted-eighth, float very rarely ·
  Scientist dotted-eighth, occasional float · Perry strong float access · Mad Professor strong
  float access.
- **Phrase length:** a `MusicalClock` setting, user/song-level, **default 16 bars**. Do NOT infer it
  from pattern length or the order list. A 64-row 4-bar pattern still sits inside a 16-bar default
  phrase (four pattern-lengths per phrase). Firing phrase-end gestures every 4 bars would be
  musically intrusive. The clock exposes structural signals separately — `patternStart`,
  `patternRepeat`, `patternChange`, `sectionChange`, `phraseBoundary` — for a later arrangement
  layer to interpret. Offer 4/8/12/16/24/32 as choices, arbitrary integers where natural.
- **Metre:** `beatsPerBar` is a song-level user setting, **default 4**. **No onset/accent
  inference, ever.** Derive rows/ticks from the real transport; beats-per-bar is metadata the user
  supplies. Critically: do not model metre as `beatsPerBar` alone — the clock needs a `beatUnit`
  too, because 7/8 and 7/4 share a numerator but are musically different. Full arbitrary-metre UI
  is not required in v1, but the architecture must not bake in 4 quarter-note beats per bar.
- **Wet cap:** one-wet-move-per-bar is too crude as the *final* model — replace with a wet-energy
  budget so compatible gestures (echo throw + small spring) can layer. Keep a **hard safety
  governor** that is independent of persona and never removed.
- **Taxonomy:** orthogonal axes, not a bigger enum — `instrumentFamily` / `musicalFunction` /
  `rhythmicRole` / `register` + `importance` / `density` / `audibility` / `repetition`. Classifier
  emits evidence + confidence, never an absolute role. User overrides stay authoritative.
- **Version drop:** not another role whitelist. Compute `arrangementImportance` -> `dropBehavior`
  in `keep | reduce | mute | throwThenMute | throwThenReduce`.
- **Tubby return EQ:** stays **manual-first**. Do NOT make it continuously sweep - that turns the
  most expressive dub gesture into wallpaper. It becomes an AI ACCENT gesture later (activate ->
  sweep -> release -> rest), never a standing preset character.
- **Spectral improv EQ:** demote to optional assistive utility, remove from the core musical brain.
  Distinction: *technical Auto EQ* vs *musical dub EQ gesture*.
- **Persona numbers:** keep them, but label evidence level - L1 documented fact / L2 strong
  technical inference / L3 creative parameterization. `+9 dB @ 60 Hz` is L3 product tuning and must
  never be presented as biography. Perry's 8-stage phaser is explicitly a product interpretation of
  the 6-stage Bi-Phase.
- **REST:** a genuine performer state and an *intention*, not a variant of `minBarsBetweenFires`.
  Model three separate things: `minimumFireGap`, `restProbability`, `restDurationRange`. While
  resting for N bars the performer does NOT reconsider firing every 250 ms.
  Initial tuning ranges (product parameters, not historical claims) - typical / extended:
  Perry 1-4 / 8 bars · Scientist 2-6 / 12 · Tubby 2-8 / 16 · Mad Professor 4-8 / 16 ·
  Jammy 4-12 / **32**. Perry absolutely rests - his identity is not "always doing something, but
  small"; it is high intervention *possibility* plus the capacity to suddenly leave space.

**Architecture constraints** (revision 2 §43)
- The AI is a decision layer **above** `DubRouter`. No AI bus, AI router, AI move registry, AI
  lane player. Never reimplement the 43 moves.
- `MusicalClock` is a **view of transport**, not a second transport authority.
- 250 ms decision tick stays for reasoning; timing belongs to the transport/audio scheduler.
- `characterPreset` (bus colour) and persona (behaviour) stay independent — any combination must
  be valid.
- `oscBass` / `crushBass` / `tubbyScream` stay manual-first. Any future AI access needs explicit
  risk permission + duration cap + gain ceiling + feedback ceiling + context gate.
- `DUB_MOVE_TABLE` is append-only — index is the on-disk `.dbx` contract.
- Do not replace one crude rule table with a larger random rule table.

---

## GATE A — BASELINE LOCK

- [x] **A1** Baseline verified: 43 moves, 5 personas, control/routing infrastructure audited
      file-by-file; April gap list excluded. Evidence: `2026-09-17-dub-studio-gap-reconciliation.md`.
      *(Closed 2026-09-17, pre-plan-revision — the audit is what surfaced the stale baseline.)*

## Pre-work — cell-encoding boundary + skank split

**Compatibility boundary established 2026-09-17** (reviewer asked for this before the gate closes).
The move-index ceiling is a *design* limit, not a storage limit: `eff` is one byte, the encoding
spends the high nibble on move index (4 bits = 16 moves) and the low nibble on target channel, so
each declared *pair* of effTyp values addresses 16 moves. Two pairs exist (36/37 base, 39/40
extended) = 32 addressable; `encodeDubEffect`'s `>= 32` guard means "out of declared pairs".
`EffectType` is a plain `number` and effTyp is stored numerically, so **no format version bump and
no new field are needed**. Effect-type space: 36-40 dub, 41-47 FREE (verified unused by grep),
48-63 (0x30-0x3F) OPL, 64-79 (0x40-0x4F) SunTronic, 96-98 (0x60-0x62) Sonix.

Paths that are index-agnostic and need NO change (verified): MIDI (string-keyed `dub.<moveId>`),
lane serialization (`DubEvent.moveId` is a string), undo/redo (whole-pattern snapshots),
copy/paste (`TrackerCell[]` whole objects), `.dbx` save/load (patterns serialized whole).

- [x] **F1** **Reshape `skankEchoThrow` from a hold into a capture.** *(Shipped: `kind:'trigger'`,
      capture window, feedback window == capture+tail, echo rate borrowed and restored rather than
      clobbered. Verified in `moves/skankEchoThrow.ts` 2026-09-18.)* Root cause of the user's
      "skanks don't echo like a dub record" report — confirmed at line level 2026-09-17. Four
      concrete defects vs. `echoThrow`, which already implements the correct gesture:
      1. **No auto-close.** `echoThrow` is `kind:'trigger'` and does
         `setTimeout(() => close(), holdMs)` — one capture window. `skankEchoThrow` is
         `kind:'hold'` with no timer, so the tap sits wide open for the whole hold. AutoDub fires
         it with `holdBars: 2` → **4 s at 120 BPM ≈ 8 offbeat stabs all thrown at once**, each
         spawning repeats, over the top of the dry. That is the wash.
      2. **Feedback window decoupled from the gesture.** `modulateFeedback(boost, 8000)` — a fixed
         8 s window regardless of hold length, so feedback stays elevated ~4 s *after* release and
         the next move inherits it. `echoThrow` passes `holdMs`, exactly matched.
      3. **Global side effect from a per-channel gesture.** It rewrites the bus-wide echo rate for
         the duration. Per the reviewer: delay *time* and throw *event* are separate concepts —
         `echoSyncDivision` owns what the delay is, `throwQuantize` owns when the throw fires.
      4. **Never reduces dry.** Optional (a console send is parallel; dry normally continues), but
         the brief dry duck is what makes a stab read as "gone into the echo".
      Target shape: trigger-kind, capture ~100-300 ms around ONE stab, feedback window == capture
      window, echo time from the move's own division (1/8D) without clobbering the bus setting,
      then release and let the tail decay through the existing feedback HPF/LPF (which already
      darkens each repeat — CHACK / chak / chuk / chk).
      **Fixable now, independent of the AI performer** — the primitive itself is mis-shaped, so the
      gesture is wrong under manual control too.
- [x] **F1a** `skankFloatThrow` = the 3:2 / 1.5-beat float, same capture shape, kept as a colour.
      *(Shipped: `moves/skankFloatThrow.ts`, registry entry, strip button. Verified 2026-09-18.)*
- [x] **F1c** Dry-duck composition: use the existing `DubMoveChain` (throw + brief `channelMute`)
      rather than building dry reduction into the move. No new mechanism.
- [x] **T1** Regression: `skankEchoThrow`'s principal repeat lands at beat+0.75, `skankFloatThrow`
      at beat+1.5. Must fail before the fix.
      `src/engine/dub/__tests__/skankThrowTiming.test.ts`, 10 tests. Written late, and the
      ledger carried the debt openly until now.
      **Verified in both directions**: reverting the move to its pre-fix shape (a `hold`,
      a fixed 8000 ms feedback window, no close timer) fails 3 of the 10; the fixed
      version passes all 10.
      It pins the SHAPE as well as the numbers, because the shape is what actually broke —
      the original bug was not a wrong constant but a tap left open for four seconds,
      throwing eight stabs at once over the dry channel. Rates are asserted against the
      TEMPO rather than in milliseconds, and the echo/float relationship allows a
      millisecond of independent rounding.
- [x] **F2** DONE 2026-09-18. Slot pair 41/42 declared, seven moves appended (indices 37-43),
      guard raised to `DUB_MAX_ENCODABLE_MOVES` (48), version 37 -> 44. Both grid renderers
      extended and their glyph arrays resized (they were `new Array(41)`, so 41/42 would have
      landed past the end). Original item text: Add slot pair 41/42 (`DUB_EFFECT_GLOBAL_X2` / `_PERCHANNEL_X2`); append `hpfRise`,
      `madProfPingPong`, `combSweep`, `versionDrop`, `skankEchoThrow`, `riddimSection`,
      `skankFloatThrow` to `DUB_MOVE_TABLE`; raise `encodeDubEffect`'s guard 32 -> 48; bump
      `DUB_MOVE_TABLE_VERSION`. **Append only, never reorder** — index is the on-disk contract.
- [x] **F2a** DONE 2026-09-18 — and removed as a separate limit: the scanner now sources the
      range from `isDubEffectTypeForDisplay`, so it cannot lag a slot declaration again.
      Original item text: Extend `DubEffectScanner` range (`DUB_EFFECT_MAX` 40 -> 42). **Independent limit —
      new slots do not fire until this changes.**
- [x] **F2b** DECIDED + DONE 2026-09-18: **scan all eight columns.** The premise in the item was
      wrong — `TrackerReplayer` DOES dispatch effTyp2..effTyp8 for ordinary effects, so a dub cell
      in column 3 rendered as Zxx, sat in a column the replayer honours, and silently never fired.
      Consistency with the replayer wins. Original item text: Scanner only reads `effTyp` and `effTyp2`, but `TrackerCell` carries `effTyp3`..
      `effTyp8`. A dub effect authored in columns 3-8 never fires. Decide: scan all 8, or document
      columns 1-2 as the supported surface.
- [x] **F2c** **Live display bug, pre-existing:** FIXED 2026-09-18. `xmEffectToString` covered
      36-38 while slots 39/40 already shipped, so moves 16-31 authored in a cell rendered a wrong
      character in `EffectCell` and in Find/Replace (both grid renderers were already correct —
      that asymmetry is what let it hide). Root fix: the range now lives in `moveTable` as
      `DUB_EFFECT_TYPE_MIN/MAX` + `isDubEffectTypeForDisplay()`, so it cannot drift per call site
      again. Regression `xmConversions.dubEffect.test.ts` includes a ratchet that walks the whole
      declared range, so the next slot pair is covered automatically; 3 of 8 assertions fail on
      the old literal. **Still open for F2:** the two grid renderers hardcode 36-40 in their own
      `EFFECT_CHARS` arrays and need 41/42 appended when the slot pair lands.
- [x] **F2d** DONE 2026-09-18 — documented in the manual's dub-slot section (correct behaviour,
      XM has no dub slot; save `.dbx` to keep moves). Original item text: `.xm` export silently drops every dub cell — `XMExporter` reads the legacy
      `cell.effect` string field, never `effTyp`. Correct behaviour (XM has no dub slot) but
      undocumented. Document it; do not "fix" it.
- [x] **F2e** DONE 2026-09-18 — slot table now lists 36-42 with the three pairs, the false
      "moves 16+ cannot be encoded" paragraph is replaced, and Prince Jammy is `jammy` not
      `gatedFlanger`. The 33/34/35 mention is kept: it is accurate history explaining the move.
      Original item text: Manual documentation is stale: `data/manualChapters.ts` still describes slots as
      33/34/35, claims moves 16+ "cannot be encoded", and lists Prince Jammy's voicing as
      `gatedFlanger`. Update to 36-42, 43+1 moves, `jammy`.
- [x] **T2** DONE 2026-09-18 — `dubMoveTableSlots.test.ts` (13) round-trips every move global and
      per-channel, freezes the 37-entry historical prefix, asserts no duplicates/collisions, and
      checks every display path covers the declared range; `dubEffectScannerColumns.test.ts` (8)
      drives the real scanner per column. 4 and 3 assertions respectively fail on the old code.
      Both wired into test:ci. Original item text: Round-trip every move: encode -> decode -> same moveId + channel; append-only ratchet
      (`DUB_MOVE_TABLE.length === DUB_MOVE_TABLE_VERSION`); and a save/load/replay regression
      covering all seven newly-encodable moves. **Gate M does not close until this passes.**
- [x] **F3** Label persona parameter values with evidence level (L1/L2/L3) in `types/dub.ts`
      comments and in `DUB_SYSTEM.md` §3.2. Documentation-only; no audio change.
      `DUB_SYSTEM.md` does not exist in this repo, and `docs/` is GITIGNORED — the manual
      is local-only. So the tracked home for this is `src/types/dub.ts` (committed) and
      this ledger; the manual chapter
      `docs/manual/src/part-9-advanced/66-dub-bus-auto-dub.md` also gained the section
      locally, but it will not travel with the repo.
      The point of the labels is practical rather than academic: an L3 number is free to be
      retuned by ear the moment it stops sounding right in THIS system, because it was
      chosen for this signal path; changing an L1 or L2 decision means the preset has
      stopped representing the engineer whose name is on it. Anyone tuning these should
      know which they are touching — which matters directly for the deferred level pass.
      Header comment on `DUB_CHARACTER_PRESETS` states the default (everything numeric is
      L3 unless said otherwise) and Tubby's entry is labelled line by line as the worked
      example.

## GATE B — MUSICAL CLOCK

- [x] **B1** DONE 2026-09-18. `src/lib/dub/musicalClock.ts` — pure, no state, no timing: the
      caller passes a row and the transport's ticks-per-row, so it is a view of transport by
      construction. Models `beatUnit` alongside `beatsPerBar` from the start (7/8 vs 7/4), and
      does NOT round fractional grids (speed 5 = 4.8 rows/beat) because rounding would place bar
      edges on rows the transport never lands on. Wired into `getAutoDubBarClock`, both the
      row-aligned and the wall-clock fallback path, so a bar means the same thing on both.
      Original item text: `MusicalClock` — `beatsPerBar`, `rowsPerBeat`, `phraseBars`, `currentBar`,
      `currentBeat`, position-within beat/bar/phrase, `nextBeat`/`nextBar`/`nextPhraseBoundary`.
      Defaults 4/4, 4 rows/beat, 16-bar phrase so current behaviour is bit-identical.
      Constraint: view of transport, never a second transport. Rows/beat is derivable as
      `24 / ticksPerRow` (speed 6 → 4 rows/beat → 16 rows/bar, today's hardcoded value).
      Replaces the `bar = floor(row/16)` hardcode in `AutoDub.getAutoDubBarClock()`.
- [x] **T3** DONE 2026-09-18 — `musicalClock.test.ts`, 21 assertions: speed 6 reproduces the old
      arithmetic for every probed row, speed 3 puts bar edges at row 32 (row 16 is mid-bar, which
      the hardcode called bar 1), 3/4 + 6/8 + 7/8-vs-7/4, phrase maths, boundary look-ahead,
      and a source contract that AutoDub actually calls the clock — 3 of those fail if the
      hardcode returns. Original item text: Speed-6 song produces identical bar edges to today; speed-3 song puts bar edges at
      row 32. Must fail before B1.

## GATE C — MUSICAL EVENT MODEL

- [x] **C1** DONE 2026-09-18. `src/lib/dub/musicalEvents.ts`. The unification point is
      `ChannelEventSource`, a data shape rather than a class hierarchy: a tracker pattern and a
      DJ deck's beat grid both produce it, so nothing downstream branches on context.
      `trackerEventSources()` is the tracker adapter (drops note-offs and empties, maps the XM
      volume column to strength, honours a rowOffset so look-ahead does not reset at a pattern
      boundary). **DJ adapter NOT written** — it needs deck beat-grid/stem access and belongs
      with that work; the interface it must satisfy is fixed and documented.
      Original item text: `MusicalEventProvider` — unified semantic event stream; tracker implementation
      (pattern look-ahead) + DJ implementation (beat grid / stems). Unifies semantic output, not
      data sources.
- [x] **C2** DONE 2026-09-18. `src/lib/dub/musicalChannelProfile.ts` — four orthogonal axes,
      each an `AxisEstimate` carrying confidence AND the source that decided it, so nothing is
      asserted as an absolute role. User overrides win outright at confidence 1 and are never
      blended. Consumes the three classifiers that already exist (`ChannelAnalysis`,
      `InstrumentClassification`, `RuntimeRoleHint`) rather than adding a fourth. Timbre-blind
      legacy roles ('lead'/'chord'/'skank') are capped at 0.4 family confidence — the classifier
      may be sure it is a lead without that being evidence it is a synth. Rhythm is classified
      against the grid MusicalClock supplies, which is placement, not metre inference.
      24 assertions. Original item text: `MusicalChannelProfile` — the orthogonal taxonomy above, with confidence. User
      override authoritative. Unblocks per-source mix hygiene (revision 1 DSP-09).
- [x] **C3** DONE 2026-09-18. `eventsInWindow` / `nextEvent` / `rowsUntilNextEvent` over
      1/16, 1/8, 1/4, beat, bar, phrase — window lengths come from MusicalClock, so look-ahead
      follows song speed and metre. Note-value windows are ABSOLUTE (an eighth is an eighth in
      any metre); only `beat` follows `beatUnit`. A test caught the first implementation
      double-applying the beat unit. Windows are half-open: an event exactly at `fromRow` is NOW,
      not upcoming, so adjacent windows tile without double-reporting. **Seek reset satisfied by
      statelessness** — no prediction state exists to go stale. Original item text: Look-ahead queries: what happens in the next 1/16, 1/8, 1/4, beat, bar, phrase.
      Seek must reset prediction state.

## GATE D — PERFORMANCE CONTEXT

- [x] **D1** `PerformanceContext` — clock, upcoming + recent events, channel profiles,
      arrangement state, recent moves, active gestures, wet/feedback/spectral energy, current
      intention + target, time since last action, phrase history. This is the performer's memory.
      `src/lib/dub/performanceContext.ts` (pure: `PerformanceMemory` + the frozen
      `buildPerformanceContext` snapshot) and `src/engine/dub/performanceMemoryBridge.ts`
      (the one place that knows the memory and the router share a program).
      **Memory listens to `DubRouter`, not to AutoDub** — the router is the single
      execution path, so the performer's memory includes the moves the USER just
      fired by hand. An AI-only log would have made it deaf to its own player.
      `spectralDensity` is `null`, not a plausible number: nothing measures it yet,
      and Gate G owns that accounting. Phrase history is fed only from the
      row-aligned clock; the pre-playback wall-clock path carries no phrase index,
      so feeding it would invent phrase turns. Wired live into `getAutoDubBarClock`
      and cleared in `stopAutoDub`. 25 tests in `test:ci`.

## GATE E — INTENTION + REST

- [x] **E1** Intention layer: `REST · ACCENT · ANSWER · SPACE · BUILD · DROP · TEXTURE ·
      TRANSITION · RESET`. Intention is chosen **before** the move.
      `src/lib/dub/intention.ts` (`IntentionPlanner`, pure) +
      `src/lib/dub/moveIntentions.ts` (what each MOVE can express — tagged per move,
      not per rule, since `echoThrow` means the same thing in all five of its rules).
      Wired into `tickImpl`: the planner decides, `chooseMove` filters rules by
      `moveServes(moveId, intention)`, and a named target channel is honoured when
      the rule's own role filter agrees. An absent intention leaves the pre-Gate-E
      behaviour intact, so existing tests still describe real behaviour.
      RESET is served by RELEASING held gestures, not by firing something at a mix
      that is already running away — no move claims it.
- [x] **E2** REST as an explicit multi-bar decision, not a failed dice roll. Reviewer calls this
      one of the highest-priority changes — dub depends on contrast.
      A REST is committed at a phrase edge, lasts `restBars`, and is honoured on every
      tick until its bar arrives; it is written to the fire log as `moveId: 'REST'` with
      its hold length, so silence appears in the log as a decision. The busy-phrase run
      comes from the Gate D phrase history, and a rest requires a whole phrase of playing
      since the last one. `if (rng() > rollProb) return null` no longer decides whether
      the performer plays.
- [x] **E3** Performance state machine `LISTEN → ANTICIPATE → PREPARE → ACT → RIDE → RELEASE →
      LISTEN` + `BUILD`/`DROP`/`RECOVER`. One machine shared by all personas.
      `src/lib/dub/performanceState.ts` — a pure reducer; nothing in it fires anything.
      BUILD and DROP are INTENTIONS (Gate E), not states: the plan listed them beside
      the state names, but what the performer wants and where it is inside a gesture
      are different questions, and merging them would give every intention its own
      state. RECOVER is a state, because it is a place the machine sits until the
      tail decays. Wired into `tickImpl`: ANTICIPATE/PREPARE wait for the target row
      instead of firing on whichever 250 ms tick first had an opinion (a tick is most
      of an eighth note at 140 BPM), and the machine owns the release that no timer
      covers — energy at the ceiling.
      `holdExpired` is deliberately false from AutoDub: its own per-hold timers already
      release at the intended length, and reporting expiry twice would release twice.
      A test caught the machine walking ACT → ACT — it fired, saw its own gesture in
      flight, and fired again. 16 tests in `test:ci`.

## GATE F — GESTURE ENGINE

- [x] **F4** `beginGesture` / `updateGesture` / `endGesture` / `cancelGesture` with attack, hold,
      release, ramp, sweep, rebound, quantized start + release. Transport stop cancels; seek
      cancels stale gestures. DubRouter stays the execution layer.
      `src/engine/dub/GestureEngine.ts`. Shipped: begin/update/end/cancel, quantized start
      AND release, `hold` and `rebound` shapes, cancel-all on transport stop, one-shot
      handling, and AutoDub migrated off its private disposer Set + timer Map onto it —
      there is now ONE notion of a held move, and the user's holds are as cancellable as
      the AI's. `DubRouter.fire` gained `preQuantized` so the engine's grid wait and the
      router's own cannot stack into a whole grid step of lateness.
      **`ramp` and `sweep` CLOSED 2026-09-18, commit `5c7eeff00`.** They were declared and
      deliberately left unimplemented rather than faked, because no move could take a
      parameter mid-flight. Now three pieces at the levels they belong to:
      `src/lib/dub/gestureShape.ts` (pure) holds the curve — a ramp travels once and stays,
      a sweep travels and comes back, triangular rather than sinusoidal because a hand on a
      knob moves evenly and stops at the turn, and frequencies interpolate in log space;
      `GestureEngine` drives it on a 25 ms timer rather than one scheduled AudioParam curve,
      because the hold can be extended or cut short at any moment; `moveAutomation.ts` says
      which moves have a parameter worth moving and between what values, so no caller
      invents a range.
      Two things the tests forced out, both real: the final value is **pinned on release,
      before the move is disposed** (ticks run every 25 ms, so the last one is up to a tick
      short of where the player aimed), and extending a hold **re-anchors instead of
      restarting** — the shape keeps the position it reached and spreads the remaining
      travel over the remaining time, so a sweep slows rather than jumping backwards. A
      CANCELLED gesture is not landed: cancel means abandon.
      `DubMoveHandle.update` is now a declared contract, `filterDrop` implements it against
      a new `DubBus.setLpfCutoffNow`, and AutoDub traces the shape whenever the chosen move
      has an entry and a hold to travel over. 62 tests across the three files; 6 of the
      engine's fail against the previous behaviour.
      `attack` remains out of scope by design — it belongs to the move's own envelope
      rather than to the scheduler.

## GATE G — WET ENERGY

- [x] **G1** Per-move metadata `wetCost` / `duration` / `feedbackCost` / `spectralDensity` /
      `lowFrequencyRisk`; runtime accounting with decay. Compatible gestures may layer; dense
      combinations restrained. **Hard safety governor retained, persona-independent.**
      `src/lib/dub/moveEnergy.ts` — costs for every move the router can fire (a test
      asserts none is missing), plus `EnergyLedger`: a held move contributes in full,
      a released one fades across its own `decaySec`, and `admits()` answers whether
      another move may layer, naming the axis that refused it.
      Decay is LINEAR on purpose: an exponential never reaches zero, so a session would
      accumulate a permanent floor of imaginary energy and the performer would grow
      quieter all evening.
      A move is judged only on the axes it contributes to — otherwise a mix already over
      budget would refuse `channelMute`, which is exactly backwards: when it is too loud,
      the silencing moves are the ones you want available. A test caught that.
      `duration` is modelled as the TAIL (`decaySec`), not the hold length: a throw is
      short to press and long to disappear, which is the asymmetry the old bar counter
      missed entirely. Wired into `tickImpl` and the rule filter; the `wet` flag and its
      one-fire-per-bar counter remain as the pre-Gate-G fallback for callers that supply
      no ledger. Personas scale the budget via `scaleBudget` (clamped 0.25-1.5x); the hard
      ceiling is not theirs to move. 19 tests in `test:ci`.

## GATE H–L — musical behaviour

- [x] **H1** Musical targeting from `MusicalChannelProfile` (Gate H).
      `src/lib/dub/musicalTargeting.ts` — `pickTarget(intention, profiles)` scores every
      channel for what the move is FOR, not for what the channel is called. ACCENT wants
      the backbeat; ANSWER wants a voice, because answering the kick is just more kick;
      SPACE wants the busy inessential part (low importance, high density); DROP takes the
      melody and REFUSES the foundation or anything in the sub register — a version
      without its bass is not a version; BUILD wants something sustained, since building
      on a one-shot hit gives the ear nothing to follow; TRANSITION marks the seam on the
      most important part. REST and RESET target nothing and return null.
      Returning `null` is a real answer: firing at a channel that does not suit the
      intention is worse than not firing.
      Profiles are now BUILT in the tick from real evidence (instrument name, the
      channel's own onset rows, the grid from the clock), cached by pattern + grid so the
      same answer is not re-derived four times a second, and passed into the Gate D
      context — which closes C2's loop into D. Confidence is respected throughout:
      `axisOr` falls back rather than guessing, so "probably percussion" never steers a
      move. 18 tests in `test:ci`.
- [x] **I1** Arrangement intelligence: `arrangementImportance` → `dropBehavior`; version drop
      protects foundation, supports throw-then-mute, arrangement-aware restoration (Gate I).
      `src/lib/dub/arrangementIntelligence.ts` (`planDrop`) + a rewritten `versionDrop`.
      Three audible faults in the old move, all from treating role as importance:
      a pad nobody could hear and the hook the tune rests on were dropped alike;
      everything left at once, making the drop a cut rather than a dub; and everything
      returned at once, which is the same fault in reverse.
      Now: the riddim is protected (foundation, sub register, bass, and a groove the
      arrangement leans on — a drop drops INTO the groove); audible parts get
      THROW-THEN-MUTE, into the echo first so the tail carries them out and the listener
      hears the part leave instead of vanishing; quiet parts simply go. The mix thins from
      the edges inward, and returns most-important-first so the riddim re-forms under the
      melody. A channel the USER had muted is theirs and never comes back on release.
      `planDrop` reports every channel including the protected ones, so "nothing to drop"
      is distinguishable from "everything is protected" — those want different behaviour.
      Profiles now live in `src/engine/dub/channelProfiles.ts`, shared by the performer's
      targeting and the moves: two copies of "what is this channel" would eventually
      disagree. 12 tests.
- [x] **J1** Consequence model: `targetAudibility` / `contrast` / `masking` / `wetEnergyChange` /
      `feedbackChange` / `structuralImpact` feeding the next decision (Gate J).
      `src/lib/dub/consequence.ts`. The performer had no idea whether anything it did
      worked: a throw at a channel that turned out to be silent, a drop that removed
      nothing because the part had already stopped, and a wash that buried the thing it
      meant to lift all looked identical to a success from the inside.
      Every field is MEASURED from a reading before and a reading after — per-channel
      levels from the engine's own meters for `targetAudibility`, whole-mix RMS for
      `contrast`, band growth without level growth for `masking`, the Gate G ledger for
      wet and feedback, audible channel count for `structuralImpact`. Nothing is inferred
      from the move's own metadata: that only says what it was SUPPOSED to do, which is
      the assumption this gate replaces.
      The after-reading waits 700 ms — an echo throw is not in the mix on the frame it
      fired, and measuring on the spot would report every move as inaudible.
      The feedback into selection is gentle and ASYMMETRIC: a no-op is pushed down hard
      (repeating one wastes a bar), a muddying move less (it did something, just not
      here), and success is NOT rewarded — rewarding it is how a rule engine ends up
      playing its favourite move for ever, and K4 already tells a motif from a rut.
      15 tests.
- [x] **K1** Personas as behavioural profiles — activity / depth / risk / restraint, anticipation,
      patience, target + intention preference, gesture length, release style, feedback/filter/drop
      appetite, timing variance, novelty vs repetition preference. Replaces the single overloaded
      `intensity` scalar (Gate K).
      `src/lib/dub/personaBehaviour.ts`. `intensity` set how often anything fired, how many
      moves a bar could hold, AND how bold they were, so turning Perry up made him more
      frequent and more extreme and less patient at once — and "restless but gentle" could
      not be said at all. Each axis now says one thing, and the file DERIVES the numbers the
      other gates already take (`intentionPolicyFor` → Gate E policy, `energyBudgetFor` →
      Gate G budget, `holdBarsFor`, `intentionAffinity`), so a persona stays one description
      instead of being re-stated per gate.
      Two rules held to: the feedback CEILING is only allowed to move in a narrow 0.8-0.9
      band whatever the appetite, because that is the safety edge and taste does not get a
      vote on runaway feedback; and intention preference is a multiplier, not a filter — a
      hard filter would leave four of five personas unable to use half the vocabulary.
      A test asserts no persona is high on everything, which is just the loud setting.
      Wired into the tick: policy applied on persona change, budget every tick. 17 tests.
      Still pending for full K1: `intensityDefault` and the per-move weight tables remain
      the firing-rate mechanism; migrating those onto `activity`/`novelty` is the rest.
- [x] **K2** Contextual variance replacing `rng() < variance * 0.1` — Perry surprises *because the
      musical situation allows it*.
      `src/lib/dub/contextualVariance.ts`. The old roll was flat, per rule, every tick, so
      Perry's unpredictability landed inside builds and on top of washes as readily as
      anywhere useful — and the only way to make him less annoying was to make him less
      surprising. The situation now gates it and the persona takes it: refused while a
      gesture is in flight (that is a mess, not a surprise), refused into a wet mix (it
      reads as noise), refused at a phrase seam (the arrangement is already saying
      something), refused too soon after the last move, with the settle time itself
      scaled by risk. Repetition RAISES the chance — the longer it has been doing the same
      thing, the more a departure is worth — bounded at 0.6.
      Computed once per tick rather than once per rule: whether the performer may depart
      is a question about the moment, not about which rule is being considered. Every
      refusal names itself for the fire log. 13 tests.
- [x] **K3** Call and response over musical time.
      `src/lib/dub/callResponse.ts` + an `ANSWER` branch in the planner. Gate E answered
      the PLAYER; this answers the MUSIC — a melodic phrase finishes, a gap opens behind
      it, and the engineer fills the gap. That is what makes a version sound like two
      musicians instead of a player and an effects unit.
      The GAP is the subject, not the phrase: a call is only a call once it has stopped,
      the window opens after the gap (answering into the decay is still talking over it),
      and it closes when the caller starts again — so the response never collides with the
      next phrase. A single hit is not a phrase, and a drum pattern is not a call awaiting
      an answer: only voices call, decided by profile with confidence respected.
      The response lands a third of the way into the window rather than at its opening.
      Answering the player still outranks answering the music, and safety outranks both.
      12 + 4 tests.
- [x] **K4** Repetition vs novelty: distinguish intentional repetition from algorithmic
      repetition.
      `src/lib/dub/repetition.ts`. Both look identical in a log — the same move, again —
      and musically they are opposites. An engineer who throws echo on bar 3 of every
      phrase is building a motif the listener starts to expect; a rule engine that throws
      echo six times running because the dice landed there is in a rut and the listener
      stops hearing it.
      What separates them is WHERE in the phrase the repeats land, not how many there are:
      a motif recurs at the same position about a phrase apart, a rut at scattered
      positions close together. Position spread is measured CIRCULARLY, so a motif sitting
      just before the phrase wrap is not read as two scattered clusters.
      The verdict feeds the weighted pick: a motif is raised, but only where it belongs —
      a motif repeated in the wrong place is just a rut with better manners — and a rut is
      pushed down, harder for a persona that values novelty, never to zero, because this
      is a nudge and not a ban. 16 tests.
- [x] **L1** Musical return quantization — `riddimSection`'s 60%-of-hold becomes next beat /
      eighth / bar / phrase boundary / next relevant event, chosen by intention (Gate L).
      `src/lib/dub/musicalReturn.ts`. 60% of four bars at 143 BPM is 4.03 s — the middle
      of a bar, wrong by an amount that changes with tempo. Returns now land on a
      boundary chosen from the intention: DROP and TRANSITION resolve on the phrase,
      BUILD and SPACE on the bar, ACCENT and ANSWER on the beat.
      Two details that matter: the boundary is STRICTLY after the current row, so a
      gesture fired on a downbeat does not "return" in the same instant it started; and
      a ceiling falls back to the largest seam that fits, because a drop that holds
      fifteen bars just because the phrase edge is that far away is not a musical
      decision either. `riddimSection` uses it for the skank return. 13 tests.
      Remaining for the item's full scope: "next relevant event" as a boundary — that
      wants the Gate C look-ahead threaded into the move, not just the grid.
- [x] **L2** Phrase intelligence: normalized `phrasePosition` from `MusicalClock`; persona arcs
      keep their shapes but stop depending on `bar % 16`.
      `getPhraseIntensityMult` now takes a 0..1 position. `bar % 16` was two assumptions
      in one — that a phrase is sixteen bars, and that a bar is what the transport's
      counter says — and neither holds at a user-set phrase length or outside 4/4. The
      five arc shapes are unchanged; only what feeds them moved. A value >= 1 is still
      accepted as a legacy bar index so an unmigrated caller degrades to the old
      behaviour instead of pinning the arc at its start. 4 tests.
- [x] **AE1** Split Auto EQ into technical-assistive vs musical-gesture; spectral driver leaves
      the core brain.
      `src/engine/dub/AutoEQDriver.ts`. Auto EQ was doing two unrelated jobs from inside
      AutoDub: a corrective curve plus a spectral/beat-sync improv loop (engineering — no
      opinion about bars or phrases, identical whichever persona is loaded), and `eqSweep`
      / `hpfRise` (moves the performer CHOOSES, with an intention, timed against the
      phrase). Only the second belongs to the brain.
      The split is structural: the driver owns its own timers, deltas, flat baseline and
      reset; AutoDub only starts it, stops it, and hands it the snapshot it already reads
      once per tick — reading the analysis twice would be two answers about one instant.
      Contract tests now assert the boundary in both directions: the brain must not own
      the driver's timers or band deltas, and the EQ GESTURES must stay in the brain.

## GATE M–O — record, verify, release

- [x] **M1** Performance recording with intention/target/gesture metadata, additive only —
      save/load compatibility preserved, replay reproduces the performance. Depends on F2.
      `src/lib/dub/performanceJournal.ts` + `performanceJournalBridge.ts`, exposed over MCP
      as `get_performance_journal` / `clear_performance_journal`.
      The recorder already captured WHAT was played (cells + automation curves); the
      journal captures WHY. "echoThrow ch1 at row 44" and "answering the horn phrase that
      ended at row 40, on the channel that made it" replay identically and mean different
      things, and only the second can be read back or argued with.
      Additive in BOTH directions, deliberately: the journal sits BESIDE the lanes, so a
      project saved without one loads exactly as before and one saved with it loads in a
      build that has never heard of it. It never affects replay — the lanes stay the source
      of truth, so a journal that drifts from an edited lane degrades into stale commentary
      rather than a performance that plays back wrong. A malformed journal parses to an
      empty one: commentary must never stop a song loading.
      It records from the ROUTER, so the user's moves and the AI's sit in one document in
      the order they happened, and only the AI's fires are annotated — a hand on a pad had
      an intention too, but not one this program should guess at. 14 tests.
      **Persistence landed** (schema 22 → 23): saved beside the project, restored through
      the forgiving parser, and only written when it has something in it — an empty
      journal in every project file is noise. `MIN_LOADABLE_SCHEMA` stays 21, because a
      purely additive field must never make an older project unloadable.
      **Replay-reproduces CLOSED 2026-09-18, commit `659f62851`.** `journalReplay.ts`
      compares what a replay fires against what the journal claims, and names the
      difference rather than returning a pass/fail: MISSING (described, not played),
      UNEXPLAINED (played, nothing says why), MISPLACED (right move, wrong row — a nudged
      lane). Row tolerance is half a row, because the journal records the row a move fired
      on live while the lane stores it quantized; entries pair with their NEAREST unclaimed
      fire so two throws on one channel in the same bar do not collapse into one.
      `firesFromLane` reads a lane WITHOUT firing it, so asking during a take makes no
      sound — and that shortcut is licensed by tests that drive the real `DubLanePlayer`
      over the same lanes and assert both produce the same list, out-of-order and disabled
      cases included. Exposed as `verify_performance_journal`.
      **Found while wiring it:** `get_performance_journal` and `clear_performance_journal`
      had handlers and bridge routes but were never declared by the MCP server, so neither
      was reachable from outside. Both are declared now. 22 tests.

      **TWO DEFECTS IN THE ABOVE, found an hour later by RUNNING the tools against a real
      session instead of trusting them** (commit `fb2f9e8a5`):
      (a) *The journal recorded nothing.* `getPerformanceJournalRecorder()` was called
      only inside `startAutoDub`, which made this module's own documented promise false —
      "the journal works when the performer is not running at all". With AutoDub off
      nothing subscribed to the router, so hand-played moves were never recorded; and
      READING the journal is what attached the listener, so it was always empty for fires
      that had already happened. Measured: two live fires, then `total: 0`. Now attached
      at the engine's dub bootstrap beside `setDubBusForRouter`, so the document exists
      whenever the router does, whatever view is open and whoever is playing.
      (b) *The verifier read the wrong storage.* It compared the journal against
      `pattern.dubLane.events` — LEGACY: `DubRecorder` stopped writing it and load
      migration moves any remaining events into automation curves and then CLEARS the
      lane. For every performance recorded since, the check found nothing and would have
      reported each entry as "missing", concluding the take does not reproduce. Exactly
      backwards. `firesFromCurves` now reads where a recording lives (upward 0.5 crossing
      = a fire, as `AutomationPlayer` does; channel from `channelIndex`, -1 = global; a
      hold counted once; `dub.channelSend` skipped because a ride is a movement, not a
      fire), and `firesForPattern` merges in legacy lane events for unmigrated projects.
      One existing contract assertion had pinned the WRONG behaviour and was corrected,
      not relaxed.
      **Lesson worth keeping: both were invisible to unit tests and obvious the moment
      the tool was actually called.**
- [x] **N1** Deterministic offline performance simulator (project, BPM, metre, phrase length,
      persona, seed, duration → bar-by-bar decision log). Primary tuning environment.
      `src/lib/dub/simulator.ts`, driving `src/lib/dub/performanceCycle.ts` — the decision
      chain extracted as a pure function that the LIVE TICK now calls too. That sharing is
      the whole point: a simulator with its own copy would tune a second performer that
      merely resembles the real one, and its results would look authoritative while being
      about something else.
      It does not simulate audio, so it answers questions about DECISIONS and cannot say
      whether the result sounds good — which is why O2 exists.
      **It paid for itself immediately, finding four real bugs in the live performer:**
      1. *The performer almost never acted.* 250 of 256 cycles sat in ANTICIPATE: the
         commit window was a quarter beat (1 row at speed 6) while each decision advances
         ~2.3 rows, so it stepped OVER its own target every time. The window is now at
         least as wide as the gap between decisions.
      2. *It answered itself.* `source: 'live'` meant live-not-lane, not user-not-AI, so
         the performer read its own fires as the player's and replied to them for ever.
         Fires now carry an ORIGIN (`user` / `ai` / `lane`); an unlabelled fire is a hand,
         and the AI declares itself.
      3. *SPACE made it busier.* `ghostReverb` (wet cost 0.75) and `sonarPing` were tagged
         as serving SPACE, so deciding to leave room made it fire something. Space is made
         by taking away, and most often by firing nothing.
      4. *Restraint was inverted.* Anticipation set the accent WINDOW, and a wider window
         always contains an upcoming onset — so the personas that look furthest ahead
         accented constantly. Jammy, the most restrained persona there is, accented 221
         times against Perry's none. How OFTEN it accents is now its own dial
         (`accentSpacingRows`, from activity and restraint); anticipation decides how
         EARLY it commits, which is what it always meant.
      12 tests. One assertion was REPLACED rather than tuned to pass: "a restrained
      persona fires fewer times" is not something the system guarantees (a fire count
      mixes accents with builds and transitions), so it now asserts what does hold — every
      persona leaves the music alone for more than half the run, and accents are spaced.
- [x] **N2** AI performance tests: REST, TARGET, PREDICTION, WET-ENERGY, CONSEQUENCE, DROP, SEEK,
      PERSONA.
      `src/lib/dub/__tests__/aiPerformance.test.ts` — 24 tests, one section per behaviour,
      each asserting something a LISTENER could notice rather than that a helper still
      exists. They run the real cycle through the N1 simulator.
      Found a semantic split while writing them: `EnergyState.feedback` is a 0..1 READING
      in the live system (from bus settings) but an unbounded COST SUM in the ledger, and
      both were being compared against the same safety ceiling — the exact drift the
      shared cycle exists to prevent. The simulator now hands the cycle a clamped reading
      and keeps the raw sums for the budget.
- [x] **N3** Musical regression scenes A–G (sparse roots riddim, dense digital dancehall,
      vocal+horn, four-channel tracker, long-form dub, unusual metre, sparse arrangement) with
      captured move count / rest duration / target distribution / wet-energy + feedback curves.
      `scenes.fixtures.ts` + `scenes.test.ts`, 41 tests. Each scene names what makes it
      awkward, and every persona runs every scene.
      They assert RANGES, not an exact decision log: a snapshot would fail on every tuning
      change and teach everyone to re-bless it without reading it, which is worse than no
      test at all. Wide enough to survive tuning, narrow enough to catch "it stopped
      resting" or "it fires on every tick now".
- [x] **N4** 30-minute deterministic run: no spam, no stuck gestures, no runaway feedback, no
      energy accumulation, no stale predictions, no performer-attributable memory growth, no
      transport drift.
      `soak.test.ts` — 1050 bars (half an hour of MUSIC, not half an hour of waiting),
      every persona, reproducible from a seed. Accumulation is checked by comparing the
      second half's mean wet energy against the first half's, which a peak alone cannot
      show.
      **It found the two biggest musical gaps in the performer:**
      1. *BUILD occupied half of everything.* The branch fired for the whole second half
         of every phrase, so the performer spent 3711 of 8400 cycles building. Building
         for eight bars is not tension, it is the new normal. Narrowed to the approach to
         the phrase edge (0.7-0.95).
      2. *It never dropped. At all.* Thirty minutes, zero DROPs — the planner had no
         branch that produced one, and once added, every drop decision landed in RIDE
         because a build was still held. A drop is precisely the moment you let go, so
         the machine now releases on a drop instead of riding through it, and the
         intention is COMMITTED until it is carried out or its window passes (the release
         takes a decision, and without the commitment the intention had moved on by the
         next one). 32 drops per half hour now, one per two phrases.
- [x] **O1** Performance monitor UI — persona / state / intention / target / phrase / wet energy /
      last move / next event + concise `WHY?` factors.
      `src/components/dub/PerformanceMonitor.tsx`, mounted in the Auto Dub panel where the
      performer is configured. Without it the only way to understand a decision is to read
      the fire log afterwards and guess, and "why did it go quiet there" is the question
      people actually ask.
      Two deliberate constraints. It reads ONE assembled snapshot per frame
      (`getPerformanceSnapshot()` in the engine) rather than polling five getters — five
      reads of a moving performer can show five different instants, which makes the
      monitor lie in exactly the situations it is needed for. And it is READ-ONLY: a
      monitor with controls becomes a second control surface that disagrees with the
      first. Both are asserted by contract tests, along with the design-token rule.
      Levels are drawn as bars rather than numbers, because the question is "is there room
      left", which a shape answers at a glance. 8 tests.
- [~] **O2 — one of the eight questions answered 2026-09-21: "does it arrive musically".**
      User, after the `dubGrid` speed fix, on "world class dub" at speed 12: "ok yes that
      has improved". Before it: "it didnt feel very nicely synced", "i disrupted the song
      more than add to it it felt off".
      Worth keeping for whoever tests this next: the fault only shows at a speed OTHER
      than 6. The grid assumed 4 rows per beat, which is exactly right at speed 6, so
      amanda.ahx and any other speed-6 tune sounded identical before and after. Testing
      the fix on the wrong song proves nothing.
      The remaining seven questions are still unanswered.

- [ ] **O2 (original entry)** Human listening review. **Never self-certify.** Ask: does it leave space, recognize
      the important event, arrive musically, know when to stop, create contrast, do drops feel
      intentional, does each intervention relate to the last, does it develop over phrases.

---

## Artifacts

- Authoritative plan: `thoughts/shared/plans/2026-09-17-dub-studio-revised-ai-performer-plan.md`
- Superseded revision 1: `thoughts/shared/plans/2026-09-17-dub-studio-master-implementation-plan.md`
- Phase-0 audit: `thoughts/shared/plans/2026-09-17-dub-studio-gap-reconciliation.md`
- System reference sent for review: `~/Desktop/devilbox-dub-system.zip` → `DUB_SYSTEM.md`
- Session handoff 2026-09-18: `thoughts/shared/handoffs/2026-09-18_pattern-display-dub-slots-and-gates-abc.md`

### Commits proving completed work

| Items | Commit | What |
|---|---|---|
| F1, F1a, F1c | `00bfd0a6b` | skank reshaped hold → capture; `skankFloatThrow` added (2026-09-17) |
| F2c | `19fe7ab54` | slots 39/40 render as `Z`; range moved into `moveTable` |
| F2, F2a, F2b, F2d, F2e, T2 | `d25da796c` | slot pair 41/42; seven moves appended; scanner reads all 8 columns |
| B1, T3 | `33a686886` | `MusicalClock`; `floor(row/16)` hardcode removed from AutoDub |
| C2 | `fa03f3e1d` | `MusicalChannelProfile` — axes + confidence + source |
| C1, C3 | `6baa5acc8` | `ChannelEventSource`, look-ahead windows from the clock |

Verified against the code 2026-09-18, not from memory: `skankEchoThrow` is
`kind:'trigger'`; `skankFloatThrow.ts` exists; `DUB_EFFECT_GLOBAL_X2 = 41` and
`DUB_MOVE_TABLE_VERSION = 44`; `DubEffectScanner` calls
`isDubEffectTypeForDisplay` and reads `cell.effTyp8`; `xmConversions` calls it too;
`musicalClock.ts` / `musicalChannelProfile.ts` / `musicalEvents.ts` exist and
`AutoDub` calls `computeMusicalPosition`.

---

## Session log — 2026-09-17 (dub bus runaway)

Six commits, none pushed. The skank fix is still **unheard**; the session was
consumed by a pre-existing feedback runaway that surfaced the moment the dub
bus was driven in anger.

### Shipped

| commit | what |
|---|---|
| `00bfd0a6b` | skankEchoThrow reshaped hold -> capture; skankFloatThrow added as a first-class move; persona weights per the reviewer's ruling |
| `63e6b3d97` | whole-mix tap no longer shadows per-channel dub sends (Hively IS isolation-capable; stale docstring said otherwise) |
| `eda2aed88` | hpfResonance mirror in the feedback path; dubPanic no longer zeroes the bass mirror; drainEchoContent wired to sends-hit-zero |
| `0666843d0` | feedback-ring gain stages + `window.__dubBus()` dev handle in the diagnostic snapshot |
| `873c72c77` | whole-mix tap SILENCED rather than frozen — fixes a regression in 63e6b3d97 |
| `16dcfe9ed` | **root cause**: external feedback loop retapped off the plate/fader + persona-independent limiter |

### Root cause (confirmed live, not inferred)

The external feedback loop was tapped at `return_`, placing the dattorro plate
("infinite" tail), ring mod, lo-fi AND the user's return fader inside a
feedback path. Loop gain = extFeedbackGain x chain gain; Perry is the only
preset with a non-zero loop (0.035) and the chain behind `return_` runs near
30, so it sat just over unity — a slow crawl, Perry-only, triggerable from the
master fader. Now taps `stereoMerge` (core wet chain only) behind a tanh
ceiling no setting can disable.

### Process lesson — the expensive one

Four commits landed on rings that were **not running**. The snapshot showed
`feedbackGain: 0` — the siren tap was idle the whole time. One of those commits
(`63e6b3d97`) actively made things worse by freezing the whole-mix tap open.

The house rule "measure before coding — one decisive measurement beats three
plausible patches" was skipped in favour of reading source and inferring. The
diagnostic that solved it (`window.__dubBus().getDiagnosticSnapshot()`) took
minutes to build and should have been step one. **Build the instrument before
the fix, for anything involving the audio graph.**

The two mirror fixes are real defects and worth keeping — they were just not
this bug.

### Still open from this session

- [x] **X1** AHX per-channel taps — FIXED + VERIFIED LIVE. `_activateDubChannel`
      bailed out on `hasWholeMixTap()`, which is effectively always true because
      a tap is registered unconditionally at DrumPadEngine construction. Any
      engine not ready on the first fader move gave up permanently; libopenmpt
      only escaped it by already being instantiated. Now gated on
      `hasUsableWholeMixFallback()` so single-output engines still stop retrying
      while capable ones retry. MCP verified: amanda.ahx
      `registeredChannelTaps` went `0` -> `[1]`, no console errors.
      **AHX was never short of capability** — 37 worklet outputs, implements
      IsolationCapableEngine — it simply never reached the code that uses them.

      Method note: this is the SECOND time a whole-mix change broke AHX. Both
      times the cause was identical — the whole-mix tap is both an audio path
      AND a flag other code reads, and I changed the audio side without
      grepping its consumers. `grep hasWholeMixTap` before the first edit would
      have caught both. Audit consumers before changing shared state.
- [x] **X2 — CLOSED 2026-09-19 by ear.** User, on "world class dub" with the skank
      thrown at Ch01: "the skank works". That is the only evidence that could ever have
      closed this. Every measurement below stops at "the wet return carries" — RMS
      0.050 to 0.083, peak 0.30, `registeredChannelTaps: [1]` — and none of it says the
      gesture SOUNDS like a skank. Shipped 2026-04 (`00bfd0a6b`), heard 2026-09-19.
      Worth keeping: the tune has no guitar or organ channel, so the target was the DRUM
      channel, where the offbeat actually lives. The obvious reading — find the chord
      channel — would have aimed it at silence.

- [x] **X2 (original entry)** The skank capture (`00bfd0a6b`) has never been heard. amanda.ahx
      cannot validate it — no per-channel isolation in practice (see X1), and
      AHX is monophonic per channel so the "skank" is a single-note stab.
      Needs a `classic` (MOD/XM/IT) reggae tune — the modland "jah cometh in
      dub" download is the intended vehicle.

      **Vehicle in place 2026-09-18, chosen by the user: "world class dub" by Skope**
      (`pub/modules/Protracker/Skope/world class dub.mod`, modland, rated 5/5). Saved to
      `public/data/songs/mod/`. 4 channels, 15 patterns, 125 BPM, D minor, a D–Csus2 dub
      vamp. Read from pattern 6:
      Ch00 = bassline (D/A/C walk, instruments 17-18); Ch01 = DRUMS, `D-3` on every even
      row with a different instrument per hit (classic MOD drum programming);
      Ch02 = effects only (`A01` volume slides, `EB2`), no notes; Ch03 = silent there.
      **There is no separate guitar/organ skank channel** — the offbeat lives inside the
      drum programming, so **Ch01 is the skank-throw target**, not a chord channel.
      Verified mechanically (NOT by ear): with the bus on and ch1 send at 0.4, a
      `skankEchoThrow` on channel 1 took programme RMS from 0.050 to 0.083 and peak to
      0.30, so the wet return carries. `registeredChannelTaps: [1]`.
      **Still open — it has to be HEARD.** Nothing above says it sounds like a skank.

      One tooling fault found while setting this up — **and two wrong diagnoses of it that
      are corrected here, because the commit message `f9b4ce234` carries both.**
      - **WRONG:** "`modlandApi.ts`'s `API_URL` falls back to the live host". It does have
        that fallback, but `.env` already sets `VITE_API_URL=http://localhost:3011/api`,
        so the browser was never affected. Not the cause.
      - **WRONG:** "`export_pattern_text` ignores its `pattern` argument". The tool
        declares `patternIndex`; the call passed `pattern`. Caller error, not a defect.
      - **ACTUAL CAUSE (verified):** `server/src/mcp/mcpServer.ts` computed
        `API_BASE` from `process.env.PORT || 3001`, but the MCP server is a SEPARATE
        process started with `cwd: server/`, where `dotenv/config` looks for `server/.env`
        and finds nothing. `.env` (repo root) sets `PORT=3011`; the API listens there;
        the MCP process fell back to 3001, where an unrelated service is listening — which
        is why it answered with a valid 404 rather than a connection error, and why the
        failure read as "modland is broken" instead of "we asked the wrong door".
        Fixed in X8 by loading the repo-root `.env` from `__dirname`, before `API_BASE` is
        computed.
- [x] **X5** **Dub-send fader moves are not recorded.** Reported 2026-09-17.
      Discrete moves record fine; a continuous fader ride captures nothing.
      Verified: `DubRecorder` subscribes ONLY to `subscribeDubRouter` /
      `subscribeDubRelease` (discrete fires -> `dub.<moveId>` step curves);
      `useMixerStore` contains no automation references at all, so
      `setChannelDubSend` writes audio + zustand state and stops there; and
      `dub.channelSend.ch<N>` is not a routable or automatable parameter — it
      exists only as a `fireParamLiveSubscribers` key that animates the UI
      fader. There is no capture path.
      Why it matters beyond the immediate report: riding the send IS a dub
      gesture — arguably the primary one, ahead of any named move. It also
      blocks the reviewer's **Gate M** (record/replay reproduces the
      performance) and **AI-08** (gesture engine), since a performer that rides
      a fader would be unrecordable and its takes unreplayable.
      **CLOSED 2026-09-18, commit `458617863`,** to that shape. `channelSendStream.ts` is
      the stream that was missing — the mixer store publishes every non-transient write
      (a transient is a move BORROWING the send, already recorded as that move; recording
      it again would be a second contradictory account of one gesture) and DubRecorder
      gains a third subscription alongside fire and release.
      A ride arrives at ~60 writes/s, so points are thinned on movement, WITH a maximum
      row gap — without one a fader creeping across a bar writes nothing until it has
      moved a hundredth, and the straight line between two distant points is not the
      gesture that was played. Curve mode with linear interpolation, or a smooth ride
      replays as a staircase.
      `dub.channelSend.ch<N>` is routable both ways: the router turns it back into a fader
      move, and AutomationPlayer addresses it by channel as it already does per-channel
      moves. `.dbx` round-trip needed no schema change (curves persist generically as
      `AutomationCurve[]`). `AutomationBaker` has NO mapping and should not — a send to a
      bus a MOD does not have has no native effect command.
      **Found while wiring it:** AutomationPlayer dispatched per-channel dub curves without
      the `'lane'` tag its own global-curve path already used, so a replayed per-channel
      curve looked like a live gesture and the recorder captured it again every pass — one
      take growing a copy of itself each time round the pattern. Fixed in the same commit.
      20 tests.

- [x] **X6** **Bus audition mode — a solo button for the send.** Raised
      2026-09-17 while writing skank test instructions that began "first switch
      off Perry", which is a smell: the user should not have to dismantle their
      voicing to hear what a gesture is doing.
      User-invoked, reversible, momentary: temporarily bypass the PARALLEL
      colour stages — plate, ring mod, lo-fi, phaser/comb sweep, external
      feedback — leaving the core wet chain (echo -> spring -> sidechain -> glue
      -> EQ) audible, then drop back into full character on release. Standard
      desk behaviour: solo the send to hear what you are actually sending.

      **Explicitly NOT automatic.** The engine must never disable colour because
      a gesture is hard to pick out — Perry's wash is Perry working, and a
      competent engineer chooses it on purpose. The dividing line: would someone
      plausibly want this on purpose? Muddy tail yes; unbounded feedback never.
      Safety stays automatic and persona-independent (the tanh ceiling in the
      ext loop); musical masking stays the user's call.

      The intelligent half of this belongs to the performer, not the engine —
      reviewer's **AI-11 consequence model**: notice the return is already
      dense, and choose a smaller gesture or rest, rather than switching the
      character off. Engine offers the ear; the AI supplies the judgement.

      Implementation note: every stage listed is already gated by an existing
      wet/dry or send gain, so this is a snapshot-and-restore of those gains
      with a short ramp — no graph surgery. Must be safe to toggle during
      playback, and must not touch `characterPreset` (that would flip the
      preset to 'custom' and silently destroy the user's voicing — see
      dubBusCharacterCoherence.test.ts).

      **CLOSED 2026-09-18, commit `368514846`,** to exactly that shape.
      `src/lib/dub/auditionHold.ts` holds the bookkeeping, pure and free of Web Audio —
      it is not about audio but about who owns a value while someone else borrows it, the
      same question the dub sends answer with their baselines. (It is pure for a second
      reason: importing `DubBus` into a test drags in the whole WASM effect chain and
      times out at 10 s. That is why the sibling bus tests read source text.)
      Two non-obvious things it gets right: pressing twice must not snapshot the DUCKED
      values as if they were the user's — one stuck press would otherwise leave a
      permanently colourless bus — and a stage changed WHILE held must land on the
      restore, so the six runtime colour setters route through the hold. Restores the
      REMEMBERED values, not `settings`, so a stage left part-way down comes back
      part-way down. The lo-fi bypass is handled as the other half of a crossfade, not a
      stage of its own.
      Panic ends an audition rather than leaving a stale snapshot to hand back pre-panic
      levels. Momentary deck button with pointer capture (a finger sliding off still
      hands the colour back; an unmount mid-hold cannot leave the bus colourless), plus
      `set_dub_bus_audition` over MCP. 23 tests.
      **Still not automatic, by design** — the AI half stays with AI-11 (notice the
      return is already dense and choose a smaller gesture), not with the engine.

- [x] **X7** **Dub lane visuals: static, and shown on every pattern.** Reported
      2026-09-18. Two separate faults.
      (a) *Not following scroll.* The machinery exists — `masterDubLaneRef`
      has its `style.top` written imperatively at PatternEditorCanvas.ts:2686
      and :2813, and the wrapper renders at `top: scrollYRef.current` with the
      inner MasterDubLane at `top={0}`. So it is wired but not firing. Needs
      live debug (does the handler run? is the ref attached when it does?),
      NOT more source reading.
      (b) *Appearing on all patterns.* Curves are stored per pattern
      (`getCurvesForPattern(patternId, channelIndex)`) and the lane is passed
      `pattern.id`, so the scoping looks right on paper. Prime suspect is
      `DubRecorder` reading `tracker.currentPatternIndex`: that value is known
      NOT to update on libopenmpt/WASM-driven engines — AutoDub carries the
      same workaround and comment. On AHX every recording would then land under
      one pattern id. Verify what id is actually written before changing
      anything.

      **CLOSED 2026-09-18, commit `57fa985db`.**
      (a) *Root cause: one style property with two owners writing two DIFFERENT
      quantities.* The RAF loop set the overlays' `top` to `overlayTop`; React
      re-rendered the same elements declaring `top: scrollYRef.current`, which holds the
      CANVAS's `baseY` — they differ by `(currentRow - topLines) * rh` — and which the
      idle RAF branch never updated at all. Last writer won. The dub lane lost most often
      because `AutomationLane` subscribes to the WHOLE automation store and so re-renders
      far more than its neighbours; the same latent fault sat under the automation and
      macro overlays. Fixed with `overlayTopRef`, written in both RAF branches and
      rendered from by all three overlays; `scrollYRef` keeps its real job.
      (b) **The hypothesis above was WRONG, and so was its premise.** Playback DOES write
      the tracker store's index, including on libopenmpt (`usePatternPlayback.ts:739`);
      it is the TRANSPORT copy that stays at 0 — which is what AutoDub's own comment at
      `AutoDub.ts:2078` says. The real explanation is pattern REUSE: loaded
      "break the box.mod" to check and pattern 0 occupies order positions 0, 1, 2 and 3,
      so a move recorded at position 0 plays and draws at all four. Cells have always
      behaved that way. Not a bug; no change made.
      (c) *Found while fixing (a):* the lane forced EVERY `dub.*` curve to steps mode.
      Right for a move — on, then off — and wrong for a send, so an X5 fader ride drew as
      a staircase while replaying as the smooth curve it was. The send now honours its
      stored mode. And `dub.channelSend` was missing from the automatable parameter list
      entirely, so a recorded ride was in the file, replayed correctly, and could never be
      selected or seen. Added per-channel, kept off the global lane. 13 tests.

- [x] **X8** **Stale MCP tool metadata.** `fire_dub_move`'s description still
      lists 27 valid moveIds from the April era — no skankEchoThrow,
      skankFloatThrow, versionDrop, riddimSection, combSweep, hpfRise,
      madProfPingPong. It accepts them fine (the router takes any registered
      id) but an agent reading the tool description would not know they exist.
      Same staleness class as the manual chapters in X-notes.

      **CLOSED 2026-09-18.** The router registers **44** moves; the description listed 27.
      A tool description must be a literal string — MCP hands it to the client before any
      app code runs — so it cannot be generated from the registry. Making staleness
      IMPOSSIBLE is the next best thing: the description is now part of the same
      bidirectional contract as `DUB_MOVE_KINDS` and `MOVE_COLOR` in
      `moveRegistryContract.test.ts`, which fails if a move is registered without being
      advertised, if a phantom move is advertised, or if the stated count drifts.
      **Second fault, found while testing X2 and initially misdiagnosed twice
      (see X2's note):** every modland tool returned 404 because the MCP server is a
      separate process started with `cwd: server/`, so `dotenv/config` looked for
      `server/.env` and found nothing; `.env` at the repo root sets `PORT=3011`, the API
      listens there, and the MCP process fell back to 3001 where an unrelated service is
      listening — a valid 404 from the wrong server. Now loads the repo-root `.env` from
      `__dirname` (CommonJS here, as `server/src/index.ts` and `routes/ai.ts` already do)
      before `API_BASE` is computed. 7 + 3 tests; both fail against the old code.

- [x] **X9 — CLOSED 2026-09-19 by measurement on the exercised path.** The earlier
      reading was a WEAK pass and was treated as one: sends looked clean, but the fire log
      showed neither `ghostReverb` nor `echoBuildUp` had fired, so the ratcheting path had
      never run. Drove it directly instead — fired `ghostReverb` global, confirmed it was
      holding (channels 0-3 muted, its signature), then released.
      Before / during / after, twice over: sends `0.25 / 0.45 / 0.45 / 0.45` -> held ->
      `0.25 / 0.45 / 0.45 / 0.45`. Exact baseline restored, no channel at 1.0, every
      channel unmuted (`userMuteMask` 65535 = all audible), taps intact.
      Closed on measurement rather than ear on purpose: the report was a STATE claim
      ("pushed the master up to 100% and stayed there") and the fader is
      `max(channel dubSend)`, so reading the sends tests the claim more directly than
      listening can.
      One-off seen and NOT logged as a bug: `returnGain` moved 0.75 -> 0.63 once and never
      again across controlled repeats, most likely the user's own hand on the FX WET fader
      while watching it. One unreproduced sample is not a finding.

- [x] **X9 (original entry)** **Store-level dub sends ratchet to 1.0 and stay there.** FIXED in code,
      NOT yet verified live by ear. Reported
      2026-09-18 as "auto dub pushed the master up to 100% and stayed there".
      The Dub Deck master fader is `max(channel dubSend)` (`DubDeckStrip.tsx:620`),
      so one pinned channel reads as a pinned master.
      **Confirmed live by measurement, not reasoning** — with AutoDub having run,
      `get_dub_bus_state` showed channels 0, 1 and 3 at `dubSend: 1` exactly while
      `get_mixer_state` showed those same three channels muted. That pairing is
      `ghostReverb`'s signature (mute dry + send to 1.0), left applied.
      Same bug CLASS as the tap ratchet (`20771d1c5`) and the whole-mix fader
      ratchet (2026-09-17), but on the path neither fix covered: the moves that
      write `useMixerStore.channels[].dubSend` directly — `ghostReverb.ts` and
      `echoBuildUp.ts`. Both snapshot the live store value at `execute()` time,
      which is another move's transient whenever moves overlap (AutoDub interleaves
      them; `ghostReverb` global also snapshots channels a per-channel `ghostReverb`
      is currently holding). Their restore then writes that transient back as the
      resting value.
      Root cause is one level up from either move: `dubSend` and `muted` conflate
      "what the user set" with "what a move is applying right now". Fix is a
      baseline separated from the applied value and resolved at RELEASE time —
      the `ChannelTapBaselines` idea (`src/lib/dub/channelTapBaseline.ts`), which
      exists for the audio-node path only, brought to the store path.
      **The §5 audio death is now CONFIRMED, by measurement, as this same bug.**
      2026-09-18, live: `userMuteMask 0xFFF0` (all four channels muted at the source),
      `lastRenderRms 0`, `silentReason: "module-rendered-silence"` — and
      `unmute_all_channels` brought the song straight back, which is exactly the test
      the handoff's §5 prescribed for confirming the mask. Mute leakage from dub moves,
      not the audio graph. Do not treat §5 as open and unexplained any more.
      Three further defects were fixed off the back of that measurement:
      (a) `planDrop` could take EVERY channel when profile evidence is weak — an
      untitled module gives four channels of `unknown`, none of which look like a
      foundation — so a drop became silence. It now keeps a core whatever the evidence
      says, protecting what the arrangement leans on hardest; a floor that applies
      precisely when the performer knows least.
      (b) Nothing ever closed a transient whose CLOSER was lost (a disposer that threw,
      an engine restart, a hot reload mid-hold). `releaseAllDubTransients()` on transport
      stop and a once-a-bar `reapOrphanedDubTransients()` watchdog now hand the channel
      back. A reaped channel is genuinely free: a lost closer turning up late cannot
      re-mute it.
      (c) `scheduleDubSendStoreWrite`'s flush guarded the INDEX but not the ELEMENT, so a
      write landing a frame after the store was replaced threw
      "Cannot set properties of undefined (setting 'dubSend')" and took out every other
      write in that frame.
      **Fix shipped:** `src/lib/dub/channelSendBaseline.ts` (ref-counted
      baselines — store transients NEST, unlike node taps) and
      `dubChannelTransient.ts` (the only way a move may touch a channel's send
      or mute). `setChannelDubSend` / `setChannelMute` take
      `{ transient: true }`; a write without it is the user's and defines the
      baseline. Converted: `ghostReverb`, `echoBuildUp`, `channelMute`,
      `versionDrop`, `riddimSection`, and the cold-path activation callback in
      `DrumPadEngine` (`openChannelTap` now releases with `null`, not `0`,
      which had been overwriting a user's non-zero send with 0).
      `channelMute`/`versionDrop`/`riddimSection` were found by the test that
      forbids a move writing the store directly — a grep for `dubSend` alone
      had missed the mute-only moves.
      Regression test `src/engine/dub/__tests__/dubSendRatchet.test.ts` (18
      cases, in `test:ci`): 6 fail on the pre-fix code, all pass after.
      **Open: a human still has to hear it** — run AutoDub for a few minutes and
      confirm the Dub Deck master fader does not walk to 100%.

- [x] **X11** **Generated effects are far louder than the music.** FIXED in code, NOT yet
      verified by ear. Reported 2026-09-18:
      "some effects like the siren etc are MUCH louder than the music". The synthesised
      moves — `dubSiren` (`DubSirenSynth`), `sonarPing`, `toast`, `tubbyScream`,
      `oscBass`, `subHarmonic` — generate their own audio at a fixed level instead of one
      referenced to the programme material, so they sit on top of a quiet tune and
      dominate it.
      Root question before touching a gain: are they referenced to ANYTHING? A fixed
      amplitude is a level relative to full scale, not relative to the mix, and a mix
      that peaks at -12 dBFS will be buried by any move that assumes -3.
      Measure first: `get_audio_level` / the `AudioDataBus` frame for the programme RMS,
      then each synth's own output, and compare. The fix is a reference level the
      generated moves are scaled against (the running programme RMS), not a hand-tuned
      constant per move — that is the same class of mistake as the master insert's
      uncompensated shelf (X10). Related: X10's trim work changed overall level, so
      re-measure after it is verified by ear.
      **Fixed:** `src/lib/dub/programmeLevel.ts` (pure) + `src/engine/dub/programmeReference.ts`
      (the live smoothed reading). Measured cause: `firePing` fired a sine at peak 0.8
      ABSOLUTE straight into the bus while the programme played at 0.05-0.15 RMS —
      15-20 dB over the music, exactly as reported.
      A smaller constant would be wrong for the next song in the other direction, so
      generated peaks are now a fraction of the PROGRAMME'S OWN measured peak. Not of its
      RMS: a listener judges "as loud as the music" against what the music peaks at, and
      a tracker mix's ~12 dB crest factor would put an RMS-referenced level about four
      times too loud. Relative presence per move survives as musical intent (a scream is
      louder than a ping), and the move's own `level` parameter now SCALES that presence
      instead of replacing it.
      Silence has no reference, so it falls back to a modest fixed peak — audible when
      auditioning with nothing loaded, not painful. The reading is smoothed with a fast
      attack and slow release so the reference describes the tune rather than a transient.
      Converted: sonarPing, radioRiser, subSwell, subHarmonic, crushBass, oscBass,
      noiseBurst, and the siren (behind its own level gain rather than straight into the
      bus). 17 tests, including a contract test that no generated source is left on a raw
      full-scale clamp.
      **Corrected the same day, from the user's ear:** "the sonar was not annoyingly high"
      but the siren was still "at least twice as loud as everything else". The first pass
      referenced EVERYTHING to the programme's PEAK, which is right for a transient and
      wrong for a drone: loudness for anything continuous follows RMS, so a siren held at
      0.75 of peak sits three to four times above the level the mix averages — exactly
      what was reported. Sustained sources (siren, oscBass, subHarmonic, crushBass) now
      reference the programme's RMS; transients keep the peak reference. `toast` is
      deliberately in NEITHER table: it routes a live microphone and ducks the music while
      it plays, so referencing it to a level its own ducking pushes down would be a
      feedback loop.
      **The numbers are PROVISIONAL.** Confirmed working by ear 2026-09-18; a deliberate
      level-tuning pass is owed once the plan closes, covering `GENERATED_PRESENCE`,
      `SILENT_PROGRAMME_PEAK`, and the X10 master-insert trim (which moves overall level
      and therefore what "as loud as the music" means). Do not tune them mid-plan.

- [x] **X12** **Held moves from the Dub Deck lingered for ever.** Reported 2026-09-18:
      "the siren and lots of other noise is lingering now", with eight
      `holdStart dubSiren` and a `crushBass` in the log and no matching release.
      Measured first: the AutoDub fire log showed 22 fires / 18 releases and never more
      than ONE hold in flight, so the performer was not the source — the deck was.
      Cause: `DubDeckStrip` kept each hold's releaser as a closure in a component ref.
      When the component unmounted or hot-reloaded, every releaser went with it and the
      sound kept going with nothing able to stop it. Same orphan class as X9's transients,
      in a different place.
      Fixed by giving the deck's holds to the GestureEngine (Gate F4's whole point: ONE
      notion of a held move). `holdMs: 0` means held until released; the engine outlives
      the component, so a transport stop, a panic or the new unmount cleanup can always
      let go, and the hold appears in `activeGestures()` where a disposer in a ref never
      could. 2 tests.

- [x] **X13** **A siren kept sounding with nothing holding it, and the bus on/off level
      jump was huge.** Both reported 2026-09-18, both the same root shape: something that
      GENERATES sound was treated as something that merely passes through.
      Measured first — the AutoDub fire log showed no siren at all this session (13 of 13
      fires released, max one hold), so it was a leftover from the earlier X12 presses
      whose releaser had been lost.
      (a) Panic cancelled every timer, tap and feedback path but never told the siren
      SYNTH to stop, and disabling the bus only HID it by cutting its input. Both paths
      now call `silenceGeneratedSynths()`. SID mode deliberately gets no equivalent: its
      generators hand back a releaser per call and already run through `actionReleasers`,
      so inventing a global stop would be a second way to do one thing.
      (b) The X10 trim subtracted the FULL shelf gain, which assumes the whole mix is
      being lifted when only the low end is — up to 9 dB of drop the moment the bus came
      on. The trim now follows the measured share of energy below the bass/mid split
      (`lowShare`, smoothed), so a bass-heavy tune pays more than a thin one. Floored and
      capped so it neither disappears nor swallows the tune.

- [x] **X14 — CLOSED 2026-09-19 on a listening pass.** User: "i dint think the siren
      overfires anymore". That is the verdict this needed: the measurement below could
      only show the over-firing was absent from the code as it now stands, never that the
      build the user HEARD it on was cleared. Both halves now agree.
      Hedged wording noted deliberately ("i dont think") — if it returns, capture
      `get_auto_dub_fire_log` BEFORE reloading, because a reload is what cost the
      original evidence.
      The "then got stuck" half was the X12/X13 failure shape (a lost release) and was
      fixed with those; the log below confirms every fire pairs with its release.

- [x] **X14 (original entry)** **The siren fires far too often, then got stuck.** Reported 2026-09-18:
      "the siren fires super often now it fired over and over until it got stuck".
      **Suspected regression from this session's own work** — the Gate E intention gating
      filters the rule table to moves that serve the current intention, and `dubSiren` is
      tagged `['ACCENT', 'TRANSITION']`. TRANSITION comes round at every phrase edge and
      has few moves serving it, so the siren can win that draw repeatedly where the old
      weighted roll spread it out. The consecutive-repeat bar (K4) allows three in a row
      before it bites, which for a sustained siren is already too many.
      "Until it got stuck" is the second half: a siren whose release was lost, which is
      the X12/X13 failure shape again.
      Measure before changing anything: `get_auto_dub_fire_log` for dubSiren fire/release
      pairing and spacing, and `get_performance_journal` for the intentions that led to
      them — that is what the journal was built for.
      **Measured 2026-09-18, 50-entry log spanning ~7 minutes of performance:** `dubSiren`
      fired ONCE (bar 1, t+7.3 s) and released 1.9 s later. No repeat, no unreleased fire,
      and no `versionDrop` / `riddimSection` in the whole window. Every fire in the log has
      its matching release and `activeHolds` returns to 0 each time. So on the code as it
      now stands the over-firing is not reproduced — but this log was taken after the
      X12/X13 fixes and a reload, so it does not clear the build the user heard it on.
      Still open pending a listening pass on a fresh page; if it recurs, capture the log
      BEFORE reloading.

- [x] **X15** **A short throw leaked its dub slot.** Found 2026-09-18 while reading the
      fire log for X14: `registeredChannelTaps` climbed 0 -> 1 -> 2 -> 3 -> 4 across one
      session and never fell, although every fire had a matching release. One leaked tap
      is one leaked libopenmpt module instance plus its buffers, held for the life of the
      page. Opening a cold channel's send is async and a throw is short, so the close
      routinely arrives mid-activation; it read a single `channelDubActive` flag that
      activation only sets at the END of its work, saw false, and dropped itself. The
      activation then finished into a slot nobody would ever close.
      Fixed by separating intent from reality: `src/lib/dub/dubChannelLifecycle.ts` tracks
      wanted / actual / in-flight, records a mid-flight request instead of dispatching it,
      and lets whoever finishes last reconcile. Activation's async steps now poll the
      recorded intent and abandon a send that has since closed, and closing a send cancels
      the deferred 500 ms activation retry. 10 behaviour tests (4 fail against the old
      single-flag model) plus a wiring contract. Commit `aa7693b69`.

- [x] **X16** **Car Bluetooth: silent unless Music.app played, and the car kept
      launching Music.** Reported 2026-09-18 on a Mac. One cause behind all of it: Web
      Audio makes the page something that makes noise, not something the OS considers a
      media player. Head units gate the A2DP stream until AVRCP reports PLAYING, and that
      comes from a media session; with no session of ours, the car's PLAY on connect goes
      to whatever macOS does consider the media app, and there is no metadata to show.
      `src/lib/audio/mediaSession.ts` holds a silent looping element (the MediaSession API
      only takes effect while a media ELEMENT plays) built in memory, not fetched — a
      session that needs the network fails exactly where it is needed. `useMediaSession`
      follows the transport and project metadata and routes the car's transport buttons
      back into the store. 20 tests including a wiring contract. Commit `d3e3d3a74`.
      **Needs the user's car to confirm** — no automated check can.

- [x] **X18** **The performer got one decision per PATTERN.** Reported 2026-09-19 as
      "King Tubby is mostly idle", with a screenshot later showing the move pad dark.
      The fire log named it exactly: every decision at `barPos: 0`, on bars 8, 16, 40, 48,
      56, 72, 80, 88 — never a bar between, never a position other than zero. Five moves
      across 72 bars, about one per 55 seconds, and three of the five gave "N rows since
      the last move" as their reason, which is the drought trigger rather than a choice.
      Cause: `currentGlobalRow` is only written when the pattern or song position changes
      (`usePatternPlayback` — deliberate, per-row store writes were avoided because the
      editor's RAF loop reads position directly), so it advances 64 rows at a time.
      AutoDub's bar clock preferred it over `currentRow`, and at speed 12 a bar is 8 rows,
      so the bar number leapt by 8 per update. Every per-bar rule — `minBarsBetweenFires`,
      the per-bar fire caps, the phrase arc — ran EIGHT TIMES too slowly.
      `src/lib/dub/transportRow.ts` takes the coarse position from the global row and the
      fine one from `currentRow`; only the PATTERN named by the global row is trusted,
      because that field carries a row offset of its own. Commit `957e220ec`.
      **Ruled out first, each by measurement:** the signal path (bus on, all four taps
      registered, sends up), the persona (`minBarsBetweenFires: 1.5`, not 16), and role
      starvation — every channel on this tune classifies as `percussion`, but
      `AutoDub.ts:940` already falls back to any non-empty channel, so those rules were
      never starved. That third one I had started to act on and it was wrong.
      15 tests across `transportRow.test.ts` and `performerClockRate.test.ts`; 6 fail
      against the old behaviour, and one keeps the old result ([0, 8, 16] — one decision
      per pattern) as a legible counter-example.

- [x] **X19** **Move buttons stayed dark while the performer worked.** Reported 2026-09-19
      with a screenshot of the CLICK / RATE / HOLD / TOGGLE rows: "i see almost no action
      here". `activeFires` is keyed `moveId:channelId` (`moveId:g` for a global move) and
      those rows matched `moveId:g` ONLY — but AutoDub fires channel-scoped moves WITH a
      channel, so `echoThrow ch2` keys as `echoThrow:2` and never lit the Throw button.
      Of the five moves in that take only the two global ones could light anything.
      A button in those rows IS the move, not the move-on-one-channel, so any channel
      counts now, matched on a delimited prefix so one id cannot light another's button.
      The per-channel grid keeps its exact key. Commit `27f00cbe3`. 7 tests.

- [x] **X17 — CLOSED 2026-09-19.** Three separate faults wearing one symptom. Measured
      before/after on "world class dub" (speed 12, King Tubby): before, 47 DOM samples
      over 19s with ZERO movement on any of 18 controls.
      1. **EQ snapshot gated on the offline classifier.** `_eqSnapshot` was built only
         `if (analysis)` from `useTrackerAnalysisStore.currentAnalysis`, which only
         exists after the user runs the ONNX capture-and-classify pipeline BY HAND.
         Loading a song does not run it, so `improvTick` hit `if (!snapshot) return`
         every tick of an ordinary session. Now fed from the live audio bus.
         Energy is read live even when the analysis exists: `genre.energy` is ONE number
         for the whole song, so `energy-reactive` computed `(energy - prevEnergy) === 0`
         forever. (`d104b1f5b`)
      2. **beatPhase quantized to the row grid.** From
         `computeMusicalPosition(<integer row>)`, so at speed 12 (8 rows/bar)
         `(barPos*4) % 1` was only ever 0.0 or 0.5 — and `beat-sync` is
         `sin(phase*2PI)`, ZERO at both. The driver ran, applied, reported no error and
         moved the EQ by 2.4e-16. Row grid now gives the beat, wall clock fills in the
         position inside it, re-anchored each beat. (`d104b1f5b`)
      3. **The deck's bus faders were never on the live channel**, and the naive fix
         would have made them lie: `LIVE_HOLD_MS` is 400ms but a tape hold keeps the
         return at 0 for BARS, so a one-shot announcement flicks the fader to 0 then
         climbs back while the audio is still killed. Held announcements now refresh
         every 150ms. (`d9a37a512`)
      **Trap for next time:** `DubBusPanel` — which already had `useLiveDubParam` wired —
      renders ONLY in the DJ Sampler and DrumPad, never in the tracker Dub Deck. The deck
      has its own controls. Earlier announce work looked correct and changed nothing here.
      Diagnosis was only possible after adding `getAutoEqDiag` (ticks/applies/lastSkip/
      lastDeltas, via `get_auto_dub_state`): every gate in that driver is a silent early
      return, so an inert driver and one holding still look identical.
      NOT wired, deliberately: BASS, MID, WIDTH — no move modulates them
      (`startStereoDoubler` builds its own parallel nodes), so animating them would
      invent motion the audio is not making. Pinned by test.

- [x] **X21 — CLOSED 2026-09-19.** User: "discarding instead of restoring works". Agrees
      with the repro below, which could not make it fail either.
      **The latent fragility is real and survives this closure**, so it is kept rather
      than deleted: `discardRecovery` never resets the editor. It drops the React state
      and deletes the IndexedDB record, and nothing more. It is correct today only
      because the prompt appears solely when `everExplicitlySaved` is false, and that
      branch loads nothing — an invariant no code enforces. If a future change ever loads
      something before the prompt resolves, discard will leave it sitting there and this
      report will come back.
      Any future fix must clear only what came from boot, NOT unconditionally: the prompt
      is not modal, so a user can load a song while it is open, and a blanket reset would
      destroy that song.

- [x] **X21 (original entry)** **Declining the crash-recovery restore must fully clear the song.**
      Reported 2026-09-19: "if i chose not to restore the current song when the browser
      offers me it after a reload the current song needs to be fully cleared, a broken
      song lingers if not." So Discard leaves partial state behind — patterns,
      instruments, order or engine state surviving a decision that was supposed to drop
      all of it, which then presents as a broken song rather than an empty one.
      Start at `resolveRecoveryPrompt` / `clearSavedProject` and the boot Restore/Discard
      path (see `project_crash_recovery_autosave`); the likely shape is the same stale
      class as the rest of this sweep — a reset that clears the STORE the prompt knows
      about while another owner (engine, replayer, format state) keeps its copy.
      **ATTEMPTED REPRO 2026-09-19 — NOT REPRODUCED on the plain-MOD path.** Loaded
      "world class dub" (ProTracker MOD, 15 patterns / 23 instruments), waited for the
      autosave to write a real recovery record (verified in IndexedDB `devilbox/project`
      holding name=world_class_dub patterns=15 instruments=23), reloaded, took the
      prompt, clicked Discard. After: tracker 1 pattern / "Untitled", instruments [],
      format state all default (editorMode classic, no WASM engines, no original module
      data), mixer 16 channels at unity, AND the IndexedDB recovery key was gone. Every
      layer clean.
      Why it passes here: the prompt only appears when `everExplicitlySaved` is FALSE
      (`useProjectPersistence.ts:1080`), and that branch loads nothing — so the editor is
      already empty and `discardRecovery` (`:1252`) has nothing to clear. It only clears
      the React state and deletes the IndexedDB record; it never resets the editor.
      **So the real defect is that discard's correctness depends on an invariant nobody
      enforces** — "the editor is empty whenever this prompt is up". Wherever that
      invariant breaks, discard leaves whatever is loaded. The user has hit a case where
      it breaks; this repro is not it.
      DO NOT "fix" this with an unconditional reset on discard: the prompt is not modal,
      so a user can load a song while it is open, and clearing unconditionally would
      destroy that song. Any fix must clear only state that came from boot/recovery, not
      state the user has since loaded.
      Still to ask/try: which format (a WASM/native song — UADE, SID, Furnace, GT Ultra —
      carries engine and original-module state a MOD does not), whether Save had ever
      been used in that profile, and whether it was the live site (deployed bundle is
      985a43fbb, older than these fixes).

- [~] **X17 (original entry)** **The EQ and dub-bus sliders do not move any more.** Reported 2026-09-19:
      "i see no action in the eq and dub bus sliders at all they use to move" — a
      REGRESSION, they used to animate while AutoDub worked.
      The live-animation path is `fireParamLiveSubscribers(param, value)`, which the knobs
      and faders subscribe to so they can move without a React re-render per frame (see
      `docs/CONTROL_PATTERNS.md` — the imperative fast path). Two candidate breaks, in
      order of suspicion:
      (a) the AutoEQ driver / bus setters no longer publish to those subscribers, or
      (b) the subscribers are keyed on a parameter name that changed.
      Measure before touching anything: subscribe-side first — confirm whether
      `fireParamLiveSubscribers` is still CALLED for `dub.*` params while a move runs
      (the fire log records the bus settings each fire, so compare a setting that visibly
      changes in the log against a slider that does not move).
      **MY EARLIER CLOSURE WAS WRONG.** I read "good now they work" as covering the
      sliders; it was about the move BUTTONS (X19). The user corrected it the same day —
      "i dont see any dub bus or eq sliders move still either". Reopened and actually
      diagnosed.
      **Cause:** only `dub.channelSend.chN` ever called `fireParamLiveSubscribers`, which
      is exactly why the channel faders always moved and nothing else did. Dub moves
      modulate the audio nodes DIRECTLY — deliberate, since routing every gesture through
      the store would put a React render inside an audio-rate path — so nothing told the
      UI anything. Both halves were missing: the bus never published, and the bus/EQ
      sliders never subscribed.
      **Fixed:** `DubBus.announce()` publishes to the same live-value channel the MIDI
      router uses, so a control follows a move exactly as it follows a CC — wired for the
      feedback swell (both edges, or the control would stick) and for every step of the
      Altec filter climb via `setHpf`, normalised the way the router defines the control
      and clamped, because the sweep climbs to 10 kHz while the control covers 20 Hz to
      1 kHz. `useLiveDubParam` is the subscribe half: it follows announcements and falls
      back to the stored value once the move lets go, so the control ends where the user
      left it. Announcement only — it changes no state and no audio, because `settings`
      is what a move restores to. 15 tests.
      **Still to wire:** the remaining bus controls (spring wet, echo wet, return gain,
      sidechain) and the EQ panel. The mechanism is in place; each is a call to
      `announce` at the point of modulation plus a `useLiveDubParam` on the control.
      Old note, now known to be only part of the story: The
      performer was firing about once a minute (the bar clock handed it one decision per
      pattern, `957e220ec`) and the move buttons it did fire mostly stayed dark
      (`27f00cbe3`), so the sliders had almost nothing to animate and what little they did
      went unnoticed. Both causes are locked in by tests; no slider-specific change was
      made or needed.
      **Worth remembering:** two independent faults stacked into one symptom, and the
      obvious reading — "the animation path broke" — was wrong. The cheap check that
      settled it was fixing the upstream causes first and re-asking.

- [x] **X22 — CLOSED 2026-09-21. The label lied; nothing was analysing.** It read
      `analyzing…` whenever `autoEqLastGenre` was empty, and that is its value until the
      ONNX capture-and-classify pipeline has been run BY HAND — loading a song does not
      start it. So a session where no analysis had ever been requested showed "analyzing…"
      forever and looked hung. The label now reports the analysis store's real
      `analysisState`: capturing / analyzing / analysis failed / **no analysis**.
      Not urgent, and now says so: the improv EQ stopped depending on this on 2026-09-19
      (it reads live audio), so an un-analysed song only means no genre baseline.

- [x] **X22 (original entry)** **"Auto EQ analyzing…" appears stuck.** Reported 2026-09-21 with a screenshot
      showing the label sitting at `Auto EQ analyzing…` indefinitely.
      Likely related to what the X17 work found: the EQ snapshot used to be gated on
      `useTrackerAnalysisStore.currentAnalysis`, which only exists once the ONNX
      capture-and-classify pipeline has been run BY HAND. `analysisState` has a
      `'capturing'` / `'analyzing'` / `'ready'` sequence (`useTrackerAnalysisStore.ts:76`),
      so a run that starts and never resolves leaves the label on `analyzing` forever.
      Check first whether `analysisState` is genuinely stuck or whether nothing ever
      started it, and whether the worker reports an error that is swallowed.
      NB the improv EQ no longer depends on this at all (it reads live audio now), so this
      is a stale LABEL, not a dead EQ — confirm that before treating it as urgent.

- [~] **X23 — PARTIAL 2026-09-21. The watchdog was blind to this engine; now it is not.**
      `get_playback_silence` only read the libopenmpt worklet diag, so for Hively/AHX,
      UADE, Furnace and every other engine it answered `diagAvailable: false` and judged
      nothing — blind to exactly the class of song reported silent. It now falls back to
      the master meter, reporting `source: "libopenmpt-worklet" | "master-meter"`. The
      meter is a weaker signal (it says there is no sound, not WHERE it was lost), which
      is why the worklet reason is still preferred when available.
      Verified live on the user's own session: `verdict: ok, source: master-meter,
      lastRenderRms 0.144`.
      **The silence itself is NOT reproduced.** Measured across a window of playback:
      master rms 0.24-0.37, never silent, every fire paired with its release. The zeros in
      the reported console log sit at the very start, during Hively warm-up
      (`[HivelyWorklet] render ... max=0.000000` before `Hively loaded & playing`) — that
      is startup, not a mid-song drop.
      Open question the user asked directly: does a move mute it by mistake for a long
      stretch? Not seen yet. Next time it happens, call `get_playback_silence` BEFORE
      reloading — it now answers for this engine.

- [~] **X23 — THREE OF MY OWN CONCLUSIONS IN THIS ENTRY WERE WRONG. What is actually
      established, 2026-09-21.**
      Each theory was killed by the next measurement, so the retractions come first:
      1. "play before the worklet is ready" — it was the unanswered crash-recovery dialog
         (`resolve_recovery_prompt({action:'restore'})`).
      2. "the mix is CUT" — it is attenuated, not cut.
      3. "the break is `engine.output → HivelySynth.output`" — **no**. `synthOutput` reads
         0 in the HEALTHY state too, so that node is simply not in the song-playback path
         (it serves standalone instrument mode). I read a constant as a symptom.
      Also ruled out by direct check rather than argument: `hivelyInstanceCount: 1` (no
      stale instance beside the live one) and `synthHoldsLiveEngine: 1` (not Vite module
      duplication, which this codebase does suffer elsewhere).
      **What the numbers do establish.** Compare the worklet's own last main-render peak
      against what arrives at the master insert:

          taps open    lastMainPeak 0.1266  ->  insertIn 0.0052    (~24x down)
          taps open    lastMainPeak 0.0750  ->  insertIn 0.0049    (~15x down)
          no taps      lastMainPeak 0.1001  ->  insertIn 0.0540    (~1.9x)
          no taps      lastMainPeak 0.0022  ->  insertIn 0.0021    (~1.0x)

      Peak against RMS is not a clean ratio, but 24x against 1.0x is far outside that
      slack. With no dub tap open the level tracks; with a tap open roughly a tenth
      survives. The worklet is not the cause — `mainZeroReturns` stays 0 and
      `mainRingFull` stays 0 throughout.
      Narrowing it further: `engineOut` tracks `lastMainPeak` in BOTH states, and
      `masterEffectsInput` is the first reading that collapses. **So the loss is between
      `HivelyEngine.output` and `masterEffectsInput`**, and `synthBus` reads 0 in both
      states so it is not on that route. The boot log's "PitchResampler worklet inserted:
      synthBus -> resampler -> masterEffectsInput" is the next thing to look at, along with
      whatever else sits on that path.
      **Deliberately stopping here rather than proposing a fourth cause.** Every probe
      added so far survives in `get_dub_bus_state`, so the next session starts with the
      instrument rather than the guess.

- [~] **X23 — THE BREAK IS ONE CONNECTION. Measured 2026-09-21, and two of my own
      earlier claims in this entry are WRONG.**
      First the corrections, because both sent the investigation sideways:
      1. "`play()` before the worklet is ready renders silence with the transport still
         reporting isPlaying" — **no**. It was the crash-recovery dialog sitting unanswered
         across every reload. `get_modal_state` reports `recoveryPromptOpen`, and
         `resolve_recovery_prompt({action:'restore'})` clears it. Nothing to do with the
         engine.
      2. "the mix is CUT" — **no**, it is attenuated to roughly a tenth and stays there.
         The user's words are the accurate ones: "audio returned after an effect now but
         very faint". My own first reading even showed `rmsMax 0.0074` rather than a true
         zero and I read it as silence anyway.
      **The whole path in one read, tap open, music faint:**

          engineOut          0.075751   <- HivelyEngine.output, hot
          synthOutput        0          <- HivelySynth.output, SILENT
          synthBus           0
          masterInput        0
          masterEffectsInput 0.007606   <- a tenth, arriving by some other route
          blepInput          0.005860
          insertIn           0.004912

      `HivelySynth`'s constructor does `this.engine.output.connect(this.output)` and sets
      `_ownsEngineConnection = true` on EVERY instance, while dispose does
      `engine.output.disconnect(this.output)` — and the comment at `HivelySynth.ts:249`
      warns that a bare `engine.output.disconnect()` "would sever the singleton's
      connection to all other destinations". The instrument is re-created on every load
      ("Creating HivelySynth" in the log each time), so a disposed instance can take the
      live connection with it and leave the survivor's output silent.
      **That is the fix site.** What is still audible is not the dry path at all: it is the
      dub return (`busReturn` 0.0108) plus what trickles into `masterEffectsInput`, which
      is exactly why it reads as "only effects" and why it came back "very faint" rather
      than fully.
      **Deliberately not fixed yet** — it is a routing-lifecycle change on the audio path
      and belongs to a decision, not a guess at the end of a long session.

- [~] **X23 — ISOLATED 2026-09-21 to a one-call reproduction. The worklet is INNOCENT.**
      Reproduction, no bus and no move needed: load an AHX, play, then
      `set_channel_dub_send(channel=1, amount=0.5)`. Master goes from rmsAvg 0.0307 to 0
      on that single call, and **setting the send back to 0 does not bring it back**.
      **The Hively worklet is producing audio the whole time.** Instrumented its two render
      paths (`renderStats` in `Hively.worklet.js`, read through
      `get_dub_bus_state.hivelyRenderStats`). With the tap open and the master silent:

          splitFrames 1156   mainSamples 1109760   mainZeroReturns 0
          lastMainPeak 0.113   mainRingWrites 1111680   mainRingFull 0
          dubPasses 420        dubSamples 403200      ringAvailable 1344

      Every counter is healthy and `lastMainPeak` is LOUDER than before the tap. The
      split-path theories in the previous entry are both dead: the main render never
      returns zero, and the ring never starves.
      **`engineOut` reads 0.0915 at the same moment** — `HivelyEngine.output` is hot while
      the master analyser reads silence. So the audio is lost strictly BETWEEN
      `HivelyEngine.output` and the master.
      **And the standing fact that explains the whole class:** `synthBus` and
      `masterEffectsInput` both read 0 for an AHX song *even while it is audible*, where a
      MOD reads 0.0855 at `masterEffectsInput` on the same taps. Hively's main output
      reaches the speakers by a path that touches neither — so the dub bus's master insert,
      which splices `masterEffectsInput → blepInput`, can never see it, and anything that
      disturbs that private path cuts the music with nothing to restore it.
      **Next:** tap `HivelySynth.output` and the instrument effect chain's output. The
      break is one of the two connections between them, and `HivelySynth.ts:249` already
      warns that a bare `engine.output.disconnect()` "would sever the singleton's
      connection to all other destinations".
      **Also seen, worth its own entry:** `play()` called before the Hively worklet is
      ready renders silence while the transport reports `isPlaying: true` and the row stays
      at 0. A second stop/play fixes it.

- [~] **X23 — REPRODUCED AND MEASURED 2026-09-21. Worse than reported.**
      It is not the song. **Enabling the dub bus on a Hively/AHX tune silences the whole
      mix, and disabling it again does NOT bring the audio back** — it stays dead until the
      page is reloaded. The user's phrasing, "turning off the bus plays music turning it on
      silences it again after a bit", is the same fault seen from the other side.
      **The measurement that found it.** Every gain on the path reads correct — envelope 1,
      master 0 dB (which is UNITY, not silence: `useAudioStore` stores dB, and reading it as
      a linear gain nearly produced a fourth wrong diagnosis), no channel muted, no stranded
      mute. Three diagnoses were argued from settings values alone and none survived. So
      `DubBus.getMasterInsertLevels()` now taps the SIGNAL at six points along the master
      insert, read through `get_dub_bus_state.masterInsertLevels`.
      With the bus enabled, the transport advancing and `masterInsertActive: true`,
      `hasSource: true`, `hasDest: true`:

          insertIn 0.000016   afterShelf 0   afterClip 0
          afterWidth 0        insertOut 0    busInput 0   busReturn 0.00003

      **Nothing reaches the insert at all.** The splice reports success while the engine's
      audio is no longer arriving at `masterEffectsInput`, and `registeredChannelTaps` is
      empty with every `dubSend` at 0 — so the main output has been taken out of the path
      and nothing put in its place. `get_audio_level` confirms it: `silent: true`, rmsAvg 0,
      with rows advancing.
      **Next**, and do not guess again: tap the active WASM engine's own `output` node the
      same way. If it has signal while `insertIn` is zero, the engine is playing into a
      disconnected node and the fault is in the whole-mix/isolation re-route, not in
      `wireMasterInsert`. `DubBus.ts:4517` already documents this exact hazard — "the old
      insert chain nodes remain physically connected but logically inactive, and the
      subsequent reconnect silently fails — permanently killing audio output" — which is
      what the no-recovery-after-disable behaviour looks like.

- [ ] **X23 (original entry)** **`jennipha.ahx` goes silent.** Reported 2026-09-21. Reproduce, then use
      `get_playback_silence` (added 2026-09-19) rather than guessing — it reports the
      worklet's own `silentReason` and separates "the engine is rendering silence" from
      "audio was produced and swallowed later". AHX is a WASM engine path, so also check
      `useWasmPositionStore` is still advancing; a stalled transport is a different fault
      and the watchdog says so explicitly.

- [x] **X24 — CLOSED 2026-09-21.** Badges are hidden outright below 17rem by a container
      query rather than compressed into noise. Instrument names went from 0px (clipped
      mid-glyph) to 154px.
      The container is NAMED and applied only to the fullscreen panel, which has a fixed
      width. Making the normal `w-fit` panel a query container would be circular — hiding
      the badges shrinks the content, which shrinks the panel, which keeps them hidden.
      Plain CSS in `index.css`, because Tailwind 3.4 has no `@container` variant without
      adding a plugin for one rule.

- [x] **X24 (original entry)** **Instrument-list badges compress to `S…` / `P…`.**
      Cosmetic, introduced deliberately 2026-09-21: the badges were `shrink-0` and ate the
      whole row, so instrument NAMES rendered at zero width and were clipped mid-glyph.
      Badges now yield before the name does, which is the right priority but leaves them
      unreadable in fullscreen at small widths. A proper fix hides them below a width
      threshold (container query) rather than compressing them.

- [~] **X25 — FIRST PASS APPLIED 2026-09-21, needs a listening check.** Measured each
      move against the live master meter before changing anything (baseline rmsAvg 0.057 /
      peak 0.492), and every one of the five verdicts was confirmed by measurement:
      | move | measured | change |
      |---|---|---|
      | Slam | peak **1.072** — over full scale, clipping | `slamSpring` thump gains 1.5/2.0 → 0.9/1.1 (re-measured 0.566) |
      | Kick | peak 0.438 — quieter than programme | `kickSpring` impulse 6.0 → 10.0 (14.0 overshot at 0.654) |
      | Sub | peak 0.162 — under the mix | `GENERATED_PRESENCE.subSwell` 0.5 → 0.75 |
      | Siren | rms 0.078 | `GENERATED_PRESENCE.siren` 1.15 → 1.25 |
      | Scream | rms 0.117 — twice programme RMS | `GENERATED_PRESENCE.tubbyScream` 0.8 → 0.6 |
      **Where each change went matters.** Slam and Kick are PROCESSED moves, so their
      levels live in `slamSpring` / `kickSpring`. Sub, Siren and Scream are GENERATED, so
      they went in `GENERATED_PRESENCE`, which references the live programme and therefore
      survives a change of song — a bare constant in the move would not.
      Scream was first trimmed at the move's `feedbackAmount` (1.3 → 0.85) and that was
      REVERTED: that parameter sets how hard the filter rings, which is the scream's
      character. Detuning it to fix a level would have changed what the move is.
      Siren was tried at 1.35 and landed exactly on the bound `programmeLevel.test.ts`
      keeps against the 2026-09-18 "siren MUCH louder than the music" regression. The
      guard is worth more than the extra 0.1, so the value moved, not the test.
      **Open: none of this has been heard yet.** Absolute levels drift with the song
      section (baseline moved 0.057 → 0.031 between passes), so the numbers can only say
      a move is no longer clipping or no longer under the mix — not that it sits right.

- [ ] **X25 (original entry)** **Move levels, judged by ear 2026-09-21.** The first real per-move loudness
      verdicts — this is the data the DEFERRED level-tuning note was waiting for, so tune
      against these rather than re-deriving them.
      | move | file | current default | verdict |
      |---|---|---|---|
      | Slam | `moves/springSlam.ts:18` | `amount: 1.0, holdMs: 400` | **too loud** |
      | Kick | `moves/springKick.ts:24` | `amount: 1.0, holdMs: 600` | **not loud enough** |
      | Sub | `moves/subSwell.ts:13` | `freq: 55, durationMs: 400, level: 0.8` | **not loud enough** |
      | Siren | `moves/dubSiren.ts:16` | `defaults: {}` (all from the preset) | **a little too silent** |
      | Scream | `moves/tubbyScream.ts:26` | `centerHz: 500, sweepHz: 900, sweepSec: 3.5, feedbackAmount: 1.3` | **too loud** |
      Note Slam and Kick are BOTH at `amount: 1.0` yet land at opposite ends by ear, so
      this is not one global trim — the spring's response differs between `slamSpring`
      and `kickSpring`. Measure each against programme level before changing numbers;
      `get_auto_dub_fire_log` records `audio.rms`/`peak` at every fire and release.
      Siren has no defaults of its own; its level comes from `sirenPreset` /
      `sirenFeedback` on the bus, so the fix is in a different place from the others.

- [x] **X26 — CLOSED 2026-09-21. Releasing the capture threw, so the release never ran.**
      Every hold site inlined the same shape:
      `onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); holdEnd(id); }}`
      `releasePointerCapture` throws `NotFoundError` when the capture is already gone — a
      very fast click, or a capture lost to a re-render — and the exception propagated out
      of the handler BEFORE `holdEnd`. The release was skipped in exactly the cases that
      needed it, leaving the drone sounding with nothing left to stop it.
      Fixed in one shared `holdButtonProps` helper rather than four copies, since the same
      fault had been pasted into each: release defensively, end the hold unconditionally,
      and treat `lostpointercapture` as a release — that is the one event that fires when
      a capture disappears without a pointerup.
      The bus Audition button had the same gap (no `onLostPointerCapture`), which would
      latch the bus into its bypassed state indefinitely. Fixed with it.
      Regression test asserts both properties and fails on the old shape.

- [x] **X26 (original entry)** **`crushBass` stuck on once, from a click.** Reported 2026-09-21: "i managed
      to get crush bass stuck once when i clicked it".
      It is a `kind: 'hold'` button (`DubDeckStrip.tsx:160`, "3-bit quantize saw drone
      while held"), driven by pointerdown/pointerup with pointer capture. A CLICK — press
      and release faster than the handlers expect, or a release that lands outside the
      captured element — can start the hold and lose the release, leaving the drone on.
      Same failure shape as X12/X13: a releaser that never runs.
      `DubBus.startCrushBass` (`DubBus.ts:5802`, `freq 55, bits 3, level 0.55`) returns the
      releaser, so check who holds it and whether `holdEnd` is reachable from every exit
      path — pointerup, pointerleave, pointercancel, and the element unmounting mid-hold.
      Intermittent, so reproduce by clicking rapidly rather than assuming one try is clean.

- [x] **X32 — CLOSED 2026-09-21.** The header row wraps (`flex flex-wrap items-center
      gap-x-2 gap-y-1`). Wrapping rather than `overflow-x-auto`: a control on a second line
      is still there to hit, while one behind a scrollbar has to be found first, which is
      the wrong trade for a surface played live. The existing order already runs most-used
      first, so what wraps is what is reached for least. Commit `8550d9bcb`.

- [ ] **X32** **Dub deck header row is not responsive and runs off the edge.** Reported
      2026-09-21 with a screenshot: DUB DECK / Bus ON / REC / STYLE / ECHO / A/B / AUTO DUB
      / EQ / BLEED / CHORUS / CLUB / QUANTIZE / DLY-VRB, with the next control ("JA...")
      cut in half at the right edge.
      Cause is in the markup, not the content: the header is
      `flex items-center gap-2 text-xs` (`DubDeckStrip.tsx` ~line 1023) with no
      `flex-wrap` and no horizontal scroll, and its parent (~line 1021) is
      `overflow-y-auto` — vertical only. So the row overflows and is simply clipped.
      Two candidate fixes, and they are not equivalent for live use: `flex-wrap` keeps
      every control reachable without scrolling but changes the deck's height as the
      window narrows, which moves everything below it; `overflow-x-auto` keeps the height
      fixed but hides controls behind a scroll the performer has to find mid-set. For a
      surface played live, wrapping is probably right, with the most-used controls ordered
      first so they stay on the first line.
      Measure at the widths that matter before choosing — the channel-strip work on the
      same day was checked at 1509 / 1280 / 1024 / 900, and this row should be too.

- [x] **X33 — CLOSED 2026-09-21 by ear**, with the capture and level work. User: "i think
      they all work now". Throw was never a capture move — it sweeps the echo's delay time
      — so what fixed it was upstream: once the channel taps actually opened, the echo tank
      had repeats to sweep. The investigation note below stands as the reason it could not
      have been fixed by raising its own gain.

- [x] **X33 (original entry)** **Throw (`delayTimeThrow`) still not obvious.** Reported 2026-09-21
      alongside Reverse: after the capture and level fixes, "backwards is obvious that it
      works now, the other two not obvious". Reverse was fixed (it lacked the
      direct-to-return path Backward has); Throw is a DIFFERENT move and needs its own
      look.
      It is not a capture at all — `throwEchoTime(target=60ms, downMs=120, holdMs=200,
      upMs=300)` sweeps the echo's DELAY TIME, which produces the pitch whoosh only if the
      echo tank already holds repeats. Fired into an empty or nearly-dry tank it changes a
      parameter and nothing sounds.
      So the question to answer first is not its level but whether there is anything in
      the echo to sweep: check `echoWet`, `returnGain` and whether repeats are audible
      BEFORE the throw. If the tank is full and it still does nothing, then look at the
      sweep range — 60ms is a long way down from a 320ms rate and may pass through too
      fast at `downMs=120` to be heard as pitch.

- [x] **X34 — FIXED 2026-09-21.** Both now go through `generatedPeak` like every other
      generated source, with presence entries of their own (`springSlam` 0.8, `springKick`
      0.95 — kick higher because it reaches the output only through the spring, while slam
      already carries a direct sub thump). The absolute multipliers stay as the move's
      internal balance between its layers; the reference carries how loud it should be
      against THIS music. Any further tuning by ear is now stable across songs.

- [x] **X34 (original entry)** **Slam and Kick are the only moves whose level ignores the music.** Found by
      audit 2026-09-21, not by ear.
      Every generated source in `DubBus` is referenced to the programme through
      `generatedPeak` so it keeps its relationship to the mix on any song — except
      `slamSpring` (`DubBus.ts` ~5034, ~5067) and `kickSpring` (~5230), which use absolute
      multipliers (`target * 0.85`, `target * 0.6`, `gain * 10.0`). So both are relatively
      LOUDER on a quiet tune and quieter on a loud one.
      That is very likely why the 2026-09-21 verdicts were "slam too loud" AND "kick not
      loud enough" at the same `amount: 1.0` — the numbers were tuned against one song.
      Fixing this properly means classifying them like the others (they are transients, so
      peak-referenced) and re-tuning the absolute values into presence numbers. Worth
      doing before any more level tuning by ear, or the next song moves the target again.
      NB the clipping guard (`directReturnHeadroom.test.ts`) constrains the direct-to-
      return paths and must keep passing after any change here.

- [x] **X35 — FIXED 2026-09-21.** `DubActions.ts` takes `beatsPerBar` from
      `DEFAULT_MUSICAL_CLOCK_SETTINGS.meter` instead of the literal 4. Third and last of
      the metre-from-a-constant copies found in one day.

- [x] **X35 (original entry)** **`quantize === 'bar'` hardcodes 4 beats per bar.** `DubActions.ts:246`:
      `beatMs * 4     // full bar (4/4)`. Third occurrence of the metre-from-a-constant
      class in one day, after `beatPhase` and `dubGrid`. `musicalClock` already exposes the
      real meter (`DEFAULT_MUSICAL_CLOCK_SETTINGS.meter.beatsPerBar`), so a bar-quantized
      throw on anything but 4/4 lands wrong. Lower impact than the other two — it only
      affects the DJ-deck throw path and only in non-4/4 — but it is the same fault and
      should go the same way.
      `AutoDub.ts:1598` (`barPos * 4`) is the same assumption; `barPos` already comes from
      the clock, so converting it is mechanical.

- [~] **X37 — CAUSE IDENTIFIED 2026-09-21: recorded dub automation, not the performer.**
      The console stack settled it. Every `reverseEcho` / `backwardReverb` / `slamSpring` /
      `throwEchoTime` in the flood arrived via
      `routeDubParameter -> AutomationPlayer.ts:467 -> TrackerReplayer`, NOT AutoDub —
      whose own fires are the far rarer `[AutoDub] ▶ HOLD` lines. The project was carrying
      recorded dub lanes and replaying that whole performance on every pass: channels
      muted from row 0, slams thrown, and the capture-silence flood following naturally
      because a muted channel puts nothing at `bus.input` to capture.
      Confirmed live at the mixer before the reload: channels 0-3 `muted: true`, no
      transient open, nothing able to restore them.
      **Not confirmed by removal.** `clear_dub_automation` (added for this) reported
      `removed: 0, musicalCurvesKept: 0` — the user had reloaded by then, and the
      automation store is in-memory, so the reload had already cleared it. The evidence is
      the stack trace plus the clean session after reload, not a before/after on the lanes.
      **Open question worth answering before calling this closed: how did those lanes get
      recorded?** If REC armed itself, or an AutoDub session wrote to automation without
      the user asking, this will come straight back. The deck showed "REC off".
      Defences added meanwhile, both independently justified: `startAutoDub` releases held
      transients before its first tick (symmetric with stop — nothing legitimate holds a
      channel at start, and a leftover mute would be captured as the user's BASELINE by
      the next move, making a one-gesture leak permanent), and the baseline registry now
      distinguishes a move's mute from the user's and can find mutes that outlived every
      transient holding them — `releaseAll` and `reapOrphans` both walk only OPEN
      transients, so neither could see the state found live.

- [~] **X37 (original entry)** **The music mutes for a pattern or two while effects keep firing.** Reported
      2026-09-21: "the music is mutet for a pattern or two and only effects fire".
      **This is not the performer resting** — an earlier reading of the same complaint as
      "a pattern of silence" was taken as periodic REST, and a phrase-arc change was made
      and then reverted when the clarification arrived. Several moves mute the DRY signal
      while held (versionDrop, masterDrop, channelMute, ghostReverb, riddimSection), so a
      hold whose release is lost leaves the music off while the wet path keeps sounding.
      **Mechanism for the DURATION, found by reading:** `reapOrphanedDubTransients` is a
      safety net that restores a channel held too long, called every AutoDub tick, and its
      own comment cites the 2026-09-18 incident where every channel sat muted. Its
      threshold was `ORPHAN_AFTER_MS = 30_000`. The longest legitimate hold is
      riddimSection at four bars, about 7.7s at 125 BPM, and a pattern at speed 12 is
      roughly fifteen seconds. So "muted for a pattern or two" is the RESCUE arriving,
      not the leak: the net worked and waited half a minute to do it.
      Lowered to 12s — clear of the longest real hold, under a pattern of damage. That
      BOUNDS a leak; it does not fix one.
      **Still to find: what leaks.** Checked and cleared: `channelMute` (ref-counted
      transient, guarded dispose), `riddimSection` (clears its skank timer, releases every
      remaining mute), and the ref counter itself — an unbalanced `end` at depth 0 returns
      null, and nested transients only restore on the last close, so overlapping drops
      cannot release each other early.
      Not yet cleared: `versionDrop`'s staggered restore schedules UNTRACKED `setTimeout`s
      up to `RESTORE_MAX_MS` (700ms) that are never cancelled, and `masterDrop`.
      The fire log now records `mutedChannels` / `mutedChannelCount` at every fire and
      release, so the next occurrence names the move rather than needing another report.
      Look for the reaper's own warning too: `[dubTransient] chN was held for too long`.

- [ ] **X36** **King Tubby goes quiet for long stretches, then only fires slam or crack.**
      Reported 2026-09-21: "long silent pauses where the persona king tubby just fire slam
      or crack etc are not uncommon".
      This is musical behaviour, not a bug in a move — the performer IS firing, it is
      choosing REST too often and then choosing from too narrow a set. Two things to
      measure before changing weights, both already recorded by the fire log:
      1. the REST ratio over a few minutes (`get_auto_dub_fire_log` counts them), against
         the 17 fires / 15 rests measured on 2026-09-19 which read as acceptable;
      2. the DISTRIBUTION of the non-REST choices — if slam and crack dominate, the
         weighted roll is being narrowed somewhere, most likely by cooldowns knocking out
         the moves with longer holds while the short triggers stay eligible.
      Note the levels work landed the same day: slam and crack are now louder than they
      were, so part of "it only fires slam or crack" may be that the others became
      relatively quieter and are simply less noticeable. Check the log before the ear.

      **MEASURED 2026-09-21 (tubby, intensity 0.55, ~48s window).** The performer is NOT
      stuck on slam. Fires: `eqSweep` x3, `springSlam` x2, `echoThrow` x2,
      `skankEchoThrow` x1, `hpfRise` x1. Gaps between fires 5-9s, i.e. 3-5 bars.
      So the report is about PERCEPTION, not selection: slam is percussive and loud —
      louder still since the same day's level work — while eqSweep, hpfRise and echoThrow
      are subtle by nature. What reads as "only slam" is slam being the only one that
      announces itself.
      **A misread worth recording.** The log shows `REST holdBars=3`, then `2`, then `1`
      on consecutive bars, which looks like rests chaining and re-extending. It is not:
      a committed REST is logged once per bar as it counts down, deliberately, so the log
      shows the decision rather than an unexplained gap (`AutoDub.ts:1671`). Reading that
      as a bug nearly produced a fix for something that works as designed.
      **Also found:** `eqSweep` is not in tubby's `weights` table at all — it comes from
      the EQ gate, not the weighted roll. A third of the observed activity is therefore a
      move the persona never chose, which matters both for tuning the weights and for
      judging what the persona is actually doing.
      Next lever to try, no code needed: raise `intensity` from 0.55 and see whether the
      gaps close. If it still reads as slam-then-nothing at 0.8, the fix is to make the
      quiet moves read as events, which is levels, not scheduling.
      Related but distinct from X25 (levels) and from the 2026-09-19 idle bug, which was a
      decision-rate fault and is closed.

### Hot-path audit 2026-09-21 — audible-discontinuity findings

Delegated audit of every dub audio path that a control can touch live. Two acted on
immediately; the rest are logged here in the auditor's priority order. Numbers are its
line references, spot-checked before being written down.

- [x] **H2 — `startPingPong` was an unbounded feedback ring. FIXED 2026-09-21.**
      Topology is `return_ -> inputGain(1.0) -> delayL/R -> merger -> wetGain -> return_`,
      a closed loop through the OUTPUT with cross-feed recirculating inside it. Round-trip
      gain is `2*wet/(1-fb)`: 2.8 at the Mad Professor values (fb 0.5, wet 0.7), about 2.4
      at the shipped defaults. Every pass ~9 dB louder than the last, into clipping within
      seconds — and AutoDub's madProfessor persona fires it unattended.
      Nothing bounded it, and landing on `return_` puts it past the input clip and the
      sidechain. Contrast `extFeedbackGain`, which is both clamped and backed by the
      `extFeedbackLimit` soft-clip governor.
      `inputGain` is now scaled so the ring settles at 0.8 — below unity so it decays;
      at exactly 1.0 it would sustain forever, which is a drone rather than a delay.

- [x] **H13 — the direct-to-return headroom guard had a hole. FIXED 2026-09-21.**
      The regex matched only `x.gain.value = expr * N;` and missed bare literals, so
      `toReturn.gain.value = 1.0` (fireNoiseBurst), the ping-pong `wetGain` and
      `startStereoDoubler`'s `wetGain` were all uncovered.
      Widened — and the rule itself was wrong, not just the pattern. Unity is fine where
      the envelope already went through `generatedPeak`: the programme reference has
      decided the level and the tap just passes it along. A blanket "nothing at unity"
      rule would have forced the snare crack's gain down and silently undone the fix the
      user had just approved. The guard now fails on anything ABOVE unity, and for
      anything AT unity requires a `generatedPeak` upstream.

- [x] **H1 — FIXED 2026-09-21.** **Echo Wet slider steps four engines' dry/wet gains.** `SpaceEchoEffect.ts:284`,
      `RE201Effect.ts:327`, `AnotherDelayEffect.ts:370`, `RETapeEchoEffect.ts:373` — all
      bare `.value =`. Driven from `DubBus.ts:3697` on every `setSettings`, so every drag
      pixel of DubBusPanel's Echo Wet is a step. One shared helper in `DubEchoEngine.ts`
      would cover all four adapters.
- [x] **H3 — FIXED 2026-09-21.** **Post-echo Drive rebuilds a 4096-point WaveShaper curve per pointer event**
      (`DubBus.ts:3902`, `makeTapeSatCurve` at :209). Transfer-function step plus 8192
      `Math.tanh` on the main thread, every event. Pre-build a ladder and crossfade.
- [x] **H4 — FIXED 2026-09-21.** **Vinyl slider hard-switches two wet gains 0 to 1** (`DubBus.ts:6400`,
      `VinylNoiseEffect.ts:191`, `ToneArmEffect.ts:198`). This chain is post-master on the
      WHOLE MIX, so it is a full-scale step, not a send. Un-debounced at
      `DubDeckStrip.tsx:589` — ~21 postMessage writes per pixel.
- [x] **H5 — FIXED 2026-09-21.** **Per-channel filter dropdown changes `BiquadFilterNode.type` live**
      (`PerChannelDubFx.ts:117`). Coefficients change in one sample while state persists —
      click. Every other setter in that file already ramps.
- [x] **H6 — FIXED 2026-09-21.** **Tape Sat mode swaps the WaveShaper curve with no mute** (`DubBus.ts:3840`).
      The same write inside `_applyCharacterPreset` IS protected by the warmup hold; only
      the `setSettings` path is bare.
- [x] **H7 — FIXED 2026-09-21.** **Club Sim swaps a live convolver buffer** (`DubBus.ts:3968`), truncating the
      in-flight tail, and on disable disconnects in the same tick as a `setTargetAtTime`
      that never reaches zero (`:3947-3963`), cutting a 2.5s tail at full gain.
      `setPlateStage` already has the correct crossfade-and-defer pattern to copy.
- [x] **H8 — FIXED 2026-09-21.** **Channel send crossing zero: isolation flips before the 20ms ramp lands**
      (`ChannelRoutedEffects.ts:503`, `:470`). Hard cut on the way down, 20ms hole in the
      dry mix on the way up.
- [x] **H9 — FIXED 2026-09-21.** **`DJSamplerPanel.tsx:120` pushes the whole dubBus object un-debounced**,
      bypassing the 50ms/100ms debounces the other two mirrors have. Worse: hold moves
      (`ringMod.ts:26`, `voltageStarve.ts:24`) call `setSettings` directly, and the next
      mirror push turns the held effect back OFF mid-gesture. Echo rate is protected from
      exactly this by `beginRateOverride`; the colour stages are not.
- [x] **H10 — FIXED 2026-09-21.** **`setSettings` ramps collide with in-flight move ramps** — no
      `cancelScheduledValues` before ~10 `setTargetAtTime` calls. Touching FX WET during a
      held Tape Stop jumps.
- [x] **H11 — FIXED 2026-09-21.** **`wireMasterInsert` steps the insert envelope to 0** (`DubBus.ts:4248`) —
      instant full-mix cut. Its own mirror `unwireMasterInsert` already ramps; copy it.
- [x] **H12 — FIXED 2026-09-21.** **`modulateFeedback` uses the no-ramp panic path for musical throws**
      (`DubBus.ts:4843`). A +0.15..+0.35 step inside a live delay loop.
- [x] **H14 — FIXED 2026-09-21.** **Teardown races** — `_swapEchoEngine`'s timeout has no `_disposed` check
      (`DubBus.ts:963`), nor does `setChainOrder`'s (`:6340`); `dispose` never clears
      `masterInsertPending`.
- [x] **H15 — CLOSED 2026-09-21 by reading the DSP, no listening test needed.**
      The question was whether the WASM smooths internally. It does, and explicitly:
      `fil4-wasm/src/filters.h:37` (`proc`) ramps both the frequency coefficient and the
      gain across the block — `d1 = (_s1 - s1) / k`, `da = (_a - a) / k` — and clamps each
      to a factor of two per block, so a jump takes several blocks rather than one sample.
      `fil4_wasm.cpp:104` passes **unity** for a disabled band instead of skipping it,
      with the comment "so the section interpolates back to flat gracefully", and the
      shelves go through `iir_interpolate`.
      So the 16-50 ms timer writes are safe, and the band enable flag crossing +/-0.2 dB
      is a gain interpolation to unity, not a switch. Structural answer, better than an
      ear: it holds for every gain, every rate and every listener.

- [ ] **H15** **Unverified: Fil4 EQ coefficient writes on 16-50ms timers** with no ramping
      or coalescing on the JS side, and band enable flags flickering as gain crosses
      +/-0.2 dB. Whether the WASM smooths internally could not be read. Needs a listening
      test before being called fine or broken.
- [x] **H16 — FIXED 2026-09-21.** The emoji is out of the mic label (project rule);
      `setSettings({})` in `wireMasterInsert` now passes the settings the master path
      depends on, since `{}` short-circuits and the call did nothing, leaving the master
      tone EQ flat until an unrelated write arrived; and `masterDrop`'s restore guard
      dropped from `< 0.05` to `<= 0.0005`, because the snowball case it protects against
      is exactly zero and the old threshold restored a genuinely quiet master to FULL
      SCALE on pad release — a loud surprise on a live rig.

- [x] **H16 (original entry)** **Minor** — `setSettings({})` in `wireMasterInsert` is a dead call (empty
      object short-circuits at `:3521`), so master tone EQ stays flat until the next real
      write; `masterDrop.ts:90` restores a genuine sub-0.05 master gain to full scale;
      DubBusPanel uses raw `<input type=range>` rather than the project's `Knob`;
      `DubDeckStrip.tsx:1247` has an emoji in a UI label against the project rule.

- [~] **X31 — THE LEDGER'S HYPOTHESIS IS DISPROVEN. MEASURED 2026-09-21.**
      The bare `AudioParam.value =` writes this entry points at (`DubBus.ts` bassShelf /
      midScoop / sweepLfo / sweepOutput) are **constructor-time**, executed while the graph
      is being built and before any audio flows. Every one of those parameters is already
      ramped on the live path via `rampBiquadParam` / `_settle`. Fixing what this entry
      described would have changed nothing.
      **What was measured instead.** A meter on `DubBus.setSettings` (calls, total, max,
      peak-per-second), surfaced through `get_dub_bus_state.settingsMeter`. Twelve store
      writes in a burst arrive at the bus as **ONE** call costing **0.69 ms** — the mirror
      is already coalesced, so the settings path is not being hammered at pointer rate
      either. One 16.08 ms outlier appeared on the first write after enabling the bus,
      which is the remaining thread to pull.
      **Open:** needs a real drag. Drag a BUS slider for ~5 s, then read `settingsMeter`
      and `get_frame_stats`. A high `peakPerSecond` with a milliseconds `maxMs` is
      main-thread contention; a low one means the crackle is in the audio path and the
      meter has ruled the control path out. Do not guess a third time.

- [ ] **X31** **BUS tab sliders crackle while dragged — bad for live dubbing.** Reported
      2026-09-21 with a screenshot of BASS / MID / WIDTH / sweep / RATE.
      Very likely zipper noise from stepped `AudioParam.value` assignment: those settings
      are written as bare `.value =` rather than ramped, so each drag event is a
      discontinuity in the signal. `DubBus.ts` lines 1618-1620 (`bassShelf` frequency / Q /
      gain), 1627-1629 (`midScoop`), 1808 (`sweepLfo.frequency`), 1822
      (`sweepOutput.gain`). The same file already has `rampBiquadParam` and uses it on the
      `merged` settings path around line 3672, so the fix is to route these through it
      rather than to invent smoothing.
      Worth checking whether `setSettings` is also being called per drag event and doing
      more than parameter writes — a rebuild per pointermove would crackle whatever the
      ramping does. The deck debounces `setDubBusSettings` (`DubDeckStrip` ~line 585) but
      the BUS tab's own sliders call `setDubBus` directly on every change.
      Verify by ear on a sustained tone, not by meter: zipper noise barely moves RMS.

- [x] **X28 — CLOSED 2026-09-21 by ear.** User: "i think they all work now this really
      added phatness to the dubs!" Three separate causes, none of them the one first
      suspected:
      1. the capture ring was full of zeros and the guard tested its LENGTH, so the log
         read healthy while the move played silence;
      2. the engine's copy of the channel sends was never seeded from the store, so no
         channel tap opened and nothing reached `bus.input`;
      3. once audio was flowing, playback was still buried — a capture taps one channel's
         send, about a quarter of programme level, and `reverseEcho` additionally routed
         ONLY into the echo so the reversed source never reached the output at all.
      Backward came good after (1) and (2); Reverse needed (3) as well, which is why it
      lagged behind and why "one of them works" was the clue that found it.

- [x] **X28 (original entry)** **Reverse, Backward and Throw seem dead.** Reported 2026-09-21 while playing
      `amanda.ahx` (Hively engine).
      Not a missing precondition: sends were up (ch0-3 at 0.45) and taps registered
      [0,1,2,3], so the `needsSend` gate was satisfied.
      **Hypothesis, untested.** These three are the only reported-dead moves that CAPTURE
      bus audio rather than generate it — `reverseEcho`, `backwardReverb` and
      `delayTimeThrow` all snapshot a ring buffer fed from `bus.input`
      (`_ensureReverseCapture`). Every move the user reports as working (slam, kick,
      crack, sub) GENERATES its own sound and needs no input. If Hively's audio never
      reaches `bus.input`, that split is exactly what you would hear.
      Supporting hint: `backwardReverb` has an explicit
      "empty ring buffer (no audio reached bus.input yet)" abort path, and the user's own
      earlier console log shows it working — `snapshot received — frames=38400` — on a
      CLASSIC (libopenmpt) song.
      **HYPOTHESIS DISPROVED 2026-09-21.** User: "they seem dead in mod as well". Dead on
      BOTH engines, so the capture tap being engine-specific is not the cause.
      Also ruled out:
      - the `needsSend` gate — sends were 0.45 with taps [0,1,2,3] registered;
      - `anySend` — reads the same live mixer values, so it was true;
      - the router's quantize defer — setting `throwQuantize: 'off'` changed nothing,
        which also clears today's `dubGrid` speed change of suspicion.
      The master meter is the wrong instrument for these: a reversed tail or an echo-time
      sweep barely moves RMS, so "no level change" is not evidence either way. Two
      separate measurements of `backwardReverb` moved the peak by less than the programme
      varies on its own.
      **ROOT CAUSE FOUND 2026-09-21, and the diagnostic was the fix's first step.**
      The console looked healthy — `snapshot received — frames=38400` — because the
      guard was `if (!frames)`, which tests the ring's LENGTH, not its content. 38400 is
      exactly 0.8s at 48kHz; the ring was the right size and full of zeros. Adding a peak
      measurement turned the same click into
      `abort — captured SILENCE (peak=7.51e-6); nothing is reaching bus.input`.
      Underneath: `rebuildDubConnections` picks which channels to reconnect from
      `channelDubSendValues`, the ENGINE's copy of the sends, skipping any at zero. The
      mixer store's values survive a song load; that array does not. An engine that
      believes every send is zero opens no channel tap, so `bus.input` is silent —
      invisible to moves that generate their own sound, fatal to the three that capture
      it. Same two-copies-of-one-fact shape as the rest of this sweep.
      Fixed by seeding the engine's values from the store before the reconnect guard,
      without overwriting a value the engine already holds (that one is live while a move
      holds a channel open). Guarded by `captureSilence.test.ts`, including the ordering —
      seeding after the guard would change nothing.
      **Verified only in part.** A capture with a send raised through the proper setter now
      succeeds (no SILENCE warning). The divergence itself — store set, engine not — was
      NOT reproduced end to end, so the seeding path is reasoned and unit-guarded rather
      than observed failing and then passing.

      **Superseded: next step was one line in the browser console.** `backwardReverb` logs its own
      progress at `console.log`, which `get_console_errors` filters out, so it has to be
      read in the browser: `▶ captureDur=` then `snapshot received — frames=N` means it
      fired and the fault is level; `abort — empty ring buffer` means nothing reached
      `bus.input`; `timeout — worklet did not reply within 1s` means the capture worklet
      is not answering; `ignored — capture node missing` means it was never created; and
      silence means the click never reached the move at all. Each points somewhere
      different, so get that line before changing anything.

- [x] **X29 — CLOSED 2026-09-21.** The list switches rendering mode rather than being
      fixed per row, since a per-row fix would damage the ordinary case.
      `lib/instruments/asciiArtNames.ts` decides: a name is art-like when it is mostly
      drawing characters OR holds an interior run of spaces, and a LIST is a picture only
      on a RUN of three such names — one instrument called `--->` is not a drawing.
      In art mode: `whitespace-pre`, no truncation, no badges (same CSS mechanism as the
      X24 narrow-panel rule), and the rows share a width (`w-max min-w-full`) inside a
      horizontally scrollable list so the picture scrolls as ONE image. Per-row scrolling
      would shear the drawing apart, which is the detail worth keeping. 18 tests.
      Commit `8550d9bcb`.

- [ ] **X29** **ASCII art in instrument names renders badly.** Many modules spell pictures
      across consecutive instrument names (screenshot 2026-09-21, jennipha/daddytwang).
      The list is already `font-mono`, but three things fight the art: names are
      `truncate`d (added 2026-09-21 to stop mid-glyph clipping), runs of spaces collapse
      without `whitespace-pre`, and the row is a flex box with badges competing for width.
      A per-row fix would break the ordinary case, so this wants a mode: when a song's
      names look like art, render the block `whitespace-pre`, full width, no truncation,
      no badges. Detecting "looks like art" is the interesting part — a high ratio of
      punctuation to letters across several consecutive names is a reasonable start.

- [x] **X30 — FIXED 2026-09-21.** The message blamed OffscreenCanvas and WebGL2 in a
      session whose own report said both were supported, which was the tell.
      The worker's 'booting' heartbeat is delivered by the MAIN thread's event loop, so a
      blocked main thread (86 MB CED model, WASM compiles) sees no heartbeat whether or
      not one was sent — and `watchdogStage1` could not tell that from a module that never
      loaded. It now also asks how much of its own time the main thread got
      (`MainThreadLiveness`) and declines to accuse the worker below 70% of its
      heartbeats; the share goes into the report either way, so the next occurrence names
      which of the two faults it was. Absent a measurement the old behaviour stands.
      Commit `799b32985`.

- [ ] **X30** **Pattern editor worker never loaded.** Seen in the user's console
      2026-09-21: "Tracker Worker: Pattern editor failed to start (worker never loaded
      after 12 s)". Reported environment says `offscreenCanvasSupported: true`,
      `wasmSupported: true`, `audioContextState: running`, so the message's own suggested
      cause does not apply. Appeared after a song load, in a long-running dev session with
      repeated HMR reloads (see X27), so check whether a stale worker from a previous load
      is the reason before treating it as a fresh-boot fault.

- [~] **X10 — A REAL CLIPPING SOURCE FOUND AND FIXED 2026-09-21.** The 2026-09-18 pass
      could not reproduce it (peak 0.86, no clipping) and left it open on the strength of
      "most of the time". The level work found the cause by accident: `springSlam`
      measured a master peak of **1.072** against a 0.492 programme baseline — over full
      scale from a single move.
      Cause: a layer connected straight to `this.return_` bypasses the bus input clip and
      the sidechain, so its gain lands on the output as written. Slam had TWO such paths,
      `thumpToReturn` at `target * 2.0` and `shangToReturn` at `target * 1.5`, both
      starting in the same instant. The written multipliers understate it — `bp` and
      `bright` BOTH feed the shang node, so they sum, and `bright` is a peaking filter at
      +9 dB.
      Now 0.85 and 0.6. Re-measured at peak 0.647 (4.2x a 0.155 baseline), no clipping.
      Guarded by `directReturnHeadroom.test.ts`: no direct-to-return gain may reach unity,
      and the two slam layers must sum below full scale. Paths into the SPRING are
      deliberately exempt — bounded by the spring's wet level, which is why
      `shangToSpring` at 3.0 and the kick impulse at 10.0 are fine.
      **Still open**: this is one confirmed source, not proof it was the only one. Report
      said "most of the time", and a single move firing cannot account for that on its own.

- [x] **X27 — FIXED 2026-09-21.** Nothing in the codebase handled HMR at all: Vite
      invalidates a changed module and everything above it, the stores sit transitively
      above the engine, so they re-executed and `create(...)` rebuilt each one at its
      defaults. The song was never unloaded — the store holding it was replaced.
      `lib/dev/keepAcrossHmr.ts` carries the DATA of the seven song-holding stores over a
      reload and deliberately not the functions, since a store's actions live in its state
      and restoring an old snapshot wholesale would reinstate the OLD closures.
      Two things learned: Vite keeps ONE dispose callback per module, so a second
      registration replaces the first silently (one callback walking a registry instead);
      and a hot context is not always Vite's — the test runner hands over a partial one,
      and reading `data` off it threw at module scope, which turned 48 store-import tests
      red and is now its own regression test. Commit `1214abc56`.

- [ ] **X27** **HMR wipes the loaded song during a dev session.** Observed repeatedly
      2026-09-21: editing `DubBus.ts` while playing reset the project to an empty default
      ("Untitled", 1 pattern, editorMode classic) with the transport still running, which
      presents as sudden silence. Dev-only, but it wastes a listening session and it
      imitates X23 closely enough to have cost a wrong diagnosis once already —
      `get_song_info` is what tells the two apart.

- [ ] **X10** **MEASURED 2026-09-18 — not reproduced at master, one real finding instead.**
      Perry preset, "world class dub" playing, all four channel sends at 0.5, `echoBuildUp`
      held: master peaked **0.86**, RMS 0.16-0.22. No clipping. The handoff's 1.00-1.03
      readings predate the X9 send-ratchet fix (pinned sends feeding the echo continuously)
      and the X10 shelf-trim work, so the condition that produced them is likely gone —
      but this was ONE tune at ONE send level, and the report says "most of the time", so
      it is NOT closed on that. Perry's `masterBassShelfDb: 9` is the largest boost in the
      chain and remains the first place to look if it recurs.
      **Found while measuring, fixed separately (`ea852e738`):** a dub send set while the
      tab is in the BACKGROUND never reached the store. The write is rAF-batched and a
      browser suspends rAF in a hidden tab, so the audio changed and the state did not —
      faders read stale on return, and a project saved meanwhile recorded the wrong sends.
      That is also why `get_dub_bus_state` kept reporting `dubSend: 0` on channels that
      plainly had live taps; read `registeredChannelTaps`, not `channelDubSends`, when the
      tab is not focused.

- [ ] **X10 (original entry)** **Dub bus clips and distorts most of the time.** Reported
      2026-09-18. Not yet investigated. Measure before touching anything:
      `__dubBus().getDiagnosticSnapshot()` reports every boosting stage next to
      its mirror plus `inputRms` / `returnRms`, and the handoff records peaks of
      1.00-1.03 at master 0 dB on the Perry preset (`returnGain 0.9`,
      `extFeedbackGain 0.035`, `masterBassPunchDb 8`). Note X9 makes this worse
      while it stands — pinned sends feed the echo continuously — so re-measure
      after X9 lands before concluding anything about gain staging.

- [x] **X3** `extFeedbackEqDb` is a +1 dB boost inside the ext loop with no
      mirror. Harmless now the limiter is in place and the tap moved, but it is
      the same class of defect as the hpfResonance mirror. Low priority.

      **CLOSED 2026-09-18.** The "same class as the hpfResonance mirror" reading was only
      half right, and acting on it would have been wrong: `extFeedbackShelfComp` mirrors
      the bass shelf because that shelf is applied on the FORWARD path and the loop would
      apply it a second time. This EQ is the loop's OWN deliberate colour — mirroring it
      deletes the feature.
      What was missing is a BUDGET, not a mirror. The fader was clamped to 0.85 with the
      EQ uncounted, so the real round-trip gain at the EQ centre was 0.85 x boost:
      **+1 dB = 0.954, +3 dB = 1.20 — over unity** in a narrow band while the fader still
      read "safe". `src/lib/dub/extFeedbackCeiling.ts` shrinks the ceiling by the boost so
      the worst case stays at 0.85 however the EQ is set, and recomputes when EITHER
      control moves. Only boosts count — a cut quietens one frequency, and spending that
      as extra feedback would hand back headroom everywhere else. 12 tests.
- [x] **X4** **PUSHED 2026-09-18** — 28 commits, `a3e529d68..a2d26356c`. The full pre-push
      gate passed (type-check, test:ci, test:compliance).
      **The DEPLOY did not land, and the cause is not code.** Live is still
      `buildHash 41dd4756`, timestamped 2026-08-23 — 26 days stale. Every GitHub Actions
      run since has failed in under 10 seconds with:
      *"The job was not started because recent account payments have failed or your
      spending limit needs to be increased."*
      So the pipeline has been dead on BILLING since August, and every "deploy" in that
      window was a no-op. Nothing in the repo can fix it: it needs the account's
      Billing & plans page. Until then, `git push` stores the work safely on GitHub and
      changes nothing about what `devilbox.uprough.net` serves.
      Note for whoever checks next: `gh` was authenticated as `johanBMS`, which has no
      access to `spotUP/DEViLBOX` and returns a bare 404 for every runs query — that is
      what made this look like missing permissions rather than a billing stop. Switched
      the active account to `spotUP`.

      **DEPLOYED MANUALLY 2026-09-18.** Live is now `buildHash 92428df4d`, build 7110 —
      the first update since 2026-08-23. Route, for the next time CI is down:
      `npm run build` (the CED model is already in `public/models/ced/`, so the workflow's
      download step is not needed), then rsync `dist/` straight into the server's web root
      over SSH as root:
      `rsync -a -c --delete dist/ root@devilbox.uprough.net:/var/www/devilbox-dist/`
      That IS the last step of `/opt/devilbox-deploy.sh`; doing it directly skips the
      GitHub Release round trip, which matters because the tarball is 1.2 GB.
      Use `-c`: a fresh build resets every mtime, so without checksum comparison rsync
      re-sends all 1.9 GB instead of the 607 MB that actually changed.
      **Do NOT replicate the workflow's `gh release delete latest`** — that release also
      holds the desktop installers (`.dmg`, `.exe`, `.AppImage`, `.deb`), which cannot be
      rebuilt locally for every platform. Replace the single asset if you need to.
      `--delete` removed 493 files, all stale fingerprinted `assets/*-HASH.js` bundles.
      Verified live: `version.json` matches HEAD, and the index's `main-DL8MuXZa.js`
      resolves 200 at exactly the built byte size.

- [ ] **X4 (original entry)** Six commits unpushed. Nothing verified by ear yet, so nothing has
      gone live. Push after X2 passes a listening test.

### Reusable

`window.__dubBus()` (dev builds only) exposes the live bus.
`__dubBus().getDiagnosticSnapshot()` now reports every boosting stage next to
its mirror, plus `inputRms` / `returnRms` level probes and the actual tap gain
values. This is the tool for any future runaway — and it is what the
reviewer's safety governor (plan AI-20 / Gate G) should be built on.
