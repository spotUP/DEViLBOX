# Deep Research: Reggae & Dub Enhancements for DEViLBOX

To transform DEViLBOX into a premier Dub/Reggae production station, we need to look beyond the basics (which you now have: Dub Siren, Space Echo, Organ) and target the specific "secret sauce" gear used by legends like King Tubby, Lee "Scratch" Perry, and Scientist.

## 1. The Missing Instrument: "Synare 3" (Electronic Percussion)
While the Dub Siren covers the "alert/siren" territory, the **Star Instruments Synare 3** is responsible for the iconic "pyiuuu," "boop," and "disco tom" sounds found in almost every late 70s/80s dub and dancehall track (e.g., Sly & Robbie).

### Hardware Architecture (Synare 3)
*   **Oscillators:** 2x Pulse/Square waves.
*   **Noise:** White noise generator.
*   **Filter:** 24dB/oct resonant Low Pass Filter (VCF).
*   **Envelopes:** Distinct decay envelopes for Amp and Filter.
*   **LFO:** Modulates pitch and filter.
*   **Sweep:** The signature "drop" comes from an oscillator pitch envelope or LFO ramp.

### DEViLBOX Implementation Proposal (`SynareSynth`)
*   **Type:** `Synth` (specialized).
*   **Engine:** `Tone.PolySynth` doesn't quite capture it. We need a custom class wrapping `Tone.Oscillator`, `Tone.Noise`, and `Tone.Filter`.
*   **Controls:**
    *   **Tune:** Base pitch.
    *   **Sweep:** Pitch decay amount (the "pyiuuu").
    *   **Resonance:** Filter self-oscillation potential.
    *   **Decay:** Short to medium.
    *   **Noise Mix:** Blending the "snare" element.

---

## 2. The Missing Effect: "Bi-Phase" (Dual Phaser)
The **Mu-Tron Bi-Phase** is the "Sound of the Ark" (Lee Perry's studio). A standard phaser sounds thin; the Bi-Phase sounds "chewy," wide, and liquid.

### Hardware Architecture
*   **Dual Architecture:** Two independent 6-stage phasor circuits.
*   **Routing:**
    *   **Series:** Phaser A -> Phaser B (Deep, complex swooshes).
    *   **Parallel:** Input -> A / Input -> B (Massive stereo width).
*   **Feedback:** Variable feedback on each.
*   **LFO:** Sine/Square, can sweep both or independent.

### DEViLBOX Implementation Proposal (`BiPhaseEffect`)
*   **Type:** `AudioEffectType` -> `'BiPhase'`.
*   **Engine:** Two `Tone.Phaser` instances wrapped in a routing logic class.
*   **Controls:**
    *   **Rate A / Rate B:** Independent speeds.
    *   **Depth A / Depth B:** Independent depths.
    *   **Feedback:** Resonance.
    *   **Routing:** Switch (Series/Parallel). This is the key feature.

---

## 3. The Missing Performance Tool: "The Tubby Filter" (Big Knob HPF)
King Tubby played the mixing desk like an instrument. His secret weapon was a custom **High Pass Filter (MCI or Altec console mod)**. He would slam the filter on the entire track or the drum bus, removing all bass to leave just the "tss-tss" of the hi-hats, then slam the bass back in for impact.

### DEViLBOX Implementation Proposal (`HighPassFilterEffect`)
*   **Type:** `AudioEffectType` -> `'DubFilter'` or `'HighPass'`.
*   **Engine:** `Tone.Filter` (HighPass).
*   **Controls:**
    *   **Cutoff (The Big Knob):** 20Hz - 10kHz.
    *   **Resonance:** Crucial. A little peak at the cutoff point makes the sweep "sing."
    *   **Throw (Send):** A button/knob to momentarily send the filtered signal to the Delay/Reverb.

---

## 4. The Melodica (Augustus Pablo Style)
A "Far East" sound essential. Hard to synthesize perfectly, but a "Melodica" preset for the `FMSynth` or `Synth` (Sawtooth + Bandpass Filter) would go a long way.

### Implementation
*   **Preset:** Create a `MELODICA_PRESET` for `FMSynth`.
*   **Characteristics:** Slight breathy attack, detuned saw/square mix, bandlimited body.

---

## Summary Recommendation
To complete the "Dub Station" vibe, I recommend prioritizing:
1.  **Synare Synth** (Instrument): Completes the percussion palette.
2.  **Bi-Phase** (Effect): The signature modulation sound.
3.  **Melodica** (Preset): The signature melodic sound.
