---
date: 2026-03-13
topic: furnace-chip-synth-debugging
tags: [furnace, chip-synth, debugging, nes, audit]
status: final
---

# Furnace Chip Synth Debugging Methodology

## 1. Overview

The goal is to match DEViLBOX WASM renders of `.fur` files to Furnace CLI reference renders. The primary quality metric is **envelope correlation (envCorr)**: Pearson correlation of 10ms RMS windows. This is phase-independent, meaning it measures shape similarity regardless of sample-level phase offset. The pass threshold is **envCorr > 0.90**.

Tools:
- `tools/furnace-audit/compare-wavs.ts` — WAV comparison (envCorr, correlation, rmsDbDiff, firstDivergenceSec)
- `tools/furnace-audit/render-devilbox.ts` — headless WASM renderer driven without a browser
- `tools/furnace-audit/render-reference.sh` — renders demo files to WAV via Furnace CLI

## 2. Rendering Reference WAVs

Use the Furnace CLI headless binary to produce ground-truth WAVs:

```
/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace
```

Run the batch render script (skips already-existing output files):

```bash
tools/furnace-audit/render-reference.sh --batch nes
```

Output directory: `test-data/furnace-ref/nes/`

The `--batch` flag accepts a chip family name (e.g., `nes`, `gb`, `genesis`) and renders all demo files for that platform.

## 3. Rendering DEViLBOX WAVs

Run the headless WASM renderer:

```bash
npx tsx tools/furnace-audit/render-devilbox.ts --batch nes
```

Output directory: `test-data/furnace-devilbox/nes/`

Key flags:
- `--cmdlog` — dumps the full dispatch command log to `/tmp/<songname>_devilbox.cmdlog.txt` as a TSV
- `--cleanup` — removes rendered WAVs after comparison (useful for bulk runs to save disk)

WASM binary: `public/furnace-dispatch/FurnaceDispatch.wasm`

The renderer drives the WASM sequencer in 128-sample chunks, applies `sysVol * postAmp * masterVol` per chip, and writes a 44100 Hz stereo WAV.

## 4. Comparing WAVs

Run the batch comparison:

```bash
npx tsx tools/furnace-audit/compare-wavs.ts --batch test-data/furnace-ref/nes test-data/furnace-devilbox/nes
```

Output per song:
- `envCorr` — Pearson correlation of 10ms RMS windows (primary metric)
- `correlation` — raw sample-level correlation
- `rmsDbDiff` — amplitude difference in dB
- `firstDivergenceSec` — time into the song where the waveforms first significantly diverge

**PASS = envCorr > 0.90**

envCorr is the right metric for chip music because oscillator phase divergence between two correct-but-drifted renders will kill sample correlation while leaving envelope shape intact. rmsDbDiff measures amplitude only and does NOT affect pass/fail.

## 5. Diagnosing Failures

### 5a. Immediate divergence (divergeAt ≈ 0s)

The song sounds wrong from the first note.

Likely causes:
- Wrong chip ID mapping in `FILE_ID_TO_ENUM` table (`src/lib/import/formats/FurnaceSongParser.ts`)
- Wrong dispatch routing — chip not wired up in `FurnaceDispatchWrapper.cpp`
- Wrong `postAmp` value causing amplitude mismatch that correlates with early divergence

Checks:
- Verify `FILE_ID_TO_ENUM` maps the numeric chip ID from the `.fur` header to the correct enum value
- Verify chip handle creation order in `FurnaceDispatchWrapper.cpp` matches the song's chip list
- Check the `POST_AMP` table in `render-devilbox.ts` for the affected chip

### 5b. Progressive divergence (envCorr drops over time)

The song starts correctly but envCorr degrades as the song plays.

Likely causes:
- Timing drift — WASM sequencer accumulates clock error relative to reference
- Oscillator phase divergence — free-running oscillators (e.g., NES triangle) drift without a phase reset mechanism

Diagnostic steps:
1. Compute regional envCorr with 10-second windows using a custom script to isolate when degradation starts
2. Check WAV duration: if DEViLBOX WAV is longer/shorter than reference, there are extra or missing ticks at song boundaries
3. For NES specifically: triangle channel is free-running (no hardware phase reset), making it inherently sensitive to any clock drift

### 5c. Good shape but wrong amplitude

envCorr passes (or nearly passes) but `rmsDbDiff` is large.

Likely cause:
- Wrong `postAmp` for the chip variant
- Example: FDS with NSFPlay core uses `postAmp = 2.0`; FDS with puNES core uses `postAmp = 1.0`

Check the `POST_AMP` table in `render-devilbox.ts` and `getPostAmp()` logic in the renderer.

