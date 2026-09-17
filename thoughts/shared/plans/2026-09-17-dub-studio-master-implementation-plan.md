---
date: 2026-09-17
topic: DEViLBOX Dub Studio — master AI-agent implementation plan (external review)
tags: [dub, dubbus, autodub, personas, dsp, ai-performer, review]
status: superseded
source: external music-theory reviewer, delivered 2026-09-17
baseline_claimed: 2026-04-20
note: |
  Verbatim copy of the reviewer's plan as delivered. The document's stated
  baseline is 2026-04-20 and is STALE relative to the current tree (it counts
  27 moves and a `gatedFlanger` preset; the tree has 43 moves and `jammy`).
  Reconciliation against the current code lives in
  thoughts/shared/plans/2026-09-17-dub-studio-gap-reconciliation.md
---

# DEViLBOX DUB STUDIO — MASTER AI-AGENT IMPLEMENTATION PLAN

**Purpose:** Take the existing DEViLBOX Dub Studio from a substantially implemented tracker dub bus to a robust, musically convincing, hardware-oriented live-dub system with authentic engineer-inspired sound coloration, complete control surfaces, persistence, testing, and eventually genuinely convincing AI live-dubbing behavior.

**Source baseline:** audited implementation and research state dated **2026-04-20**.

**Critical instruction to all agents:** This is NOT a greenfield implementation. A large amount of the Dub Studio is already shipped. Agents must inspect and reuse the existing implementation before creating abstractions, replacing DSP, or duplicating routing.

---

# 0. MASTER OBJECTIVE

The finished system should behave like a **musical dub instrument**, not merely a collection of effects.

There are three distinct goals:

```text
GOAL A — ENGINE
Reliable, complete, testable DubBus infrastructure.

GOAL B — SOUND
Convincing historical/characterful dub coloration.

GOAL C — PERFORMANCE
A human-like live-dub performer that understands musical events,
space, timing, consequences, and restraint.
```

Do not solve these three goals by mixing them together prematurely.

The implementation sequence should be:

```text
EXISTING ENGINE
      ↓
COMPLETE / HARDEN
      ↓
SONIC COLOR
      ↓
CONTROL SURFACE
      ↓
PERFORMANCE MODEL
      ↓
PERSONAS
      ↓
AI LIVE DUB
```

The existing architecture already routes UI/automation/performance actions through `DubRouter`, which should remain the common execution path.

---

# 1. CURRENT BASELINE — DO NOT REBUILD

The following are already implemented and should be considered the starting point.

## 1.1 DubBus

`src/engine/dub/DubBus.ts`

Existing chain:

```text
input
 ↓
HPF
 ↓
bass shelf
 ↓
mid processing
 ↓
sweep/flanger
 ↓
tape saturation
 ↓
SpaceEcho
 ↓
Aelapse spring
 ↓
sidechain compressor
 ↓
glue compressor
 ↓
LPF
 ↓
M/S stereo width
 ↓
return gate
 ↓
master
```

The bus already contains real DSP rather than stubs, including tape saturation, multiple echo behavior, spring, filtering, compression, stereo processing and performance effects.

**Agent rule:** Before adding DSP, inspect the existing node graph and determine whether the desired behavior can be implemented by extending the existing nodes.

---

# 2. EXISTING PERFORMANCE SURFACE

There are currently **27 DubMoves** backed by real bus functionality.

Existing move families include:

```text
ECHO
STAB
CHANNEL THROW
CHANNEL MUTE
SPRING
FILTER
SIREN
TAPE WOBBLE
SNARE CRACK
DELAY TIME
BACKWARD REVERB
MASTER DROP
TAPE STOP
TRANSPORT TAPE STOP
TOAST
TUBBY SCREAM
STEREO DOUBLER
REVERSE ECHO
SONAR PING
RADIO RISER
SUB SWELL
OSC BASS
CRUSH BASS
SUB HARMONIC
ECHO BUILDUP
DELAY PRESET 380
DELAY PRESET DOTTED
```

The existing `DubRouter.fire()` is the common move execution point and pairs fire/release events. `DubRecorder` and `DubLanePlayer` already integrate with that architecture.

**Do not create a second AI-only move execution system.**

The eventual AI performer must ultimately call the same move infrastructure a human uses.

---

# 3. EXISTING CHARACTER SYSTEM

Existing character presets:

```text
tubby
scientist
perry
gatedFlanger
madProfessor
```

The presets already control combinations of spring, tape saturation, tone, chaos, scatter, etc.

The new sound-coloring work should **extend and refine this system**, not create an unrelated second preset architecture.

The research establishes the intended broad character distinctions:

```text
TUBBY
dark / aggressive filtering / spring / tape / stepped filter

SCIENTIST
cleaner / brighter / plate-like / mid-scoop / drops / little or no glue

PERRY
lo-fi / tape accumulation / phaser / spring chaos / near-mono

MAD PROFESSOR
hi-fi / wide / lush / digital delay / air
```

These are character targets, not instructions to imitate individual recordings sample-for-sample.

---

# 4. EXISTING PER-CHANNEL ROUTING

Per-channel Dub routing is already implemented through `ChannelRoutedEffects`.

There are 32 dub sends and lazy channel activation.

The four relevant WASM engines already expose per-channel outputs.

The tracker integration already has:

```text
DubDeckStrip
per-channel mute
throw
echo
stab
build
HOLD
dub-send fader
REC
DubLaneTimeline
```

**Do not replace this routing architecture.**

Future AI performance should use these same channel taps.

---

# 5. EXISTING AUTOMATION / LANE SYSTEM

`DubRecorder` already records DubRouter events.

`DubLanePlayer` already plays lane events from transport ticks, including backwards-seek handling.

Pattern schema has already reached v20 for `Pattern.dubLane`.

The remaining concern is not inventing a lane system; it is proving that every persistence/export path preserves it.

---

# 6. OBSOLETE WORK — DO NOT REIMPLEMENT

## Pixi parity

**G7 is obsolete.**

Pixi has been removed from the codebase.

