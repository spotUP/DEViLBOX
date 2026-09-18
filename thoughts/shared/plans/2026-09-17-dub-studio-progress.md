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

Running count: **18 of 51 done.**

**The denominator was wrong until 2026-09-18.** The header said "of 36" from the day this file
was written and was never updated as sub-items (F1a, F1c, F2a-F2e, T1-T3, the X series) were
added. Counted from the checkboxes: 17 ticked, 34 open, 51 total (X9 and X10 added 2026-09-18). If you change the item list,
recount — do not trust this sentence either.

### Gate status

| Gate | State | Notes |
|---|---|---|
| A — baseline lock | **closed** | A1 |
| Pre-work — cell encoding + skank | **closed bar T1 and F3** | F1, F1a, F1c, F2, F2a-e, T2 done |
| B — musical clock | **closed** | B1, T3 |
| C — event model | **closed** | C1, C2, C3. DJ adapter for C1 deliberately not written |
| D — performance context | **closed** | D1 |
| E — intention + REST | open | E1, E2, E3 |
| F — gesture engine | open | F4 |
| G — wet energy | open | G1 |
| H-L — musical behaviour | open | H1, I1, J1, K1-K4, L1, L2, AE1 |
| M-O — record, verify, release | open | M1, N1-N4, O1, O2 |
| X — user-reported open threads | 1 of 11 | X1 closed |

### Debt carried, not hidden

- **T1 is open while F1 and F1a are shipped.** The skank reshape went in without its regression
  test, against the house rule that a bug fix ships with a test that fails before and passes
  after. Write it before Gate D, or accept it knowingly.
- **X2 — the skank has still never been heard.** Shipped and tested by measurement only.

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
- [ ] **T1** Regression: `skankEchoThrow`'s principal repeat lands at beat+0.75, `skankFloatThrow`
      at beat+1.5. Must fail before the fix.
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
- [ ] **F3** Label persona parameter values with evidence level (L1/L2/L3) in `types/dub.ts`
      comments and in `DUB_SYSTEM.md` §3.2. Documentation-only; no audio change.

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

- [ ] **E1** Intention layer: `REST · ACCENT · ANSWER · SPACE · BUILD · DROP · TEXTURE ·
      TRANSITION · RESET`. Intention is chosen **before** the move.
- [ ] **E2** REST as an explicit multi-bar decision, not a failed dice roll. Reviewer calls this
      one of the highest-priority changes — dub depends on contrast.
- [ ] **E3** Performance state machine `LISTEN → ANTICIPATE → PREPARE → ACT → RIDE → RELEASE →
      LISTEN` + `BUILD`/`DROP`/`RECOVER`. One machine shared by all personas.

## GATE F — GESTURE ENGINE

- [ ] **F4** `beginGesture` / `updateGesture` / `endGesture` / `cancelGesture` with attack, hold,
      release, ramp, sweep, rebound, quantized start + release. Transport stop cancels; seek
      cancels stale gestures. DubRouter stays the execution layer.

## GATE G — WET ENERGY

- [ ] **G1** Per-move metadata `wetCost` / `duration` / `feedbackCost` / `spectralDensity` /
      `lowFrequencyRisk`; runtime accounting with decay. Compatible gestures may layer; dense
      combinations restrained. **Hard safety governor retained, persona-independent.**

## GATE H–L — musical behaviour

- [ ] **H1** Musical targeting from `MusicalChannelProfile` (Gate H).
- [ ] **I1** Arrangement intelligence: `arrangementImportance` → `dropBehavior`; version drop
      protects foundation, supports throw-then-mute, arrangement-aware restoration (Gate I).
- [ ] **J1** Consequence model: `targetAudibility` / `contrast` / `masking` / `wetEnergyChange` /
      `feedbackChange` / `structuralImpact` feeding the next decision (Gate J).
- [ ] **K1** Personas as behavioural profiles — activity / depth / risk / restraint, anticipation,
      patience, target + intention preference, gesture length, release style, feedback/filter/drop
      appetite, timing variance, novelty vs repetition preference. Replaces the single overloaded
      `intensity` scalar (Gate K).
- [ ] **K2** Contextual variance replacing `rng() < variance * 0.1` — Perry surprises *because the
      musical situation allows it*.
- [ ] **K3** Call and response over musical time.
- [ ] **K4** Repetition vs novelty: distinguish intentional repetition from algorithmic
      repetition.
- [ ] **L1** Musical return quantization — `riddimSection`'s 60%-of-hold becomes next beat /
      eighth / bar / phrase boundary / next relevant event, chosen by intention (Gate L).
