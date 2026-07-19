---
date: 2026-04-24
topic: open-source-midi-controllers
tags: [midi, hardware, open-source, controller, pads, faders, display]
status: research-complete
---

# Open-Source MIDI Controllers for DEViLBOX

## DEViLBOX Requirements

| View | Hardware needed |
|------|----------------|
| Drum Pad | 16 velocity-sensitive pads (aftertouch ideal) |
| Dub Deck | 4–9 faders (per-channel sends + master) + ~30 trigger buttons |
| DJ View | Crossfader + deck volume faders + EQ knobs + pitch sliders |
| All views | Display for synth params / dub status / DJ info |

## Key Finding

**No single off-the-shelf open-source controller covers all three use cases.**
Velocity-sensitive pads are almost entirely absent from the open-source space.

---

## Controller-by-Controller Summary

### OpenDeck L Board — ★ Best Platform
- **GitHub:** shanteacontrols/OpenDeck — Apache 2.0 (firmware + hardware)
- **Hardware:** RP2040, 128 digital inputs, 64 analog inputs (FSR/fader), 64 digital outputs, I2C OLED connector, USB-C MIDI + DIN MIDI
- **Pads:** FSR (Force Sensitive Resistor) sensors give velocity — this is the ONLY open-source path to velocity-sensitive pads
- **Faders:** Yes — up to 64 analog inputs (faders, FSR, etc.)
- **Display:** OLED via I2C connector
- **Buy:** Lectronz store, ~$80 for the board (you build the enclosure + wire sensors)
- **Deep integration:** Apache 2.0, full SysEx config protocol, browser configurator. Can be reflashed with custom firmware completely.
- **Gap:** Requires custom hardware fabrication — no off-the-shelf enclosure with pads+faders

---

### 16nx Faderbank — ★ Best Pure Fader Controller
- **GitHub:** 16n-faderbank/16nx — MIT firmware, CC BY-SA 4.0 hardware
- **Hardware:** 16 × 60mm faders, USB-C MIDI, DIN MIDI, CV, I2C, RP2040
- **Pads:** None
- **Faders:** 16 — perfect for 9-channel dub deck sends + room to spare
- **Display:** None
- **Buy:** Pusherman Productions UK (~£160), Slate + Ash, Michigan Synth Works XVI variant (~$300 USD)
- **Deep integration:** MIT + open hardware means fully hackable firmware. Could add SysEx for LED feedback.
- **Best for:** Dub deck channel sends. Pair with another controller for pads.

---

### Faderpunk (AtoVproject) — ★ Faders + RGB Buttons
- **GitHub:** ATOVproject/faderpunk — GPLv3 firmware (hardware files unclear)
- **Hardware:** 16 × 60mm ALPS faders, 16 × RGB backlit buttons, USB-C MIDI, DIN MIDI, RP2350B (Rust firmware)
- **Pads:** None (but 16 RGB buttons can fire dub moves)
- **Faders:** 16 faders
- **Display:** None
- **Buy:** Perfect Circuit, Exploding Shed, Detroit Modular — ~€650
- **Deep integration:** GPLv3 firmware, "apps" API for extensions. 16 RGB buttons controllable via MIDI.
- **Best for:** Dub deck sends + 16 dub move trigger buttons in one unit. Expensive.

---

### Monome Grid One — Buttons Only
- **GitHub:** monome/iii — GPLv3 firmware; hardware schematics CC BY-NC-SA (old kit only)
- **Hardware:** 16×8 grid of 128 capacitive buttons, per-button white LED, USB MIDI (RP2040 models only)
- **Pads:** NOT velocity-sensitive — binary on/off only
- **Faders:** None
- **Display:** None
- **Buy:** monome.org — $800
- **Deep integration:** iii firmware is Lua-scriptable on-device. Standard MIDI note messages control LEDs.
- **Gap:** No velocity, expensive per-button, no faders. The NC license restricts hardware cloning.

---

### MidiFighter Twister — NOT Truly Open
- **GitHub:** DJ-TechTools/Midi_Fighter_Twister_Open_Source — restrictive license
- **Hardware:** 16 push-encoders with RGB rings, USB-C MIDI
- **License verdict:** Source-available for personal use only — NOT open source. No hardware schematics. Cannot legally modify and redistribute.
- **Skip:** License kills it for deep integration.

---

