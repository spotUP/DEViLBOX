# Handoff: Behringer X-Touch Family Support

**Date:** 2026-05-01  
**Scope:** X-Touch Compact, X-Touch, X-Touch One  
**Status:** Code complete, **not hardware-validated yet**

---

## Summary

DEViLBOX now has first-class support for the Behringer **X-Touch Compact**, **X-Touch**, and **X-Touch One** in the DJ surface layer.

This work adds:

- device detection presets
- input routing for CC + MCU-style pitch-bend motor faders
- note-triggered dub move routing
- bidirectional hardware feedback for:
  - motor faders
  - button LEDs
  - encoder rings
- regression tests for preset detection and feedback encoding

**Important:** this was implemented from codebase inspection plus public protocol evidence, but **no real hardware was available during implementation**. The remaining task is real-device bring-up and layout tuning.

---

## Files Added

- `src/midi/xTouchFeedback.ts`
- `src/hooks/useXTouchFeedback.ts`
- `src/midi/performance/__tests__/xTouchSupport.test.ts`

## Files Modified

- `src/midi/djControllerPresets.ts`
- `src/midi/DJControllerMapper.ts`
- `src/components/dj/DJView.tsx`
- `package.json`
- `src/components/embed/PatternEditorEmbed.tsx`

---

## What Was Implemented

### 1. New controller presets

**File:** `src/midi/djControllerPresets.ts`

Added presets for:

- `behringer-xtouch-compact`
- `behringer-xtouch`
- `behringer-xtouch-one`

Auto-detection order matters:

- **Compact** must match before generic `"x-touch"`
- **One** must match before generic `"x-touch"`

That ordering is now in place.

### 2. Pitch-bend motor-fader input

**File:** `src/midi/DJControllerMapper.ts`

Added `pitchBendMappings` support so MCU-style hardware can drive DJ params through pitch bend rather than only CC.

Used for:

- **X-Touch**: 8 channel strips + crossfader
- **X-Touch One**: single-fader crossfader mode

### 3. Note-to-dub-parameter routing

**File:** `src/midi/DJControllerMapper.ts`

Extended note mappings so a note can either:

- trigger an existing DJ action, or
- directly route a `dub.*` parameter through `routeParameterToEngine()`

This is how X-Touch buttons now trigger dub moves without needing a separate controller layer.

### 4. Dedicated X-Touch feedback encoder

**File:** `src/midi/xTouchFeedback.ts`

Added pure helpers for:

- 14-bit MCU pitch-bend output
- Compact CC fader output
- MCU button LED output
- Compact global button LED output
- MCU/Compact encoder ring output
- feedback message assembly from current DJ + dub state

### 5. Live feedback hook in DJ view

**Files:** `src/hooks/useXTouchFeedback.ts`, `src/components/dj/DJView.tsx`

Added a DJ-only hook that:

- watches DJ store state
- watches dub bus state
- reads the active DJ preset from `DJControllerMapper`
- uses the currently selected MIDI output device
- sends updated feedback messages on animation-frame batching

It also tracks **touched faders** and suppresses outgoing motor writes while the user is physically holding the fader.

---

## Current Mapping Shape

### X-Touch Compact

Implemented as a **CC-style DJ/dub mixer surface**:

- faders 1-8 + main fader use CC
- encoders use CC
- buttons use notes
- touch sensing uses CC `101-109`

Current intent:

- faders = deck volumes / EQ / crossfader
- encoders = deck filter/filter resonance/pitch plus dub bus controls
- top-row buttons = play / PFL / loop states
- additional rows = cues, beat jumps, and dub moves

### X-Touch

Implemented as an **MCU-style surface**:

- motor faders use pitch bend
- encoder rings use CC
- buttons use notes
- touch notes suppress motor writeback while touched

Current intent:

- 8 faders = deck A strip, deck B strip
- master fader = crossfader
- encoders = filter / resonance / pitch / dub controls

### X-Touch One

Implemented as a **single-fader transport + crossfader surface**:

- single motor fader drives crossfader
- one encoder is used for master volume feedback
- note buttons map to play/loop/cue + dub moves

This layout is provisional and will likely be the first one adjusted after real hardware testing.

---

## Important Fixes Already Made During This Pass

