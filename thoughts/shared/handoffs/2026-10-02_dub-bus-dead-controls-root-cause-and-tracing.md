---
date: 2026-10-02
topic: Dub bus dead-control hunt — root causes, fixes, tracing and a deterministic measuring rig
tags: [dub, autodub, personas, tracing, moves, debugging]
status: implemented
---

# Dub bus: why everything read as dead, and what fixed it

Session started from "the sub button is still broken", grew into a full audit
of the dub bus. **The headline: nothing in the audio chain was broken. Two
deliberate design decisions interacted to leave the bus with no input and no
explanation, and a third gap meant nothing ever recovered it.**

Everything below is verified live against the running app, not inferred.

---

## Critical references

| What | Where |
|---|---|
| Panic mutes engine, not store | `src/engine/dub/DubBus.ts` — `dubPanic()`, drain timer |
| No-op guard that defeats no-op repairs | `src/engine/dub/DubBus.ts` — `_applySettings`, `if (!changed && !opts?.force) return;` |
| Song load closes every send | `src/lib/song/applySong.ts` — `resetDubSends()` |
| Bus is fed ONLY by open channel sends | `src/types/dub.ts` — whole-mix fallback deliberately silenced |
| The "an enabled bus must be fed" invariant | `src/lib/dub/seedSendOnEnable.ts` |
| desired-vs-actual diagnostic | `DubBus.getLiveState()`, exposed as `liveState` |
| Deterministic knob A/B | `measureDubKnob` in `src/bridge/handlers/writeHandlers.ts` |
| Auto Dub candidate moves | `src/engine/dub/AutoDub.ts` |
| Persona ownership of controls | `CHARACTER_FIELDS` in `src/stores/useDrumPadStore.ts` |
| Dub Mute's move (return mute) | `src/engine/dub/moves/tapeStop.ts` → `startTapeHold()` |
| The real tape stop | `src/engine/dub/moves/transportTapeStop.ts` |

---

## Root cause 1 — the bus was fed nothing, by design

`applySong` calls `resetDubSends()` on every song load (deliberate, 2026-09-22:
*"a dub producer starts with the sends down and brings them up"*). The bus is
fed only by channels whose sends are open — channel isolation is preferred and
the whole-mix fallback is **deliberately silenced** so sends behave like a
proper send bus.

Together: load a song and the entire wet section is silent. Worse, the deck
gates every `needsSend` move behind a *"Raise a CH send first"* toast, so
holding **Tape Stop / Sub Harmonic / Filter Drop / Master Drop / Liquid /
Starve** fires **nothing at all**. Measured: with all sends 0, `channelTapGainMax`
0 and `inputRms` 0 while the master chain carried `insertOut 0.258`.

Raise sends on three channels and the same bus goes to `channelTapGainMax`
0.68, `inputRms` 0.03–0.11. **This single fact explains most of the
"everything is dead" reports.**

### Fixed
`ensureBusIsFed(busEnabled)` states the invariant once and is called at **both**
break points, not just the enable edge:
- `useDrumPadStore.setDubBus`, on any explicit `enabled: true`
- `applySong`, immediately after `resetDubSends()`

Seeds channel 0 at 0.15 (Auto Dub's measured flat seed, matching the
four-send-at-0.2123 feed `returnGain` is calibrated against). Never touches a
send the performer opened; skips the BLEED floor, which is not a send.

`DubBusPanel` now shows a **"No channel send — bus silent"** badge and dims the
return chain rather than leaving live-looking controls that do nothing.

Live: a song load against an already-enabled bus used to leave sends
`[0,0,0,0]`; now `[0.15,0,0,0]`.

---

## Root cause 2 — a panic left the bus dead behind an ON panel

`dubPanic()` mutes the **engine** (`enabled = false`, input gain 0) without
touching `settings.enabled`. That is safe *only if* the caller also writes the
store — and the tracker's KILL deliberately does not:

