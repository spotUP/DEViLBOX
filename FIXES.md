# DEViLBOX — Outstanding Fixes

Generated from codebase audit. Updated in real-time as fixes land.

---

## Status Key
- ⬜ Not started
- 🔄 In progress
- ✅ Done
- ⏭️ Skipped (out of scope / intentional)

---

## Audio Engine

| Status | Item | File |
|--------|------|------|
| ✅ | ProTracker pattern delay effect (E0x) | `engine/ProTrackerPlayer.ts:588` |
| ✅ | ProTracker Amiga LED filter toggle (E0) | `engine/ProTrackerPlayer.ts:513` |
| ✅ | XM Glissando command (S2y) | `engine/effects/XMHandler.ts:525` |
| ✅ | S3M Glissando command | `engine/effects/S3MHandler.ts:436` |
| ✅ | S3M Panbrello waveform command | `engine/effects/S3MHandler.ts:452` |
| ✅ | Modular VCO — PWM input/modulation | `engine/modular/modules/VCOModule.ts` |
| ✅ | Modular LFO — DC offset for unipolar mode | `engine/modular/modules/LFOModule.ts:70` |
| ✅ | Modular Noise — pink/brown filtering | `engine/modular/modules/NoiseModule.ts:53` |
| ✅ | Modular Arpeggiator — BPM from global tempo | `engine/modular/modules/ArpeggiatorModule.ts:141` |
| ✅ | Modular Graph — topological sort + cycle detection | `engine/modular/ModularGraphBuilder.ts` |

## Keyboard / Input

| Status | Item | File |
|--------|------|------|
| ✅ | Arrangement view keyboard shortcuts (entire stub) | `hooks/arrangement/useArrangementKeyboard.ts` |
| ✅ | Drum pad keyboard shortcuts (entire stub) | `hooks/drumpad/useDrumPadKeyboard.ts` |
| ✅ | Piano roll keyboard shortcuts (entire stub) | `hooks/pianoroll/usePianoRollKeyboard.ts` |
| ✅ | Tracker accent input (Shift+key always false) | `hooks/tracker/useTrackerInput.ts:242` |
| ⏭️ | Chord expansion dialog | `hooks/tracker/useTrackerInput.ts:940` — requires full dialog UI component |
| ⏭️ | "Go to time" command | `engine/keyboard/commands/position.ts:99` — requires input prompt UI |
| ⏭️ | "Render to sample/instrument" commands | `engine/keyboard/commands/misc.ts:252` — requires full render pipeline |
| ⏭️ | "Command palette" command | `engine/keyboard/commands/misc.ts:312` — requires new UI component |

## Import / Export

| Status | Item | File |
|--------|------|------|
| ⏭️ | XM export — instrument envelopes + samples | `lib/export/XMExporter.ts:600` — requires significant XM format work |
| ✅ | IT format sample extraction | `lib/import/SampleExtractor.ts` |
| ✅ | Amiga PAL modal — audio processing pipeline | `components/instruments/AmigaPalModal.tsx` |

## UI / UX

| Status | Item | File |
|--------|------|------|
| ✅ | Note name helper tooltip in DrumpadEditorModal | `components/midi/DrumpadEditorModal.tsx:515` |
| ✅ | Modular cable curved bends | `components/instruments/synths/modular/utils/cableRouting.ts:36` |

## Sync / Networking

| Status | Item | File |
|--------|------|------|
| ⏭️ | Ableton Link WebRTC peer discovery | `lib/sync/abletonLink.ts:336` — requires server infrastructure |

---

## Log

- **2026-02-26** — Bulk fix pass. Implemented 15 items across all categories:
  - Audio Engine: ProTracker E0x pattern delay, LED filter, XM/S3M glissando, S3M panbrello waveform, modular VCO PWM, LFO unipolar DC offset, noise pink/brown, arpeggiator global BPM, graph topological sort + cycle detection
  - Keyboard: arrangement, drumpad, piano roll keyboard stubs fully implemented; tracker accent (Shift+key)
  - Import/Export: IT sample extraction (8/16-bit, delta encoding); AmigaPal full DSP pipeline (trim → hi-pass → lo-pass → limiter → 8-bit)
  - UI: note name tooltip in DrumpadEditorModal; confirmed cable curved bends already implemented (stale TODO removed)
  - Skipped: chord expansion dialog, go-to-time, render commands, command palette (all require new UI components); XM envelope export (large scope); Ableton Link (server infra)