### Wee Noise Makers PGB-1 — Interesting Small Form
- **GitHub:** wee-noise-makers/WNM-PGB1-firmware — GPLv3
- **Hardware:** 30 buttons, 128×64 OLED display, TRS MIDI, RP2040, €279
- **Pads:** None (tactile buttons)
- **Faders:** None
- **Display:** OLED (but used by internal UI, not host-writable via SysEx out of the box)
- **Deep integration:** GPLv3 firmware — can add host-writable display SysEx. Small form factor.

---

### Drumboy Pro — Future Option (Aug 2026)
- **GitHub:** Randomwaves/Drumboy — MIT firmware + hardware (KiCad)
- **Hardware:** 5.3" display, 8 rotary knobs (10 banks = 80 params), tactile buttons, MIDI I/O, embedded Linux
- **Gap:** Kickstarter, ships August 2026. Groovebox first, controller second. No velocity pads, no faders.

---

## Recommended Setup for DEViLBOX

### Option A — Purpose-Built (Max Integration, Requires Fabrication)

Build a custom controller using **OpenDeck L board**:

| Control | Component | Maps to |
|---------|-----------|---------|
| 16 FSR pads (velocity) | Force-sensitive resistors + OpenDeck | Drum Pad view |
| 9 faders | 60mm ALPS linear pots + OpenDeck | Dub deck channel sends |
| 30+ buttons | Mechanical buttons + OpenDeck | Dub move triggers |
| 2 encoders | Rotary encoders + OpenDeck | DJ EQ / pitch |
| 128×64 OLED | I2C OLED via OpenDeck connector | Synth params / dub status |

Total BOM: ~$200-400 in parts + 3D printed/CNC enclosure + assembly time.
Result: 100% open source, fully custom, deep SysEx integration possible.

### Option B — Buy Now (Best Off-the-Shelf Split)

- **Maschine Mk3** (~$400) — 16 velocity pads + NKS display integration (see NI plan)
- **16nx Faderbank** (~£160) — 16 faders for dub deck sends

Total: ~$550-600. Maschine gives velocity pads + NKS display. 16nx gives proper faders.
16nx is fully open (MIT + CC BY-SA) so we can add custom SysEx feedback.
Maschine is closed hardware but the NI display integration plan covers it separately.

### Option C — All Open, No Fabrication

- **16nx Faderbank** (~£160) — 16 faders for dub deck
- **Faderpunk** (~€650) — 16 faders + 16 RGB trigger buttons for dub moves

Covers dub deck well. Still misses velocity-sensitive drum pads. Total ~€850+.

---

## What "Deep Integration" Looks Like Per Controller

### 16nx Faderbank — What We Can Do (MIT license)

1. Add SysEx receive for LED feedback (none currently — faders only send)
2. Fork firmware to send fader position at 14-bit resolution (currently 7-bit CC)
3. Add "dub deck mode" where fader 16 is master send, 1-15 are channels
4. No display to push content to

### OpenDeck — What We Can Do (Apache 2.0)

1. Add custom SysEx commands for live display content (OLED)
2. Define DEViLBOX-specific MIDI profile in the browser configurator
3. Build a DEViLBOX preset for the web configurator
4. Map FSR velocity to drum pad view directly
5. Add LED matrix feedback for dub move fire events

### Monome Grid — What We Can Do (GPLv3 Lua)

1. Write a Lua script running ON the device that subscribes to MIDI from DEViLBOX and lights LEDs accordingly
2. Color-code dub move buttons by category (INSTR vs PROC)
3. Flash a button on dub move fire
4. No velocity — hard limit for drum pads

---

## Open Questions / Follow-Up

- [ ] Can OpenDeck OLED display receive arbitrary content via SysEx from host? (Check wiki)
- [ ] Is the 16nx firmware easy to extend to add SysEx receive? (RP2040 + Arduino-style)
- [ ] Does Faderpunk hardware schematic exist? (Not found in repo)
- [ ] Is there any open-source controller with velocity pads + faders + display in a single unit? (Answer appears: No, as of April 2026)

## References

- 16nx: github.com/16n-faderbank/16nx
- OpenDeck: github.com/shanteacontrols/OpenDeck
- Faderpunk: github.com/ATOVproject/faderpunk
- Monome iii: codeberg.org/tehn/iii
- WNM PGB-1: github.com/wee-noise-makers/WNM-PGB1-firmware
- Drumboy: github.com/Randomwaves/Drumboy
- NI Display plan: thoughts/shared/plans/2026-04-24-ni-hardware-display-integration.md
