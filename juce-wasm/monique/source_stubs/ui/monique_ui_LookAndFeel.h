// Stub for Monique WASM build — UI look and feel not needed
// NOTE: This file is included at the bottom of monique_core_Parameters.h (line ~1446)
// so BoolParameter, IntParameter, and other Parameter types are already defined.
#pragma once

class Monique_Ui_Mainwindow;

// Minimal ComponentColours stub (real one has SectionTheme etc.)
struct ComponentColours {
    void read_from(juce::XmlElement*) {}
    void write_to(juce::XmlElement*) const {}
    void save_to(juce::XmlElement*) const {}
};

class UiLookAndFeel {
public:
    UiLookAndFeel()
        : show_values_always(false, "ShowVals", "SV")
        , animate_envs(0, 1, 1, "AnimEnvs", "AE")
        , animate_sliders(0, 1, 1, "AnimSliders", "AS")
        , animate_arp(0, 1, 1, "AnimArp", "AA")
        , animate_poly(0, 1, 0, "AnimPoly", "AP")
        , show_tooltips(false, "ShowTips", "ST")
    {}
    virtual ~UiLookAndFeel() {}

    // Parameter fields accessed by MoniqueSynthData
    BoolParameter show_values_always;
    IntParameter animate_envs;
    IntParameter animate_sliders;
    IntParameter animate_arp;
    IntParameter animate_poly;
    BoolParameter show_tooltips;

    // Theme data
    ComponentColours colours;

    // UI component references
    juce::Component* midi_learn_comp = nullptr;
    Monique_Ui_Mainwindow* mainwindow = nullptr;

    // Theme data (plain values)
    float defaultRValue = 0.2f;
    float defaultGValue = 0.2f;
    float defaultBValue = 0.2f;

    int is_global_user_return = 0;
    int is_global_factory_return = 0;
    int is_global_program_return = 0;
    int is_global_undo = 0;
};