```ts
// DubDeckStrip.tsx:670
// Do NOT disable the bus — KILL drains effects but keeps the deck open
// so the performer can re-engage immediately without re-opening the strip.
```

(`PadGrid.tsx:114` *does* write the store — the two views disagree.) So the
promised "re-engage immediately" never happened. The store never changed, so
the store→engine mirror — which pushes only on a change — had nothing to push.
Enabling again was a no-op.

Measured: engine `enabled=false`, `inputGain=0`, `returnRms=0`, store
`enabled=true`. Every knob and every move dead while the panel read ON. **This
is the "sub button is broken" report.**

### Fixed
The drain timer already restored echo and spring from current settings;
`enabled` was simply omitted. Now restored through `setSettings` so the **full**
enable path runs (input-gain ramp, synth un-silencing, master-insert re-sync).

**`force` was required.** `_applySettings` drops writes whose values already
match (`if (!changed && !opts?.force) return;`), and re-converging a diverged
engine is *by definition* such a write. The first attempt passed its tests and
was still wrong live — a source-contract test cannot catch a short-circuit.

Live: mid-drain `enabled=false inputGain=0 store=true inputRms=0` → after drain
`enabled=true inputGain=1 inputRms=0.0296`, **no user toggle**.

---

## Tracing — `getLiveState()`, desired vs actual

`getDiagnosticSnapshot()` is a flat bag mixing the store's DESIRED values with
the graph's ACTUAL ones, and never says which is which. Three misdiagnoses came
out of that:
- `diagnostic.echoRateMs` is the **setting**. It read a steady 320 through a
  hold that was working perfectly.
- `spring.wet` reads 1 whatever is written — useless as a judge.
- With no label to trust, live probes were compared against a **playing song**.

`getLiveState()` returns `{desired, actual, delta}` per parameter at one
instant. Unreadable values are `null` — an honest unknown, not a zero that
reads as "working but silent". Covers enabled, lpf/hpf cutoff, returnGain,
inputGain, feedbackGain, plateSend, sweepOutput, echoWet, springWet,
echoRateMs. Reachable as `liveState` on `get_dub_bus_state`.

The echo rate reads through the `describe()` seam RE-201 already had;
`SpaceEchoAdapter` and `SpaceEchoEffect` had none, so it read `null` **on the
engine that ships by default**. Live value is read off the delay node, not the
stored option, because a `rampTo` in flight is exactly what these exist to show.

Live: `tapeWobble` held drops `echoRateMs` actual 320 → 299.46 (delta −20.5),
restoring on release.

---

## `measure_dub_knob` — deterministic A/B

Every "dead knob" call this session was an **instrument** fault, not a bus
fault. Return-RMS was sampled from a playing song whose level drifts, with the
two arms read seconds apart, so the drift landed entirely on the difference:
**every parameter tested read LOWER when raised.** `springWet` came out at 1.1%
"no change" and was fine — it nearly got "fixed" as a result.

Reuses `measure_dub_bus_stages`' proven seeded pink-noise path (identical seed
12345 and filter, both channels summed — a mono analyser reads decorrelated
stereo reverb 3 dB low):
- refuses while the transport plays
- the same fixed noise feeds both arms
- **interleaved ABAB**, not all-A-then-all-B
- returns `liveState` alongside the numbers
- `measurable: false` under 0.5 dB, with a `note` saying that is the rig's own
  noise floor and **not** proof a control is dead

Registered on **both** the relay (`server/src/mcp/mcpServer.ts`) and the app
bridge — `mcpToolMetadata.test.ts` enforces the pair.

**Validation:** `returnGain` 0.5 → 3 measured **+15.7 dB** against a computed
`20·log₁₀(3/0.5)` = **15.6 dB**. The rig reads true.

### ⚠ Known blind spot (confirmed by the owner)
The same run: `plateStageMix` +2.2 dB (measurable), **`springWet` +0.3 and
`echoWet` +0.1** (not measurable) — but **the owner hears both working**. So
return-RMS energy is the wrong instrument for tail-based effects: the direct
path dominates total return energy and RMS says nothing about a tail's *time*
structure.