Do not create:

```text
src/pixi/dub/
```

Do not rebuild Pixi versions of:

```text
DubDeckStrip
DubLaneTimeline
DubBusPanel
```

The current UI architecture is DOM-based.

---

# 7. PHASE 0 — CODEBASE RECONNAISSANCE

## AGENT: ARCHITECTURE AUDITOR

Before modifying anything, inspect:

```text
src/engine/dub/DubBus.ts
src/engine/dub/DubRouter.ts
src/engine/dub/DubRecorder.ts
src/engine/dub/DubLanePlayer.ts
src/engine/dub/moves/
src/engine/tone/ChannelRoutedEffects.ts
src/types/dub.ts
src/components/dub/DubBusPanel.tsx
src/components/dub/DubDeckStrip.tsx
src/components/dub/DubLaneTimeline.tsx
src/stores/useDrumPadStore.ts
src/stores/useMixerStore.ts
src/midi/performance/parameterRouter.ts
src/hooks/useTransportStore.ts
src/lib/export/exporters.ts
src/hooks/useProjectPersistence.ts
MCP bridge/server files
```

Also inspect all existing DubBus tests and the audio export contract tests.

### Deliverable

Produce a verified map of:

```text
INPUT
 ↓
CHANNEL ISOLATION
 ↓
DUB SEND
 ↓
DubBus
 ↓
DubRouter / Moves
 ↓
Recorder
 ↓
Lane
 ↓
Transport
 ↓
Export
```

and identify where each remaining gap belongs.

**Do not start DSP refactoring during this phase.**

---

# 8. PHASE A — COMPLETE ALL EXISTING CONTROL SURFACES

This phase should be completed before introducing new AI performance intelligence.

## A1 — Complete MIDI move registry

**Gap:** G1.

`DUB_MOVE_KINDS` currently exposes only the original subset of moves.

Add MIDI routes for:

```text
crushBass
echoBuildUp
oscBass
radioRiser
reverseEcho
sonarPing
stereoDoubler
subHarmonic
subSwell
tubbyScream
delayPreset380
delayPresetDotted
```

Use the existing trigger/hold semantics.

### Acceptance

Every one of the 27 moves is reachable through the MIDI routing system.

Do not change existing CC behavior.

---

# 9. PHASE A2 — COMPLETE LANE COLORS

**Gap:** G2.

Extend:

```text
MOVE_COLOR
```

to all 27 moves.

Use the existing palette and group related effects visually.

Suggested families:

```text
echo / delay      cool
reverb / spring   violet/blue
filters           green/yellow
tape              orange
bass              red/warm
utility/drop      neutral/high contrast
```

### Acceptance

No DubMove renders using the generic fallback grey.

---

# 10. PHASE A3 — KEYBOARD CONTROL

**Gap:** G3.

The old Full-Screen Dub Mode has intentionally been removed.

Do not recreate that UI.

Instead implement keyboard bindings within the main tracker architecture.

Requirements:

```text
keyboard → command layer → DubRouter.fire()
```

Do not directly manipulate DubBus from keyboard handlers.

Provide configurable/default bindings for the major live-dub moves.

At minimum provide access to:

```text
echo throw
spring
filter
drop
tape stop
delay
reverse
snare crack
```

and provide a discoverable way to access the complete move set.

### Acceptance

Keyboard control works while the tracker remains the primary editor.

No overlay-heavy Full-Screen Dub Mode is introduced.

---

# 11. PHASE A4 — DJ TOAST

**Gap:** G10.

Expose the existing `toast` move in DJ view next to the appropriate DJ microphone controls.

Reuse the existing implementation.

Do not create another Toast DSP path.

### Acceptance

DJ view can trigger the same Toast move available elsewhere.

---

# 12. PHASE A5 — CHARACTER PRESET A/B

**Gap:** G11.

Implement:

```text
CURRENT CHARACTER
LAST CUSTOM SETTINGS
A/B TOGGLE
```

Behavior:

```text
load Tubby
    ↓
edit returnGain
    ↓
custom settings retained
    ↓
A/B
    ↓
Tubby preset ↔ previous custom state
```

The A/B mechanism must not destroy either state.

### Acceptance

Repeated A/B toggling is lossless.

---

# 13. PHASE A6 — MCP MOVE SWEEP

**Gap:** G8.

Verify every move through:

```text
fire_dub_move
release_dub_move
```

Test all 27 moves.

For each move:

```text
fire
wait
verify activity
release if applicable
verify release
```

Do not rely solely on UI tests.

### Acceptance

All moves are reachable through MCP and execute the expected DubBus behavior.

Where RMS-based audio verification is used, do not require a globally non-zero result for inherently silent/control-only moves without defining an appropriate signal-path assertion. The test must distinguish:

```text
DSP-producing move
control/mute move
hold move
trigger move
```

---

# 14. PHASE B — PERSISTENCE HARD LOCK

## B1 — `.dbx` export

**Gap:** G4.

Inspect the actual `.dbx` exporter.

Determine whether:

```text
pattern.dubLane
```

is serialized explicitly or indirectly.

Do not assume whole-object serialization is safe.

If missing, add it.

If already present indirectly, add a contract test proving it.

---

# 15. PHASE B2 — DUB LANE ROUND TRIP

**Gap:** G5.

Create a regression test:

```text
record trigger
record hold
save
clear/recreate persistence state
load
compare
```

Compare:

```text
moveId
row
durationRows
channelId
params
source
```

where applicable.

Then repeat for:

```text
export .dbx
import .dbx
```

### Acceptance

Dub lane data survives both persistence mechanisms.

---

# 16. PHASE C — EXISTING ENGINE INTEGRATION FIXES

## C1 — Dub channel activation retry

**Gap:** G6.

Current failure mode:

```text
user raises dub send
 ↓
engine not ready
 ↓
getActiveIsolationEngine() === null
 ↓
activation silently never completes
```

Fix this.

Preferred architecture:

```text
request activation
 ↓
engine unavailable?
 ↓
register one-shot readiness retry
 ↓
engine ready
 ↓
activate channel
 ↓
connect output
 ↓
register tap
```

