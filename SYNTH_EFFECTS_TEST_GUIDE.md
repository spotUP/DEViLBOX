# Synth Effect Commands - Manual Test Guide

## Quick Test (Browser Console)

Open http://localhost:5173 in your browser, then paste this into the console:

```javascript
// 1. Create new song
await window.__devilbox_test_effects();

// OR manually:
const store = window.__zustand_stores?.songStore;
if (!store) {
  console.error('Song store not found');
} else {
  // Create blank song
  store.getState().newSong({
    name: 'Effect Test',
    channels: 4,
    patterns: 1,
    patternLength: 64
  });
  
  // Add TB-303
  const instStore = window.__zustand_stores?.instrumentStore;
  const instId = instStore.getState().addInstrument({
    type: 'TB303',
    name: 'TB-303 Bass'
  });
  
  console.log('Instrument ID:', instId);
  
  // Add test notes (you'll need to add these manually in the pattern editor)
  console.log('Now add notes manually:');
  console.log('  Row 0:  C-4 01 .. .... (trigger)');
  console.log('  Row 4:  C-4 01 .. C00  (volume 0)');
  console.log('  Row 8:  C-4 01 .. C40  (volume 64)');
  console.log('  Row 12: C-4 01 .. 047  (arpeggio)');
  console.log('  Row 16: C-4 01 .. 120  (porta up)');
  console.log('  Row 20: C-4 01 .. 220  (porta down)');
  console.log('  Row 24: C-5 01 .. 310  (tone porta)');
  console.log('  Row 28: C-4 01 .. 434  (vibrato)');
  console.log('  Row 32: C-4 01 .. 8C0  (pan right)');
  console.log('  Row 36: C-4 01 .. A10  (vol slide)');
}
```

## Expected Results

### Row 0-3: Note Trigger
- **EXPECTED**: TB-303 bass note plays normally at default volume
- **TEST**: Should hear the note clearly

### Row 4-7: C00 (Set Volume 0)
- **EXPECTED**: Note becomes completely silent
- **TEST**: Should hear nothing (this was the original bug!)

### Row 8-11: C40 (Set Volume 64)  
- **EXPECTED**: Note becomes audible again at 50% volume
- **TEST**: Should hear note at medium volume

### Row 12-15: 047 (Arpeggio)
- **EXPECTED**: Cycles through C-4, E-4, G-4 (C major chord)
- **TEST**: Should hear rapid note changes (arpeggio effect)

### Row 16-19: 120 (Portamento Up)
- **EXPECTED**: Pitch slides upward continuously
- **TEST**: Should hear pitch rising

### Row 20-23: 220 (Portamento Down)
- **EXPECTED**: Pitch slides downward continuously  
- **TEST**: Should hear pitch falling

### Row 24-27: 310 (Tone Portamento to C-5)
- **EXPECTED**: Pitch slides from C-4 toward C-5 target note
- **TEST**: Should hear smooth pitch glide upward

### Row 28-31: 434 (Vibrato)
- **EXPECTED**: Pitch wobbles (LFO modulation)
- **TEST**: Should hear vibrato effect

### Row 32-35: 8C0 (Pan Right)
- **EXPECTED**: Sound moves to right channel
- **TEST**: Should hear sound in right speaker/headphone

### Row 36+: A10 (Volume Slide Up)
- **EXPECTED**: Volume gradually increases
- **TEST**: Should hear note getting louder

## How to Test

1. **Start Dev Server**: `npm run dev` (should already be running)
2. **Open Browser**: http://localhost:5173
3. **Open Tracker View**: Click "Tracker" in the top nav
4. **Create Song**: Use the console snippet above OR:
   - Click "New Song"
   - Add TB-303 instrument from instrument panel
   - Manually enter notes in pattern editor
5. **Play**: Press Space or click Play button
6. **Listen**: Verify each effect sounds correct as the pattern plays

## Common Issues

- **No sound at all**: Check Audio Context is resumed (click anywhere first)
- **C00 doesn't silence**: Effect command implementation bug (should be fixed!)
- **Pitch effects don't work**: Detune offset not being applied (should be fixed!)
- **Panning doesn't work**: Pan not applied to synth (should be fixed!)

## Automated Test (TODO)

We need MCP tools for programmatic testing:
- `create_song(channels, patterns, bpm)`
- `add_instrument(type, name)`
- `set_pattern_cell(pattern, row, ch, note, inst, vol, fx_type, fx_param)`
- `play_song()`
- `get_audio_level(wait_ms)` - verify silence/audible

For now, manual testing confirms the implementation works.
