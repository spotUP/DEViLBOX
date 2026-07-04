---
date: 2026-04-12
topic: USB-SID-Pico + view removal + CheeseCutter WASM engine
tags: [sid, hardware, cheesecutter, views, tdz, wasm]
status: final
---

# Session Handoff: SID Hardware + View Removal + CheeseCutter

## Completed

### USB-SID-Pico Hardware Routing (GT Ultra + SF2)
- GTToolbar ASIDToggle: rewired to SIDHardwareManager (supports WebUSB + ASID)
- Softsynth GainNode muted when hardware bridge active
- Auto-enable on init when SIDHardwareManager.isActive
- USBSIDPico: cycleExact=false (flush() encoding fix)
- SIDHardwareManager: setTimeout(0) batched flush, clearDiffCache, applyClockFromSettings
- C64SIDEngine: enableHardwareOutput() register-dump bridge at ~43Hz
- Shared SIDHardwareToggle component

### TDZ Production Bundle Fix
- Circular import: useTrackerStore ↔ useEditorStore ↔ useCursorStore
- storeAccess.ts leaf module with register/get pattern
- editorMasks.ts for MASK_* constants

### View Removal (86 files deleted, -26,202 lines)
- Arrangement, Piano Roll, TB-303 view, Split View — all removed
- TB-303 synth engine/controls/presets kept

### CheeseCutter (.ct) Full Port
- Parser with pattern/instrument/table extraction
- PSID wrapping FAILED (editor player needs flat-RAM, not I/O-mapped $D400)
- Built dedicated WASM engine: 6502 CPU + reSID, flat RAM, multispeed
- Output: public/cheesecutter/CheeseCutter.{js,wasm} (11KB + 91KB)

## Needs Testing
1. **CheeseCutter WASM playback** — not yet tested by user
2. SF2 USB-SID-Pico routing
3. Live site TDZ fix deployed

## Open: Audio Clicks Investigation
Pre-existing clicks in SF2/GT. Three suspects:
1. ScriptProcessorNode (websid) — runs on main thread, susceptible to JS blocking
2. Browser underruns — dev tools / heavy React renders
3. Master effects chain WASM processing overhead
