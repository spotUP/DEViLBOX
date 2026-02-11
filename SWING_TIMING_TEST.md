# Swing Timing Test Pattern

## Test Pattern: 16-step sequence at 120 BPM

### Pattern Layout
```
Step:  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
Note:  C4  -   C4  -   C4  -   C4  -   C4  -   C4  -   C4  -   C4  -
Flag:  -   -   S   -   -   -   S   -   -   -   S   -   -   -   S   -
```
- `-` = rest
- `S` = slide flag on previous step

### Expected Behavior

#### At 120 BPM (rowDuration = 125ms per 1/16 note)

**Swing = 100 (Straight - NO delay)**
- Step 0: triggers at 0ms
- Step 1: triggers at 125ms (125ms gap)
- Step 2: triggers at 250ms (125ms gap) - SLIDE from step 1
- Step 3: triggers at 375ms (125ms gap)
- Step 4: triggers at 500ms (125ms gap)
- **ALL steps evenly spaced at 125ms intervals**

**Swing = 150 (Medium Swing - 16.7% delay on odd steps)**
- Step 0: triggers at 0ms (on-beat)
- Step 1: triggers at 125ms + 21ms = 146ms (DELAYED)
- Step 2: triggers at 250ms (on-beat) - SLIDE from step 1
- Step 3: triggers at 375ms + 21ms = 396ms (DELAYED)
- Step 4: triggers at 500ms (on-beat)
- **Even steps (0,2,4...) on grid, odd steps (1,3,5...) delayed by ~21ms**

**Swing = 200 (Full Triplet - 33.3% delay on odd steps)**
- Step 0: triggers at 0ms (on-beat)
- Step 1: triggers at 125ms + 42ms = 167ms (DELAYED - triplet feel)
- Step 2: triggers at 250ms (on-beat) - SLIDE from step 1
- Step 3: triggers at 375ms + 42ms = 417ms (DELAYED)
- Step 4: triggers at 500ms (on-beat)
- **Even steps on grid, odd steps delayed by ~42ms (creates shuffle/triplet feel)**

### Slide Timing Verification

The slides from step 1→2, 5→6, 9→10, 13→14 should:
1. **Always take the same duration** (determined by synth slideTime parameter, typically 60-200ms)
2. **Start from the delayed position** (if swing applied to source step)
3. **End at the on-beat position** (target step is always even, no delay)

### Old Bug Behavior (BEFORE FIX)

With swing=100 (supposed to be straight), the OLD code was:
```typescript
const intensity = state.swing / 100;  // = 1.0 at swing=100
const shiftFactor = intensity * 0.3333;  // = 0.3333
return shiftFactor * rowDuration;  // = 42ms delay!
```

This meant **ALL odd steps got 33% delay even at "straight" timing!**

### Fixed Behavior (AFTER FIX)

With swing=100:
```typescript
const intensity = (state.swing - 100) / 100;  // = 0.0 at swing=100
return intensity * 0.3333 * rowDuration;  // = 0ms delay ✓
```

Now swing=100 is truly straight timing.

## How to Test

1. **Load the test pattern** (run the test script)
2. **Set BPM to 120**
3. **Set swing to 100** - Listen: should sound like a metronome (evenly spaced)
4. **Set swing to 150** - Listen: should have subtle bounce (delayed backbeat)
5. **Set swing to 200** - Listen: should have strong triplet/shuffle feel
6. **Listen to slides** - Should glide smoothly, starting from swung position if applicable

## Expected Audio Results

- **Swing 100**: Mechanical, even, like a drum machine
- **Swing 150**: Slight groove, feels more human
- **Swing 200**: Strong shuffle, like hip-hop hi-hats or jazz swing
- **Slides**: Smooth pitch glide, no timing artifacts or clicks
