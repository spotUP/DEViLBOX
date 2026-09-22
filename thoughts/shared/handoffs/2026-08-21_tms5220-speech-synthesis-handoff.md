---
date: 2026-08-21
topic: TMS5220 Speech Synthesis — ROM vs TTS Character Alignment
tags: [tms5220, speech, phoneme-map, calibration, A/B-test]
status: draft
---

# TMS5220 Speech Synthesis Handoff — 2026-08-21

## Executive Summary

The TMS5220 (Speak & Spell chip) speech synthesis has two fundamentally different audio paths:
- **ROM words** (A-Z, verified vocabulary): byte-exact authentic TI recordings → sound like the original toy
- **TTS words** (arbitrary text via SAM/Reciter): hand-authored static phoneme map (`samToTMS5220`) → sound like alien speech

**Goal:** Recalibrate the static phoneme map from the A-Z letter recordings so TTS ("devilbox") matches ROM character ("welcome").

---

## Current State (All Verified Working)

### Fixes Applied This Session

| Issue | Fix | File |
|-------|-----|------|
| Text input lost before first play | `updateMAMEChipTextParam` now lazy-creates instrument | `src/engine/tone/SynthParameterUpdates.ts:211` |
| Key press race / swallowed presses | Removed `if (!isSpeaking)` skip in `writeKeyOn` | `src/engine/tms5220/TMS5220Synth.ts:322-336` |
| Vowel sustain default mismatch | `_vowelLoopSingle = false` → `true` (matches UI Sustain ON) | `src/engine/tms5220/TMS5220Synth.ts:162` |
| ROM words ignore knobs | `_playROMWordDirect` now routes through frame buffer | `src/engine/tms5220/TMS5220Synth.ts:285-307` |
| ROM vs TTS volume/formant mismatch | All paths use `_sendFrameBufferAndSpeak(applyKnobOffsets=false for auth)` | `src/engine/tms5220/TMS5220Synth.ts:605-620` |
| Voice Preset select | Confirmed present in `ChipSynthControls.tsx:640-682` | (no change needed) |

**Type-check:** ✅ clean  
**Tests:** ✅ 76/76 speech/tms5220 tests pass

---

## The Core Problem: Static Phoneme Map Doesn't Match Hardware

### Pipeline
```
Typed text → Reciter (SAM) → phoneme tokens → buildFramesFromROMLibrary
                                                      ↓
                              ┌──────────────────────┴──────────────────────┐
                              ▼                                             ▼
                        Static table                                    ROM-mined library
                        (samToTMS5220)                                  (word-mined)
                        HAND-AUTHORED                                   MISALIGNED
                        (primary source)                                (fallback only)
```

- `buildFramesFromROMLibrary` uses **static-first priority** (correct decision — word-mined library has R* whistle, IY/OW/W*/Y* front/back swap)
- But the static table is **hand-tuned from memory**, not measured from hardware
- Result: TTS phonemes live in a different formant space than ROM recordings

### Letter Recordings = Ground Truth
The 26 A-Z letter recordings in the VSM ROM have **known phonemic structure** (defined in `LETTER_PHONEME_MAP`):
- `B` = `B*` + `IY` (CV)
- `F` = `EH` + `F*` (VC)
- `O` = `OW` (V)
- etc.

`extractPhonemeLibrary(romWords.slice(0, 26))` already cleanly segments these using `segmentLetterFrames` with boundary detection. This is the **only clean, verifiable phoneme data** we have.

---

## A/B/C Test Plan

### Already Rendered (headless, via MAME WASM)
```bash
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX"
```
Produces:
- **A (static)**: `tms5220-phrase-static.wav` — pure hand-authored `samToTMS5220` via `phonemesToTMS5220Frames`
- **B (library)**: `tms5220-phrase.wav` — current pipeline (static-first + ROM-mined fallback) via `buildFramesFromROMLibrary`

### Need to Create: C (Calibrated Static)
- Extract per-phoneme statistics from A-Z letter recordings
- Generate new `samToTMS5220` map with ROM-measured means
- Render as `--calibrated` variant
- Compare C vs A: same pipeline, only static table differs

### Phoneme Coverage
| Phoneme | In A-Z Letters? | Source for C |
|---------|-----------------|--------------|
| Vowels: IY, IH, EH, AE, AA, AH, AO, UH, AX, IX, ER, UX, OH | ✅ | **Letter-mined mean** |
| Diphthongs: EY, AY, OY, AW, OW, UW | ✅ (partial) | Letter-mined where present |
| Glides: R*, RX, L*, LX, W*, WX, Y*, YX | ✅ | Letter-mined |
| Nasals: M*, N*, NX | ✅ | Letter-mined |
| Stops: B*, D*, G*, P*, T*, K* | ✅ | Letter-mined |
| Fricatives: S*, SH, F*, TH, /H, Z*, ZH, V*, DH | ❌ (SH, ZH, TH, DH) | Keep hand-authored |
| Affricates: CH, J* | ❌ | Keep hand-authored |
| Other: DX, Q* | ❌ | Keep hand-authored |

---

## Implementation Steps for Next Session

### Step 1: Create Calibration Script
**New file:** `tools/tms5220-audit/extractLetterCalibration.ts`

```typescript
// Load ROM → parseVSMDirectory → extractPhonemeLibrary(letters)
// For each phoneme code in letter library:
//   - Average K1-K10 across frames (mean or median? — open question)
//   - Mean energy, mean pitch
//   - Duration = frameCount * 25ms (median frame count)
// Emit TypeScript map literal matching samToTMS5220 signature
```

