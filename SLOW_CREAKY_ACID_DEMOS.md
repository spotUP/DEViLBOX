# Slow Creaky Acid Demo Songs

Two demo songs showcasing different approaches to creating slow, creaky acid basslines at 60 BPM.

## 🐌 Slow Creaky (Authentic)
**File**: `slow-creaky-acid-authentic.song.json`

**Approach**: Real TB-303 hardware behavior
- **Tempo-Relative**: OFF (authentic)
- **BPM**: 60
- **Filter Decay**: 2500ms (absolute)
- **Normal Decay**: 2500ms (absolute)
- **Accent Decay**: 3000ms (absolute)
- **VEG Decay**: 2000ms (absolute)

**How it works**:
This uses the authentic TB-303 approach where envelope decay times are **absolute milliseconds**. Just like real hardware, the decay times don't change with tempo. To get long, creaky sweeps at slow tempos, you simply set long decay times:
- Filter decay cranked to 2500ms
- Devil Fish normal decay at 2500ms
- Devil Fish accent decay at maximum 3000ms
- High resonance (85%) for self-oscillation
- VEG sustain at 100% for infinite notes

**Result**: Long, slow, creaky filter sweeps that take 2.5-3 seconds to complete, regardless of tempo.

---

## 🐌 Slow Creaky (Tempo-Relative)
**File**: `slow-creaky-acid-tempo-relative.song.json`

**Approach**: Creative enhancement (not found on real hardware)
- **Tempo-Relative**: ON (creative)
- **BPM**: 60
- **Filter Decay**: 800ms (at reference 125 BPM)
- **Normal Decay**: 800ms (at reference 125 BPM)
- **Accent Decay**: 1000ms (at reference 125 BPM)
- **VEG Decay**: 700ms (at reference 125 BPM)

**How it works**:
This uses the creative tempo-relative enhancement where decay times **scale with BPM**. The decay values are set at a reference of 125 BPM, then automatically scaled:

**Scaling formula**: `actualDecay = baseDecay × (125 / currentBPM)`

At 60 BPM:
- 800ms filter decay → 1666ms actual (800 × 125/60)
- 800ms normal decay → 1666ms actual
- 1000ms accent decay → 2083ms actual
- 700ms VEG decay → 1458ms actual

**Result**: Similar long, creaky sweeps achieved with moderate base values that automatically scale for slower tempos.

---

## Key Differences

### Authentic Method (Hardware-Accurate)
✅ Matches real TB-303/Devil Fish behavior
✅ Decay times always absolute (milliseconds)
✅ Set long values for slow, creaky sweeps
✅ Default behavior in DEViLBOX

### Tempo-Relative Method (Creative Enhancement)
🎨 Creative feature not on real hardware
🎨 Decay times scale with BPM automatically
🎨 Set moderate values, let tempo do the work
🎨 Optional toggle (OFF by default)

---

## When to Use Each

**Use Authentic** if you want:
- True TB-303 hardware behavior
- Predictable, absolute decay times
- Classic acid production workflow
- Consistency across different BPM songs

**Use Tempo-Relative** if you want:
- Experimental/creative workflow
- One set of presets that work at any tempo
- Automatic adaptation to tempo changes
- Easier transition between slow/fast sections

---

## Accessing These Demos

1. Open DEViLBOX
2. Click **"Demos ▾"** in the toolbar
3. Select:
   - **🐌 Slow Creaky (Authentic)** - Real hardware behavior
   - **🐌 Slow Creaky (Tempo-Relative)** - Creative enhancement

Both demos use identical patterns and similar settings, allowing direct comparison of the two approaches!
