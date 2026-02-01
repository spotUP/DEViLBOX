# Deep Research: Roland RE-201 Space Echo & Implementation Plan

## The Hardware Legend: Roland RE-201
Released in 1974, the Space Echo is arguably the most famous delay unit in history. Unlike modern digital delays, it used a physical loop of magnetic tape to record and play back sound.

### Core Architecture
1.  **Tape Transport:** A motor moves tape across heads. Changing the **Repeat Rate** (motor speed) changes the delay time AND pitch (because the tape physically speeds up or slows down).
2.  **Heads:**
    *   1 Record Head (writes input to tape).
    *   **3 Playback Heads:** Spaced at fixed intervals.
        *   Head 1: Short (~1x distance)
        *   Head 2: Medium (~2x distance)
        *   Head 3: Long (~3x distance)
    *   1 Erase Head (clears tape for next loop).
3.  **Spring Reverb:** A physical spring tank added to the signal path.

### The 12 Modes
The "Mode Selector" is the heart of the RE-201. It hard-wires which playback heads are active and whether the reverb is mixed in.

| Mode | Active Heads | Reverb? | Description |
| :--- | :--- | :--- | :--- |
| **1** | Head 1 | No | Short slapback |
| **2** | Head 2 | No | Medium echo |
| **3** | Head 3 | No | Long echo |
| **4** | Head 2 + 3 | No | Rhythmic gallop (ta-TA... ta-TA...) |
| **5** | Head 1 | **Yes** | Slapback + Reverb |
| **6** | Head 2 | **Yes** | Medium + Reverb |
| **7** | Head 3 | **Yes** | Long + Reverb |
| **8** | Head 1 + 2 | **Yes** | Short/Med syncopation + Reverb |
| **9** | Head 2 + 3 | **Yes** | Standard multi-tap + Reverb |
| **10** | Head 1 + 3 | **Yes** | Wide spacing + Reverb (Rarely used) |
| **11** | Head 1 + 2 + 3 | **Yes** | "The Wash" - dense texture |
| **12** | None | **Yes** | Reverb Only |

### Sonic Characteristics (The "Vibe")
*   **Self-Oscillation:** Turning "Intensity" (Feedback) past 12 o'clock causes the repeats to get louder and louder, creating a chaotic wall of noise.
*   **Tone:** Tape loses high frequencies on every repeat. The repeats get darker and grittier.
*   **Modulation:** The motor isn't perfect. The tape slips. This "Wow and Flutter" adds a subtle chorus/vibrato to the echoes.

---

## DEViLBOX Implementation Plan

We can recreate this faithfully using `Tone.js`. We won't just add a preset; we'll build a custom `SpaceEchoEffect` class.

### 1. New Effect Type
Update `src/types/instrument.ts` to include `'SpaceEcho'` in `AudioEffectType`.

### 2. The Engine (`SpaceEchoEffect.ts`)
We will create a class that wraps multiple internal Tone.js nodes:

*   **Delay Network:**
    *   `head1`: `Tone.Delay` (Time = Rate * 1)
    *   `head2`: `Tone.Delay` (Time = Rate * 2)
    *   `head3`: `Tone.Delay` (Time = Rate * 3)
*   **Reverb:**
    *   `spring`: `Tone.Reverb` (Short decay, high dampening for metallic sound).
*   **Feedback Loop:**
    *   We cannot use standard `Tone.FeedbackDelay` because we need to feed *multiple* heads back into the input.
    *   We will create a `feedbackGain` node.
    *   Output of active heads -> Sum -> Tape Saturation -> Filter -> Feedback Gain -> Input.
*   **Modulation (Wow/Flutter):**
    *   `Tone.LFO` connected to the `delayTime` of the heads.

### 3. Controls (UI)
We will expose these parameters in `EffectPanel.tsx`:

*   **Mode:** 1-12 (Knob/Slider)
*   **Rate:** 50ms - 1000ms (Base delay time)
*   **Intensity:** 0 - 1.2 (Feedback - going >1 allows self-oscillation)
*   **Echo Vol:** 0 - 1 (Mix of delay signal)
*   **Reverb Vol:** 0 - 1 (Mix of reverb signal)
*   **Bass/Treble:** Low/High shelf filters on the wet signal.

### 4. Integration
*   Add to `InstrumentFactory` to instantiate the new class.
*   Add to `EffectPanel` parameters list.

### Why this is cool for DEViLBOX
The Dub Siren you just added needs a partner. The Space Echo is *the* classic pairing for dub sirens. Implementing this gives us a complete "Sound System" rig within the tracker.

**Ready to build?**
I have the architecture mapped out. I can start by adding the type definitions and then building the engine class.