Do not create polling loops.

Do not repeatedly activate already-active channels.

### Acceptance

Raising a send before engine readiness eventually produces audio once the engine becomes ready.

---

# 17. PHASE C2 — BPM-FOLLOWING ECHO

**Gap:** G12.

Currently synchronized echo timing can become frozen when BPM changes.

When:

```text
echoSyncDivision !== null
```

the system should recompute delay time when transport BPM changes.

Avoid excessive parameter churn.

Use a modest debounce or scheduled update where appropriate.

### Acceptance

At 120 BPM:

```text
1/4 ≈ 500 ms
```

At 140 BPM:

```text
1/4 ≈ 428.6 ms
```

The actual implementation should follow the existing division semantics and transport timing model rather than hard-coding these examples.

### Important

Do not retune free-running/manual delay settings when the user has explicitly chosen a non-synced mode.

---

# 18. PHASE C3 — SIDECHAIN SOURCE

**Gap:** G13.

Extend `DubBusSettings` with an explicit sidechain source concept.

Suggested shape:

```ts
sidechainSource:
    'bus'
  | 'channel'

sidechainChannelIndex?: number
```

Preserve:

```text
bus
```

as the current behavior.

For:

```text
channel
```

route the selected isolated channel into the sidechain detector.

The first practical use case is:

```text
Kick → sidechain
```

while other material does not trigger the compressor.

### Acceptance

With kick selected:

```text
kick → duck
snare → no additional sidechain trigger
bass → no additional sidechain trigger
```

subject to the actual detector configuration.

---

# 19. PHASE C4 — MASTER INSERT REWIRE

**Gap:** G15.

Current live chain rebuilding can produce a transient glitch.

Do not redesign the master chain.

Implement safe transition:

```text
ramp gain down
 ↓
disconnect / rebuild
 ↓
connect new graph
 ↓
ramp gain up
```

Use the smallest practical transition window.

### Acceptance

Repeated ON/OFF toggling during:

```text
sustained bass
sustained chord
echo tail
spring tail
```

produces no audible click or dropout.

---

# 20. PHASE C5 — PRESET / USER EDIT COHERENCE

**Gap:** G16.

Audit every UI caller of:

```text
setDubBus(...)
```

Determine how `characterPreset` is preserved.

Standardize the rule:

```text
preset loaded
    ↓
any manual parameter edit
    ↓
characterPreset = custom
    ↓
all other custom values preserved
```

No direct field update should accidentally restore preset values or erase the preset/custom distinction.

---

# 21. PHASE D — DSP SOUND-COLORING

This phase uses the supplied 2026-04-20 dub sound-coloring research as the **sonic target**.

The research should be treated as a set of historically informed design targets and starting values, not as a reason to blindly rebuild the current DSP.

The first task for every DSP agent is:

```text
INSPECT EXISTING NODE
        ↓
COMPARE TO RESEARCH TARGET
        ↓
IDENTIFY ACTUAL GAP
        ↓
EXTEND EXISTING IMPLEMENTATION
```

---

# 22. DSP-01 — TUBBY BASS SHELF

Add/refine the dedicated Tubby bass shelf.

Starting target:

```text
type       low shelf
frequency  90 Hz
Q          0.9
gain       +6 dB
```

Place it after the HPF so sub-rumble is not unnecessarily amplified.

The preset should use the researched Tubby voicing.

### Tests

Verify:

```text
frequency
Q
gain
preset application
ramping
```

### Listening

Compare the effect against the existing Tubby preset.

Do not allow this to destabilize low-end gain staging.

---

# 23. DSP-02 — SCIENTIST MID SCOOP

Add/refine:

```text
peaking EQ
700 Hz
Q 1.4
-6 dB
```

It must be automatable.

The characteristic action should support:

```text
0 dB
 ↓
-6 dB
 ↓
return
```

over musical time.

The research specifically identifies Scientist's rejection of glue-style compression as a major distinction.

Therefore the Scientist preset should bypass the glue compressor rather than merely setting its ratio low.

### Acceptance

Scientist preset:

```text
GlueComp = bypass
mid scoop = active
```

---

# 24. DSP-03 — SPACE ECHO FEEDBACK FILTERING

Inspect the existing SpaceEcho implementation.

Add only what is actually missing.

Target:

```text
feedback HPF:
approximately 200–400 Hz

feedback LPF:
approximately 3–5 kHz
```

Character presets can vary this.

The purpose is:

```text
each repeat loses low-end mud
each repeat becomes progressively darker
```

Do not simply place filters after the entire delay return.

The filtering should occur **inside the feedback path** if the DSP architecture permits it.

### Acceptance

Repeated echoes become progressively filtered rather than each repeat receiving an identical full-spectrum copy.

---

# 25. DSP-04 — ALTEC/TUBBY STEPPED HPF

Implement a Tubby-specific HPF mode.

Target positions:

```text
70
100
150
250
500
1000
2000
3000
5000
7500
10000 Hz
```

Target slope:

```text
18 dB/oct
```

The research identifies the discrete stepping as part of the performance character.

Possible implementation:

```text
3 × 6 dB/oct stages
```

or another equivalent implementation validated against the actual desired response.

### Control behavior

MIDI/step commands:

```text
snap to nearest position
```

Mouse/manual continuous mode may interpolate between positions if the existing UI requires it.

Do not destroy the discrete character of the preset simply to make the control smoother.

### Acceptance

The Tubby filter has audible stepped transitions and the expected approximate slope.

---

# 26. DSP-05 — LIQUID FLANGER

The supplied research identifies this as a major missing characteristic.

Implement a parallel flanger before SpaceEcho:

```text
Dub send
   ↓
split
   ├── dry
   └── flanger
            ↓
         SpaceEcho
```

Starting parameters:

```text
delay center       5 ms
range              ±4 ms
sweep              1–9 ms
LFO                0.15 Hz
feedback           0.72
feedback HPF       200 Hz
```

