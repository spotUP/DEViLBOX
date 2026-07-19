---
date: 2026-03-23
topic: DOM vs Pixi vs 3D view logic duplication audit
tags: [architecture, duplication, audit, pixi, dom, 3d, refactor]
status: final
---

# View Logic Duplication Audit — Full App

## Overview

Three rendering modes: DOM (`src/components/`), Pixi/WebGL (`src/pixi/`), Three.js/R3F (3D components).
Controlled by `renderMode` in `useSettingsStore` and `deckViewMode` in `useDJStore`.

**Estimated duplicated logic: ~33,500 lines.**

---

## 1. TurntablePhysics — 7 Independent Instances

| File | Line |
|------|------|
| `src/components/dj/DeckCssTurntable.tsx` | :31 |
| `src/components/dj/DeckVinylView.tsx` | :34 |
| `src/components/dj/DeckVinyl3DView.tsx` | :92 |
| `src/components/dj/DeckTurntable.tsx` | (via momentum model) |
| `src/pixi/views/dj/PixiDJDeck.tsx` | :476, :782 (TWO) |
| `src/components/vj/VJView.tsx` | :609 |
| `src/engine/TrackerScratchController.ts` | :63 |

**Fix:** `DeckEngine` owns one `TurntablePhysics` per deck. Views read `engine.physics.playbackRate`.

---

## 2. Scratch Engine Calls — ~30 Sites in 8 Files

Files: DeckCssTurntable, DeckTurntable, DeckVinylView, DeckVinyl3DView, VJView, PixiDJDeck.

Each independently:
- `try { getDJEngine().getDeck(deckId).startScratch() } catch {}`
- `getDJEngine().getDeck(deckId).setScratchVelocity(rate)`
- `getDJEngine().getDeck(deckId).stopScratch(50)`

Subtle differences: DeckTurntable uses `stopScratch(0)`, others use `stopScratch(50)`.
DeckTurntable has no real physics (linear momentum decay instead).

**Fix:** Shared `useDeckScratch(deckId)` hook or methods on DeckEngine.

---

## 3. Transport Logic — Duplicated and DIVERGED

| File | Play | Pause | Quantized | SpinDown | Physics |
|------|------|-------|-----------|----------|---------|
| DeckTransport.tsx | Yes | Yes | Yes | Yes (0.8s) | No |
| PixiDeckTransport.tsx | Yes | Yes | **NO** | **NO** | No |
| DeckVinyl3DView.tsx | Yes | Yes | **NO** | Yes (0.8s) | Yes (visual) |
| DJKeyboardHandler.tsx | Yes | Yes | **NO** | Yes | No |
| DeckFXPads.tsx brake | No | Yes | No | Yes | No |

**Fix:** `DeckEngine.togglePlay({ quantize?, spinDown?, onComplete? })` — one method, all views call it.

---

## 4. Mixer Controls — Triplicated

### DOM (individual components):
- `MixerEQ.tsx` (107 lines) — EQ 3-band
- `MixerChannelStrip.tsx` (196 lines) — volume, trim, mute
- `MixerCrossfader.tsx` (148 lines) — crossfader + curve
- `MixerFilter.tsx` (54 lines) — DJ filter
- `MixerMaster.tsx` (157 lines) — master vol + booth
- `MixerVUMeter.tsx` (130 lines) — VU meters

### Pixi (all-in-one):
- `PixiDJMixer.tsx` (580 lines)

### 3D Vestax (all-in-one):
- `MixerVestax3DView.tsx` (908 lines, 23 inline engine calls)

Divergences:
- DOM has quantized EQ kill. Pixi/3D do not.
- DOM has quantized filter sweep. Pixi/3D do not.
- 3D has hamster switch. DOM does not apply it consistently.
- Some components update only store, some only engine, some both.

**Fix:** Action functions: `setDeckEQ(deckId, band, dB)`, `setDeckVolume(deckId, v)`, `setCrossfader(pos)`, etc. Each updates store + engine atomically.

---

## 5. Store + Engine Dual-Write — No Abstraction

~100 call sites do:
```typescript
store().setDeckEQ('A', 'high', v);
getDJEngine().getDeck('A').setEQ('high', v);
```

No consistency about which gets updated. Some components update store only, engine only, or both.

**Fix:** One action function per control. Views never touch store or engine directly.

---

## 6. Position Polling — Duplicated RAF Loops

| File | Polls | Rate |
|------|-------|------|
| DJDeck.tsx | audioPosition, songPos, BPM, scratch state | 20fps |
| DeckCssTurntable.tsx | audioPlayer.getPosition() | 60fps |
| PixiDJDeck.tsx | getWaveform(), getPosition() | 60fps |
| DeckVinyl3DView.tsx | reads store (but store not updated in 3D mode!) | 60fps |

