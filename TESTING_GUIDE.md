# Buzzmachines Testing Guide

## Prerequisites

1. **Build the WASM modules** (if not already done):
   ```bash
   ./scripts/build-buzzmachines.sh
   ```

2. **Start the dev server**:
   ```bash
   npm run dev
   ```

## Test 1: WASM Loading (Browser Console)

Open `test-buzzmachine.html` in your browser and:

1. Click **"1. Load WASM Modules"**
2. Check console for:
   - ✅ "Factory function loaded"
   - ✅ "WASM module instantiated"
   - ✅ Exported functions listed

**Expected Result:** No errors, modules load successfully.

## Test 2: Integration in DEViLBOX

1. Open DEViLBOX in browser (`http://localhost:5173`)
2. Navigate to **Instruments** panel
3. Click **"Browse"** tab
4. Scroll to **"Buzzmachines"** category
5. Select **"Buzz Distortion"** or **"Buzz SVF Filter"**

**Expected Result:** BuzzmachineEditor UI appears with parameter sliders.

## Test 3: Parameter Controls

With a buzzmachine selected:

1. **Arguru Distortion:**
   - Adjust "Input Gain" slider → Should show multiplier (e.g., "2.00x")
   - Adjust "Threshold (+)" slider → Should show percentage
   - Toggle "Mode" button → Should switch between "Clip" and "Saturate"
   - Toggle "Phase Inversor" → Should show ON/OFF

2. **Elak SVF:**
   - Adjust "Cutoff" slider → Should show percentage
   - Adjust "Resonance" slider → Should show percentage

**Expected Result:** All controls update values correctly.

## Test 4: Preset Loading

1. With a buzzmachine selected, open **Preset dropdown**
2. Select a preset (e.g., "Heavy Saturate" for Distortion)
3. Verify parameters update to preset values

**Expected Result:** Parameters change to match preset.

## Test 5: Audio Processing (Advanced)

**Note:** Requires connecting a sound source.

1. Create a Tone.js synth or load a sample
2. Route through BuzzDistortion or BuzzSVF
3. Play a note
4. Adjust parameters while playing

**Expected Audio:**
- **Distortion:** Should hear clipping/saturation
- **SVF:** Should hear filtering effect

## Test 6: Multiple Instances

1. Create 2 instruments with different buzzmachines
2. Trigger both simultaneously
3. Verify no conflicts or audio glitches

**Expected Result:** Both machines work independently.

## Debugging Tips

### WASM Not Loading

Check browser console for:
```
Failed to load buzzmachine: [machinetype]
```

**Fix:** Verify WASM files exist in `public/buzzmachines/`

### Parameters Not Updating

Check console for:
```
[BuzzmachineEngine] Machine not initialized
```

**Fix:** Ensure `BuzzmachineEngine.init()` was called

### No Audio Output

1. Check AudioContext state: `Tone.context.state`
2. Verify worklet registered: `context.audioWorklet`
3. Check for errors in worklet: See `Buzzmachine.worklet.js` console logs

### TypeScript Errors

Run type check:
```bash
npm run type-check
```

All checks should pass ✅

## Performance Testing

### CPU Usage

Open browser DevTools → Performance:
1. Start recording
2. Play notes with buzzmachine
3. Stop recording
4. Check CPU usage

**Target:** <10% CPU per machine

### Memory Usage

Open DevTools → Memory:
1. Take heap snapshot
2. Create/destroy 10 machines
3. Take another snapshot
4. Compare

**Target:** No memory leaks, stable usage

## Known Issues

1. **Arguru Reverb:** Does not compile (uses different API)
2. **No GUI yet:** Parameter editing via sliders only
3. **Limited selection:** Only 2 machines (proof-of-concept)

## Success Criteria

- [x] ✅ WASM modules load without errors
- [x] ✅ BuzzmachineEditor renders in UI
- [x] ✅ Parameters update correctly
- [x] ✅ Presets load
- [ ] ⏳ Audio processing works (pending runtime test)
- [ ] ⏳ No audio artifacts
- [ ] ⏳ Performance acceptable

## Next Steps After Testing

If all tests pass:

1. **Phase 2:** Port 3-8 more machines
2. **Phase 3:** Enhanced UI (knobs, visual feedback)
3. **Phase 4:** WAM plugin system integration

## Support

If you encounter issues:
1. Check console for errors
2. Verify WASM files exist and are correct size (~9-13KB each)
3. Ensure Emscripten build completed successfully
4. Review `BUZZMACHINES_IMPLEMENTATION.md` for architecture details

---

**Last Updated:** 2026-01-29
**Status:** Ready for runtime testing
