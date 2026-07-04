---
date: 2026-05-05
topic: maschine-mk2-nihia
tags: [midi, maschine, hid, nihia, hardware, controller]
status: in-progress
---

# Maschine MK2 Deep Integration

## Task
Get all 8 main Maschine MK2 knobs working in DEViLBOX without requiring Maschine 3 running.

## What Was Done This Session

### Dev server port
Changed Vite from 5173 → 5174 (`dev.sh:21`).

### HID Bridge (partially working)
Built `tools/maschine-bridge.ts` — node-hid bridge that opens the Maschine HID interface and forwards events via WebSocket on port 4005. Browser-side client at `src/midi/MaschineHIDBridge.ts`.

**What works via HID:**
- 16 pads → note on/off
- Transport buttons → note on/off
- 2 encoders work (Volume encoder → CC 111 → resonance, Tempo encoder → CC 120 → cutoff)

**What doesn't work via HID:**
- The 8 main knobs send NO data on the HID interface. Confirmed via extensive testing.

**Root cause discovered:** The 8 main knobs are NOT on the HID interface at all. They communicate exclusively via the **NIHIA IPC protocol** (CFMessagePort on macOS), not USB HID. This was confirmed by the `rebellion` open-source project which fully reverse-engineered the protocol.

### NIHIA Protocol (in progress)
Built `tools/maschine-nihia.c` — C program that connects to `NIHWMainHandler` CFMessagePort and attempts the NIHIA handshake.

**Status:**
- Successfully connects to NIHWMainHandler ✓
- Sends MSG_SERIAL_CONNECT (msgid=0x03444900, deviceid=0x1140, serial="6F05B5C7") ✓
- Gets back 4 bytes: `64 69 63 65` ("dice") — NOT CONST_TRUE (0x74727565)
- Handshake fails

**Next debugging step:** Send MSG_VERSION first and dump the response, then try MSG_SERIAL_CONNECT. The "dice" response meaning is unknown — could be device already claimed, wrong version, or protocol mismatch.

### Pattern Editor Performance Fix
`src/components/tracker/PatternEditorCanvas.tsx` — removed dead `instruments` subscription from useInstrumentStore (was subscribed but never used, caused re-render on every MIDI CC update).

### MIDI Controller Wizard
`src/components/dialogs/MIDIControllerWizard.tsx` — added scroll to modal content area so "Continue" button is reachable with 15+ MIDI devices.

### CC Mappings Added
`src/stores/useMIDIStore.ts` — added CC 14-21 (Maschine Controller Editor Page 1 knobs) mapped to TB303 params: cutoff/resonance/envMod/decay/accent/overdrive/slideTime/volume. Also added CC 110-120 for HID bridge encoders.

### Dev.sh Changes
- Port 5174 for Vite
- HID bridge removed from auto-start (conflicts with Maschine 3 HID exclusive access)
- Maschine MK2 excluded from Web MIDI auto-connect (lets HID bridge own it)

## Critical References

### NIHIA Protocol (rebellion)
- Full reverse-engineering: `/tmp/rebellion/` (cloned locally)
- Key file: `/tmp/rebellion/scripts/niproto.lua` — all message formats
- Key file: `/tmp/rebellion/scripts/niinstance_methods.lua` — init sequence
- Key file: `/tmp/rebellion/src/librebellion/platform/macos/platform.cpp` — CFMessagePort send (msgid=0)

**Protocol architecture:**
```
Maschine hardware → NIHardwareAgent → NIHostIntegrationAgent
  → CFMessagePort "NIHWMainHandler" → Application
```

**MSG_SERIAL_CONNECT format (little-endian int32s):**
```
[0x03444900][deviceid=0x1140][0x4e694d32][0x70726d79][serial_len][serial...]
```

**Expected reply format:**
```
[0x74727565 (CONST_TRUE)][reqportlen][reqportname...][notifportlen][notifportname...]
```

**KNOB_ROTATE event (msgid 0x3654e00):**
```
[_][cnt][unk1][msgtype][knob(0-7)][rotation(delta)]
```
6 x int32, all little-endian.

### NIHIA C Bridge
- Source: `tools/maschine-nihia.c`
- Build: `clang -o tools/maschine-nihia tools/maschine-nihia.c -framework CoreFoundation -Wall -O2`
- Run: `./tools/maschine-nihia 6F05B5C7` (serial from system_profiler)

### HID Bridge
- Source: `tools/maschine-bridge.ts`
- Browser client: `src/midi/MaschineHIDBridge.ts`
- Not in dev.sh auto-start (removed to not conflict with Maschine 3)
- To run manually: `npx tsx tools/maschine-bridge.ts`

### Controller Editor
- Maschine 3 installed: `/Applications/Native Instruments/Maschine 3/Maschine 3.app`
- Controller Editor: `/Applications/Native Instruments/Controller Editor/`
- Template: `/Users/spot/Downloads/Template 1.ncm2` — confirms knobs CC 14-21, ch 1
- NIHostIntegrationAgent: running at `/Library/Application Support/Native Instruments/Hardware/`
- Hardware serial: `6F05B5C7` (from system_profiler)

## Learnings

1. **Maschine MK2 knobs use NIHIA IPC, not HID.** This is why they never appeared in HID reports. The NI agent mediates all communication.

2. **HID report 0x20 is pad pressure, not encoders.** We initially thought it was encoder data. Pads change bytes in this report when pressed. The "encoders" we saw (CC 71, 80) are the Volume and Tempo large encoders which DO appear in the pad report for some reason.

3. **The HID bridge and Maschine 3 are exclusive.** The HID bridge takes the device away from Maschine 3. Must choose one or the other.

4. **Controller Editor requires NIHIA to route knobs.** Without the full NIHIA handshake, Controller Editor's virtual MIDI ports don't receive knob data.

5. **The NIHIA handshake returns "dice" (0x65636964).** Unknown why. Might be version mismatch, protocol variant, or wrong message format. MSG_VERSION response not yet tested.

## Next Steps (Ordered)

1. **Debug the NIHIA handshake** — run `./tools/maschine-nihia 6F05B5C7` with MSG_VERSION sent first (already in code), see both responses. The "dice" meaning needs to be understood. Check rebellion issues/PRs for similar reports.

2. **Try rebellion itself** — compile and run the actual rebellion binary with the Maschine MK2 to see if IT can connect successfully. If rebellion works, compare its exact byte sequences with ours. Build: `cd /tmp/rebellion && cmake -B build && cmake --build build`.

3. **Check NIHIA version** — the NIHostIntegrationAgent might have a different API version than what rebellion was built against. The reply format may have changed.

4. **If NIHIA works** — wire `maschine-nihia` output into the bridge. The bridge spawns the C process and reads its stdout JSON. Forward knob events as CC 14-21 to the MIDI pipeline.

5. **Komplete Kontrol** — TODO references saved: `flmidi-kompletekontrol` and `reaKontrol` for future KK S-series support.

## What Currently Works (End of Session)

- Pads and buttons work via HID bridge (when HID bridge is running)
- 2 large encoders (Volume/Tempo) work via HID → resonance/cutoff
- CC 14-21 mapped in useMIDIStore for when Controller Editor routing is fixed
- Pattern editor no longer re-renders on MIDI CC updates (performance fix)
- MIDI wizard modal scrollable
- All type-checks pass
