# Devil Fish TB-303 Modification: Accurate Control Layout Research

**Research Date:** 2026-01-21
**Purpose:** Design accurate 1:1 implementation of Devil Fish mod with single knob set (like real hardware)

---

## Executive Summary

The **critical finding** is that the Devil Fish modification **DOES NOT duplicate the TB-303's knobs**. Instead, it:
1. **Reuses the original 6 TB-303 knobs** with extended ranges and changed functions
2. **Adds new dedicated knobs** for entirely new parameters (Normal/Accent Decay, Soft Attack, etc.)
3. **Adds switches** that change modes and enable/disable features

**Current DEViLBOX Implementation Problem:**
- We have separate knob panels for "TB-303" and "Devil Fish"
- This is incorrect - the real hardware has ONE set of knobs that work differently based on mod switches

---

## Original TB-303 Control Layout

### The Six Original Knobs
According to [Roland TB-303 documentation](https://www.roland.com/us/products/rc_tb-303/), the original TB-303 had **exactly 6 knobs**:

1. **Tuning** - Master tuning
2. **Cutoff** - Filter cutoff frequency
3. **Resonance** - Filter resonance (Q)
4. **Envelope Mod** - Envelope modulation amount
5. **Decay** - Filter envelope decay time
6. **Accent** - Accent amount

These knobs were "highly playable" and controlled the TB-303's single oscillator (sawtooth or square wave) through a resonant lowpass filter.

**Source:** [Wikipedia - Roland TB-303](https://en.wikipedia.org/wiki/Roland_TB-303)

---

## Devil Fish Modification: Physical Changes

### What Robin Whittle's Devil Fish Mod Actually Does

According to the [official Devil Fish documentation](https://www.firstpr.com.au/rwi/dfish/):

#### 1. **Original Knobs Are Modified (Not Duplicated)**

The six original knobs are **mounted 1.5mm higher** for easier turning, but they remain the SAME physical knobs. However, their **functions change**:

**CRITICAL FUNCTION CHANGE - The Decay Knob:**
- **Stock TB-303:** Controls MEG (Main Envelope Generator - filter envelope decay)
- **Devil Fish Mod:** Controls VEG (Volume Envelope Generator - amplitude envelope decay)
- Range: 16ms to 3 seconds (first half of pot rotation), then sustain mode

**Source:** [Devil Fish Manual](https://www.firstpr.com.au/rwi/dfish/Devil-Fish-Manual.pdf), [SynthDIY](http://www.synthdiy.com/show/?id=415)

#### 2. **New Dedicated Knobs Added**

Because the original Decay knob now controls VEG, the Devil Fish adds **TWO new knobs** for MEG:

- **Normal Decay** - MEG decay for non-accented notes (30ms - 3 seconds)
- **Accent Decay** - MEG decay for accented notes (30ms - 3 seconds)

Plus additional new knobs:
- **Soft Attack** - Attack time for non-accented notes (0.3ms - 30ms)
- **Overdrive** - Oscillator level to filter (0× to 66.6× normal level)
- **Filter Tracking** - Amount of keyboard tracking on filter (0 to over-tracking)
- **Filter FM** - Amount of filter frequency modulation from VCA output

**Sources:** [Devil Fish mods](https://www.firstpr.com.au/rwi/dfish/), [Behringer TD-3-MO Review](https://www.soundonsound.com/reviews/behringer-td-3-mo)

#### 3. **Extended Ranges on Original Knobs**

The original knobs get **vastly expanded ranges**:

- **Cutoff:** Doubled to 5kHz max, extended to much lower frequencies
- **Envelope Mod:** Extended to include zero, up to 3× normal maximum
- **Resonance:** Can push into self-oscillation
- **Accent:** Works with new accent sweep circuit

**Source:** [Devil Fish features](https://www.firstpr.com.au/rwi/dfish/)

#### 4. **New Switches Added**

The Devil Fish adds several switches (not knobs) for mode control:

- **Sweep Speed Switch** (3-position): Fast / Normal / Slow
  - Controls how accent sweep circuit behaves
  - Only affects accented notes

- **Accent Sweep Switch** (3-position): Different sweep combinations
  - Includes "High Resonance" mode

- **Muffler Switch** (3-position): Off / Soft / Hard
  - Post-VCA soft-clip distortion

- **Sub-Oscillator Switch** (3-position): Off / Low / Mid / High
  - Adds sub-oscillator 3 octaves below

- **Audio In Switch** (3-position): Off / On / Momentary
  - External audio through filter

**Sources:** [Behringer TD-3-MO review](https://www.soundonsound.com/reviews/behringer-td-3-mo), [Devil Fish features](https://notebook.zoeblade.com/Devil_Fish.html)

---

## Parameter Routing Analysis

### How Devil Fish Changes Parameter Flow

#### Original TB-303 Signal Flow:
```
Oscillator → VCA (fixed envelope) → Filter (MEG controls cutoff) → Output
                                         ↑
                                    Envelope Mod + Decay
```

#### Devil Fish Modified Signal Flow:
```
Oscillator (+ Sub-Osc) → Overdrive → VCA (VEG controls amplitude) → Filter (MEG controls cutoff) → Muffler → Output
                                         ↑                               ↑
                                    VEG Decay                  Normal/Accent Decay + Soft Attack
                                    (original Decay knob)       (new dedicated knobs)
                                         ↑                               ↑
                                    VEG Sustain                    Filter Tracking
                                                                   Filter FM
                                                                   Sweep Speed
```

**Key Insight:** The original Decay knob's **target changed** from MEG to VEG, and two new knobs handle MEG.

---

## Control Philosophy: Single Knob Set Design

### The Devil Fish Approach (What We Should Replicate)

1. **Core Knobs (Always Visible):**
   - Tuning, Cutoff, Resonance, Envelope Mod - same function as original
   - **Decay** - NOW controls VEG (amplitude envelope)
   - Accent - enhanced range

2. **Devil Fish Extension Knobs (Show When DF Enabled):**
   - Normal Decay (MEG for non-accented)
   - Accent Decay (MEG for accented)
   - Soft Attack
   - Overdrive
   - Filter Tracking
   - Filter FM

3. **Mode Switches (Change Behavior, Not Parameters):**
   - Sweep Speed (Fast/Normal/Slow)
   - Accent Sweep (affects resonance during accent)
   - High Resonance toggle
   - Muffler (Off/Soft/Hard)
   - Sub-Oscillator (Off/Low/Mid/High)

### Why This Matters for DEViLBOX

**Current Wrong Approach:**
- Two separate knob panels
- User switches between "TB-303 Mode" and "Devil Fish Mode"
- Creates confusion about which parameters are active

**Correct Approach (Like Real Hardware):**
- ONE set of knobs
- When Devil Fish is OFF: 6 original knobs (Decay controls MEG)
- When Devil Fish is ON:
  - Same 6 knobs (Decay NOW controls VEG)
  - Additional 6+ knobs appear for new DF parameters
  - Switches control modes/routing

---

## UI/UX Design Recommendations

### Proposed Layout

#### Base TB-303 Panel (Always Visible)
```
┌─────────────────────────────────────────┐
│  TUNING   CUTOFF  RESONANCE  ENV MOD   │
│    ○        ○        ○         ○       │
│                                         │
│   DECAY    ACCENT                      │
│     ○        ○                         │
│  [VEG/MEG indicator]                   │
└─────────────────────────────────────────┘
```

#### Extended Panel (Revealed When Devil Fish Enabled)
```
┌─────────────────────────────────────────┐
│ ☠ DEVIL FISH MODIFICATIONS ☠           │
├─────────────────────────────────────────┤
│  NORMAL   ACCENT   SOFT                │
│  DECAY    DECAY   ATTACK               │
│    ○        ○       ○                  │
│                                         │
│  OVERDRIVE  FILTER   FILTER            │
│             TRACKING   FM              │
│      ○        ○        ○               │
├─────────────────────────────────────────┤
│ Sweep Speed:  ○ Fast ○ Norm ○ Slow    │
│ Accent Sweep: ○ Mode1 ○ Mode2 ○ HiRes │
│ Muffler:      ○ Off   ○ Soft  ○ Hard  │
│ Sub-Osc:      ○ Off ○ Low ○ Mid ○ High│
└─────────────────────────────────────────┘
```

### Visual Indicators

1. **Decay Knob Label Changes:**
   - Devil Fish OFF: "DECAY (MEG)"
   - Devil Fish ON: "DECAY (VEG)" ← This is CRITICAL

2. **Color Coding:**
   - Original TB-303 knobs: Standard color
   - Devil Fish extension knobs: Different accent color
   - Mode switches: Tertiary color

3. **Accordion/Collapsible Panel:**
   - Devil Fish section can collapse when disabled
   - Smooth animation reveals extended controls
   - "Enable Devil Fish" toggle at top

---

## Implementation Roadmap

### Phase 1: Refactor Type System
**File:** `src/types/instrument.ts`

```typescript
// BEFORE (Wrong - separate configs):
export interface TB303Config {
  decay: number;  // What does this control???
  // ...
  devilFish?: {
    normalDecay: number;
    accentDecay: number;
    // ...
  }
}

// AFTER (Correct - unified with mode awareness):
export interface TB303Config {
  // Core knobs (meaning changes based on devilFish.enabled)
  decay: number;  // MEG when DF off, VEG when DF on

  // Devil Fish extensions (only active when enabled)
  devilFish?: {
    enabled: boolean;  // THE KEY FLAG

    // When enabled, these override decay for MEG:
    normalDecay: number;   // MEG for non-accented
    accentDecay: number;   // MEG for accented

    // VEG control (original decay knob):
    vegDecay: number;      // Amplitude envelope decay
    vegSustain: number;    // 0-100% sustain level

    // New parameters:
    softAttack: number;    // 0.3-30ms
    overdrive: number;     // 0-100%
    filterTracking: number; // 0-200%
    filterFM: number;      // 0-100%

    // Mode switches:
    sweepSpeed: 'fast' | 'normal' | 'slow';
    accentSweepMode: 'mode1' | 'mode2' | 'highRes';
    muffler: 'off' | 'soft' | 'hard';
    subOscillator: 'off' | 'low' | 'mid' | 'high';
  }
}
```

### Phase 2: Update Engine Parameter Routing
**File:** `src/engine/TB303EngineAccurate.ts`

The engine needs to route parameters correctly based on `devilFish.enabled`:

```typescript
private convertConfig(config: TB303Config): TB303AccurateConfig {
  const dfEnabled = config.devilFish?.enabled ?? false;

  return {
    // Original knobs (behavior depends on DF state)
    cutoff: config.filter?.cutoff ?? 800,
    resonance: config.filter?.resonance ?? 50,
    envMod: config.filterEnvelope?.envMod ?? 50,

    // CRITICAL: Decay knob routing changes!
    normalDecay: dfEnabled
      ? (config.devilFish?.normalDecay ?? 200)  // DF: use dedicated knob
      : (config.filterEnvelope?.decay ?? 200),  // Stock: use decay knob for MEG

    accentDecay: dfEnabled
      ? (config.devilFish?.accentDecay ?? 200)
      : (config.filterEnvelope?.decay ?? 200),  // Stock: same as normal

    vegDecay: dfEnabled
      ? (config.devilFish?.vegDecay ?? 3000)    // DF: decay knob controls VEG
      : 3000,                                    // Stock: fixed ~3-4 sec

    // Devil Fish only parameters
    softAttack: config.devilFish?.softAttack ?? 4,
    filterTracking: config.devilFish?.filterTracking ?? 0,
    // ... etc
  };
}
```

### Phase 3: Refactor UI Components

**File:** `src/components/instruments/VisualTB303Editor.tsx`

Replace dual-panel approach with unified panel:

```typescript
export const VisualTB303Editor: React.FC<Props> = ({ config, onChange }) => {
  const dfEnabled = config.devilFish?.enabled ?? false;

  return (
    <div>
      {/* CORE KNOBS - Always visible */}
      <KnobSection title="TB-303 Bass Line">
        <Knob label="Tuning" ... />
        <Knob label="Cutoff" ... />
        <Knob label="Resonance" ... />
        <Knob label="Env Mod" ... />

        {/* DECAY KNOB - Label changes based on DF state */}
        <Knob
          label={dfEnabled ? "VEG Decay" : "MEG Decay"}
          value={config.filterEnvelope.decay}
          onChange={(v) => {
            if (dfEnabled) {
              // When DF on, decay knob controls VEG
              updateDevilFish('vegDecay', v);
            } else {
              // When DF off, decay knob controls MEG
              updateFilterEnvelope('decay', v);
            }
          }}
        />

        <Knob label="Accent" ... />
      </KnobSection>

      {/* DEVIL FISH PANEL - Collapsible, only when enabled */}
      {dfEnabled && (
        <ExpandablePanel title="☠ Devil Fish Modifications">
          <KnobSection title="Envelope Generators">
            <Knob label="Normal Decay (MEG)"
                  value={config.devilFish.normalDecay} ... />
            <Knob label="Accent Decay (MEG)"
                  value={config.devilFish.accentDecay} ... />
            <Knob label="Soft Attack"
                  value={config.devilFish.softAttack} ... />
          </KnobSection>

          <KnobSection title="Filter Modulation">
            <Knob label="Overdrive" ... />
            <Knob label="Filter Tracking" ... />
            <Knob label="Filter FM" ... />
          </KnobSection>

          <SwitchSection title="Mode Controls">
            <Toggle3Way label="Sweep Speed"
                        options={['Fast', 'Normal', 'Slow']} ... />
            <Toggle3Way label="Muffler"
                        options={['Off', 'Soft', 'Hard']} ... />
            {/* etc */}
          </SwitchSection>
        </ExpandablePanel>
      )}
    </div>
  );
};
```

### Phase 4: Migration Strategy

1. **Add `vegDecay` to existing configs** with default 3000ms
2. **Keep backward compatibility** - if `devilFish.enabled` is undefined, assume false
3. **Update presets** to use new structure
4. **Add migration function** in store to convert old saved songs

---

## Accuracy Checklist

### Hardware Accuracy Requirements

- [x] Single set of 6 core knobs (not duplicated)
- [x] Decay knob changes function (MEG → VEG) when DF enabled
- [x] New dedicated knobs for MEG when DF enabled (Normal/Accent Decay)
- [x] Extended ranges on original knobs when DF enabled
- [x] Mode switches (not knobs) for Sweep/Muffler/Sub-Osc
- [x] Soft Attack only affects non-accented notes
- [x] VEG has sustain mode option
- [x] Accent Sweep circuit only active on accented notes
- [x] Filter can self-oscillate with high resonance
- [x] Overdrive is pre-filter (not post like typical distortion)

---

## Sources

### Primary Sources
- [Devil Fish Official Site](https://www.firstpr.com.au/rwi/dfish/) - Robin Whittle's original documentation
- [Devil Fish Manual PDF](https://www.firstpr.com.au/rwi/dfish/Devil-Fish-Manual.pdf) - Complete technical manual
- [Roland TB-303 Wikipedia](https://en.wikipedia.org/wiki/Roland_TB-303) - Original TB-303 specifications
- [Roland TB-303 Official](https://www.roland.com/us/products/rc_tb-303/) - Original design documentation

### Implementation References
- [Behringer TD-3-MO Review (Sound on Sound)](https://www.soundonsound.com/reviews/behringer-td-3-mo) - Modern Devil Fish clone
- [Devil Fish Features (SynthDIY)](http://www.synthdiy.com/show/?id=415) - Technical breakdown
- [TB-303 Unique Characteristics](https://www.firstpr.com.au/rwi/dfish/303-unique.html) - Original design analysis

### Community Resources
- [ModWiggler Devil Fish Discussion](https://www.modwiggler.com/forum/viewtopic.php?t=234404) - DIY mod implementations
- [Gearspace Devil Fish Thread](https://gearspace.com/board/electronic-music-instruments-and-electronic-music-production/586391-devil-fish-mod-worth.html) - User experiences

---

## Conclusion

The Devil Fish modification does NOT create a separate set of controls - it **extends and repurposes the original 6 TB-303 knobs** while adding new dedicated controls for the extended parameters.

**Key Implementation Insight:**
The Decay knob is the **critical pivot point**:
- Stock TB-303: Controls MEG (filter envelope)
- Devil Fish: Controls VEG (amplitude envelope), with two NEW knobs for MEG

Our current dual-panel approach is **historically and functionally incorrect**. We need to implement a **unified single-knob-set interface** that accurately reflects the real hardware behavior.
