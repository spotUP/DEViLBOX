---
date: 2026-08-21
topic: TMS5220 Phoneme Map Calibration from A-Z Letter Recordings
tags: [tms5220, speech, phoneme-map, calibration]
status: draft
---

# TMS5220 Calibration Plan — 2026-08-21

## Goal
Replace the hand-authored `samToTMS5220` static map with a calibrated version derived from the 26 A-Z letter recordings in the VSM ROM, so TTS ("devilbox") matches ROM character speech ("welcome").

## Decisions (Locked)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Mean vs Median for K-indices | **Median** | Robust to segmentation boundary outliers (R* whistle, transition frames) |
| Mean vs Median for energy/pitch | **Mean** (pitch: voiced frames only) | Less outlier-sensitive; pitch mean excludes pitch=0 |
| Duration calculation | Median frame count × 25ms | Letter recordings vary in enunciation; median = stable |
| Unvoiced pitch handling | Exclude pitch=0 from pitch mean | Prevents 0 from dragging down mean |
| Coarticulation in segments | Accept (current `segmentLetterFrames` extracts middle 60%) | Vowels clean; consonants include burst — acceptable |

---

## Implementation Steps

### Step 1: Create `tools/tms5220-audit/extractLetterCalibration.ts`

**Input:** First 26 VSMWord entries (A-Z letters)
**Process:**
1. Load ROM → `parseVSMDirectory` → `extractPhonemeLibrary(letters.slice(0,26))`
2. For each phoneme code in the letter library:
   - Compute **median** K1-K10 across all frames
   - Compute **mean** energy across all frames
   - Compute **mean** pitch across **voiced** frames only (pitch > 0)
   - `durationMs = median(frameCount) * 25`
   - `unvoiced = mode` (majority vote across frames)
3. Emit TypeScript map literal matching `samToTMS5220` signature

**Output:** `tools/tms5220-audit/calibratedStaticMap.ts` (importable TS module)

```typescript
// Auto-generated from A-Z letter recordings
export const calibratedStaticMap: Record<string, TMS5220Frame> = {
  'IY': { k: [12, 28, ...], energy: 12, pitch: 20, unvoiced: false, durationMs: 150 },
  // ... all phonemes present in letters
};
```

**Missing phonemes** (SH, ZH, TH, DH, CH, J*, DX, Q*, WH, /X, KX, GX, LX, WX, YX, RX, IX, UX, OH, OY, AW, UW — see handoff table): Keep hand-authored values from `tms5220PhonemeMap.ts`.

---

### Step 2: Add `--calibrated` Mode to `renderPhrase.ts`

Modify `tools/tms5220-audit/renderPhrase.ts`:
- Import `calibratedStaticMap` from `./calibratedStaticMap`
- Add mode `'calibrated'` that uses `buildFramesFromROMLibrary(tokens, emptyMap, calibratedFallback)`
- `calibratedFallback(code)` → looks up in `calibratedStaticMap`, falls back to `samToTMS5220` for missing
- This isolates the static table difference (same pipeline, same post-processing)

**CLI:**
```bash
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --calibrated
```

---

### Step 3: Render A/B/C Triad

```bash
# A: static (hand-authored)
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --static

# B: library (current pipeline - static-first + ROM fallback)
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX"

# C: calibrated (new static table from letters)
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --calibrated
```

Produces:
- `tms5220-phrase-static.wav` (A)
- `tms5220-phrase.wav` (B)  
- `tms5220-phrase-calibrated.wav` (C)

---

### Step 4: Listen & Decide

Compare A vs C in browser/audio player.
- **If C sounds closer to authentic ROM** (like the letter recordings): Proceed to Step 5
- **If marginal**: Iterate on aggregation (try mean for K-indices, adjust duration, etc.)

---

### Step 5: Replace `samToTMS5220` in `tms5220PhonemeMap.ts`

**File:** `src/engine/speech/tms5220PhonemeMap.ts:45-118`

Replace the `map` object with:
1. Calibrated values for phonemes present in A-Z letters
2. Hand-authored values for missing phonemes (SH, ZH, TH, DH, CH, J*, DX, Q*, WH, /X, KX, GX, LX, WX, YX, RX, IX, UX, OH, OY, AW, UW)

**Verify:** `npm run type-check` + speech tests pass

---

### Step 6: Regression Test

**New file:** `src/engine/speech/__tests__/phonemeMapCalibration.test.ts`

Tests:
1. All SAM codes in `KNOWN_PHONEMES` have entries (either calibrated or hand-authored)
2. Vowel formant ratios spot-check:
   - IY: K1 low, K2 high (front high vowel)
   - AH: K1 mid, K2 mid (central)
   - UW: K1 low, K2 low (back high vowel)
3. Frame count / duration consistency (all >= class minimums)
3. Energy/pitch ranges within valid bounds (energy 1-14, pitch 0-31)

---

## File Changes Summary

| File | Change Type |
|------|-------------|
| `tools/tms5220-audit/extractLetterCalibration.ts` | **New** |
| `tools/tms5220-audit/calibratedStaticMap.ts` | **Generated** |
| `tools/tms5220-audit/renderPhrase.ts` | **Modify** (add `--calibrated`) |
| `src/engine/speech/tms5220PhonemeMap.ts` | **Modify** (replace static map) |
| `src/engine/speech/__tests__/phonemeMapCalibration.test.ts` | **New** |

---

## Verification Checklist

- [ ] `npm run type-check` passes
- [ ] `npx vitest run --config vite.config.ts src/engine/speech/` passes
- [ ] A/B/C triad renders without error
- [ ] C sounds closer to authentic ROM than A
- [ ] Regression test covers all `KNOWN_PHONEMES`

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Median K-indices sound worse | Can re-run with mean; script is fast |
| Missing phonemes break TTS | Fallback to hand-authored in `calibratedFallback` |
| Letter extraction has boundary errors | `extractMiddle(trimmed)` already skips 20% edges; median robust |
| Duration too short/long | Pipeline applies `compressROMFrames(0.65)` + stress scaling |

---

## Commands Reference

```bash
# Type-check
npm run type-check

# Speech tests
npx vitest run --config vite.config.ts src/engine/speech/

# Render triad (after Step 2)
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --static
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX"
npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/renderPhrase.ts "WELCOME TO DEVILBOX" --calibrated

# Dev server (for browser listening)
npm run dev
# → http://localhost:5174
```
