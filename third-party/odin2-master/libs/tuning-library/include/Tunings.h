/**
 * Tunings.h — Extended stub for Odin2 WASM UI build
 * Provides the full Tunings API surface that Odin2 uses.
 */
#pragma once
#include <cmath>
#include <string>
#include <vector>

namespace Tunings {

constexpr double MIDI_0_FREQ = 8.17579891564;

struct Scale {
    std::string description = "12 Tone Equal Temperament";
    int count = 12;
    struct Tone { double cents = 0; };
    std::vector<Tone> tones;
    Scale() { for (int i = 1; i <= 12; i++) tones.push_back({i * 100.0}); }
};

struct KeyboardMapping {
    int count = 128;
    int middleNote = 60;
    double tuningFrequency = 261.6255653;
    int tuningConstantNote = 60;
};

inline Scale evenTemperament12NoteScale() { return Scale(); }
inline KeyboardMapping tuneNoteTo(int note, double freq) {
    KeyboardMapping km;
    km.tuningConstantNote = note;
    km.tuningFrequency = freq;
    return km;
}

inline Scale parseSCLData(const std::string&) { return Scale(); }
inline KeyboardMapping parseKBMData(const std::string&) { return KeyboardMapping(); }

class Tuning {
public:
    Scale scale;
    KeyboardMapping keyboardMapping;

    Tuning() {
        for (int i = 0; i < 128; i++)
            frequencies_[i] = 440.0 * std::pow(2.0, (i - 69) / 12.0);
    }
    Tuning(const Scale&, const KeyboardMapping&) : Tuning() {}
    Tuning(const Scale&) : Tuning() {}

    double frequencyForMidiNote(int note) const {
        if (note < 0) note = 0;
        if (note > 127) note = 127;
        return frequencies_[note];
    }

    double frequencyForMidiNoteScaledByMidi0(int note) const {
        return frequencyForMidiNote(note) / frequencyForMidiNote(0);
    }

    double logScaledFrequencyForMidiNote(int note) const {
        return std::log2(frequencyForMidiNote(note) / MIDI_0_FREQ);
    }

private:
    double frequencies_[128];
};

} // namespace Tunings
