---
date: 2026-04-03
topic: dj-scratch-fixes-and-dx7-presets
tags: [dj, scratch, dx7, audio, ui]
status: final
---

# DJ Scratch Fixes + DX7 Preset Issues — Session Handoff

## Tasks Completed

### DJ Scratch (all fixed)
- **Flanging/double audio** — backward scratch rate sign bug (4 setRate calls sent positive instead of negative)
- **Position reset to 0** — replaced broken framesBack with backwardStartElapsedMs
- **Async race** — _switchToForward made fully synchronous via silenceAndStop()
- **Backward displacement tracking** — accumulates backward travel for accurate resume position
- **Gain automation safety** — raw native AudioParam bypasses Tone.Signal entirely
- **Volume boost root cause** — gain overlap during forward→backward transition (deckGain ramp 5ms + scratchBufGain ramp 3ms overlapped). Fixed with instant _setDeckGain(0)
- **PitchShift routing** — scratch buffer must NOT route through pitchShift (internal delay buffers cause bleed). Direct to channelGain.
- **Brick-wall limiter** — DynamicsCompressor at -1dBFS on each deck's channel output (safety ceiling)
- **Speed drift on exit** — hardReset timer forces playbackRate to restMultiplier
- **useDeckStateSync false-stop** — no longer marks deck as stopped during scratch or AutoDJ

### DJ Features
- **Scratch sensitivity** — slider in Settings > Input > Vinyl Scratch (50-200%, applied to all 5 turntable handlers)
- **View mutual exclusion** — tracker stops on DJ entry, DJ stops when leaving (except VJ)
- **Auto DJ error feedback** — enable() returns error strings, shown via status bar
- **Pattern display in Pixi** — PixiDeckPatternDisplay mounted on vinyl and 3D deck views

### UI Fixes
- **Crate panel eventMode** — added eventMode="static" so panel is interactive immediately
- **PixiList hover** — parent pointermove hover tracking with hitArea rectangles
- **DOM playlist hover** — JS-based onPointerEnter/Leave (CSS :hover doesn't work on mobile)
- **DOM playlist buttons** — 1/2/X show on hover via hoveredIdx state

## Outstanding Issues

### DX7 Presets — Partially Fixed
- **VCED operator order fixed** — configToVCED now reverses operators (config[0]=OP1 → VCED slot 5)
- **Patch banks produce audio** but voices don't match labels (hihat sounds like bass)
- **Some VCED presets may still sound wrong** — needs verification after operator order fix
- Possible voice index offset issue in selectVoice or the manifest
- The DX7 WASM/worklet were reverted to last committed version (previous session's debug build was broken)

### DX7 Investigation Needed
- Verify VCED presets sound correct after operator order fix
- Check if patch bank voice indices match manifest names
- The `dx7LoadSysex` bridge does memcpy + serial program change — verify firmware processes it correctly
- Test with known-good DX7 .syx files from external sources
- The DX7 emulation might have accuracy issues unrelated to our code

## Key Files
| File | What changed |
|------|-------------|
| `src/engine/dj/DeckEngine.ts` | All scratch fixes, limiter, gain automation |
| `src/engine/dj/DeckScratchBuffer.ts` | wireIntoChain signature generalized |
| `src/engine/dj/DJAutoDJ.ts` | enable() returns error strings |
| `src/engine/dj/DJActions.ts` | enableAutoDJ returns Promise<string\|null> |
| `src/stores/useUIStore.ts` | View switch mutual exclusion |
| `src/hooks/dj/useDeckStateSync.ts` | scratch/AutoDJ-aware false-stop prevention |
| `src/engine/dx7/dx7sysex.ts` | Operator order reversal in configToVCED |
| `src/pixi/components/PixiList.tsx` | Hover tracking, hitArea, actions |
| `src/components/dj/DJPlaylistPanel.tsx` | JS hover, action buttons |
| `public/worklets/scratch-buffer.worklet.js` | Unchanged (reference) |
