# How to Test Buzzmachines in DEViLBOX

## Step-by-Step Guide

### 1. Start DEViLBOX

```bash
npm run dev
```

Wait for: `Local: http://localhost:5173`

Then open that URL in your browser.

---

### 2. Open the Instruments Panel

Look at the **bottom-left** of the screen. You'll see the Instruments panel.

If it's collapsed, click the **"Instruments"** button to expand it.

---

### 3. Navigate to Browse Tab

In the Instruments panel, you'll see several tabs at the top:
- Quick
- Sound
- Effects
- **Browse** ← Click this one

---

### 4. Find Buzzmachines Category

Scroll down in the Browse tab until you see:

```
┌─────────────────────────────┐
│  Buzzmachines               │
│  Classic Jeskola Buzz       │
│  effects (WASM)             │
│                             │
│  • Buzz Distortion          │
│  • Buzz SVF Filter          │
└─────────────────────────────┘
```

It will be at the **bottom** of the list, after "Other Chips".

---

### 5. Select a Buzzmachine

Click on either:
- **"Buzz Distortion"** (Arguru Distortion effect)
- **"Buzz SVF Filter"** (Elak State Variable Filter)

This will create a new instrument with that buzzmachine.

---

### 6. View the Parameter Editor

After selecting, the UI should automatically switch to the **"Sound"** tab.

You should see:

```
┌─────────────────────────────────────┐
│ Arguru Distortion                   │
│ by Arguru • effect                  │
├─────────────────────────────────────┤
│ PARAMETERS                          │
│                                     │
│ Input Gain              [====] 1.00x│
│ Threshold (-)           [====] 25% │
│ Threshold (+)           [====] 25% │
│ Output Gain             [====] 1.00x│
│ Phase Inversor          [ OFF ]    │
│ Mode                    [ Clip ]   │
├─────────────────────────────────────┤
│ PRESETS                            │
│ [Select preset...        ▼]        │
└─────────────────────────────────────┘
```

---

### 7. Test the Parameters

#### For Buzz Distortion:

1. **Drag the "Input Gain" slider**
   - Value should change (e.g., "2.00x", "3.00x")

2. **Click the "Mode" button**
   - Should toggle between "Clip" and "Saturate"

3. **Click the "Phase Inversor" button**
   - Should toggle between "OFF" and "ON"

4. **Try the preset dropdown**
   - Select "Heavy Saturate"
   - All parameters should update

#### For Buzz SVF Filter:

1. **Drag the "Cutoff" slider**
   - Value should change (0-100%)

2. **Drag the "Resonance" slider**
   - Value should change (0-100%)

3. **Try the preset dropdown**
   - Select "TB-303 Style"
   - Parameters should update

---

### 8. Test Audio (Advanced)

To actually **hear** the buzzmachine effect:

#### Method 1: As an Effect on Another Instrument

1. Create a basic synth (e.g., MonoSynth):
   - Browse tab → "Bass Synths" → "MonoSynth"

2. Go to the **Effects** tab

3. Click **"Add Effect"**

4. Select your buzzmachine from the list

5. Play notes on your keyboard (or use the test keyboard at bottom)

6. Adjust buzzmachine parameters while playing

#### Method 2: Direct Test (Browser Console)

Open browser console (F12), then paste:

```javascript
// Start Tone.js audio
await Tone.start();

// Create test oscillator
const osc = new Tone.Oscillator(440, 'sawtooth').toDestination();
osc.start();

// Play for 2 seconds then stop
setTimeout(() => osc.stop(), 2000);
```

You should hear a sawtooth wave. Then route it through the buzzmachine to hear the effect.

---

## ✅ Success Checklist

- [ ] Dev server started
- [ ] DEViLBOX opened in browser
- [ ] Instruments panel visible
- [ ] Browse tab clicked
- [ ] "Buzzmachines" category found
- [ ] Machine selected (Distortion or SVF)
- [ ] Sound tab shows BuzzmachineEditor
- [ ] Parameters visible (sliders/buttons)
- [ ] Sliders move and values update
- [ ] Buttons toggle correctly
- [ ] Presets load from dropdown
- [ ] No errors in browser console (F12)

---

## 🐛 Troubleshooting

### "I don't see Buzzmachines category"

**Check:**
1. Did the build complete? Run: `npm run type-check`
2. Clear browser cache: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
3. Check console for errors (F12)

### "Sliders don't work"

**Check:**
1. Browser console (F12) for JavaScript errors
2. Is the instrument actually selected? (Check Instruments panel header)

### "No audio when playing notes"

**Check:**
1. AudioContext state:
   ```javascript
   console.log(Tone.context.state); // Should be "running"
   ```

2. If "suspended", click anywhere on the page first (browser autoplay policy)

3. Try: `await Tone.start()` in browser console

---

## 📸 What You Should See

### Browse Tab View:
```
Instruments Panel
├── [Quick] [Sound] [Effects] [Browse*]
└── Categories:
    ├── Bass Synths
    ├── Lead Synths
    ├── ...
    ├── Console Chips (Furnace)
    └── Buzzmachines ← HERE!
        ├── Buzz Distortion
        └── Buzz SVF Filter
```

### Sound Tab View (after selecting):
```
╔═══════════════════════════════════╗
║ Arguru Distortion                 ║
║ by Arguru • effect                ║
╠═══════════════════════════════════╣
║ PARAMETERS                        ║
║                                   ║
║ Input Gain    [slider]   1.00x   ║
║ Threshold (-) [slider]   25%     ║
║ Threshold (+) [slider]   25%     ║
║ Output Gain   [slider]   1.00x   ║
║ Phase Inversor [OFF button]      ║
║ Mode          [Clip button]      ║
║                                   ║
║ PRESETS                          ║
║ [Dropdown: Select preset...]     ║
╚═══════════════════════════════════╝
```

---

## 🎯 Quick Test Script

Copy-paste this into browser console to verify everything works:

```javascript
// Check if buzzmachines are available
const { BuzzmachineEngine, BuzzmachineType } = await import('/src/engine/buzzmachines/BuzzmachineEngine.ts');
const engine = BuzzmachineEngine.getInstance();

// Check machine info
const distInfo = engine.getMachineInfo(BuzzmachineType.ARGURU_DISTORTION);
console.log('✅ Distortion available:', distInfo.name);

const svfInfo = engine.getMachineInfo(BuzzmachineType.ELAK_SVF);
console.log('✅ SVF available:', svfInfo.name);

console.log('🎉 Buzzmachines loaded successfully!');
```

---

## 📞 Need Help?

If you get stuck:

1. **Check browser console** (F12 → Console tab) for errors
2. **Run verification**: `./scripts/test-buzzmachines.sh`
3. **Check WASM files exist**: `ls -lh public/buzzmachines/`
4. **Review docs**: See `TESTING_GUIDE.md` for detailed troubleshooting

---

**That's it! Start testing and let me know what you find! 🚀**
