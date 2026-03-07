/**
 * Tunings.h — Minimal stub for Odin2 WASM build
 *
 * The Surge tuning-library provides microtonal support via .scl/.kbm files.
 * For WASM, we provide standard 12-TET tuning only.
 */
#pragma once
#include <cmath>

namespace Tunings {

class Tuning {
public:
    Tuning() {
        // Standard 12-TET: A4 = 440 Hz
        for (int i = 0; i < 128; i++) {
            frequencies_[i] = 440.0 * std::pow(2.0, (i - 69) / 12.0);
        }
    }

    double frequencyForMidiNote(int note) const {
        if (note < 0) note = 0;
        if (note > 127) note = 127;
        return frequencies_[note];
    }

    double frequencyForMidiNoteScaledByMidi0(int note) const {
        return frequencyForMidiNote(note) / frequencyForMidiNote(0);
    }

    double logScaledFrequencyForMidiNote(int note) const {
        return std::log2(frequencyForMidiNote(note) / 8.17579891564);
    }

private:
    double frequencies_[128];
};

} // namespace Tunings
