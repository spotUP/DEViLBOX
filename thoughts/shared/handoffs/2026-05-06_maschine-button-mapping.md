---
date: 2026-05-06
topic: maschine-mk2-button-mapping
tags: [maschine, midi, nks, hardware, hid]
status: draft
---

# Handoff — Maschine MK2 Button Mapping + NKS Auto-mapping

## Task(s)

1. **PRIMARY**: Create a complete Maschine MK2 button mapping preset — map all physical buttons to DEViLBOX EditorActions
2. **SECONDARY**: Fix NKS auto-mapping so turning MK2 knobs controls the active synth (e.g. TB-303)

## Critical References

| File | Purpose |
|------|---------|
| `src/midi/MaschineHIDBridge.ts` | Routes NIHIA events → MIDI messages. Contains the broken `BUTTON_NOTES` map. |
| `tools/maschine-bridge.ts` | Node subprocess: bridges nihia stdout → WebSocket to browser |
| `tools/maschine-nihia.c` | C bridge: HID output (display/LEDs) + NIHIA IPC input (knobs/pads/buttons) |
| `src/midi/ButtonMapManager.ts` | Persists MIDI note→EditorAction mappings, applies them on incoming MIDI |
| `src/midi/controllerProfiles.ts` | 10 existing controller profiles; NO Maschine MK2 profile yet |
| `src/midi/performance/parameterRouter.ts` | NKS CC 70-77 → active synth parameter routing |
| `src/midi/performance/NIHardwareProtocol.ts` | OLED display rendering (updateMaschineDisplay, drawMaschineWaveform) |
| `src/midi/performance/MK2Display.ts` | 256×64 1bpp framebuffer + 5×7 font renderer |

## The Root Bug — All Buttons Currently Silently Dropped

`tools/maschine-bridge.ts` emits button events as:
```json
{ "type": "button", "name": "btn45", "pressed": true }
```

`MaschineHIDBridge.ts` `BUTTON_NOTES` map uses human-readable keys:
```typescript
const BUTTON_NOTES: Record<string, number> = {
  play: 116, rec: 117, erase: 118, restart: 119, ...
};
```

At `MaschineHIDBridge.ts:154-157`:
```typescript
} else if (evt.type === 'button') {
  const note = BUTTON_NOTES[evt.name];
  if (note === undefined) return;  // "btn45" never matches → ALL buttons dropped
```

Every single MK2 button press is silently discarded here.

## What Needs to Be Built

### Step 1 — Discover NIHIA button numbers

Add temporary logging to `tools/maschine-bridge.ts` to print all button events:
```typescript
if (evt.type === 'button') {
  console.error(`[BTN] btn=${evt.btn} pressed=${evt.pressed}`);
}
```
Then physically press each button on the MK2 and record the mapping.

Known/expected NIHIA button numbers (from NI SDK docs and community research):
- These are NOT confirmed — must be discovered by physical testing
- The C bridge emits `{"type":"button","btn":N}` where N is the raw NIHIA integer

### Step 2 — Fix `MaschineHIDBridge.ts`

Replace the named `BUTTON_NOTES` string lookup with a numeric btn→note map:
```typescript
// Maps NIHIA button number → MIDI note (channel 14)
const NIHIA_BUTTON_NOTES: Record<number, number> = {
  // Discovered by testing — fill these in
  45: 116,  // play (example)
  46: 117,  // rec
  // ...
};
```

And update `maschine-bridge.ts` to pass the raw `btn` number through:
```typescript
broadcast({ type: 'button', name: `btn${evt.btn}`, btnId: evt.btn, pressed: ... });
```

Or alternatively: do the name→number translation in `maschine-bridge.ts` itself.

### Step 3 — Add Maschine MK2 controller profile to `controllerProfiles.ts`