The flanger should be capable of feeding the echo chain so that the echo receives the coloration.

Do not make the flanger permanently active for all characters.

Initial character:

```text
Perry = strong candidate
```

but test against the intended character matrix before finalizing.

### Acceptance

No unstable feedback.

No low-frequency runaway.

Flanger can be independently bypassed.

---

# 27. DSP-06 — PERRY TAPE STACK

The research describes Perry's character as accumulated tape degradation rather than simply one tape saturation stage driven harder.

Existing `TapeSat` stack mode must be inspected first.

If the existing stack is insufficient, implement an optional multi-path/multi-stage topology.

Starting research values:

```text
Path A:
drive 0.25
wow 0.3 Hz
depth 0.002
hiss -60 dBFS

Path B:
drive 0.45
wow 0.4 Hz
depth 0.003
hiss -54 dBFS

Path C:
drive 0.65
wow 0.5 Hz
depth 0.004
hiss -48 dBFS
```

The research describes these as parallel paths; the agent must verify the intended gain staging rather than blindly summing three full-level signals.

Use independent modulation seeds/phases where the DSP implementation supports this.

### Acceptance

Perry sounds:

```text
darker
more unstable
more accumulated
more textured
```

without simply becoming louder.

---

# 28. DSP-07 — RETURN M/S WIDTH

Add/refine a return-stage M/S matrix.

Target character range:

```text
Perry        near mono
Tubby        narrow
Scientist    moderate
Mad Professor wide
```

The implementation must preserve mono compatibility.

### Tests

Verify:

```text
width = minimum
width = default
width = maximum
```

with:

```text
mono input
stereo input
echo
spring
```

---

# 29. DSP-08 — CHARACTER MACRO

The character selector should eventually expose a coherent macro rather than a handful of unrelated settings.

Target matrix:

| Parameter     |         TUBBY |      SCIENTIST |      PERRY | MAD PROFESSOR |
| ------------- | ------------: | -------------: | ---------: | ------------: |
| HPF           |       stepped |     continuous | continuous |    continuous |
| HPF freq      |        100 Hz |          80 Hz |      40 Hz |         35 Hz |
| Tubby shelf   | +6 dB @ 90 Hz |          +3 dB |      +2 dB |         +3 dB |
| Mid scoop     |          0 dB | -6 dB @ 700 Hz |      -2 dB |          0 dB |
| High shelf    |          0 dB |          +2 dB |      -3 dB |         +4 dB |
| Tape drive    |          0.40 |           0.30 |       0.65 |          0.15 |
| Tape mode     |        single |         single |      stack |        single |
| Flanger       |           off |            off |         on |           off |
| Echo feedback |          0.55 |           0.70 |       0.82 |          0.45 |
| Feedback HPF  |        250 Hz |         300 Hz |     200 Hz |        400 Hz |
| Feedback LPF  |         3 kHz |          5 kHz |      2 kHz |         8 kHz |
| Spring length |         2.2 s |          3.5 s |      4.8 s |         3.0 s |
| Spring damp   |          0.55 |           0.25 |       0.10 |          0.50 |
| Spring chaos  |          0.20 |           0.40 |       0.80 |          0.10 |
| Stereo width  |           0.3 |            0.8 |        0.2 |           1.0 |
| Return LPF    |        12 kHz |         18 kHz |      8 kHz |        18 kHz |

These are **starting target values from the supplied research**. Agents must verify the existing `DubBusSettings` schema and actual DSP response before assuming that the numerical values map 1:1 to current parameter ranges.

---

# 30. CHARACTER-SPECIFIC RULE

The character preset is not the same thing as the performer persona.

Eventually support:

```text
BUS CHARACTER
+
PERFORMER PERSONA
```

independently.

For example:

```text
Scientist performer
+
Perry-colored bus
```

should be possible.

This prevents the DSP character from determining the AI's behavior.

---

# 31. DSP-09 — PER-SOURCE MIX HYGIENE

This is a separate layer from the DubBus.

Do not put every source EQ recommendation into the master DubBus.

The research identifies useful source-specific starting points:

## Kick

```text
HPF       30 Hz
boost     60–80 Hz
cut       300–500 Hz
LPF       6–8 kHz
compression around 4:1
```

## Bass

```text
HPF       40–50 Hz
boost     80–120 Hz
cut       1–2 kHz
LPF       1–1.5 kHz for dark patches
mono      below 150 Hz
```

## Skank

```text
HPF       150 Hz
cut       300–500 Hz
boost     2–4 kHz
```

## Horns

```text
HPF       100 Hz
control   2–4 kHz
body      400–600 Hz
LPF       12 kHz
```

## Vocals

```text
HPF       80 Hz
cut       ~300 Hz
presence  3–5 kHz
air       ~12 kHz
```

### Important

Do not automatically impose these settings on every tracker channel.

First introduce musical source classification.

---

# 32. PHASE E — MUSICAL CHANNEL MODEL

The current role classifier can confuse:

```text
piano chord
piano skank
piano pad
```

and similar cases.

Do not expand a single `role` enum indefinitely.

Use orthogonal information:

```ts
instrumentFamily
musicalFunction
register
importance
density
```

Example:

```ts
{
    instrumentFamily: 'piano',
    musicalFunction: 'skank',
    register: 'mid',
    importance: 0.82,
    density: 0.41
}
```

This information becomes the basis for future AI dubbing.

---

# 33. PHASE F — ARRANGEMENT INTELLIGENCE

Replace binary assumptions such as:

```text
drop = mute every non-rhythm channel
```

with an arrangement mask.

Possible dimensions:

```text
foundation
accent
harmonic
melodic
texture
sacrificial
```

A version can therefore behave like:

```text
KICK       keep
BASS       keep
SNARE      keep/reduce
SKANK      remove
PAD        remove
VOCAL      throw then remove
HORN       throw then remove
```

The important distinction is:

```text
REMOVE BECAUSE OF MUSICAL PURPOSE
```

rather than:

```text
REMOVE BECAUSE CLASSIFIER SAID "CHORD"
```

