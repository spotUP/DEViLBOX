# MOD Playback Audit - BassoonTracker vs DEViLBOX

## Critical Issues Found

### 1. **Frequency Calculation Method (MAJOR)**

**BassoonTracker Approach:**
```javascript
// For MOD files (ProTracker mode)
getSampleRateForPeriod(period) {
    return AMIGA_PALFREQUENCY_HALF / period;
    // = 3546895 / period
}

// Then calculates playback rate:
playbackRate = sampleRate / audioContext.sampleRate
```

**Example for period 428 (C-2):**
- sampleRate = 3546895 / 428 = **8286.67 Hz**
- playbackRate = 8286.67 / 44100 = **0.188**

**Our Current Approach:**
- We create samples at fixed 8363 Hz
- Map to note C4 (MIDI 60)
- Let Tone.js transpose from there
- ❌ **This is fundamentally wrong for MOD playback**

### 2. **Period-to-Frequency Formula**

**Correct Amiga Formula:**
```
frequency = 3546895 / period
```

**Our Period Table (after fix):**
```javascript
428: 'C4'  // Maps C-2 period to C4 note
```

**Problem:** We're converting periods to **notes**, but MOD playback needs **dynamic frequency/playback rates**!

### 3. **Sample Rate Handling**

**BassoonTracker:**
- Stores sample PCM data at original rate
- Creates AudioBuffer at context sample rate (44100)
- Calculates playback rate dynamically per-note based on period
- **Each note plays at different playback rate**

**Our Current:**
- Store at fixed 8363 Hz
- Map to single note (C4)
- Let Tone.js Sampler handle transposition
- ❌ **Doesn't match Amiga playback behavior**

### 4. **Finetune Application**

**BassoonTracker:**
```javascript
// ProTracker finetune
if (instrument.getFineTune()){
    period = getFineTuneForPeriod(period, instrument.getFineTune());
}
```

Finetune modifies the **period**, not the base note!

**Our Current:**
```javascript
detune: (sample.finetune * 100) / 128  // Convert to cents
```

This applies detune in **cents**, which is correct for pitched instruments but may not match ProTracker's period-based tuning exactly.

## Root Cause Analysis

The fundamental issue is **architectural mismatch**:

1. **BassoonTracker**: Period-based system
   - Works directly with Amiga periods (113-856)
   - Calculates frequencies using `3546895 / period`
   - Uses Web Audio API's `playbackRate` directly
   - No note mapping - pure frequency playback

2. **DEViLBOX with Tone.js Sampler**: Note-based system
   - Maps samples to MIDI notes
   - Uses Tone.js' note transposition
   - Expects samples to be "pitched instruments"
   - ❌ **Doesn't match tracker paradigm**

## Recommended Solutions

### Option A: Use Tone.js Player Instead of Sampler (RECOMMENDED)

**Advantages:**
- Player supports `playbackRate` directly
- No note mapping needed
- Can implement exact Amiga formula
- More accurate to original MOD behavior

**Changes Needed:**
1. Change instrument type from `Sampler` to `Player`
2. Store period in pattern cells (not just notes)
3. Calculate playback rate per note: `3546895 / period / 44100`
4. Apply finetune by adjusting period before calculation

**Example:**
```typescript
// In PatternScheduler when triggering note
const period = getPeriodFromNote(cell.note, cell.instrument);
const finetunedPeriod = applyFinetune(period, instrument.finetune);
const playbackRate = 3546895 / finetunedPeriod / 44100;

player.playbackRate = playbackRate;
player.start(time);
```

### Option B: Pre-calculate All Period Mappings for Sampler

**Advantages:**
- Keep using Tone.js Sampler
- More compatible with rest of DEViLBOX

**Disadvantages:**
- Less accurate
- Need to map ~700 possible periods to notes
- Finetune and pitch effects harder to implement

**Changes Needed:**
1. Create comprehensive period-to-frequency table
2. Convert frequencies to closest MIDI notes
3. Map each period to multiple samples at different base notes
4. Use detune for fine adjustments