**Do not re-litigate `springWet` / `echoWet` as dead knobs.** The fix is a
**tail mode** that gates the input off and measures the return's decay
afterwards — approved by the owner, **not yet built** (interrupted). See Next
Steps.

---

## Smaller fixes (all with regression tests)

- **`djKillAll` destroyed the dub levels permanently.** It force-wrote
  echoWet/springWet/echoIntensity/returnGain to 0 for the drain and never undid
  it; the store persists to localStorage, so one accidental hit flattened the
  bus for good. Now snapshots and restores after `DUB_BUS.DRAIN_MS`, skipping a
  level the performer moved during the window.
- **Plate mix was a grey control that did nothing** — the panel disabled the
  slider when `plateStage === 'off'` and the store defaulted to `'off'`. The
  engine was always correct. Fixed with a store invariant (`reconcilePlateStage`),
  not a component patch, so either order of the two controls ends with a plate
  you can hear. Default stage is now `madprofessor`.
- **Hold buttons** — `touch-action`/`user-select`/`-webkit-touch-callout` on
  `.dub-move-button`, for the pointer cancellation that ended a sustained hold.
- **Sub Harmonic** — removed from `SUSTAINED_SOURCES`, given Pulse/Bed modes
  with native low-fundamental detection (120 Hz lowpass + 8192-pt FFT). Its
  `level: 1.4` was documented as setting the level, but `generatedPeakFor`
  clamps to 1.0 — so 1.4 was exactly 1.0, which is why the move was
  mis-diagnosed twice (2026-09-21, 2026-10-01).
- **Liquid** — replaced raw-node `Tone.connect` with native connects (Tone only
  recognises Tone nodes, so the phaser branch connected *nothing*), and gated
  settings re-application on an ownership predicate so a held move is not
  re-muted mid-hold by a stale store value.
- **Sidechain** — added a `'drums'` source resolved from the tracker's patterns.
  The manual channel routing was live all along; the engine-only audit that
  called those fields dead was looking in the wrong layer.

---

## Personas — investigated, two findings, one bug fixed

**Can every persona reach every control? Yes.** No per-persona gating exists
anywhere — no disable/lock/readonly/hide keyed on the persona. The 4 personas
(`tubby`, `scientist`, `perry`, `jammy`) are pure `overrides` sets: they set
values, never access.

**Do they use every control? 37 of 42 deck moves.** Fixed: **`transportTapeStop`
carried a 12-bar `MOVE_COOLDOWNS` entry and no candidate-move entry** — config
that read as an intention and could never fire. Added, gated on
`intensity > 0.55` so it does not stall a quiet passage.

Unfired by design, documented in place: `tubbyScream`, `oscBass`, `crushBass`
(manual-only — they saturate or stomp the mix when auto-fired).

**Unfired with no recorded reason:** `dubStab`, `bassEmphasis`, `toast`.

**A persona can make a control look dead but does not break it.** Tubby sets
`sweepAmount: 0` and `chainOrder: 'echoSpring'`. Checked rather than assumed:
`CHARACTER_FIELDS` is built from every key any preset overrides (minus
`returnGain`), so `sweepAmount` **is** a character field — turning the Liquid
knob flips `characterPreset` to `custom` and the persona detaches cleanly.
The slider shows 0, you change it, it changes. **No bug; do not "fix" this.**

**Auto Dub writes no panel settings at all** — zero `setDubBus` calls with
named parameters. The panel exposes 64 labelled controls; a persona's character
comes entirely from its `overrides` snapshot at load, and Auto Dub never
re-touches a slider for the whole performance.

---

## Owner ear-verification (all passed)