---

# 34. PHASE G — AI LIVE-DUB PERFORMER

Only begin this phase after the underlying control, persistence, DSP, and safety layers are stable.

The goal is to move Auto Dub from:

```text
rule
→ probability
→ move
```

toward:

```text
listen
→ understand
→ anticipate
→ decide
→ perform
→ listen to consequence
→ decide again
```

The existing Auto Dub system already operates on a periodic high-level tick with bar clock, density, transient detection, phrase energy, rules and cooldowns.

Keep the high-level loop.

Do not make it responsible for sample-accurate timing.

---

# 35. AI-01 — MUSICAL EVENT PROVIDER

Create a common event abstraction for tracker and DJ contexts.

Possible interface:

```ts
MusicalEventProvider
```

Events should expose:

```ts
channel
timestamp
beat
bar
role
instrumentFamily
eventType
strength
confidence
```

Tracker and DJ systems can provide different underlying data while the dub performer consumes the same conceptual event stream.

This addresses the existing architectural difference where DJ Auto Dub has deck/stem information while tracker Auto Dub has pattern look-ahead.

---

# 36. AI-02 — EVENT PREDICTION

The performer needs a short look-ahead horizon.

Example:

```text
+80 ms   kick
+310 ms  snare
+470 ms  skank
+920 ms  vocal
```

The performer should be able to prepare a gesture before the event arrives.

For example:

```text
snare predicted
 ↓
open send
 ↓
snare arrives
 ↓
capture
 ↓
close send
```

This is much more realistic than detecting the snare after it has already happened.

---

# 37. AI-03 — PERFORMANCE CONTEXT

Introduce a runtime context containing:

```text
current bar
current beat
phrase position

active channels
channel importance
channel roles

recent events
recent moves

active throws
active holds
active rides

echo energy
spring energy
feedback energy
return energy

last major action
time since action
current intention
```

This should be cheap to update.

The important property is **memory**.

The performer must know what it just did.

---

# 38. AI-04 — INTENTION LAYER

Do not have the AI choose an effect first.

Introduce musical intentions:

```text
REST
ACCENT
ANSWER
SPACE
BUILD
DROP
TEXTURE
TRANSITION
RESET
```

Decision chain:

```text
MUSIC
 ↓
CURRENT MUSICAL CONDITION
 ↓
INTENTION
 ↓
TARGET
 ↓
DUB MOVE
 ↓
GESTURE
```

Example:

```text
snare approaching
 ↓
ACCENT
 ↓
snare
 ↓
echoThrow
 ↓
short send gesture
 ↓
feedback ride
 ↓
release
```

---

# 39. AI-05 — REST MUST BE A REAL DECISION

The performer must sometimes intentionally do nothing.

Do not implement rest merely as:

```text
random chance failed
```

The state should explicitly represent:

```text
REST
LISTEN
WAIT
```

This is essential to dub.

A performer that throws an effect every available opportunity will sound like an automated plugin demo.

---

# 40. AI-06 — PERFORMANCE STATE MACHINE

Use a shared state machine:

```text
LISTENING
    ↓
ANTICIPATING
    ↓
PREPARING
    ↓
EXECUTING
    ↓
RIDING
    ↓
RELEASING
    ↓
LISTENING
```

Additional structural states:

```text
BUILDING
DROPPING
RECOVERING
```

The persona modifies the behavior of the state machine.

It should not create five independent Auto Dub implementations.

---

# 41. AI-07 — GESTURE ENGINE

Dub moves should support continuous performance gestures.

Conceptual interface:

```ts
beginGesture()
updateGesture()
endGesture()
cancelGesture()
```

Support:

```text
attack
hold
release
ramp
sweep
rebound
quantized start
quantized release
```

This is especially important for:

```text
send fader
filter
feedback
echo time
spring
master drop
```

The human operator does not teleport a knob from 0 to 1. They perform a gesture.

---

# 42. AI-08 — SEPARATE THINKING FROM AUDIO TIMING

Use:

```text
AI decision loop
```

for:

```text
what should happen?
```

and:

```text
transport/audio scheduler
```

for:

```text
exactly when should it happen?
```

The current Auto Dub tick is approximately 250 ms.

That is acceptable for high-level reasoning.

It is not acceptable for exact musical execution.

---

# 43. AI-09 — WET ENERGY

The existing system introduced cooldowns and wet caps because unrestricted Auto Dub could become spammy/musically dense.

Do not simply remove those safeguards.

Instead model:

```text
wetEnergy
feedbackEnergy
spectralDensity
```

Each move can carry approximate metadata:

```ts
wetCost
duration
feedbackCost
spectralDensity
```

Then:

```text
small throw
+
small spring
```

may be acceptable,

while:

```text
long echo wash
+
large spring
+
reverse reverb
+
high feedback
```

should consume too much energy and be discouraged.

The AI should understand the current state of the return rather than only its own cooldown timers.

---

# 44. AI-10 — SPLIT INTENSITY

Do not continue using one scalar for every aspect of performance.

Separate:

```text
activity
depth
risk
restraint
```

For example:

```text
activity = how often
depth    = how strong
risk     = how dangerous/unusual
restraint = how willing to leave space
```

This makes personas much more expressive.

---

# 45. AI-11 — CONSEQUENCE MODEL

After a move, evaluate its approximate result.

Useful observations:

```text
targetWasAudible
contrastCreated
maskingIncrease
wetEnergyIncrease
feedbackIncrease
structuralImpact
```

The performer can then adapt.

Example:

```text
echo throw
 ↓
return becomes very dense
 ↓
next long echo discouraged
 ↓
filter return
 ↓
rest
```

Another:

```text
spring hit
 ↓
beautiful sparse tail
 ↓
space remains
 ↓
another short accent allowed
```

This is the beginning of the “human producer” behavior.

---

# 46. AI-12 — PERSONAS BECOME BEHAVIORAL PROFILES

The five personas should no longer be primarily move-weight tables.

They should define behavior such as:

```text
activity
depth
risk
restraint

anticipation
patience
target preference

throw length
feedback preference
filter preference
drop preference
release style

timing variance
gesture variance
phrase preference
```

---

# 47. PERSONA — TUBBY

Target behavior:

```text
short decisive gestures
percussion targeting
strong filter work
tight echo throws
dark return
strong restraint
```

Likely preferences:

```text
snare
drums
short throws
filter cuts
spring accents
phrase-boundary drops
```

Avoid making Tubby simply:

```text
"high echo probability"
```

The defining behavior is the interaction between:

```text
filter
return
echo
spring
timing
space
```

---

# 48. PERSONA — SCIENTIST

Target behavior:

```text
precision
longer structural builds
strong drops
midrange manipulation
cleaner returns
plate-style space
```

Important DSP distinction:

```text
glue compressor bypass
```

The performer should favor deliberate structural intervention over constant texture.

---

# 49. PERSONA — PERRY

Target behavior:

```text
high contextual variance
lo-fi textures
spring chaos
phaser/flanger
tape degradation
near-mono space
unusual transitions
```

But:

```text
variance != random spam
```

Perry's unusual behavior should still react to the music.

---

# 50. PERSONA — MAD PROFESSOR

Target behavior:

```text
patience
wide spatial effects
longer development
digital delay
lush reverb
cleaner tonal balance
```

He should be comfortable leaving a large spatial tail running rather than immediately adding another event.

---

# 51. PERSONA — JAMMY

Preserve the existing Jammy concept as a sparse, structural performer.

Target behavior:

```text
low activity
high restraint
short structural interventions
drops
cuts
digital/precise gestures
```

Jammy should demonstrate that “doing less” is an intentional performance strategy.

---

# 52. AI-13 — CONTEXTUAL VARIANCE

Variance should be based on context.

Bad:

```text
random number
 ↓
different effect
```

Better:

```text
expected move
 ↓
musical context
 ↓
available space
 ↓
persona risk
 ↓
alternative move
```

Example:

```text
expected:
snare → echo

alternative:
snare → filter

alternative:
snare → spring

alternative:
snare → REST
```

The alternatives must be constrained by musical state.

---

# 53. AI-14 — CALL AND RESPONSE

Introduce relationships between interventions.

For example:

```text
snare → echo
```

followed later by:

```text
vocal → spring
```

or:

```text
echo throw
 ↓
space
 ↓
answer with filter
```

The AI should avoid repeatedly targeting the same channel/event unless that repetition is itself intentional.

---

# 54. AI-15 — REPETITION VS NOVELTY

Track recent moves and targets.

Detect:

```text
same move repeatedly
same channel repeatedly
same timing repeatedly
same intensity repeatedly
```

Then allow personas to respond differently.

For example:

```text
Tubby:
repeat a successful tight move

Perry:
introduce a controlled variation

Mad Professor:
wait longer

Jammy:
probably stop
```

---

# 55. AI-16 — PHRASE AWARENESS

The existing phrase system uses fixed 16-bar curves in places.

The future system should expose normalized musical position:

```text
phrasePosition = 0..1
```

and know:

```text
phrase start
phrase middle
phrase end
transition
```

The existing fixed 16-bar assumptions should not be expanded blindly.

Use actual transport/pattern/arrangement information where available.

---

# 56. AI-17 — EVENT-BASED RETURNS

Avoid fixed return timings such as:

```text
return at exactly 60% of hold duration
```

where the effect is intended to interact with musical structure.

Instead allow:

```text
next beat
next subdivision
next bar
phrase boundary
next relevant event
```

The return timing should be a musical decision.

---

# 57. AI-18 — INTELLIGENT VERSION DROPS

A version should be a musical arrangement event.

Before a drop:

```text
identify foundation
identify harmonic material
identify sacrificial material
identify useful echo targets
```

Then:

```text
throw selected element
 ↓
remove/reduce material
 ↓
leave foundation
 ↓
allow tail to occupy space
 ↓
restore arrangement
```

This is much closer to how a human dub operator creates a version.

---

# 58. AI-19 — MANUAL-FIRST DANGEROUS EFFECTS

Preserve the current boundary around effects that can destabilize a mix.

Examples include:

```text
tubbyScream
oscBass
crushBass
```

These should not become unrestricted Auto Dub toys.

If eventually exposed to AI, they require explicit:

```text
risk budget
duration limit
gain limit
context condition
```

The safer default is to leave them manual-first.

---

# 59. AI-20 — SAFETY GOVERNOR

Never allow musical intelligence to bypass DSP safety.

Monitor:

```text
peak level
feedback growth
low-frequency energy
return energy
```

The governor should preferably correct musically:

```text
reduce feedback
close filter
reduce send
```

before hard limiting is required.

Never remove existing safety mechanisms to make Auto Dub more dramatic.

---

# 60. AI-21 — PERFORMANCE RECORDING

Extend lane recording metadata where useful.

Potential metadata:

```text
intent
target event
persona
gesture start
gesture end
quantization
```

This allows a lane to communicate:

```text
BAR 12
SNARE THROW
 ↓
ECHO
 ↓
FEEDBACK RIDE
 ↓
FILTER CLOSE
```

rather than only:

```text
echoThrow
```

Do not break existing lane compatibility.

---

# 61. AI-22 — PERFORMANCE MONITOR UI

The Auto Dub UI should eventually show the performer rather than merely exposing settings.

Suggested display:

```text
PERSONA
Tubby

STATE
RIDING ECHO

INTENT
ACCENT

TARGET
SNARE

PHRASE
BAR 7 / 8

WET ENERGY
████░░░░

LAST MOVE
Echo Throw

NEXT EVENT
Snare +180 ms
```

Optional diagnostic:

```text
WHY?
```

which explains:

```text
Targeted snare because:
- strong transient
- phrase position 0.72
- return energy low
- Tubby favors percussion
```

This is for transparency/debugging, not for exposing internal chain-of-thought.

---

# 62. TESTING PHILOSOPHY

Dub Studio currently has a major test-coverage gap.

Do not test only React components.