**Critical bug:** In 3D mode, DJDeck.tsx is NOT mounted, so position polling doesn't run. The 3D view reads store values that are never updated.

**Fix:** Headless `useDeckStateSync(deckId)` hook mounted in DJView.tsx regardless of view mode.

---

## 7. Visualization RAF Loops — Doubled

DOM visualizers: Oscilloscope, FrequencyBars, ChannelOscilloscope, StereoField, ParticleField, etc.
Pixi visualizers: PixiChannelOscilloscope, PixiFrequencyBars, PixiStereoField, PixiParticleField, etc.

Both run independently even though only one render mode is active.

**Fix:** Shared data hook that polls once; views just render from shared data.

---

## 8. Dialog Pairs — 57 Pixi Dialogs

| DOM | Pixi | DOM Lines | Pixi Lines |
|-----|------|-----------|------------|
| SettingsModal.tsx | PixiSettingsModal.tsx | 1,099 | 1,387 |
| ExportDialog.tsx | PixiExportDialog.tsx | 1,126 | 1,490 |
| HelpModal.tsx | PixiHelpModal.tsx | 835 | 1,049 |
| SIDInfoModal.tsx | PixiSIDInfoModal.tsx | 636 | 964 |
| NewSongWizard.tsx | PixiNewSongWizard.tsx | 498 | 657 |
| FileBrowser.tsx | PixiFileBrowser.tsx | 501 | 420 |
| GrooveSettingsModal.tsx | PixiGrooveSettingsModal.tsx | 221 | 293 |

~8,700 lines duplicated in just these 7 pairs.

Both SettingsModals directly manipulate `djEngine.deckA.replayer.setStereoSeparationMode()` — engine calls in dialog code.

---

## 9. View Pairs — 14 Major Views

| DOM | Pixi | DOM Lines | Pixi Lines |
|-----|------|-----------|------------|
| PatternEditorCanvas.tsx | PixiPatternEditor.tsx | 2,685 | 1,963 |
| PianoRoll.tsx | PixiPianoRollView.tsx | 1,386 | 870 |
| TrackerView.tsx | PixiTrackerView.tsx | 892 | 408 |
| ArrangementView.tsx | PixiArrangementView.tsx | 313 | 781 |
| DJView.tsx | PixiDJView.tsx | 485 | 243 |
| DJDeck.tsx | PixiDJDeck.tsx | 434 | 1,536 |
| MixerPanel.tsx | PixiMixerView.tsx | 308 | 267 |
| SplitView.tsx | PixiSplitView.tsx | 274 | 280 |
| EditorControlsBar.tsx | PixiEditorControlsBar.tsx | 404 | 718 |
| NavBar.tsx | PixiNavBar.tsx | 379 | 474 |

~13,200 lines duplicated.

---

## 10. Features Only in One Mode (Drift)

| Feature | DOM | Pixi | 3D |
|---------|-----|------|----|
| Quantized play | Yes | NO | NO |
| SpinDown on pause | Yes | NO | Yes |
| Beat-grid phase align | Yes | NO | NO |
| EQ kill switches | Yes | NO | NO |
| Quantized filter sweep | Yes | NO | NO |
| 33/45 RPM toggle | NO | NO | Yes |
| Power on/off | NO | NO | Yes |
| Tonearm seek | NO | NO | Yes |
| Position polling | Yes | Yes | BROKEN |

---

## Recommended Architecture

### Shared Logic Layer (between stores and views):

```
Views (DOM/Pixi/3D)
  ↓ forward input
Shared Hooks & Actions (src/hooks/dj/ or src/engine/dj/)
  ↓ call methods
Engine (DeckEngine, TurntablePhysics)
  ↓ update
Stores (useDJStore, useFormatStore)
  ↑ read
Views (DOM/Pixi/3D)
```

### Specific extractions needed:

1. **`DeckEngine.togglePlay(options)`** — play/pause with optional quantize + spinDown
2. **`DeckEngine.physics`** — owns TurntablePhysics per deck
3. **`useDeckStateSync(deckId)`** — headless position/BPM/level polling hook
4. **`useDeckScratch(deckId)`** — scratch lifecycle hook
5. **`src/engine/dj/DJMixerActions.ts`** — setEQ, setVolume, setCrossfader, setFilter, etc.
6. **Dialog logic extraction** — shared hooks for settings, export, file browser logic
7. **Visualization data hook** — shared waveform/FFT/level polling

### Priority order:
1. Position polling fix (3D mode is BROKEN — no position updates)
2. Transport unification (features diverged)
3. Mixer action extraction (store/engine sync inconsistent)
4. Scratch lifecycle extraction
5. Physics ownership move to DeckEngine
6. Dialog logic extraction (largest line count but lower risk)