**Output:** `tools/tms5220-audit/calibratedStaticMap.ts` (importable)

### Step 2: Add `--calibrated` Mode to renderPhrase.ts
Modify `tools/tms5220-audit/renderPhrase.ts`:
- Import calibrated map
- Add mode `'calibrated'` that uses `buildFramesFromROMLibrary(tokens, emptyMap, calibratedFallback)`
- This isolates the static table difference (same pipeline, same post-processing)

### Step 3: Render A/B/C Triad
```bash
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --static
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --calibrated
```

### Step 4: Listen & Decide
Compare `tms5220-phrase-static.wav` (A) vs `tms5220-phrase-calibrated.wav` (C).
- If C sounds closer to authentic ROM → replace `samToTMS5220` in `tms5220PhonemeMap.ts`
- If marginal → iterate on aggregation (mean vs median, duration handling)

### Step 5: Replace Static Map
**File:** `src/engine/speech/tms5220PhonemeMap.ts:45-118`
- Replace the `map` object with calibrated values
- Keep hand-authored for missing phonemes (SH, ZH, TH, DH, CH, J*, etc.)
- Run type-check + speech tests

### Step 6: Regression Test
**New file:** `src/engine/speech/__tests__/phonemeMapCalibration.test.ts`
- Verify all SAM codes in `KNOWN_PHONEMES` have entries
- Spot-check vowel formant ratios (K1/K2 for IY vs AH vs UW match hardware expectations)
- Verify frame count / duration consistency

---

## Open Questions (Need Decision Before Step 1)

1. **Mean vs Median** for K-indices/energy/pitch aggregation?
   - Mean: smooths outliers, standard
   - Median: robust to segmentation boundary errors
   - *Recommendation:* Start with **median** for K-indices (formant peaks), mean for energy/pitch

2. **Duration calculation**: `median(frameCount) * 25ms` or preserve per-frame 25ms and let pipeline compress?
   - Current pipeline applies `compressROMFrames` (65% tempo) to static frames
   - *Recommendation:* Use median frame count → durationMs, let pipeline handle compression

3. **Unvoiced handling**: pitch=0 frames excluded from pitch mean?
   - *Yes* — only average pitch for voiced frames

4. **Transition frames**: Letter recordings include coarticulation (B*→IY transition). Current segmentation takes "middle" of vowel — good. But consonant segments include burst+transition. Acceptable?

---

## Relevant Files (Quick Reference)

| File | Purpose |
|------|---------|
| `src/engine/tms5220/TMS5220Synth.ts` | Main synth — writeKeyOn, speakText, frame buffer path |
| `src/engine/speech/tms5220PhonemeMap.ts` | **Target for replacement** — `samToTMS5220` static map |
| `src/engine/speech/ROMPhonemeExtractor.ts` | `extractPhonemeLibrary`, `buildFramesFromROMLibrary`, `segmentLetterFrames`, `lpcToTMS5220Frames` |
| `src/engine/speech/ROMWordAligner.ts` | `resolveRepeatFrames`, `trimSilence`, `getPhonemeClass`, `kIndexDistance` |
| `src/engine/speech/VSMROMParser.ts` | `parseVSMDirectory`, `LPCFrame`, `VSMWord` |
| `src/engine/speech/Reciter.ts` | `textToPhonemes`, `parsePhonemeString`, `KNOWN_PHONEMES` |
| `tools/tms5220-audit/renderPhrase.ts` | A/B render harness (add `--calibrated` mode) |
| `tools/tms5220-audit/renderWord.ts` | Low-level MAME WASM render (WAV output + stats) |
| `tools/tms5220-audit/exportPhonemeLibrary.ts` | Reference: how full library is exported |
| `src/engine/speech/__tests__/romPhonemeLibrary.test.ts` | Oracle tests (letter oracle, reconstruction, reachability) |

---

## Commands Cheat Sheet

```bash
# Type-check
npm run type-check

# Speech/TMS5220 tests
npx vitest run --config vite.config.ts src/engine/tms5220/ src/engine/speech/

# Render A/B (already works)
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --static
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX"

# Dev server (for browser testing)
npm run dev
# → http://localhost:5174
```

---

## Dirty Tree (Do NOT Commit)
- `mame-wasm/tms5220/TMS5220Synth.cpp` — cabinet filter WIP
- `public/mame/TMS5220.wasm` — stale binary
- `src/constants/chipParameters.ts` — session edits
- `.serena/project.yml` — tool config
- `FXChainPlayer-Releases-1.3.11/` — unrelated
- Untracked songs in root

---

## Next Session Entry Point

1. Read this handoff
2. Decide mean/median (Q1 above)
3. Create `tools/tms5220-audit/extractLetterCalibration.ts`
4. Run it → inspect output
5. Add `--calibrated` to `renderPhrase.ts`
6. Render triad → listen
7. If C wins → replace `samToTMS5220` + test + commit

---

## Context for Reviewer

This is a **character alignment** task, not a bug fix. The architecture is sound:
- ROM words play authentic (byte-exact via frame buffer)
- TTS uses static-first pipeline (correct priority)
- Only the static table's numbers are wrong

The letter recordings are the **only ground truth** we have. Everything else (word-mined library) is derived and misaligned. Recalibrating the static table from letters is the minimal, correct fix.
