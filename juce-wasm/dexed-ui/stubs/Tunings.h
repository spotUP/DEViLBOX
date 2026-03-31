// Tunings.h — Stub for Dexed WASM build
// Replaces the surge tuning-library header
#pragma once

#include <string>
#include <vector>

namespace Tunings {

struct Tone {
    double cents = 0;
    double floatValue = 0;
    int intValue = 0;
    std::string stringRep;
    enum Type { kToneCents, kToneRatio } type = kToneCents;
};

struct Scale {
    std::string name = "Standard";
    std::string description;
    std::string rawText;
    int count = 12;
    std::vector<Tone> tones;
};

struct KeyboardMapping {
    int tuningConstantNote = 60;
    double tuningFrequency = 261.625565;
    int tuningPitch = 60;
    int octaveDegrees = 12;
    int mapSize = 0;
    int firstMidi = 0;
    int lastMidi = 127;
    int middleNote = 60;
    bool isStandardMapping = true;
    std::string rawText;
    std::vector<int> keys;
    std::string name = "Standard";
};

class Tuning {
public:
    Tuning() = default;
    Tuning(const Scale& s) : scale(s) {}
    Tuning(const Scale& s, const KeyboardMapping& k) : scale(s), mapping(k) {}

    double frequencyForMidiNote(int mn) const {
        return 440.0 * pow(2.0, (mn - 69) / 12.0);
    }
    double frequencyForMidiNoteScaledByMidi0(int mn) const {
        return frequencyForMidiNote(mn);
    }
    double logScaledFrequencyForMidiNote(int mn) const {
        return log2(frequencyForMidiNote(mn) / 8.17579891564371);
    }

    Scale scale;
    KeyboardMapping mapping;
};

inline Scale readSCLData(const std::string&) { return Scale(); }
inline KeyboardMapping readKBMData(const std::string&) { return KeyboardMapping(); }
inline Scale parseSCLData(const std::string&) { return Scale(); }
inline KeyboardMapping parseKBMData(const std::string&) { return KeyboardMapping(); }

} // namespace Tunings