Test:

```text
DSP graph
move dispatch
parameter mapping
lane recording
lane playback
transport
persistence
MCP
MIDI
safety
```

---

# 63. TEST AGENT — MOVE TESTS

Create pure-logic tests for all 27 move modules.

Mock `DubBus`.

For each move assert:

```text
correct bus method
correct parameters
correct trigger/hold behavior
correct release behavior
```

Do not require real Web Audio for every move test.

---

# 64. TEST AGENT — DUBBUS GRAPH

Create `DubBus.test.ts`.

Test:

```text
preset application
settings application
enable/disable
signal graph invariants
feedback paths
filter settings
return settings
```

Where possible, use injected/mocked audio nodes rather than requiring actual audio playback.

---

# 65. TEST AGENT — DUB LANE PLAYER

Test:

```text
row 0
middle event
end event
trigger
hold
release
backwards seek
transport stop
pattern change
```

Verify stale holds cannot survive a seek.

---

# 66. TEST AGENT — CHANNEL ROUTING

Test:

```text
channel activation
channel deactivation
engine unavailable
engine becomes available
repeated activation
send = 0
send > 0
```

This directly covers G6.

---

# 67. TEST AGENT — AUDIO SAFETY

Add tests/diagnostics for:

```text
NaN
Infinity
feedback runaway
unexpected DC/low-frequency buildup
gain explosions
```

Use deterministic synthetic signals where possible.

---

# 68. TEST AGENT — CHARACTER PRESETS

For every character:

```text
load
inspect settings
edit one parameter
edit second parameter
switch preset
return to custom
A/B
```

Verify no accidental state loss.

---

# 69. TEST AGENT — MCP

Run all 27 moves through MCP.

The verification should identify the type of each move:

```text
trigger
hold
control
mute
DSP generator
```

and verify the correct expected outcome.

Do not use a single generic RMS assertion for every move.

---

# 70. TEST AGENT — MIDI

Verify all 27 move IDs exist in the MIDI registry.

For each:

```text
MIDI event
 ↓
parameterRouter
 ↓
DubRouter
 ↓
move
 ↓
bus
```

---

# 71. TEST AGENT — EXPORT

Test:

```text
create lane
save
load
export
import
compare
```

Use deterministic event data.

This should become a permanent regression test.

---

# 72. AUDIO VALIDATION

Automated tests are not sufficient for the DSP.

Every major DSP phase requires listening tests.

Create a deterministic test project containing:

```text
kick
bass
skank
snare
horn
vocal
pad
percussion
```

with a predictable reggae/dub-style arrangement.

Use the same material for every character A/B.

---

# 73. CHARACTER A/B TESTS

Test:

```text
TUBBY
SCIENTIST
PERRY
MAD PROFESSOR
```

against the researched reference qualities.

The purpose is not to recreate a commercial recording exactly.

Ask:

```text
Does the character have the intended tonal behavior?

Does the return behave differently?

Does the space feel different?

Does the saturation behave differently?

Does the stereo field behave differently?

Does the character remain useful at normal operating levels?
```

---

# 74. TUBBY LISTENING TEST

Verify:

```text
dark return
stepped HPF
spring character
short/tight echo behavior
controlled low end
narrower stereo
```

The filter should sound like a performance control rather than a generic modern EQ.

---

# 75. SCIENTIST LISTENING TEST

Verify:

```text
cleaner tone
mid scoop
bright plate-like space
strong drops
less glue compression
precise intervention
```

The compressor bypass should be audibly meaningful without causing level inconsistencies.

---

# 76. PERRY LISTENING TEST

Verify:

```text
tape accumulation
phaser/flanger
spring chaos
near-mono field
lo-fi degradation
unstable texture without instability
```

The result must not simply be:

```text
"more distortion"
```

---

# 77. MAD PROFESSOR LISTENING TEST

Verify:

```text
wide stereo
cleaner high end
lush reverb
digital delay
ping-pong spatial movement
controlled low-mid
```

---

# 78. PERFORMANCE SIMULATOR

Once the AI performer exists, create an offline deterministic simulation.

Input:

```text
project/riddim
BPM
persona
random seed
duration
```

Output:

```text
BAR 1
LISTEN

BAR 3
SNARE → ECHO

BAR 4
FILTER RIDE

BAR 8
VERSION DROP

BAR 12
HORN → SPRING

BAR 16
RESET
```

This is essential for tuning without repeatedly starting the full UI.

---

# 79. PERFORMANCE INVARIANTS

The AI must satisfy these rules.

```text
Do not throw on silent channels.

Do not repeatedly throw every bar merely because probability allows it.

Do not stack unlimited wet effects.

Do not leave dangerous feedback running indefinitely.

Do not accidentally remove foundation channels.

Do not survive transport stop with active gestures.

Do not survive seek with stale predictions.

Do not destroy custom preset settings.

Do not bypass DubRouter.

Do not bypass DSP safety.

Do not treat randomness as musicality.

Do not assume every 4/4 pattern is 16 rows per bar.

Do not confuse loudness with successful performance.

Do not confuse activity with quality.
```

---

# 80. AGENT EXECUTION ORDER

Agents should execute in this order.

## STAGE 1 — COMPLETE WHAT EXISTS

```text
1. architecture audit
2. G1 MIDI
3. G2 lane colors
4. G3 keyboard
5. G10 DJ Toast
6. G11 preset A/B
7. G8 MCP sweep
```

## STAGE 2 — PROTECT DATA

```text
8. G4 dbx export
9. G5 persistence tests
```

## STAGE 3 — FIX ENGINE INTEGRATION

```text
10. G6 channel activation retry
11. G12 BPM-following echo
12. G13 sidechain source
13. G15 master insert transition
14. G16 preset/edit coherence
15. G9 echo/spring chain self-oscillation
```

## STAGE 4 — DSP COLOR

```text
16. Tubby shelf
17. Scientist scoop
18. SpaceEcho feedback filtering
19. return M/S
20. Tubby stepped HPF
21. liquid flanger
22. Perry tape stack
23. character macro
```

