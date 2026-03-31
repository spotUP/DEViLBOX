/**
 * DexedEditorOverride.cpp — Replacement PluginEditor.cpp for WASM UI build
 *
 * Contains just the essential methods for rendering the Dexed UI:
 * constructor (layout), paint, timer, UI update, and resize.
 * Skips all file I/O, dialogs, CartManager interactions, and deprecated JUCE APIs.
 *
 * Copyright (c) 2013-2018 Pascal Gauthier (original Dexed source).
 * GPL v3 license (same as upstream Dexed).
 */

#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "GlobalEditor.h"
#include "Dexed.h"

#include <emscripten.h>

//==============================================================================
DexedAudioProcessorEditor::DexedAudioProcessorEditor(DexedAudioProcessor* ownerFilter)
    : AudioProcessorEditor(ownerFilter),
      midiKeyboard(ownerFilter->keyboardState, MidiKeyboardComponent::horizontalKeyboard),
      cartManager(this)
{
    processor = ownerFilter;

    resetSize();
    setExplicitFocusOrder(1);

    frameComponent.setBounds(0, 0, WINDOW_SIZE_X,
        (processor->showKeyboard ? WINDOW_SIZE_Y : WINDOW_SIZE_Y - 94));
    addAndMakeVisible(&frameComponent);
    lookAndFeel->setDefaultLookAndFeel(lookAndFeel);
    background = lookAndFeel->background;

    // OPERATORS (6 panels: 3 across × 2 rows)
    frameComponent.addAndMakeVisible(&(operators[0]));
    operators[0].setBounds(2, 1, 287, 218);
    operators[0].bind(processor, 0);

    frameComponent.addAndMakeVisible(&(operators[1]));
    operators[1].setBounds(290, 1, 287, 218);
    operators[1].bind(processor, 1);

    frameComponent.addAndMakeVisible(&(operators[2]));
    operators[2].setBounds(578, 1, 287, 218);
    operators[2].bind(processor, 2);

    frameComponent.addAndMakeVisible(&(operators[3]));
    operators[3].setBounds(2, 219, 287, 218);
    operators[3].bind(processor, 3);

    frameComponent.addAndMakeVisible(&(operators[4]));
    operators[4].setBounds(290, 219, 287, 218);
    operators[4].bind(processor, 4);

    frameComponent.addAndMakeVisible(&(operators[5]));
    operators[5].setBounds(578, 219, 287, 218);
    operators[5].bind(processor, 5);

    // MIDI keyboard
    frameComponent.addAndMakeVisible(&midiKeyboard);
    midiKeyboard.setLowestVisibleKey(24);
    midiKeyboard.setBounds(4, 581, getWidth() - 8, 90);
    midiKeyboard.setTitle("Keyboard keys");

    // Global editor
    frameComponent.addAndMakeVisible(&global);
    global.setBounds(2, 436, 864, 144);
    global.bind(this);
    global.setMonoState(processor->isMonoMode());

    rebuildProgramCombobox();
    global.programs->addListener(this);

    // CartManager — add as hidden child (required for editor destructor)
    frameComponent.addChildComponent(&cartManagerCover);
    cartManagerCover.addChildComponent(&cartManager);

    AffineTransform scale = AffineTransform::scale(processor->getZoomFactor());
    frameComponent.setTransform(scale);
    resetSize();
    addKeyListener(this);
    updateUI();
    startTimer(100);
}

DexedAudioProcessorEditor::~DexedAudioProcessorEditor() {
    stopTimer();
    processor->unbindUI();
    setLookAndFeel(nullptr);
}

//==============================================================================
void DexedAudioProcessorEditor::paint(Graphics& g) {
    g.setColour(background);
    g.fillRoundedRectangle(0.0f, 0.0f, (float)getWidth(), (float)getHeight(), 0);
}

void DexedAudioProcessorEditor::resetSize() {
    float zoomFactor = processor->getZoomFactor();
    int w = (int)(WINDOW_SIZE_X * zoomFactor);
    int h = (int)((processor->showKeyboard ? WINDOW_SIZE_Y : WINDOW_SIZE_Y - 94) * zoomFactor);
    setSize(w, h);
}

float DexedAudioProcessorEditor::getLargestScaleFactor() {
    return 1.0f;
}

void DexedAudioProcessorEditor::resetZoomFactor() {
    processor->setZoomFactor(1.0f);
}

void DexedAudioProcessorEditor::timerCallback() {
    if (processor->forceRefreshUI) {
        processor->forceRefreshUI = false;
        updateUI();
    }
    // Update VU meter
    global.updateVu(processor->vuSignal);
}

void DexedAudioProcessorEditor::comboBoxChanged(ComboBox* comboBoxThatHasChanged) {
    if (comboBoxThatHasChanged == global.programs) {
        int index = global.programs->getSelectedItemIndex();
        if (index >= 0) {
            processor->setCurrentProgram(index);
            updateUI();
        }
    }
}

void DexedAudioProcessorEditor::updateUI() {
    for (int i = 0; i < 6; i++) {
        operators[i].updateDisplay();
    }
    global.updateDisplay();
    global.repaint();

    // Forward param changes to JS callback
    EM_ASM({
        if (window._dexedUIParamCallback) {
            // Signal a full UI update
            window._dexedUIParamCallback(-1, 0);
        }
    });
}

void DexedAudioProcessorEditor::rebuildProgramCombobox() {
    global.programs->clear(dontSendNotification);
    for (int i = 0; i < processor->getNumPrograms(); i++) {
        String name = processor->getProgramName(i);
        if (name.isEmpty())
            name = "Program " + String(i + 1);
        global.programs->addItem(name, i + 1);
    }
    global.programs->setSelectedId(processor->getCurrentProgram() + 1, dontSendNotification);
}

// Stubs for methods we don't need in WASM
void DexedAudioProcessorEditor::loadCart(File) {}
void DexedAudioProcessorEditor::saveCart() {}
void DexedAudioProcessorEditor::initProgram() {
    processor->resetToInitVoice();
    updateUI();
}
void DexedAudioProcessorEditor::storeProgram() {}
void DexedAudioProcessorEditor::cartShow() {}
void DexedAudioProcessorEditor::parmShow() {}
void DexedAudioProcessorEditor::tuningShow() {}
void DexedAudioProcessorEditor::discoverMidiCC(Ctrl*) {}

bool DexedAudioProcessorEditor::isInterestedInFileDrag(const StringArray&) { return false; }
void DexedAudioProcessorEditor::filesDropped(const StringArray&, int, int) {}
std::unique_ptr<ComponentTraverser> DexedAudioProcessorEditor::createFocusTraverser() {
    return std::make_unique<FocusTraverser>();
}
bool DexedAudioProcessorEditor::keyPressed(const KeyPress&, Component*) { return false; }
