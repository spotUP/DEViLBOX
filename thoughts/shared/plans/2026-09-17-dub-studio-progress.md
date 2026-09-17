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

Running count: **1 of 36 done** (Gate A closed).

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

- [ ] **F1** **Reshape `skankEchoThrow` from a hold into a capture.** Root cause of the user's
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
- [ ] **F1a** `skankFloatThrow` = the 3:2 / 1.5-beat float, same capture shape, kept as a colour.
- [ ] **F1c** Dry-duck composition: use the existing `DubMoveChain` (throw + brief `channelMute`)
      rather than building dry reduction into the move. No new mechanism.
- [ ] **T1** Regression: `skankEchoThrow`'s principal repeat lands at beat+0.75, `skankFloatThrow`
      at beat+1.5. Must fail before the fix.
- [ ] **F2** Add slot pair 41/42 (`DUB_EFFECT_GLOBAL_X2` / `_PERCHANNEL_X2`); append `hpfRise`,
      `madProfPingPong`, `combSweep`, `versionDrop`, `skankEchoThrow`, `riddimSection`,
      `skankFloatThrow` to `DUB_MOVE_TABLE`; raise `encodeDubEffect`'s guard 32 -> 48; bump
      `DUB_MOVE_TABLE_VERSION`. **Append only, never reorder** — index is the on-disk contract.
- [ ] **F2a** Extend `DubEffectScanner` range (`DUB_EFFECT_MAX` 40 -> 42). **Independent limit —
      new slots do not fire until this changes.**
- [ ] **F2b** Scanner only reads `effTyp` and `effTyp2`, but `TrackerCell` carries `effTyp3`..
      `effTyp8`. A dub effect authored in columns 3-8 never fires. Decide: scan all 8, or document
      columns 1-2 as the supported surface.
- [ ] **F2c** **Live display bug, pre-existing:** `lib/xmConversions.ts:246` checks
      `effTyp >= 36 && effTyp <= 38`, missing slots **39/40 that already ship** — moves 16-31 in
      cells render as a wrong character instead of `Z`. Fix to cover 36-42. (Both renderers,
      `TrackerCanvas2DRenderer:71-75` and `TrackerGLRenderer:158-162`, map 36-40 correctly and need
      41/42 appending.)
- [ ] **F2d** `.xm` export silently drops every dub cell — `XMExporter` reads the legacy
      `cell.effect` string field, never `effTyp`. Correct behaviour (XM has no dub slot) but
      undocumented. Document it; do not "fix" it.
- [ ] **F2e** Manual documentation is stale: `data/manualChapters.ts` still describes slots as
      33/34/35, claims moves 16+ "cannot be encoded", and lists Prince Jammy's voicing as
      `gatedFlanger`. Update to 36-42, 43+1 moves, `jammy`.
- [ ] **T2** Round-trip every move: encode -> decode -> same moveId + channel; append-only ratchet
      (`DUB_MOVE_TABLE.length === DUB_MOVE_TABLE_VERSION`); and a save/load/replay regression
      covering all seven newly-encodable moves. **Gate M does not close until this passes.**
- [ ] **F3** Label persona parameter values with evidence level (L1/L2/L3) in `types/dub.ts`
      comments and in `DUB_SYSTEM.md` §3.2. Documentation-only; no audio change.

## GATE B — MUSICAL CLOCK

- [ ] **B1** `MusicalClock` — `beatsPerBar`, `rowsPerBeat`, `phraseBars`, `currentBar`,
      `currentBeat`, position-within beat/bar/phrase, `nextBeat`/`nextBar`/`nextPhraseBoundary`.
      Defaults 4/4, 4 rows/beat, 16-bar phrase so current behaviour is bit-identical.
      Constraint: view of transport, never a second transport. Rows/beat is derivable as
      `24 / ticksPerRow` (speed 6 → 4 rows/beat → 16 rows/bar, today's hardcoded value).
      Replaces the `bar = floor(row/16)` hardcode in `AutoDub.getAutoDubBarClock()`.
- [ ] **T3** Speed-6 song produces identical bar edges to today; speed-3 song puts bar edges at
      row 32. Must fail before B1.

## GATE C — MUSICAL EVENT MODEL

- [ ] **C1** `MusicalEventProvider` — unified semantic event stream; tracker implementation
      (pattern look-ahead) + DJ implementation (beat grid / stems). Unifies semantic output, not
      data sources.
- [ ] **C2** `MusicalChannelProfile` — the orthogonal taxonomy above, with confidence. User
      override authoritative. Unblocks per-source mix hygiene (revision 1 DSP-09).
- [ ] **C3** Look-ahead queries: what happens in the next 1/16, 1/8, 1/4, beat, bar, phrase.
      Seek must reset prediction state.

## GATE D — PERFORMANCE CONTEXT

- [ ] **D1** `PerformanceContext` — clock, upcoming + recent events, channel profiles,
      arrangement state, recent moves, active gestures, wet/feedback/spectral energy, current
      intention + target, time since last action, phrase history. This is the performer's memory.

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
- Commits proving completed work: *(record here as items close)*