### Option C: Hybrid Approach

Use `Player` for MOD-imported samples, `Sampler` for synths:
- Check `instrument.metadata.importedFrom === 'MOD'`
- Route to appropriate instrument type
- Best of both worlds

## Specific Code Fixes Needed

### 1. InstrumentConverter.ts
```typescript
// Store period lookup data
const metadata: InstrumentMetadata = {
  importedFrom: 'MOD',
  modData: {
    periodMultiplier: 3546895,  // AMIGA_PALFREQUENCY_HALF
    usePeriodPlayback: true,
  },
  // ...
};
```

### 2. InstrumentFactory.ts
```typescript
private static createInstrument(config: InstrumentConfig) {
  // Check if MOD sample
  if (config.metadata?.modData?.usePeriodPlayback) {
    return this.createPeriodicPlayer(config);  // New method
  }

  // Regular instruments
  switch (config.synthType) {
    case 'Sampler': return this.createSampler(config);
    // ...
  }
}

private static createPeriodicPlayer(config: InstrumentConfig): Tone.Player {
  // Create Player that supports playbackRate
  return new Tone.Player({
    url: config.parameters.sampleUrl,
    loop: config.sample?.loop,
    loopStart: config.sample?.loopStart || 0,
    loopEnd: config.sample?.loopEnd || 0,
    volume: config.volume || -12,
  });
}
```

### 3. PatternScheduler.ts
```typescript
private scheduleNote(cell: TrackerCell, instrument: InstrumentConfig, time: number) {
  // Check if period-based playback
  if (instrument.metadata?.modData?.usePeriodPlayback) {
    // Get period from note
    const period = this.noteToPeriod(cell.note);

    // Apply finetune
    const finetunedPeriod = this.applyFinetune(period, instrument.sample?.finetune || 0);

    // Calculate playback rate
    const frequency = 3546895 / finetunedPeriod;
    const playbackRate = frequency / 44100;

    // Trigger with playback rate
    const player = this.getInstrument(instrument.id) as Tone.Player;
    player.playbackRate = playbackRate;
    player.start(time);
  } else {
    // Regular note-based playback
    this.triggerAttack(cell.note, time, instrument);
  }
}

private noteToPeriod(note: string | null): number {
  if (!note) return 428; // Default C-2

  // Reverse lookup from our period table
  const periodTable = {
    'C3': 856, 'C#3': 808, 'D3': 762, // ...
    'C4': 428, 'C#4': 404, 'D4': 381, // ...
    'C5': 214, 'C#5': 202, 'D5': 190, // ...
  };

  return periodTable[note] || 428;
}

private applyFinetune(period: number, finetune: number): number {
  // ProTracker finetune adjusts period slightly
  // Each finetune unit shifts by ~1%
  const adjustment = finetune * 0.01;
  return Math.round(period * (1 + adjustment));
}
```

## Testing Checklist

After implementing fixes:

- [ ] Period 428 produces correct C-2 pitch (8286 Hz)
- [ ] Period 856 produces correct C-1 pitch (4143 Hz)
- [ ] Period 214 produces correct C-3 pitch (16573 Hz)
- [ ] Finetune shifts pitch correctly (±1% per unit)
- [ ] Sample loops work correctly
- [ ] Effect commands (pitch slides, vibrato) work
- [ ] Compare waveform output to BassoonTracker
- [ ] Test with multiple MOD files (different styles)

## References

- BassoonTracker: `/Reference Code/BassoonTracker-master/script/src/audio.js:676`
- Amiga frequency: 3546895 Hz (PAL) = 7093790 / 2
- ProTracker period range: 113-856
- Standard C-2 period: 428 → 8286.67 Hz

## Recommendation

**Implement Option A (Player-based approach)** for the most accurate MOD playback. This matches the original tracker architecture and will give the best results.

Estimated effort: 4-6 hours
Priority: HIGH (current playback is significantly off-pitch)