## STAGE 5 — HARDENING

```text
24. move tests
25. DubBus tests
26. lane tests
27. routing tests
28. persistence tests
29. MIDI tests
30. MCP tests
31. safety tests
```

## STAGE 6 — MUSICAL INTELLIGENCE

```text
32. MusicalClock abstraction where genuinely needed
33. MusicalEventProvider
34. channel musical model
35. event prediction
36. PerformanceContext
37. intention layer
38. performer state machine
39. gesture scheduling
40. wet-energy model
41. consequence model
42. arrangement intelligence
43. persona behavioral profiles
44. contextual variance
45. call/response
46. repetition/novelty
47. phrase awareness
48. performance recording metadata
49. performer UI
50. deterministic performance simulator
```

---

# 81. IMPORTANT DEPENDENCY RULE

Do not implement later-stage AI abstractions merely because they appear in this plan.

For each proposed abstraction, the agent must first ask:

```text
Does existing code already provide this?

Can the existing transport/store/router be extended?

Will this abstraction reduce complexity?

Does it solve an observed problem?

Does it introduce a second source of truth?
```

If the answer is no, do not add it.

The architecture should become **simpler**, not merely more sophisticated.

---

# 82. NO GREENFIELD DUPLICATION

Never create:

```text
AI DubBus
AI DubRouter
AI MoveRegistry
AI ChannelRouter
AI LanePlayer
AI MIDI router
```

There should remain one canonical implementation of each.

The AI is a **decision layer above the existing performance infrastructure**.

---

# 83. SIGNAL-FLOW PRINCIPLE

The intended architecture is:

```text
TRACKER / DJ AUDIO
       ↓
PER-CHANNEL ISOLATION
       ↓
DUB SEND
       ↓
DUB BUS
       ↓
CHARACTER COLOR
       ↓
EFFECT RETURN
       ↓
MASTER
```

Performance:

```text
USER / MIDI / KEYBOARD / PAD / MCP / LANE / AI
       ↓
DubRouter
       ↓
DubMove
       ↓
DubBus / Mixer
```

Keep these two paths conceptually separate:

```text
AUDIO PATH
```

and:

```text
CONTROL/PERFORMANCE PATH
```

---

# 84. SOUND-COLORING PRINCIPLE

Do not turn the DubBus into a clean modern mastering processor.

The character comes from interaction:

```text
filter
+
tape
+
echo
+
feedback filtering
+
spring
+
gain staging
+
stereo behavior
```

The research specifically distinguishes these engineer approaches.

Therefore:

```text
Tubby ≠ generic dark preset

Scientist ≠ generic bright preset

Perry ≠ generic distortion preset

Mad Professor ≠ generic stereo preset
```

Each character should emerge from multiple interacting parameters.

---

# 85. PERFORMANCE PRINCIPLE

The AI should eventually feel like someone operating a desk.

Desired behavior:

```text
listen for several bars
 ↓
identify foundation
 ↓
identify accents
 ↓
identify upcoming event
 ↓
wait
 ↓
anticipate
 ↓
open send
 ↓
capture hit
 ↓
close send
 ↓
ride echo
 ↓
darken return
 ↓
listen
 ↓
leave space
 ↓
approach phrase boundary
 ↓
remove harmonic layer
 ↓
allow tail to fill space
 ↓
restore source
 ↓
continue
```

Not:

```text
250ms timer
 ↓
roll probability
 ↓
effect
 ↓
cooldown
 ↓
repeat
```

---

# 86. FINAL WORLD-CLASS DEFINITION

The Dub Studio is complete when all of the following are true.

## ENGINE

```text
All 27 moves work.
All control surfaces reach the same move system.
MIDI is complete.
Keyboard is complete.
MCP is complete.
Lane recording works.
Lane playback works.
Persistence works.
.dbx round-trip works.
Transport behavior is safe.
Channel activation is reliable.
```

## DSP

```text
Tubby has stepped filter character.
Scientist has meaningful mid-scoop and no glue compression.
Perry has accumulated tape/phaser/spring character.
Mad Professor has wide/lush/digital character.
SpaceEcho feedback gets progressively filtered.
Return width is character-dependent.
Gain staging remains safe.
Live graph changes are glitch-free.
```

## PERFORMANCE

```text
The performer anticipates events.
The performer remembers previous actions.
The performer can rest.
The performer understands wet density.
The performer understands phrase structure.
The performer can target important musical material.
The performer can create drops.
The performer can respond to consequences.
The performer does not spam effects.
```

## PERSONAS

```text
Tubby feels different from Scientist.
Scientist feels different from Perry.
Perry feels different from Mad Professor.
Mad Professor feels different from Jammy.
```

The distinction must be visible in **behavior over time**, not merely in which preset parameters are loaded.

## HUMAN CONTROL

Everything the AI can do should remain controllable by:

```text
mouse
keyboard
MIDI
pads
automation
lane
MCP
```

where technically appropriate.

---

# 87. FINAL AGENT RULE

Before every implementation, the agent must answer these questions internally in the task report:

```text
1. What already exists?

2. What exactly is missing?

3. What file/module owns that responsibility?

4. Can the existing architecture be extended?

5. What behavior must remain unchanged?

6. What is the smallest safe implementation?

7. How will it be tested?

8. How will it be audibly verified if DSP is involved?

9. What regression could this introduce?

10. What is the explicit acceptance criterion?
```

Agents must not interpret this document as permission to refactor unrelated parts of DEViLBOX.

The guiding principle is:

```text
KEEP WHAT WORKS
FIX WHAT IS BROKEN
ADD WHAT IS ACTUALLY MISSING
VERIFY THE DSP
THEN MAKE THE PERFORMER MUSICAL
```

The end result should not merely be a technically impressive effect rack.

It should be a **playable dub desk inside DEViLBOX**: a system where the DSP has believable character, the controls behave like instruments, the lane records actual performances, the AI can operate the same desk as a human, and the resulting performance has timing, restraint, repetition, anticipation, space, and consequence.
