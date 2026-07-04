---
date: 2026-04-26
topic: ced-instrument-classifier-testing-mcp-fix
tags: [ced, mcp, instrument-classification, debugging]
status: in-progress
---

# Handoff: CED Classifier Testing + MCP Fix

## What Was Being Worked On

Two parallel threads: (1) testing the CED neural instrument classifier end-to-end, (2) fixing the DEViLBOX MCP connection reliability.

## CED Instrument Classifier — State

### What's Shipped (working in user's browser)
- `mispeech/ced-base` (0.500 mAP, 527 AudioSet classes) runs in `src/workers/instrument-classifier.worker.ts` via onnxruntime-web (already installed)
- Model served from Hetzner at `/models/ced/` — CI downloads 86.9MB during build
- Local dev: model must be at `public/models/ced/model.onnx` (gitignored). Download once:
  ```bash
  mkdir -p public/models/ced
  curl -L "https://huggingface.co/mispeech/ced-base/resolve/main/model.onnx" -o public/models/ced/model.onnx
  curl -L "https://huggingface.co/mispeech/ced-base/resolve/main/config.json" -o public/models/ced/config.json
  ```
- Status messages show in the app status bar: "Loading instrument classifier…" then "Instruments classified: 23 typed"
- Instrument list shows colored type tags (KICK/BASS/SYNTH/PAD etc.) progressively
- Classifications staggered 200ms apart to avoid CPU spike
- SID voice register classifier (heuristic, instant) runs on each AutoDub tick
- UADE channels classified via CedChannelAccumulator (live oscilloscope tap → 0.68s buffer → CED)

### What Was Confirmed Working
- User's screenshot showed "LOADING INSTRUMENT CLASSIFIER..." in the status bar
- world_class_dub.mod loaded with 23 instruments in the list
- The CED worker IS running in the user's real browser

### What Was NOT Confirmed
- Whether the "Instruments classified: 23 typed" status message appeared
- Whether type tags appeared in the instrument list
- Whether the classifications were correct (KICK on kick samples, BASS on bass, etc.)

### Known Issue: Cannot Test With Playwright
Playwright's Chromium build lacks WASM SIMD support — ONNX inference takes 10+ minutes instead of 1-5 seconds. **Always test CED with the real browser via DEViLBOX MCP tools.**

## MCP Fix — What Was Done

### Root Cause
Both Express and the MCP subprocess called `startRelay()`. Whoever started first owned port 4003. If Express restarted, MCP got stranded with no auto-reconnect.

### Fix Applied (committed)
- MCP subprocess now calls `connectAsClient()` ONLY — never competes for port 4003
- Express always owns port 4003 (server mode)
- `connectAsClient()` exported from `wsRelay.ts`
- Exponential backoff reconnect: 500ms → 1s → 2s → ... → 10s cap
- MCP auto-reconnects if Express restarts — no manual intervention needed

### To Activate the Fix
**Restart Claude Code once.** The new subprocess spawned by Claude Code will use the updated `connectAsClient()` code. After that, `npm run dev` → browser open → MCP tools work.

## Dev Server Issue

`npm run dev` runs `vitest run` before starting Vite+Express. Some network tests hit port 3000 (unknown what's on 3000). These fail with ECONNREFUSED and block the server from starting.

**Workaround:** Was using `npx vite --port 5173` + Express separately. But this misses the cross-origin headers that Express sets, breaking WASM SharedArrayBuffer.

**Real fix needed:** Identify which tests hit port 3000 and fix them so `npm run dev` works reliably. This is a separate issue.

## Next Steps

1. Restart Claude Code to get fresh MCP subprocess
2. `npm run dev` (or workaround if port 3000 tests block it)
3. Open browser at localhost:5173, click once
4. Load world_class_dub.mod
5. Use `get_console_errors()` to check for ONNX worker errors
6. Watch for "Instruments classified: 23 typed" status message
7. Check instrument list for type tags (KICK/BASS/SNARE/PAD etc.)
8. Verify correct classification: kick drums → KICK, bass samples → BASS, pads → PAD

## Files Changed This Session

| File | Change |
|------|--------|
| `src/bridge/analysis/CedMelSpectrogram.ts` | NEW — mel spectrogram matching CedFeatureExtractor |
| `src/bridge/analysis/AudioSetInstrumentMap.ts` | NEW — AudioSet label → InstrumentType mapping |
| `src/bridge/analysis/SongRoleTimeline.ts` | NEW — song walk → per-channel role timeline |
| `src/bridge/analysis/CedChannelAccumulator.ts` | NEW — live audio → CED for UADE/oscilloscope engines |
| `src/bridge/analysis/SidVoiceClassifier.ts` | NEW — SID voice register heuristic classifier |
| `src/workers/instrument-classifier.worker.ts` | NEW — CED ONNX worker with ensureSession() guard |
| `src/stores/useInstrumentTypeStore.ts` | NEW — instrument type store, 200ms stagger |
| `src/stores/useChannelTypeStore.ts` | NEW — live channel type store for UADE/SID |
| `src/stores/useInstrumentTypeStore.ts` | Status messages: "Loading…" → "Instruments classified: N typed" |
| `src/components/instruments/InstrumentList.tsx` | CED tags, smooth selection animation, classify trigger |
| `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` | Added InstrumentSelector to toolbar |
| `src/components/tracker/FT2Toolbar/InstrumentSelector.tsx` | Fixed arrows, removed name, useShallow |
| `src/components/tracker/EditorControlsBar.tsx` | Volume slider: `w-16 shrink-0` (was stretching full width) |
| `src/engine/dub/AutoDub.ts` | CED timeline + channel type overlay + SID classifier tick |
| `server/src/mcp/wsRelay.ts` | `connectAsClient()` exported, exponential backoff reconnect |
| `server/src/mcp/index.ts` | Uses `connectAsClient()` instead of `startRelay()` |
| `CLAUDE.md` | CRITICAL rule: use DEViLBOX MCP + real Chrome, NOT Playwright |
| `.github/workflows/deploy.yml` | Downloads CED model during CI build |

## Also Shipped This Session (Earlier)
- `src/engine/dub/moves/skankEchoThrow.ts` — dotted-delay offbeat echo move
- `src/bridge/analysis/SampleSpectrum.ts` — leftover changes (minor)