- [ ] **L2** Phrase intelligence: normalized `phrasePosition` from `MusicalClock`; persona arcs
      keep their shapes but stop depending on `bar % 16`.
- [ ] **AE1** Split Auto EQ into technical-assistive vs musical-gesture; spectral driver leaves
      the core brain.

## GATE M–O — record, verify, release

- [ ] **M1** Performance recording with intention/target/gesture metadata, additive only —
      save/load compatibility preserved, replay reproduces the performance. Depends on F2.
- [ ] **N1** Deterministic offline performance simulator (project, BPM, metre, phrase length,
      persona, seed, duration → bar-by-bar decision log). Primary tuning environment.
- [ ] **N2** AI performance tests: REST, TARGET, PREDICTION, WET-ENERGY, CONSEQUENCE, DROP, SEEK,
      PERSONA.
- [ ] **N3** Musical regression scenes A–G (sparse roots riddim, dense digital dancehall,
      vocal+horn, four-channel tracker, long-form dub, unusual metre, sparse arrangement) with
      captured move count / rest duration / target distribution / wet-energy + feedback curves.
- [ ] **N4** 30-minute deterministic run: no spam, no stuck gestures, no runaway feedback, no
      energy accumulation, no stale predictions, no performer-attributable memory growth, no
      transport drift.
- [ ] **O1** Performance monitor UI — persona / state / intention / target / phrase / wet energy /
      last move / next event + concise `WHY?` factors.
- [ ] **O2** Human listening review. **Never self-certify.** Ask: does it leave space, recognize
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
- [ ] **X2** The skank capture (`00bfd0a6b`) has never been heard. amanda.ahx
      cannot validate it — no per-channel isolation in practice (see X1), and
      AHX is monophonic per channel so the "skank" is a single-note stab.
      Needs a `classic` (MOD/XM/IT) reggae tune — the modland "jah cometh in
      dub" download is the intended vehicle.
- [ ] **X5** **Dub-send fader moves are not recorded.** Reported 2026-09-17.
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
      Shape of the fix: make `dub.channelSend.ch<N>` a first-class automatable
      parameter and have the recorder capture continuous writes as curve points
      (rAF-batched — the setter already batches at ~60/s for exactly this
      reason), rather than bolting a second recording path next to DubRecorder.
      Check `AutomationBaker` and the `.dbx` round-trip cover it before closing.

- [ ] **X6** **Bus audition mode — a solo button for the send.** Raised
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

- [ ] **X7** **Dub lane visuals: static, and shown on every pattern.** Reported
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

- [ ] **X8** **Stale MCP tool metadata.** `fire_dub_move`'s description still
      lists 27 valid moveIds from the April era — no skankEchoThrow,
      skankFloatThrow, versionDrop, riddimSection, combSweep, hpfRise,
      madProfPingPong. It accepts them fine (the router takes any registered
      id) but an agent reading the tool description would not know they exist.
      Same staleness class as the manual chapters in X-notes.

- [~] **X9** **Store-level dub sends ratchet to 1.0 and stay there.** FIXED in code,
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
      Likely also the mechanism behind the §5 audio death: `ghostReverb` global
      mutes every sending channel, and a failed restore leaves the module muting
      every channel at the source, which is exactly `effectiveMainMask`
      rendering silence.
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

- [ ] **X10** **Dub bus clips and distorts most of the time.** Reported
      2026-09-18. Not yet investigated. Measure before touching anything:
      `__dubBus().getDiagnosticSnapshot()` reports every boosting stage next to
      its mirror plus `inputRms` / `returnRms`, and the handoff records peaks of
      1.00-1.03 at master 0 dB on the Perry preset (`returnGain 0.9`,
      `extFeedbackGain 0.035`, `masterBassPunchDb 8`). Note X9 makes this worse
      while it stands — pinned sends feed the echo continuously — so re-measure
      after X9 lands before concluding anything about gain staging.

- [ ] **X3** `extFeedbackEqDb` is a +1 dB boost inside the ext loop with no
      mirror. Harmless now the limiter is in place and the tap moved, but it is
      the same class of defect as the hpfResonance mirror. Low priority.
- [ ] **X4** Six commits unpushed. Nothing verified by ear yet, so nothing has
      gone live. Push after X2 passes a listening test.

### Reusable

`window.__dubBus()` (dev builds only) exposes the live bus.
`__dubBus().getDiagnosticSnapshot()` now reports every boosting stage next to
its mirror, plus `inputRms` / `returnRms` level probes and the actual tap gain
values. This is the tool for any future runaway — and it is what the
reviewer's safety governor (plan AI-20 / Gate G) should be built on.
