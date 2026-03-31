// Stub for Monique WASM build — Main window UI not needed
#pragma once
class Monique_Ui_Refresher;
class Monique_Ui_Mainwindow : public juce::AudioProcessorEditor {
public:
    Monique_Ui_Mainwindow() {}
    Monique_Ui_Mainwindow(Monique_Ui_Refresher*) {}
    ~Monique_Ui_Mainwindow() {}
    void triggerAsyncUpdate() {}
    void open_midi_editor_if_closed() {}
};