Note: rmsDbDiff does not affect the pass/fail threshold, but it does affect audible volume in the browser.

### 5d. Marginal fails (envCorr 0.88–0.90)

The song is nearly correct but just below threshold.

Likely causes:
- Fundamental blip_buf resampling differences between DEViLBOX (fixed 128-sample chunks) and Furnace CLI (variable chunk size)
- Extra ticks at song end inflating divergence in final window

Diagnostic steps:
- Use `--cmdlog` to count total commands and compare command types — missing or extra commands indicate a sequencer bug
- Check whether the WAV is slightly longer than reference (extra end-of-song ticks)

## 6. Command Log Analysis

Enable with `--cmdlog` flag. Output file: `/tmp/<songname>_devilbox.cmdlog.txt`

Format (TSV with header):
```
tick    cmd    chan    val1    val2    ret
```

Key command IDs:
- `0` = NOTE_ON
- `1` = NOTE_OFF
- `4` = INSTRUMENT
- `5` = VOLUME
- `7` = GET_VOLMAX
- `9` = PRE_NOTE

Count commands by type:
```bash
awk -F'\t' 'NR>1 {cmd[$2]++} END {for (c in cmd) printf "cmd %d: %d\n", c, cmd[c]}' /tmp/foo.cmdlog.txt
```

Note: No VOLUME (cmd 5) entries in the cmdlog is **normal** — volume envelopes come from instrument macros processed internally, not from separate volume dispatch commands.

## 7. Known Root Causes by Chip

### NES (pure)

Most pure NES songs pass well (envCorr > 0.90).

Triangle channel is free-running with no hardware phase reset. Any clock drift manifests as progressive envCorr degradation in later sections. This is a hardware-accurate behavior difference, not a bug per se.

Old format versions (v100–v165) may use different feature encodings; verify version handling in the parser.

### NES + FDS

FDS must use the NSFPlay core, not the puNES core:
- Set `setNSFPlay(true)` in `FurnaceDispatchWrapper.cpp`
- FDS postAmp = `2.0` for NSFPlay (not `1.0` for puNES)
- Furnace CLI defaults to NSFPlay for rendering (`fdsCoreRender=1`)

Symptoms of wrong core: FDS channel appears silent or has severely wrong amplitude.

### NES + VRC6

VRC6 works correctly. Notes typically start several seconds into the song (after the pure NES intro). Ensure the comparison window is long enough to capture actual VRC6 output — a short debug window may miss it entirely.

### NES + VRC7

VRC7 implementation is solid; the full demo set passes.

### NES + MMC5

MMC5 postAmp = `64.0` in the POST_AMP table. May have dispatch routing issues if the chip handle is not wired up in `FurnaceDispatchWrapper.cpp`.

### NES + N163

Currently broken/unsupported.

### 5E01 + Namco C30

Not NES hardware. This is a separate chip ID that requires its own dispatch path.

## 8. Architecture Notes

- The WASM sequencer (`FurnaceSequencer.cpp`, ~3000 lines) handles **all effect processing** for `.fur` playback. The TypeScript `FurnaceEffectRouter` is for live/real-time effects only, not the primary `.fur` playback path.
- Dispatch goes to per-chip handles via `chanDispatchHandle[]` + `chanSubIdx[]` arrays built during song load.
- Per-chip amplitude scaling: `sysVol * postAmp * masterVol` applied in `render-devilbox.ts`.
- blip_buf is the resampler: converts chip-native clock rate to 44100 Hz using band-limited interpolation.
- DEViLBOX renders in fixed 128-sample chunks; Furnace CLI uses variable chunk sizes. This can cause marginal envCorr differences near the pass threshold.

## 9. Lessons Learned

- **Always check chip ID mapping first** when a new chip family fails entirely. A wrong `FILE_ID_TO_ENUM` entry means the wrong chip emulator core is instantiated.
- **rmsDbDiff is not envCorr.** A large amplitude difference does not fail the audit. Fix amplitude separately after the shape is correct.
- **Silent FDS** was caused by using the puNES core instead of NSFPlay, not by a missing dispatch command. The two cores have different output rates and amplitudes.
- **Debug window too small** — the first 20 render chunks cover only ~0.06 seconds. Late-starting chips (VRC6 entering after 3s of NES intro) will appear absent if the window is too short.
- **Progressive degradation = oscillator phase drift**, not missing commands. If the cmdlog shows correct NOTE_ON/OFF counts but envCorr declines over time, the cause is diverging phase between free-running oscillators, not a sequencer bug.
- **VRC6 sawtooth and pulse output** verified working at render #2586 in the extended audit run.
