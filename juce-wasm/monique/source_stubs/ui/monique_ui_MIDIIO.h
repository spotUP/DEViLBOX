// Stub for Monique WASM build — MIDI I/O UI not needed
#pragma once
class UiLookAndFeel;
class MoniqueAudioProcessor;
class MIDIControlHandler {
public:
    MIDIControlHandler() {}
    MIDIControlHandler(UiLookAndFeel*, MoniqueAudioProcessor*) {}
    ~MIDIControlHandler() {}
    void handleController(int, int) {}
    bool is_learning() const { return false; }
    bool is_activated_for(void*) const { return false; }
};
