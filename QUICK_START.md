# 🚀 Buzzmachines Quick Start Guide

## Step 1: Start Dev Server

```bash
npm run dev
```

Then open: **http://localhost:5173**

---

## Step 2: Open Buzzmachines in UI

1. Click **"Instruments"** panel (bottom left)
2. Click **"Browse"** tab
3. Scroll down to **"Buzzmachines"** category
4. Click **"Buzz Distortion"** or **"Buzz SVF Filter"**

You should see the BuzzmachineEditor appear in the **"Sound"** tab with parameter sliders.

---

## Step 3: Test Parameters

### For Buzz Distortion:

Try these presets from the dropdown:
- **"Heavy Saturate"** - Aggressive warm distortion
- **"Soft Clip"** - Gentle digital clipping
- **"Stereo Width"** - Phase inversion for width

Manual testing:
1. Move **"Input Gain"** slider → Value should update (e.g., "2.00x")
2. Click **"Mode"** button → Should toggle between Clip/Saturate
3. Click **"Phase Inversor"** → Should show ON/OFF

### For Buzz SVF Filter:

Try these presets:
- **"TB-303 Style"** - Classic acid filter
- **"Low Pass Resonant"** - Smooth lowpass
- **"Vowel Filter"** - High resonance formant

Manual testing:
1. Move **"Cutoff"** slider → Should show percentage
2. Move **"Resonance"** slider → Should show percentage

---

## Step 4: Test Audio (Advanced)

**Note:** Requires connecting a sound source.

### Method 1: Use Existing Instrument
1. Create a basic synth (MonoSynth, TB303, etc.)
2. Add Buzzmachine as an effect
3. Play notes and adjust parameters

### Method 2: Browser Console Test

Open browser console (F12) and run:

```javascript
// Test Arguru Distortion
const { BuzzmachineSynth } = await import('./src/engine/buzzmachines/BuzzmachineSynth.ts');
const { BuzzmachineType } = await import('./src/engine/buzzmachines/BuzzmachineEngine.ts');

const distortion = new BuzzmachineSynth(BuzzmachineType.ARGURU_DISTORTION);
await distortion.ensureInitialized();

// Create test oscillator
const osc = new Tone.Oscillator(440, 'sine').start();
osc.connect(distortion);
distortion.toDestination();

// Play sound (you should hear distortion)
// Stop with: osc.stop();
```

---

## Step 5: Verify WASM Loading

Open **test-buzzmachine.html** in browser:

1. Click **"1. Load WASM Modules"**
2. Check console output:
   - ✅ Should see "Factory function loaded"
   - ✅ Should see "WASM module instantiated"
   - ✅ Should list exported functions

If errors occur, see **Troubleshooting** below.

---

## Quick Checklist

- [ ] Dev server starts without errors
- [ ] Buzzmachines category appears in Browse tab
- [ ] Can select Buzz Distortion
- [ ] Can select Buzz SVF Filter
- [ ] Parameters update when moved
- [ ] Presets load correctly
- [ ] Values display correctly (multipliers, percentages)
- [ ] WASM modules load (test-buzzmachine.html)

---

## Troubleshooting

### UI doesn't show Buzzmachines

**Check:** Type definitions compiled
```bash
npm run type-check
```

**Check:** WASM files exist
```bash
ls -lh public/buzzmachines/
```

### WASM fails to load

**Fix:** Clear browser cache (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

**Check:** Console for errors (F12 → Console tab)

### Parameters don't update

**Check:** Redux DevTools to see if state updates
**Check:** Browser console for JavaScript errors

### No audio output

1. Check AudioContext state:
   ```javascript
   Tone.context.state  // Should be "running"
   ```

2. Resume if suspended:
   ```javascript
   await Tone.start();
   ```

---

## Expected Results

### ✅ Success Indicators

- Buzzmachines appear in Browse tab
- Parameter sliders work
- Presets load
- Values display correctly
- No console errors
- WASM modules load successfully

### ⚠️ Known Limitations

- Audio processing not yet verified (needs runtime test)
- Only 2 machines available (proof-of-concept)
- No visual feedback (waveform/spectrum)

---

## Performance Metrics (Target)

| Metric | Target | How to Check |
|--------|--------|--------------|
| **CPU Usage** | <10% per machine | Chrome DevTools → Performance |
| **Memory** | Stable, no leaks | DevTools → Memory → Take snapshots |
| **Load Time** | <1 second | DevTools → Network tab |
| **Bundle Size** | ~56KB total | Already verified ✅ |

---

## Next Steps After Testing

If all tests pass:

1. **Expand machine library** - Port 3-8 more machines
2. **Enhanced UI** - Add knobs, waveforms, VU meters
3. **Performance tuning** - Optimize if needed
4. **Documentation** - Add user guide

If issues found:

1. Note the error message
2. Check browser console
3. Review TESTING_GUIDE.md for detailed troubleshooting
4. Check BUZZMACHINES_IMPLEMENTATION.md for architecture

---

## Support Files

- **TESTING_GUIDE.md** - Comprehensive testing procedures
- **BUZZMACHINES_IMPLEMENTATION.md** - Technical details
- **BUZZMACHINES_COMPLETE.md** - Full reference
- **test-buzzmachine.html** - Standalone test page

---

**Ready to test!** 🎉

Start the dev server and follow the steps above.
