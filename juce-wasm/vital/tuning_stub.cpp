/**
 * tuning_stub.cpp — Minimal Tuning class implementation for WASM build
 *
 * The full tuning.cpp depends heavily on JUCE's String/File APIs for loading
 * .scl/.kbm/.tun files. In WASM, we use standard 12-TET tuning and don't
 * support custom tuning files. This stub provides the minimal implementation
 * needed to link.
 */

#include "common/tuning.h"

Tuning::Tuning() : scale_start_midi_note_(60), reference_midi_note_(69), default_(true) {
    setDefaultTuning();
}

Tuning::Tuning(File) : Tuning() {}

void Tuning::setDefaultTuning() {
    default_ = true;
    scale_.clear();
    keyboard_mapping_.clear();
    // Standard 12-TET: each MIDI note maps to itself
    for (int i = 0; i < kTuningSize; ++i) {
        tuning_[i] = (vital::mono_float)(i - kTuningCenter);
    }
}

vital::mono_float Tuning::convertMidiNote(int note) const {
    int index = note + kTuningCenter;
    if (index >= 0 && index < kTuningSize)
        return tuning_[index] + (vital::mono_float)note;
    return (vital::mono_float)note;
}

void Tuning::loadScale(std::vector<float>) { setDefaultTuning(); }
void Tuning::loadFile(File) { setDefaultTuning(); }
void Tuning::setConstantTuning(float note) {
    for (int i = 0; i < kTuningSize; ++i)
        tuning_[i] = note - (float)(i - kTuningCenter);
}

void Tuning::setReferenceFrequency(float) {}
void Tuning::setReferenceNoteFrequency(int, float) {}
void Tuning::setReferenceRatio(float) {}

Tuning Tuning::getTuningForFile(File) { return Tuning(); }
String Tuning::allFileExtensions() { return String(""); }
int Tuning::noteToMidiKey(const String&) { return 0; }

json Tuning::stateToJson() const { return json::object(); }
void Tuning::jsonToState(const json&) { setDefaultTuning(); }
void Tuning::loadScalaFile(const StringArray&) { setDefaultTuning(); }
