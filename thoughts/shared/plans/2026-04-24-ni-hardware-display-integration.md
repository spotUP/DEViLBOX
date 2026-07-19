---
date: 2026-04-24
topic: ni-hardware-display-integration
tags: [midi, nks, maschine, komplete-kontrol, display, sysex, nihia]
status: draft
---

# NI Hardware Display Integration

## Goal

Push live DEViLBOX state to the physical displays on Maschine Mk3 and
Komplete Kontrol S-series hardware — synth parameters, dub deck status,
DJ view data, and active pattern info.

## What Already Exists

| File | What it does |
|------|-------------|
| `src/midi/performance/NKSFileFormat.ts` | Full NKSF preset export (RIFF/msgpack, NKS spec v2.0.2) |
| `src/midi/performance/nksTaxonomy.ts` | Parameter taxonomy + page layout |
| `src/midi/NKSAutoMapper.ts` | Auto-maps synth CCs + pushes parameter names to display |
| `src/midi/MPKMiniDisplay.ts` | Akai MPK Mini Mk3 OLED via SysEx (working reference impl) |
| `src/midi/performance/AkaiMIDIProtocol.ts` | Akai SysEx wrapper (display + knob names) |
| `src/components/dialogs/NKSSetupWizard.tsx` | User-facing NKS setup UI |

The Akai MPK Mini display integration is the **reference implementation** —
it proves the SysEx-over-WebMIDI approach works for browser apps.

## Target Hardware

### Maschine Mk3
- 2× 128×64 OLED screens (Group A–D / Group E–H)
- 16 velocity+aftertouch pads with RGB LEDs
- 8 smart strips (touch-sensitive, not faders)
- Protocol: NIHIA (NI Hardware Integration Agent) over USB MIDI SysEx

### Komplete Kontrol S-series (S49/S61/S88)
- 8 per-knob mini OLED displays (show parameter name + value per encoder)
- Light guide: RGB LEDs under every key
- 8 endless encoders
- Protocol: NIHIA over USB MIDI SysEx

## Protocol Research Needed

The NIHIA protocol is not officially documented for third-party hosts,
but has been reverse-engineered by several open-source projects:
- `ni-controllers` (Linux kernel driver)
- `maschine.rs` (Rust implementation)
- Various Python/Node community projects

Key questions to answer during investigation:
1. Which SysEx commands control each display region on Maschine Mk3?
2. Does Komplete Kontrol expose per-knob OLED via SysEx or requires NIHostIntegrationAgent binary?
3. Can Web MIDI API send the required SysEx without elevated permissions?
4. Is there a handshake/authentication step required?

## Proposed Display Content

### Maschine Mk3 — Left screen (Group A–D)

**Synth mode (instrument loaded):**
```
┌─────────────────────────────┐
│ TB-303        Page 2/4      │
│ Cutoff  Res  EnvMod  Decay  │
│  64%    82%   45%    200ms  │
│ Accent  Tune  Wave   Drive  │
└─────────────────────────────┘
```

**Dub deck mode (bus enabled):**
```
┌─────────────────────────────┐
│ DUB BUS ON    Tubby         │
│ ECHO: 380ms  Spring: 65%    │
│ Last: SCREAM  Bar: 3/4      │
│ Ch1:100% Ch2:80% Ch3:0%     │
└─────────────────────────────┘
```

### Maschine Mk3 — Right screen (Group E–H)

**DJ mode:**
```
┌─────────────────────────────┐
│ DECK A         DECK B       │
│ 128.0 BPM     132.5 BPM    │
│ Pitch: +2st   Pitch: 0st   │
│ ████░░░░ X ░░░░████        │
└─────────────────────────────┘
```

### Komplete Kontrol S-series — Per-knob OLEDs

Each of the 8 encoders shows its mapped parameter name on the small OLED
above it. This already works conceptually (see NKSAutoMapper) — just needs
the NIHIA SysEx commands instead of the Akai ones.

