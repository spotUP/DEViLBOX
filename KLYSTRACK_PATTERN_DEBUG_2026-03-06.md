# Klystrack Pattern Data Debug Guide

**Issue:** Songs play but pattern data doesn't display in the pattern editor.

## Debug Process

### 1. **Prepare the Environment**

- Start the dev server: `npm run dev`
- Open the app in your browser
- Open DevTools console: **F12** → **Console tab**
- Keep the console open while testing

### 2. **Load a Klystrack File**

1. File → Import (or drag & drop a `.kt` file)
2. Select the Klystrack format in the view
3. Watch the DevTools console for logs

### 3. **Expected Log Sequence**

If everything works correctly, you should see this sequence:

```
[Klystrack Worklet] loadSong: buffer size: 12345
[Klystrack Worklet] _klys_load_song returned: 1
[Klystrack Worklet] Song loaded - channels: 2 patterns: 5 instruments: 12
[Klystrack Worklet] extractAndSendData: { numPatterns: 5, numChannels: 2, numInstruments: 12 }
[Klystrack Worklet] Pattern 0: length=64, steps=64
[Klystrack Worklet] Pattern 1: length=32, steps=32
...
[Klystrack Worklet] Sending songData: { patterns: 5, sequences: 2, instruments: 12 }
[Klystrack Worklet] songData message posted
[KlysEngine] songData message received: { patterns: 5, sequences: 2, instruments: 12, callbacks: 1 }
[KlysView] songData received: { patterns: 5, sequences: 2, instruments: 12 }
[KlysView] updating klysNative with 12 instruments
```

### 4. **Debugging Scenarios**

#### **Scenario A: All logs appear → Pattern editor still empty**

The data is extracted and sent correctly, but the display isn't updating. Check:
- Is the pattern editor receiving the updated `klysNative` from the store?
- Does the pattern editor re-render when `nativeData` changes?
- Try: Click away from the Klystrack view and back. Does the data appear?

**Fix:**  Ensure `KlysPatternEditor` is subscribed to store updates and re-renders when `nativeData` changes.

#### **Scenario B: Logs stop after `_klys_load_song returned: 0`**

The WASM failed to load the song. The file might be:
- Corrupted or truncated
- Not actually a valid .kt file
- A different version than expected

**Fix:** Test with a known-good .kt file. Check the file size and format.

#### **Scenario C: Logs stop after `loadSong: buffer size:`**

The worklet isn't even calling `_klys_load_song`. The WASM might:
- Not be initialized
- Have crashed during init

**Fix:** Check for "error" logs. Look for WASM init failures in KlysEngine.

#### **Scenario D: No logs appear at all**

The worklet code isn't running. Either:
- The worklet isn't being registered
- The song isn't being sent to the worklet
- The worklet module is cached and using old code

**Fix:**
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Check that `KlysEngine.loadSong()` is actually being called

### 5. **Key Code Locations**

| Component | File | Role |
|-----------|------|------|
| WASM Bridge | `klystrack-wasm/common/KlysWrapper.c` | Implements `klys_load_song`, `klys_get_num_patterns`, etc. |
| Worklet | `public/klystrack/Klystrack.worklet.js` | Runs in AudioWorklet context, extracts pattern data, posts messages |
| Engine | `src/engine/klystrack/KlysEngine.ts` | Receives worklet messages, calls onSongData callbacks |
| View | `src/components/klystrack/KlysView.tsx` | Subscribes to onSongData, updates store with patterns |
| Store | `src/stores/useFormatStore.ts` | Holds `klysNative` with patterns, sequences, instruments |
| Editor | `src/components/klystrack/KlysPatternEditor.tsx` | Reads `nativeData.patterns` and `nativeData.sequences`, renders patterns |

### 6. **Manual Testing**

If you want to test the WASM layer directly, you can:

1. Create a minimal HTML page that loads the WASM
2. Call the functions manually
3. Check if `klys_get_num_patterns()` returns the correct value

Example:
```javascript
const wasmResponse = await fetch('/klystrack/Klystrack.wasm');
const buffer = await wasmResponse.arrayBuffer();
const {Module} = await createKlystrack({ wasmBinary: buffer });
Module._klys_init(44100);
const ok = Module._klys_load_song(dataPtr, dataLen);
const numPatterns = Module._klys_get_num_patterns();
console.log('num_patterns:', numPatterns); // Should be > 0
```

### 7. **Next Steps if Still Stuck**

1. **Check the WASM binary timestamp:** If you modified `KlysWrapper.c`, did you rebuild the WASM?
   ```bash
   cd klystrack-wasm/build
   emcmake cmake ..
   emmake make
   ```

2. **Verify the file is actually loading:** Add a checkpoint in `mus_load_song_RW` to log success/failure.

3. **Check if g_song_loaded is being set:**  The getter functions all check `if (!g_song_loaded) return 0;` — if this flag isn't set, nothing will work.

4. **Test with a different .kt file:** Maybe it's a format issue specific to certain files.

## Commit

All debug logging has been committed:
```
commit 38ae516ca
debug: add comprehensive logging to klystrack pattern data extraction
```

To revert the logging when done:
```bash
git revert 38ae516ca
```