Two real issues were caught after the first implementation:

### Compact LED note numbers were wrong

The first feedback pass wrote Compact LEDs to low note numbers that did not match the actual mapped button row.

Fixed so Compact feedback now targets the real top-row mapped notes:

- `16`, `17`, `18`
- `20`, `21`, `22`

### X-Touch One was inheriting full-size X-Touch LEDs

The first feedback pass reused the full-size MCU button list for X-Touch One.

Fixed so X-Touch One now uses its own button layout and does **not** emit bogus full-size channel-strip LED feedback.

---

## Test Coverage Added

**File:** `src/midi/performance/__tests__/xTouchSupport.test.ts`

Covers:

- Compact detection priority over generic X-Touch
- One detection priority over generic X-Touch
- MCU pitch-bend encoding
- Compact CC + LED feedback emission
- touched-fader suppression for MCU motor feedback
- X-Touch One using its own button layout

Test scripts updated:

- `test:ci`
- `test:all`

---

## Validation Already Run

Completed locally:

- `npm run type-check`
- `npm run test -- src/midi/performance/__tests__/xTouchSupport.test.ts`
- `npm run test:ci`

---

## What Is Still Unproven

Because there was **no hardware attached**, these are still assumptions until bring-up:

1. **Exact Behringer firmware behavior**
   - especially X-Touch One
   - especially Compact ring/LED behavior in the user’s chosen mode

2. **Touch message behavior on the real devices**
   - whether every device/model sends exactly the expected touch messages
   - whether any device sends touch on a different channel or note range

3. **Selected output pairing UX**
   - the feedback layer uses the currently selected MIDI output
   - it does **not** auto-pair input/output by device name yet

4. **Best default control layout**
   - especially whether the user prefers more direct dub-bus access vs classic DJ strip controls

---

## First Bring-Up Checklist When Hardware Arrives

### Setup

1. Connect the controller.
2. Open DEViLBOX DJ view.
3. Select the device as **MIDI input**.
4. Select the matching device as **MIDI output**.
5. Move to the DJ surface with the new X-Touch preset active.

### Verify Input

For each device:

1. Move each fader and verify the mapped UI control follows.
2. Press mapped buttons and verify:
   - play
   - cue
   - PFL
   - loop
   - dub moves
3. Turn encoders and verify:
   - filter
   - resonance
   - pitch
   - dub bus params

### Verify Feedback

For each device:

1. Change mixer state in the UI and verify hardware follows.
2. Verify button LEDs reflect:
   - play state
   - PFL state
   - loop state
3. Verify encoder rings move when UI state changes.
4. Verify motor faders follow UI state.
5. Touch and hold a motor fader, then change state in UI:
   - the motor **should not fight the user while touched**
6. Release the fader:
   - the motor should resume following state

### Specifically watch for

- reversed motor direction
- wrong ring mode/value scale
- stale LEDs after preset switch
- output working only after reselecting MIDI output
- Compact in the wrong hardware mode
- X-Touch One button notes differing from current assumption

---

## Most Likely Next Code Changes After Hardware Testing

These are the most likely adjustments once real devices are connected:

1. **Layout tuning**
   - remap some Compact buttons/encoders for a better dub workflow

2. **Startup initialization**
   - explicitly push a full LED/ring/fader state refresh when preset becomes active

3. **Input/output pairing improvements**
   - auto-bind selected output by matching the selected input’s device name

4. **Device quirks**
   - per-model LED/ring differences if Behringer firmware diverges from the assumed standard MIDI behavior

5. **More regression tests**
   - lock in any discovered real-hardware quirks once confirmed

---

## Key Implementation Notes

- Feedback only runs in **DJView** right now.
- Output uses `MIDIManager.getSelectedOutput()`.
- No SysEx layer was added.
- This integration intentionally stays in the existing DJ controller architecture instead of introducing a parallel hardware stack.
- `src/components/embed/PatternEditorEmbed.tsx` was touched only to remove an unrelated unused variable caught by strict type-check.

---

## Recommended Next Step

When the hardware arrives, start with **X-Touch Compact first**. It has the strongest preset + feedback coverage and is the most likely to validate the overall architecture quickly. After that, verify full-size **X-Touch**, then use **X-Touch One** to refine the single-fader layout.