1. **KILL recovery** — tail dies, bus returns on its own after ~2 s.
2. **Loaded song leaves the bus alive** — no badge, send at ~15%, moves usable.
3. **Dub Mute** — whole dub return drops out and returns.
4. **Sub Harmonic** — works in both Pulse and Bed.
5. **Spring wet / Echo wet** — audible (this is what exposed the rig's blind
   spot; see above).

---

## Next steps, in order

1. **Build the tail measurement mode** (`probe: 'tail'`) — owner-approved, the
   rig is written, only this half is missing. Gate the input off, then measure
   the return's decay. Re-run `springWet`, `echoWet` and every tail-based
   control through it. Do not trust return-RMS for them again.
2. **Channel identity** — the real blocker for personas. `riddimSection` mutes
   by role, and on `Cannabusiness` the roles resolve to
   `["pad","bass","bass","bass"]`: three basses, no drums. "Drop to drums and
   bass" therefore mutes 1 channel of 4 and exposes no drums. Per
   `2026-09-22-dub-personas-completeness.md` this is a **channel-identity**
   problem, not persona architecture — note statistics cannot separate a kick
   from a bass because in a tracker module drums *are* samples played at
   pitches. The plan's next move is to find out what
   `analyzeSampleForClassification` returns for these instruments and why it
   does not clear `confidence >= 0.5`, not to add a mechanism beside it.
3. **`dubStab` / `bassEmphasis` / `toast`** — add to Auto Dub or document as
   manual-only, so the vocabulary has no unexplained holes.
4. **`analyze_instrument_spectrum` did not return within 120 s** on instrument 2
   — whatever else is true, that path is too slow to answer during a
   performance.

---

## Gotchas that cost time this session

- **A source-contract test cannot catch a short-circuit.** happy-dom has no
  Web Audio and nothing constructs a real `new DubBus()`, so engine behaviour
  is locked by tests that assert *text*. My first panic fix passed 5 tests and
  was still wrong live. If a fix must run through `_applySettings`, reason
  about the no-op guard explicitly and prove it live.
- **Never measure against a playing song.** Use `measure_dub_knob`, or stop the
  transport. Sequential A/B on drifting audio biases every difference toward
  "raising makes it quieter", which reads as a dead knob.
- **RMS at a mixed return cannot distinguish "more reverb" from "same".**
- **`get_dub_bus_state` mixes desired and actual.** Read `liveState`, not
  `diagnostic`, when you want to know what the graph is doing.
- **`Tone.connect` only recognises Tone nodes.** A plain `BiquadFilterNode`
  cast into a Tone type connects nothing, without erroring. Use native
  `connect()` or `getNativeAudioNode()`.
- **Hard reload after editing `DubBus`** — HMR retains stale methods.
- **`mcpToolMetadata.test.ts` requires every routed MCP tool on both the relay
  and the app bridge.**
- `noStaleTransportRow` and `singleLoadPath` contract tests **flake in large
  parallel runs** (they scan the filesystem) and pass standalone. Not a
  regression signal.
- `ECONNREFUSED … port 3000` noise in store tests is harmless.
- `thoughts/spot/` is git-ignored; `thoughts/lars/todos.md` is left untracked
  on purpose.

---

## Commits (branch `feature/dub-bus-move-inaudibility`, **not pushed**)

| SHA | What |
|---|---|
| `3e4cb5000` | Re-enable the dub bus after a panic instead of leaving it dead |
| `926cf6f91` | Feed an enabled dub bus so its controls are not silently inert |
| `8e491a530` | Report the dub bus as desired vs actual |
| `2275034ad` | Add `measure_dub_knob` |
| `2a7f5f68a` | Relabel Tape Stop → Dub Mute |
| `e5e9c53d7` | Panic level restore, plate reachability, hold buttons, sub modes |
| `947742a51` | Let Auto Dub actually fire the transport tape stop |

PR #79 (`thoughts/shared/prs/79_description.md`) stays separate and open. Do not
touch `main`. Pre-commit runs only the suites adjacent to staged files; the full
suite gates at pre-push.