Structure to mirror from an existing profile (e.g. AkaiMPKMiniMK3):
```typescript
{
  id: 'maschine-mk2',
  name: 'Native Instruments Maschine MK2',
  detect: (deviceName: string) => deviceName.toLowerCase().includes('maschine'),
  mappings: [
    { midiNote: 116, midiChannel: 14, action: 'transport.play', displayName: 'Play' },
    { midiNote: 117, midiChannel: 14, action: 'transport.toggleRecord', displayName: 'Rec' },
    { midiNote: 118, midiChannel: 14, action: 'edit.undo', displayName: 'Erase' },
    { midiNote: 119, midiChannel: 14, action: 'transport.playFromStart', displayName: 'Restart' },
    { midiNote: 80,  midiChannel: 14, action: 'pattern.next', displayName: 'Scene →' },
    { midiNote: 81,  midiChannel: 14, action: 'pattern.previous', displayName: 'Pattern ←' },
    // Group A-H (notes 0-7, ch14) → NKS page 0-7
    { midiNote: 0, midiChannel: 14, action: 'cmd:nks.page.0', displayName: 'Group A / NKS Page 1' },
    { midiNote: 1, midiChannel: 14, action: 'cmd:nks.page.1', displayName: 'Group B / NKS Page 2' },
    // ... H
  ]
}
```

Note: `cmd:nks.page.N` actions may need to be registered in `CommandRegistry` first.

### Step 4 — NKS Page Navigation via Group A-H

Group A-H buttons (MIDI ch14, notes 0-7) should navigate NKS parameter pages.
Need to either:
- Add `cmd:nks.page.N` to CommandRegistry and wire to `NKSAutoMapper.setPage(N)`
- Or use a dedicated EditorAction type `nks.page` with a `pageIndex` payload

### Step 5 — Fix NKS auto-mapping for active synth

When user clicks a synth (e.g. TB-303), `syncKnobsToSynth` should fire and configure
CC 70-77 to control that synth's parameters for the current NKS page.

Verify the chain:
1. User selects instrument → `setActiveInstrumentId` in store
2. Store change → `NKSAutoMapper` or `parameterRouter` notified
3. `nksKnobAssignments` updated for CC 70-77 → correct param IDs for that synth
4. Knob turn → CC 70 arrives → routes to correct param → synth updates

The likely failure: `syncKnobsToSynth` is not subscribed to the active instrument store,
or the param IDs for TB-303 don't match the NKS page params.

## MK2 Physical Button Layout (for reference)

```
[REC] [ERASE] [RESTART]         [TAP] [SWING] [TEMPO] [VOLUME]
[PLAY]                           [STEP] [BROWSE] [AUTO] [SAMPLING]
                                 [MACRO] [LOCK] [NOTE REPEAT]
[SCENE][PATTERN][PAD MODE]
[NAVIGATE][DUPLICATE][SELECT]
[SOLO][MUTE]                     [← →] [ENTER]

[GroupA][B][C][D]
[GroupE][F][G][H]

Pads 1-16 (4×4 grid)
8 Encoders above pads
```

## Hardware State (What Works)

- OLED displays: working, white text on black background, 256×64 px
- Pad LEDs: working via `setAllPadColors` (49-byte report 0x80)
- Knob input: CC 70-77 on MIDI ch15, routes through NKS system
- Pad input: notes 36-51 on MIDI ch15
- Button input: BROKEN — all silently dropped (see Root Bug above)
- Display brightness: dim unless Maschine 3 is briefly opened to initialize; correct
  0xF8/0xF9 feature report format for brightness not yet known

## Recent Session Context

The previous session (2026-05-05, see `thoughts/shared/handoffs/2026-05-05_maschine-mk2-nihia.md`)
completed:
- Hybrid HID+NIHIA bridge (maschine-nihia.c + maschine-bridge.ts)
- OLED display rendering with MK2Display class
- Pad LED control
- Knob routing via CC 70-77 → NKS system
- Inverted display (black bg, white text)

## Next Steps (ordered)

1. Add temp logging to maschine-bridge.ts, press every button, record btn numbers
2. Fix BUTTON_NOTES in MaschineHIDBridge.ts to use discovered numeric btn IDs
3. Add Maschine MK2 profile to controllerProfiles.ts with full button→action mapping
4. Wire Group A-H to NKS page navigation (add CommandRegistry entries if needed)
5. Trace NKS auto-mapping chain and fix syncKnobsToSynth trigger for active synth
6. Test: press Play → transport plays; turn Group A → NKS page 1; knob 1 → 303 cutoff

## Other Notes

- Context limit was hit during this session — agents could not be spawned to finish research
- The plan file at `/Users/spot/.claude/plans/tingly-frolicking-rivest.md` is a stub (empty)
- Display brightness: hardware initialized to dim by default; Maschine 3 sets correct level
  via unknown feature report. Low priority — brightness persists after Maschine 3 is closed.
- Right screen "scrolling lines" artifact: may be refresh rate / partial-frame issue in
  maschine-nihia.c's display write chunking. Not investigated.