### Komplete Kontrol — Light Guide

The RGB LEDs under each key can indicate:
- Notes active in the current tracker pattern (green)
- Hot cue positions (deck A = blue, deck B = amber)
- Dub move trigger zones (red when bus is active)

## Implementation Plan

### Phase 1 — Protocol research (before any code)

1. Read `ni-controllers` Linux driver source for NIHIA SysEx format
2. Read `maschine.rs` for Maschine Mk3 display command structure
3. Confirm WebMIDI SysEx works with NI hardware (no kernel driver needed)
4. Document exact byte layout for:
   - Maschine Mk3 screen write (left + right)
   - Maschine Mk3 pad LED set (RGB per pad)
   - Komplete Kontrol per-knob OLED write
   - Komplete Kontrol light guide LED set

### Phase 2 — NIHardwareProtocol.ts

Mirror the existing `MPKMiniDisplay.ts` pattern but for NI hardware.

```typescript
// src/midi/NIHardwareProtocol.ts
export function writeMaschineScreen(side: 'left' | 'right', lines: string[]): void
export function setMaschinePadColor(pad: number, r: number, g: number, b: number): void
export function writeKompleteKnobOLED(knob: number, name: string, value: string): void
export function setKompleteKeyColor(key: number, r: number, g: number, b: number): void
```

### Phase 3 — Display content sources

Wire stores to display updates via subscriptions:

| DEViLBOX state | Display target |
|----------------|---------------|
| `useInstrumentStore.currentInstrument` | Maschine left screen header |
| `nksKnobAssignments` (current page) | Maschine left screen params / KK OLEDs |
| `useDubStore` (bus, persona, lastMove) | Maschine left screen dub mode |
| `useDJStore` (decks, crossfader) | Maschine right screen DJ mode |
| `useTrackerStore.patterns[current]` | KK light guide note highlights |

### Phase 4 — Auto-detect hardware

Extend `NKSAutoMapper.syncNKSToSynth` to detect which hardware is connected
and route display updates accordingly. Priority:
1. Komplete Kontrol S-series (per-knob OLEDs, light guide)
2. Maschine Mk3 (dual screen, pad LEDs)
3. Akai MPK Mini Mk3 (current, already working)

### Phase 5 — Pad LED sync

When the drum pad view is active, mirror the pad colors from
`useDrumPadStore` to Maschine's physical pad LEDs in real time.
On dub move fire → flash the corresponding pad red.

## Success Criteria

- [ ] Maschine Mk3 left screen shows synth parameter page (name + value per knob)
- [ ] Maschine Mk3 left screen switches to dub deck view when bus is enabled
- [ ] Maschine Mk3 right screen shows DJ deck A/B status when DJ view is active
- [ ] Maschine Mk3 pad LEDs mirror drum pad colors from the store
- [ ] Komplete Kontrol per-knob OLEDs show NKS parameter names on turn
- [ ] Komplete Kontrol light guide highlights notes in current tracker pattern
- [ ] Hardware auto-detected on MIDI connect, no manual setup required

## Open Questions

- Does NIHIA require the NIHostIntegrationAgent process running on the host OS,
  or is raw SysEx sufficient from a browser context?
- Does NI enforce any handshake that requires their binary SDK?
- WebMIDI SysEx requires `sysex: true` in the permission request — already
  handled in our MIDIManager, needs verification.

## References

- `src/midi/MPKMiniDisplay.ts` — reference implementation pattern
- `src/midi/performance/AkaiMIDIProtocol.ts` — Akai SysEx wrapper
- `src/midi/NKSAutoMapper.ts` — parameter page routing
- ni-controllers Linux driver: https://github.com/torvalds/linux/tree/master/drivers/hid/hid-ni-maschine
- maschine.rs (protocol reference)
- NKS SDK v2.0.2 (already implemented in NKSFileFormat.ts)
